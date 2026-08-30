import {
  BinanceApiError,
  BinanceFuturesClient,
  formatToPrecision,
  newClientId,
  roundPrice,
} from "./binance";
import { runWalkForwardDiagnostic } from "./backtest";
import {
  acquireCycleLock,
  getLatestBacktest,
  getLatestResearch,
  getSettings,
  getState,
  recordEvent,
  releaseCycleLock,
  saveBacktest,
  saveResearch,
  saveState,
} from "./repository";
import { researchMarket } from "./research";
import { executeRiskReducingClose } from "./risk-close";
import { calculateRiskSizedQuantity, evaluateTechnicalSignal } from "./strategy";
import {
  FORWARD_VALIDATION_ACKNOWLEDGEMENT,
  LIVE_ACKNOWLEDGEMENT,
  REAL_MONEY_ENTRY_BUILD_ENABLED,
  type BacktestResult,
  type BinancePosition,
  type BinanceOrder,
  type CycleResult,
  type MarketResearch,
  type TechnicalSignal,
  type TenantExecutionContext,
  type TradingEnv,
  type TradingSettings,
  type TradingState,
} from "./types";

function result(outcome: string, message: string, details?: Record<string, unknown>, ok = true): CycleResult {
  return { ok, outcome, message, at: Math.floor(Date.now() / 1_000), details };
}

function errorMessage(error: unknown): string {
  return (error instanceof Error ? error.message : "Unknown trading engine failure").slice(0, 300);
}

function utcDayKey(nowMs = Date.now()): string {
  return new Date(nowMs).toISOString().slice(0, 10);
}

function clearManagedPositionState(state: TradingState, now = Math.floor(Date.now() / 1_000)): void {
  state.active_entry_client_id = null;
  state.active_entry_at = null;
  state.active_position_amount = null;
  state.active_stop_client_id = null;
  state.active_take_profit_client_id = null;
  state.last_trade_at = now;
  state.updated_at = now;
}

function ownedProtectionIds(state: TradingState): string[] {
  return [...new Set([state.active_stop_client_id, state.active_take_profit_client_id].filter(
    (value): value is string => Boolean(value),
  ))];
}

async function cancelOwnedProtectionOrders(input: {
  client: Pick<BinanceFuturesClient, "cancelAlgoOrder">;
  state: TradingState;
  symbol: string;
}): Promise<string[]> {
  const cancellationErrors: string[] = [];
  for (const clientAlgoId of ownedProtectionIds(input.state)) {
    try {
      await input.client.cancelAlgoOrder(input.symbol, clientAlgoId);
    } catch (error) {
      if (error instanceof BinanceApiError && [-2011, -2013].includes(error.code || 0)) continue;
      cancellationErrors.push(`${clientAlgoId}: ${errorMessage(error)}`);
    }
  }
  return cancellationErrors;
}

export { executeRiskReducingClose } from "./risk-close";

function credentialGuardFailures(env: TradingEnv, tenant?: TenantExecutionContext): string[] {
  const failures: string[] = [];
  if (!(tenant?.apiKey || env.BINANCE_API_KEY)?.trim()) failures.push("Binance API key is missing");
  if (!(tenant?.apiSecret || env.BINANCE_API_SECRET)?.trim()) failures.push("Binance API secret is missing");
  return failures;
}

function liveGuardFailures(env: TradingEnv, tenant?: TenantExecutionContext): string[] {
  const failures = credentialGuardFailures(env, tenant);
  if (!REAL_MONEY_ENTRY_BUILD_ENABLED) failures.push("real-money entry is disabled in this public build");
  if (env.LIVE_TRADING_ALLOWED !== LIVE_ACKNOWLEDGEMENT) failures.push("live acknowledgement secret is not set");
  if (env.FORWARD_VALIDATION_APPROVED !== FORWARD_VALIDATION_ACKNOWLEDGEMENT) {
    failures.push("paper-forward validation has not been approved");
  }
  if (!env.GEMINI_API_KEY?.trim()) failures.push("Gemini research key is missing");
  if (!tenant && !env.TRADING_ADMIN_TOKEN?.trim()) failures.push("admin token is missing");
  return failures;
}

async function disableEngine(env: TradingEnv, state: TradingState, reason: string, tenantId?: string): Promise<void> {
  const now = Math.floor(Date.now() / 1_000);
  if (tenantId) {
    await env.DB.prepare("UPDATE tenant_trading_settings SET enabled = 0, updated_at = ? WHERE tenant_id = ?")
      .bind(now, tenantId).run();
  } else {
    await env.DB.prepare("UPDATE trading_settings SET enabled = 0, updated_at = ? WHERE id = 1").bind(now).run();
  }
  state.paused_reason = reason.slice(0, 300);
  state.last_error = reason.slice(0, 300);
  state.updated_at = now;
  await saveState(env.DB, state, tenantId);
}

async function emergencyCloseAndPause(input: {
  env: TradingEnv;
  client: BinanceFuturesClient;
  state: TradingState;
  symbol: string;
  positionAmount: number;
  quantity: string;
  reason: string;
  tenantId?: string;
}): Promise<CycleResult> {
  const { env, client, state, symbol, positionAmount, quantity, reason, tenantId } = input;
  let closeError: string | null = null;
  let closeOrder: BinanceOrder | null = null;
  let cancellationErrors: string[] = [];
  try {
    const execution = await executeRiskReducingClose({
      client,
      state,
      symbol,
      side: positionAmount > 0 ? "SELL" : "BUY",
      quantity,
      clientOrderId: newClientId("panic"),
    });
    closeOrder = execution.closeOrder;
    cancellationErrors = execution.cancellationErrors;
  } catch (error) {
    closeError = errorMessage(error);
  }

  const pauseReason = closeError
    ? `CRITICAL: protection failed and emergency close failed: ${closeError}`
    : `Engine paused after emergency close: ${reason}`;
  if (!closeError) {
    clearManagedPositionState(state);
  }
  await disableEngine(env, state, pauseReason, tenantId);
  await recordEvent(env.DB, "critical", "emergency_close", pauseReason, {
    symbol,
    reason,
    cancellationErrors,
    closeError,
    closeOrderId: closeOrder?.orderId || null,
    closeAveragePrice: Number(closeOrder?.avgPrice || 0) || null,
  }, tenantId);
  return result("emergency_paused", pauseReason, {
    cancellationErrors,
    closeError,
    closeOrderId: closeOrder?.orderId || null,
  }, false);
}

async function closeManagedPosition(input: {
  env: TradingEnv;
  client: BinanceFuturesClient;
  state: TradingState;
  symbol: string;
  positionAmount: number;
  quantity: string;
  outcome: string;
  eventType: string;
  message: string;
  details?: Record<string, unknown>;
  pauseAfter?: boolean;
  eventLevel?: "info" | "warning" | "critical";
  tenantId?: string;
}): Promise<CycleResult> {
  const {
    env,
    client,
    state,
    symbol,
    positionAmount,
    quantity,
    outcome,
    eventType,
    message,
    details,
    pauseAfter,
    eventLevel,
    tenantId,
  } = input;
  let execution: { closeOrder: BinanceOrder; cancellationErrors: string[] };
  try {
    execution = await executeRiskReducingClose({
      client,
      state,
      symbol,
      side: positionAmount > 0 ? "SELL" : "BUY",
      quantity,
      clientOrderId: newClientId("exit"),
    });
  } catch (error) {
    const reason = `${message}; close failed: ${errorMessage(error)}`;
    await disableEngine(env, state, reason, tenantId);
    await recordEvent(env.DB, "critical", `${eventType}_failed`, reason, details, tenantId);
    return result(`${outcome}_failed`, reason, details, false);
  }

  const now = Math.floor(Date.now() / 1_000);
  clearManagedPositionState(state, now);
  state.last_error = null;
  state.updated_at = now;
  if (pauseAfter) {
    await disableEngine(env, state, `${message}; engine paused for manual review`, tenantId);
  } else {
    state.paused_reason = null;
    await saveState(env.DB, state, tenantId);
  }
  await recordEvent(env.DB, eventLevel || (pauseAfter ? "critical" : "info"), eventType, message, {
    ...details,
    cancellationErrors: execution.cancellationErrors,
    closeOrderId: execution.closeOrder.orderId,
    closeAveragePrice: Number(execution.closeOrder.avgPrice || 0) || null,
  }, tenantId);
  return result(outcome, message, {
    ...details,
    cancellationErrors: execution.cancellationErrors,
    closeOrderId: execution.closeOrder.orderId,
    closeAveragePrice: Number(execution.closeOrder.avgPrice || 0) || null,
  });
}

export async function closeManagedPositionNow(
  env: TradingEnv,
  tenant: TenantExecutionContext,
  options: { outcome?: string; eventType?: string; message?: string; eventLevel?: "info" | "warning" | "critical" } = {},
): Promise<CycleResult> {
  const now = Math.floor(Date.now() / 1_000);
  if (!await acquireCycleLock(env.DB, now, tenant.tenantId)) {
    return result("locked", "Another trading cycle is already running", undefined, false);
  }
  try {
    const [settings, state] = await Promise.all([
      getSettings(env.DB, tenant.tenantId),
      getState(env.DB, tenant.tenantId),
    ]);
    const client = new BinanceFuturesClient(tenant.apiKey, tenant.apiSecret);
    await client.syncTime();
    const position = (await client.getPositions(settings.symbol))
      .find((item) => item.symbol === settings.symbol && Math.abs(Number(item.positionAmt)) > 0);

    if (!state.active_entry_client_id) {
      if (position) {
        return result("untracked_position", "Nexus refused to close a position it does not own; close it directly on Binance", {
          symbol: settings.symbol,
        }, false);
      }
      return result("already_flat", "No Nexus-managed position is open");
    }

    if (!position) {
      const cancellationErrors = await cancelOwnedProtectionOrders({ client, state, symbol: settings.symbol });
      clearManagedPositionState(state, now);
      await disableEngine(env, state, "Manual close requested; position was already flat and engine was disabled", tenant.tenantId);
      await recordEvent(env.DB, cancellationErrors.length ? "warning" : "info", "manual_close_flat",
        "Manual close found no open managed position; owned protections were reconciled and the engine was disabled",
        { cancellationErrors }, tenant.tenantId);
      return result("already_flat", "Managed position was already flat; live execution is disabled", { cancellationErrors });
    }

    const amount = Number(position.positionAmt);
    const rules = await client.getSymbolRules(settings.symbol);
    return closeManagedPosition({
      env,
      client,
      state,
      symbol: settings.symbol,
      positionAmount: amount,
      quantity: formatToPrecision(Math.abs(amount), rules.quantityPrecision),
      outcome: options.outcome || "manual_close",
      eventType: options.eventType || "manual_close",
      message: options.message || "Customer closed the Nexus-managed position at market; live execution was disabled",
      details: { symbol: settings.symbol, requestedAt: now },
      pauseAfter: true,
      eventLevel: options.eventLevel || "info",
      tenantId: tenant.tenantId,
    });
  } catch (error) {
    const message = `Manual close failed: ${errorMessage(error)}`;
    await recordEvent(env.DB, "critical", "manual_close_failed", message, undefined, tenant.tenantId).catch(() => undefined);
    return result("manual_close_failed", message, undefined, false);
  } finally {
    await releaseCycleLock(env.DB, tenant.tenantId).catch(() => undefined);
  }
}

function researchAllowsTrade(
  research: MarketResearch,
  signal: TechnicalSignal,
  settings: TradingSettings,
): { allowed: boolean; reason: string } {
  if (["high", "extreme"].includes(research.riskLevel)) {
    return { allowed: false, reason: `News risk is ${research.riskLevel}` };
  }
  if (research.confidence < settings.min_research_confidence) {
    return { allowed: false, reason: "Research confidence is below the configured floor" };
  }
  if (signal.action === "LONG" && research.bias === "bearish") {
    return { allowed: false, reason: "News bias conflicts with the long signal" };
  }
  if (signal.action === "SHORT" && research.bias === "bullish") {
    return { allowed: false, reason: "News bias conflicts with the short signal" };
  }
  return { allowed: true, reason: "Technical setup passed the independent news-risk gate" };
}

async function refreshResearchIfDue(input: {
  env: TradingEnv;
  settings: TradingSettings;
  state: TradingState;
  signal: TechnicalSignal;
  latest: MarketResearch | null;
  force: boolean;
  tenantId?: string;
}): Promise<MarketResearch | null> {
  const { env, settings, state, signal } = input;
  const now = Math.floor(Date.now() / 1_000);
  const due = input.force || !input.latest || now - input.latest.createdAt >= settings.research_minutes * 60;
  if (!due || !env.GEMINI_API_KEY?.trim()) return input.latest;

  try {
    const research = await researchMarket({
      apiKey: env.GEMINI_API_KEY,
      model: env.GEMINI_MODEL,
      symbol: settings.symbol,
      marketSnapshot: {
        interval: settings.interval,
        price: signal.price,
        technicalAction: signal.action,
        technicalConfidence: signal.confidence,
        indicators: signal.indicators,
      },
    });
    await saveResearch(env.DB, research);
    state.last_research_at = research.createdAt;
    await recordEvent(env.DB, "info", "research_updated", "24-hour market research refreshed", {
      symbol: research.symbol,
      bias: research.bias,
      riskLevel: research.riskLevel,
      confidence: research.confidence,
      sourceCount: research.sources.length,
    }, input.tenantId);
    return research;
  } catch (error) {
    const message = errorMessage(error);
    state.last_error = `Research update failed: ${message}`;
    await recordEvent(env.DB, "warning", "research_failed", state.last_error, undefined, input.tenantId);
    return input.latest;
  }
}

async function refreshBacktestIfDue(input: {
  env: TradingEnv;
  client: BinanceFuturesClient;
  settings: TradingSettings;
  latest: BacktestResult | null;
  tenantId?: string;
}): Promise<BacktestResult | null> {
  const now = Math.floor(Date.now() / 1_000);
  if (input.latest && now - input.latest.createdAt < 6 * 60 * 60) return input.latest;
  try {
    const hourMs = 60 * 60 * 1_000;
    const latestCompletedHour = Math.floor(Date.now() / hourMs) * hourMs - 1;
    const candleWindows = await Promise.all(Array.from({ length: 12 }, (_, index) => input.client.getCandles(
      input.settings.symbol,
      input.settings.interval,
      1_000,
      latestCompletedHour - index * 1_000 * hourMs,
    )));
    const backtest = runWalkForwardDiagnostic({
      symbol: input.settings.symbol,
      interval: input.settings.interval,
      candleWindows,
    });
    await saveBacktest(input.env.DB, backtest);
    await recordEvent(input.env.DB, backtest.passed ? "info" : "warning", "backtest_completed", backtest.passed
      ? "Recent walk-forward diagnostic passed"
      : "Recent walk-forward diagnostic failed; live entries are blocked", {
      tradeCount: backtest.tradeCount,
      winRate: backtest.winRate,
      netR: backtest.netR,
      maxDrawdownR: backtest.maxDrawdownR,
      profitFactor: backtest.profitFactor,
      passedWindows: backtest.passedWindows,
      windowCount: backtest.windowCount,
    }, input.tenantId);
    return backtest;
  } catch (error) {
    await recordEvent(input.env.DB, "warning", "backtest_failed", errorMessage(error), undefined, input.tenantId);
    return input.latest;
  }
}

async function monitorExistingPosition(input: {
  env: TradingEnv;
  client: BinanceFuturesClient;
  settings: TradingSettings;
  state: TradingState;
  position: BinancePosition;
  signal: TechnicalSignal;
  research: MarketResearch | null;
  tenantId?: string;
}): Promise<CycleResult> {
  const { env, client, settings, state, position, signal, research, tenantId } = input;
  const positionAmount = Number(position.positionAmt);
  if (!state.active_entry_client_id) {
    const reason = "An open position was not created by this engine; live execution is paused without closing it";
    await disableEngine(env, state, reason, tenantId);
    await recordEvent(env.DB, "critical", "untracked_position", reason, { symbol: position.symbol }, tenantId);
    return result("untracked_position", reason, undefined, false);
  }

  const now = Math.floor(Date.now() / 1_000);
  if (state.active_entry_at && now - state.active_entry_at >= 96 * 60 * 60) {
    const rules = await client.getSymbolRules(settings.symbol);
    return closeManagedPosition({
      env,
      client,
      state,
      symbol: settings.symbol,
      positionAmount,
      quantity: formatToPrecision(Math.abs(positionAmount), rules.quantityPrecision),
      outcome: "time_exit",
      eventType: "time_exit",
      message: "Managed position closed at the 96-hour maximum holding time",
      details: { symbol: settings.symbol },
      tenantId,
    });
  }

  const rules = await client.getSymbolRules(settings.symbol);
  const expectedAmount = Number(state.active_position_amount);
  if (Number.isFinite(expectedAmount) && expectedAmount !== 0
    && Math.abs(expectedAmount - positionAmount) > Math.max(rules.quantityStep / 2, 1e-12)) {
    return emergencyCloseAndPause({
      env,
      client,
      state,
      symbol: settings.symbol,
      positionAmount,
      quantity: formatToPrecision(Math.abs(positionAmount), rules.quantityPrecision),
      reason: `Managed position amount changed outside Nexus (expected ${expectedAmount}, found ${positionAmount})`,
      tenantId,
    });
  }

  const protections = await client.getOpenAlgoOrders(settings.symbol);
  const exitSide = positionAmount > 0 ? "SELL" : "BUY";
  const stopOrder = protections.find((order) => order.orderType === "STOP_MARKET"
    && order.side === exitSide
    && (state.active_stop_client_id
      ? order.clientAlgoId === state.active_stop_client_id
      : order.clientAlgoId.startsWith("nx_sl_")));
  const takeProfitOrder = protections.find((order) => order.orderType === "TAKE_PROFIT_MARKET"
    && order.side === exitSide
    && (state.active_take_profit_client_id
      ? order.clientAlgoId === state.active_take_profit_client_id
      : order.clientAlgoId.startsWith("nx_tp_")));
  if (!stopOrder || !takeProfitOrder) {
    return emergencyCloseAndPause({
      env,
      client,
      state,
      symbol: settings.symbol,
      positionAmount,
      quantity: formatToPrecision(Math.abs(positionAmount), rules.quantityPrecision),
      reason: "One or more exchange-native protective orders are missing",
      tenantId,
    });
  }
  if (!state.active_stop_client_id || !state.active_take_profit_client_id || !state.active_position_amount) {
    state.active_stop_client_id = stopOrder.clientAlgoId;
    state.active_take_profit_client_id = takeProfitOrder.clientAlgoId;
    state.active_position_amount = String(positionAmount);
    state.updated_at = now;
    await saveState(env.DB, state, tenantId);
  }

  const quantity = formatToPrecision(Math.abs(positionAmount), rules.quantityPrecision);
  const maxResearchAge = Math.max(15 * 60, settings.research_minutes * 2 * 60);
  const researchIsFresh = Boolean(research && now - research.createdAt <= maxResearchAge);
  if (researchIsFresh && research?.riskLevel === "extreme") {
    return closeManagedPosition({
      env,
      client,
      state,
      symbol: settings.symbol,
      positionAmount,
      quantity,
      outcome: "news_risk_exit",
      eventType: "news_risk_exit",
      message: "Managed position closed because fresh Gemini research classified market news risk as extreme",
      details: {
        researchBias: research.bias,
        researchConfidence: research.confidence,
        sourceCount: research.sources.length,
      },
      pauseAfter: true,
      tenantId,
    });
  }

  const opposingAction = positionAmount > 0 ? "SHORT" : "LONG";
  const opposingBias = positionAmount > 0 ? "bearish" : "bullish";
  const reversalConfirmed = Boolean(research && researchIsFresh
    && signal.action === opposingAction
    && signal.confidence >= 72
    && research.bias === opposingBias
    && research.confidence >= settings.min_research_confidence);
  if (reversalConfirmed && research) {
    return closeManagedPosition({
      env,
      client,
      state,
      symbol: settings.symbol,
      positionAmount,
      quantity,
      outcome: "confirmed_reversal_exit",
      eventType: "confirmed_reversal_exit",
      message: "Managed position closed after a confirmed technical reversal aligned with fresh Gemini news bias",
      details: {
        technicalAction: signal.action,
        technicalConfidence: signal.confidence,
        researchBias: research.bias,
        researchConfidence: research.confidence,
        researchRisk: research.riskLevel,
      },
      tenantId,
    });
  }

  return result("position_protected", "Existing engine position is open and protected", {
    symbol: settings.symbol,
    positionAmount,
    entryPrice: Number(position.entryPrice),
    markPrice: Number(position.markPrice),
    unrealizedPnl: Number(position.unRealizedProfit),
    protectionCount: protections.length,
  });
}

export async function runTradingCycle(
  env: TradingEnv,
  options: { forceResearch?: boolean; tenant?: TenantExecutionContext } = {},
): Promise<CycleResult> {
  const now = Math.floor(Date.now() / 1_000);
  const tenantId = options.tenant?.tenantId;
  if (!await acquireCycleLock(env.DB, now, tenantId)) {
    return result("locked", "Another trading cycle is already running");
  }

  let state: TradingState | null = null;
  try {
    const settings = await getSettings(env.DB, tenantId);
    state = await getState(env.DB, tenantId);
    const publicClient = new BinanceFuturesClient("", "");
    const candles = await publicClient.getCandles(settings.symbol, settings.interval, 300);
    const signal = evaluateTechnicalSignal(candles);
    let research = await getLatestResearch(env.DB, settings.symbol);
    research = await refreshResearchIfDue({
      env,
      settings,
      state,
      signal,
      latest: research,
      force: Boolean(options.forceResearch),
      tenantId,
    });
    let backtest = await getLatestBacktest(env.DB, settings.symbol, settings.interval);
    backtest = await refreshBacktestIfDue({ env, client: publicClient, settings, latest: backtest, tenantId });

    state.last_cycle_at = now;
    state.updated_at = now;
    await saveState(env.DB, state, tenantId);
    if (!settings.enabled && !state.active_entry_client_id) {
      state.last_error = null;
      await saveState(env.DB, state, tenantId);
      return result("research_only", "Market scan completed; real-money execution remains disabled", {
        signal,
        research: research ? {
          bias: research.bias,
          riskLevel: research.riskLevel,
          confidence: research.confidence,
          createdAt: research.createdAt,
        } : null,
        backtest,
      });
    }

    const guardFailures = credentialGuardFailures(env, options.tenant);
    if (guardFailures.length) {
      state.last_error = `Live guard blocked execution: ${guardFailures.join(", ")}`;
      await saveState(env.DB, state, tenantId);
      return result("guard_blocked", state.last_error, { guardFailures }, false);
    }
    const client = new BinanceFuturesClient(
      options.tenant?.apiKey || env.BINANCE_API_KEY!,
      options.tenant?.apiSecret || env.BINANCE_API_SECRET!,
    );
    await client.syncTime();
    if (await client.isHedgeMode()) {
      const reason = "Binance Hedge Mode is unsupported; switch the Futures account to One-way Mode before enabling";
      await disableEngine(env, state, reason, tenantId);
      return result("account_mode_blocked", reason, undefined, false);
    }

    const account = await client.getAccount();
    const equity = account.totalMarginBalance;
    if (!Number.isFinite(equity) || equity <= 0) {
      return result("balance_blocked", "Binance Futures equity is unavailable or zero", undefined, false);
    }

    const dayKey = utcDayKey();
    let baselineChanged = false;
    if (state.day_key !== dayKey || !Number(state.daily_baseline_equity)) {
      state.day_key = dayKey;
      state.daily_baseline_equity = String(equity);
      baselineChanged = true;
    }
    if (baselineChanged) {
      state.updated_at = now;
      await saveState(env.DB, state, tenantId);
    }
    const baseline = Number(state.daily_baseline_equity);
    const drawdownBps = baseline > 0 ? Math.max(0, (baseline - equity) / baseline * 10_000) : 0;
    const allPositions = await client.getPositions();
    const openPositions = allPositions.filter((position) => Math.abs(Number(position.positionAmt)) > 0);
    if (drawdownBps >= settings.daily_loss_bps) {
      const reason = `Daily loss circuit breaker reached (${drawdownBps.toFixed(1)} bps)`;
      const managed = openPositions.find((position) => position.symbol === settings.symbol);
      if (managed && state.active_entry_client_id) {
        const rules = await client.getSymbolRules(settings.symbol);
        return closeManagedPosition({
          env,
          client,
          state,
          symbol: settings.symbol,
          positionAmount: Number(managed.positionAmt),
          quantity: formatToPrecision(Math.abs(Number(managed.positionAmt)), rules.quantityPrecision),
          outcome: "daily_loss_exit",
          eventType: "daily_loss_exit",
          message: `${reason}; managed position closed and engine paused`,
          details: { baseline, equity, drawdownBps },
          pauseAfter: true,
          tenantId,
        });
      }
      await disableEngine(env, state, reason, tenantId);
      await recordEvent(env.DB, "critical", "daily_loss_limit", reason, { baseline, equity }, tenantId);
      return result("daily_loss_paused", reason, { baseline, equity }, false);
    }

    if (openPositions.length) {
      const managed = openPositions.find((position) => position.symbol === settings.symbol);
      if (managed) {
        if (openPositions.length > 1) {
          await recordEvent(env.DB, "warning", "additional_position_detected",
            "Additional Futures positions are open; Nexus will manage only its tracked BTCUSDT position", {
              openSymbols: openPositions.map((item) => item.symbol),
            }, tenantId);
        }
        return monitorExistingPosition({
          env,
          client,
          settings,
          state,
          position: managed,
          signal,
          research,
          tenantId,
        });
      }
      if (state.active_entry_client_id) {
        const cancellationErrors = await cancelOwnedProtectionOrders({ client, state, symbol: settings.symbol });
        clearManagedPositionState(state, now);
        await saveState(env.DB, state, tenantId);
        await recordEvent(env.DB, cancellationErrors.length ? "warning" : "info", "position_closed",
          "The tracked Nexus position is flat; owned protective orders were reconciled", { cancellationErrors }, tenantId);
      }
      {
        const reason = "Another Futures position is open; single-position safety rule paused the engine without closing it";
        await disableEngine(env, state, reason, tenantId);
        await recordEvent(env.DB, "critical", "position_limit", reason, { openSymbols: openPositions.map((item) => item.symbol) }, tenantId);
        return result("position_limit", reason, undefined, false);
      }
    }

    if (state.active_entry_client_id) {
      const cancellationErrors = await cancelOwnedProtectionOrders({ client, state, symbol: settings.symbol });
      await recordEvent(env.DB, "info", "position_closed", "Managed position is flat; stale protective orders were cleared", {
        entryClientId: state.active_entry_client_id,
        cancellationErrors,
      }, tenantId);
      clearManagedPositionState(state, now);
      await saveState(env.DB, state, tenantId);
    }

    if (!settings.enabled) {
      return result("engine_disabled", "Managed position is flat and real-money execution is disabled");
    }
    const entryGuardFailures = liveGuardFailures(env, options.tenant);
    if (entryGuardFailures.length) {
      state.last_error = `Live entry guard blocked execution: ${entryGuardFailures.join(", ")}`;
      await saveState(env.DB, state, tenantId);
      return result("guard_blocked", state.last_error, { guardFailures: entryGuardFailures }, false);
    }
    if (state.paused_reason) {
      return result("paused", state.paused_reason, undefined, false);
    }
    if (!backtest || now - backtest.createdAt > 24 * 60 * 60) {
      return result("backtest_stale", "A recent walk-forward diagnostic is unavailable; live entry is blocked", undefined, false);
    }
    if (!backtest.passed) {
      return result("backtest_veto", "Recent walk-forward diagnostic did not meet the minimum risk criteria", {
        tradeCount: backtest.tradeCount,
        winRate: backtest.winRate,
        netR: backtest.netR,
        maxDrawdownR: backtest.maxDrawdownR,
        profitFactor: backtest.profitFactor,
      }, false);
    }

    if (!research) {
      state.last_error = "No completed live-web research is available; no trade was placed";
      await saveState(env.DB, state, tenantId);
      return result("research_blocked", state.last_error, undefined, false);
    }
    const maxResearchAge = Math.max(15 * 60, settings.research_minutes * 2 * 60);
    if (now - research.createdAt > maxResearchAge) {
      state.last_error = "Market research is stale; no trade was placed";
      await saveState(env.DB, state, tenantId);
      return result("research_stale", state.last_error, { createdAt: research.createdAt }, false);
    }
    if (signal.action === "WAIT") {
      state.last_error = null;
      await saveState(env.DB, state, tenantId);
      return result("no_setup", signal.reason, { signal, researchRisk: research.riskLevel });
    }
    if (!signal.closeTime || Date.now() - signal.closeTime > 5 * 60 * 1_000) {
      return result("signal_expired", "The breakout signal is older than five minutes; entry is skipped to avoid chasing price");
    }
    const researchGate = researchAllowsTrade(research, signal, settings);
    if (!researchGate.allowed) {
      state.last_error = null;
      await saveState(env.DB, state, tenantId);
      return result("research_veto", researchGate.reason, {
        technicalAction: signal.action,
        researchBias: research.bias,
        researchRisk: research.riskLevel,
        researchConfidence: research.confidence,
      });
    }
    if (state.last_trade_at && now - state.last_trade_at < settings.cooldown_minutes * 60) {
      return result("cooldown", "Trade cooldown is active", {
        remainingSeconds: settings.cooldown_minutes * 60 - (now - state.last_trade_at),
      });
    }

    const rules = await client.getSymbolRules(settings.symbol);
    const stopDistance = Math.max(signal.atr * 2.5, signal.price * 0.004);
    const estimatedStop = signal.action === "LONG" ? signal.price - stopDistance : signal.price + stopDistance;
    const quantity = calculateRiskSizedQuantity({
      equity,
      riskBps: settings.risk_bps,
      leverage: settings.leverage,
      maxNotionalUsdt: Math.min(settings.max_notional_usdt, account.availableBalance * settings.leverage),
      entryPrice: signal.price,
      stopPrice: estimatedStop,
      quantityStep: rules.quantityStep,
      minQuantity: rules.minQuantity,
      minNotional: rules.minNotional,
    });
    if (!quantity) {
      return result("size_blocked", "Risk-sized quantity is below Binance minimums or available margin", undefined, false);
    }

    await client.setIsolatedMargin(settings.symbol);
    await client.setLeverage(settings.symbol, settings.leverage);
    const entryClientId = newClientId("entry");
    const stopClientId = newClientId("sl");
    const takeProfitClientId = newClientId("tp");
    const entrySide = signal.action === "LONG" ? "BUY" : "SELL";
    const exitSide = signal.action === "LONG" ? "SELL" : "BUY";
    const quantityText = formatToPrecision(quantity, rules.quantityPrecision);

    // Persist intended ownership before sending the market order. A network timeout
    // can hide a successful fill; the next cycle must still recognize it as Nexus-owned.
    state.active_entry_client_id = entryClientId;
    state.active_entry_at = now;
    state.active_position_amount = String(signal.action === "LONG" ? quantity : -quantity);
    state.active_stop_client_id = stopClientId;
    state.active_take_profit_client_id = takeProfitClientId;
    state.updated_at = now;
    await saveState(env.DB, state, tenantId);

    let entryOrder: BinanceOrder;
    try {
      entryOrder = await client.placeMarketEntry({
        symbol: settings.symbol,
        side: entrySide,
        quantity: quantityText,
        clientOrderId: entryClientId,
      });
    } catch (placementError) {
      try {
        entryOrder = await client.getOrderByClientId(settings.symbol, entryClientId);
      } catch (lookupError) {
        if (lookupError instanceof BinanceApiError && lookupError.code === -2013) {
          const position = (await client.getPositions(settings.symbol))
            .find((item) => item.symbol === settings.symbol && Math.abs(Number(item.positionAmt)) > 0);
          if (!position) {
            clearManagedPositionState(state, now);
            await saveState(env.DB, state, tenantId);
            throw placementError;
          }
          entryOrder = {
            orderId: 0,
            clientOrderId: entryClientId,
            avgPrice: position.entryPrice,
            executedQty: String(Math.abs(Number(position.positionAmt))),
            status: "FILLED",
          };
        } else {
          throw new Error(`Entry acknowledgement is ambiguous; ownership is retained for automatic reconciliation: ${errorMessage(lookupError)}`);
        }
      }
    }
    const filledQuantity = Number(entryOrder.executedQty);
    const entryPrice = Number(entryOrder.avgPrice || signal.price) || signal.price;
    if (filledQuantity <= 0) {
      const reason = "Market entry returned no filled quantity; engine paused for manual review";
      const unexpectedPosition = (await client.getPositions(settings.symbol))
        .find((item) => item.symbol === settings.symbol && Math.abs(Number(item.positionAmt)) > 0);
      if (unexpectedPosition) {
        const unexpectedAmount = Number(unexpectedPosition.positionAmt);
        return emergencyCloseAndPause({
          env,
          client,
          state,
          symbol: settings.symbol,
          positionAmount: unexpectedAmount,
          quantity: formatToPrecision(Math.abs(unexpectedAmount), rules.quantityPrecision),
          reason,
          tenantId,
        });
      }
      clearManagedPositionState(state, now);
      await disableEngine(env, state, reason, tenantId);
      await recordEvent(env.DB, "critical", "entry_fill_unknown", reason, { orderId: entryOrder.orderId }, tenantId);
      return result("entry_unknown", reason, undefined, false);
    }

    state.last_trade_at = now;
    state.active_position_amount = String(signal.action === "LONG" ? filledQuantity : -filledQuantity);
    state.updated_at = now;
    try {
      await saveState(env.DB, state, tenantId);
    } catch (error) {
      return emergencyCloseAndPause({
        env,
        client,
        state,
        symbol: settings.symbol,
        positionAmount: signal.action === "LONG" ? filledQuantity : -filledQuantity,
        quantity: formatToPrecision(filledQuantity, rules.quantityPrecision),
        reason: `Managed-position persistence failed after entry: ${errorMessage(error)}`,
        tenantId,
      });
    }

    const actualStopDistance = Math.max(signal.atr * 2.5, entryPrice * 0.004);
    const stopPrice = roundPrice(
      signal.action === "LONG" ? entryPrice - actualStopDistance : entryPrice + actualStopDistance,
      rules,
    );
    const takeProfitPrice = roundPrice(
      signal.action === "LONG" ? entryPrice + actualStopDistance * 2 : entryPrice - actualStopDistance * 2,
      rules,
    );

    try {
      await client.placeCloseAllProtection({
        symbol: settings.symbol,
        side: exitSide,
        type: "STOP_MARKET",
        triggerPrice: formatToPrecision(stopPrice, rules.pricePrecision),
        clientAlgoId: stopClientId,
      });
      await client.placeCloseAllProtection({
        symbol: settings.symbol,
        side: exitSide,
        type: "TAKE_PROFIT_MARKET",
        triggerPrice: formatToPrecision(takeProfitPrice, rules.pricePrecision),
        clientAlgoId: takeProfitClientId,
      });
    } catch (error) {
      return emergencyCloseAndPause({
        env,
        client,
        state,
        symbol: settings.symbol,
        positionAmount: signal.action === "LONG" ? filledQuantity : -filledQuantity,
        quantity: formatToPrecision(filledQuantity, rules.quantityPrecision),
        reason: `Protective order placement failed: ${errorMessage(error)}`,
        tenantId,
      });
    }

    state.last_error = null;
    state.updated_at = now;
    await saveState(env.DB, state, tenantId);
    await recordEvent(env.DB, "info", "trade_opened", "Live position opened with exchange-native stop and take-profit", {
      symbol: settings.symbol,
      action: signal.action,
      quantity: quantityText,
      entryPrice,
      stopPrice,
      takeProfitPrice,
      riskBps: settings.risk_bps,
      leverage: settings.leverage,
      entryOrderId: entryOrder.orderId,
      entryClientId,
      stopClientId,
      takeProfitClientId,
    }, tenantId);
    return result("trade_opened", "Live trade opened and protected", {
      symbol: settings.symbol,
      action: signal.action,
      quantity: quantityText,
      entryPrice,
      stopPrice,
      takeProfitPrice,
    });
  } catch (error) {
    const message = errorMessage(error);
    if (state) {
      state.last_cycle_at = now;
      state.last_error = message;
      state.updated_at = now;
      await saveState(env.DB, state, tenantId).catch(() => undefined);
    }
    await recordEvent(env.DB, "warning", "cycle_failed", message, undefined, tenantId).catch(() => undefined);
    return result("cycle_failed", message, undefined, false);
  } finally {
    await releaseCycleLock(env.DB, tenantId).catch(() => undefined);
  }
}
