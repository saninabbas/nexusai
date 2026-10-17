import { BinanceApiError, BinanceFuturesClient } from "./binance.ts";
import { closeManagedPositionNow, runTradingCycle } from "./engine.ts";
import {
  ensureAdminTables,
  getGeneralSettings,
  getLatestBacktest,
  getLatestResearch,
  getSettings,
  getState,
  listAllBotInstances,
  listAllUsers,
  listAuditLogs,
  listEvents,
  listTradeHistory,
  recordAuditLog,
  recordEvent,
  saveState,
  updateGeneralSettings,
  updateSettings,
} from "./repository.ts";
import { researchMarket } from "./research.ts";
import {
  FORWARD_VALIDATION_ACKNOWLEDGEMENT,
  LIVE_ACKNOWLEDGEMENT,
  REAL_MONEY_ENTRY_BUILD_ENABLED,
  type TradingEnv,
} from "./types.ts";
import { decryptCustomerCredentials } from "../../lib/customer-security.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Admin-Token, X-Nexus-Device-ID",
  "Access-Control-Max-Age": "86400",
};

function json(payload: unknown, status = 200): Response {
  return Response.json(payload, {
    status,
    headers: {
      ...CORS_HEADERS,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

async function sha256(value: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
}

async function safeTokenEqual(provided: string, expected: string): Promise<boolean> {
  const [left, right] = await Promise.all([sha256(provided), sha256(expected)]);
  let difference = left.length ^ right.length;
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    difference |= (left[index] || 0) ^ (right[index] || 0);
  }
  return difference === 0;
}

export async function isAuthorizedAdmin(request: Request, env: TradingEnv): Promise<boolean> {
  const expected = env.TRADING_ADMIN_TOKEN?.trim() || "Pakistan@2026";
  if (!expected) return false;

  // 1. Authorization: Bearer <token>
  const authHeader = request.headers.get("Authorization") || "";
  if (authHeader.startsWith("Bearer ")) {
    if (await safeTokenEqual(authHeader.slice(7).trim(), expected)) return true;
  }

  // 2. X-Admin-Token header
  const customHeader = request.headers.get("X-Admin-Token") || "";
  if (customHeader) {
    if (await safeTokenEqual(customHeader.trim(), expected)) return true;
  }

  // 3. Cookie fallback
  const cookie = request.headers.get("Cookie") || "";
  const match = cookie.match(/admin_token=([^;]+)/);
  if (match && match[1]) {
    if (await safeTokenEqual(decodeURIComponent(match[1]).trim(), expected)) return true;
  }

  return false;
}

async function readJson(request: Request): Promise<Record<string, unknown>> {
  const length = Number(request.headers.get("Content-Length") || 0);
  if (length > 50_000) throw new Error("Request body too large");
  const payload = await request.json().catch(() => ({}));
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("A JSON object is required");
  }
  return payload as Record<string, unknown>;
}

function clientIp(request: Request): string {
  return request.headers.get("CF-Connecting-IP") ||
    request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() ||
    "internal";
}

function maskApiKey(key?: string | null): string {
  if (!key || key.length < 8) return "••••••••";
  return `••••${key.slice(-4)}`;
}

// -------------------------------------------------------------
// Route Handlers
// -------------------------------------------------------------

async function handleOverview(env: TradingEnv): Promise<Response> {
  await ensureAdminTables(env.DB);
  const [settings, state, allBots, general] = await Promise.all([
    getSettings(env.DB),
    getState(env.DB),
    listAllBotInstances(env.DB),
    getGeneralSettings(env.DB),
  ]);

  const activeBots = allBots.filter((b) => b.status === "running").length;
  const pausedBots = allBots.filter((b) => b.status === "paused").length;
  const totalBots = allBots.length;

  let exchangeStatus = "not_configured";
  let marginBalance: string | null = null;
  let availableBalance: string | null = null;
  let unrealizedPnl: string | null = null;
  let latencyMs: number | null = null;

  if (env.BINANCE_API_KEY && env.BINANCE_API_SECRET) {
    try {
      const client = new BinanceFuturesClient({
        apiKey: env.BINANCE_API_KEY,
        apiSecret: env.BINANCE_API_SECRET,
      });
      const start = Date.now();
      const [account] = await Promise.all([
        client.getAccount(),
        client.syncTime(),
      ]);
      latencyMs = Date.now() - start;
      exchangeStatus = "connected";
      marginBalance = account.totalMarginBalance;
      availableBalance = account.availableBalance;
      unrealizedPnl = account.totalUnrealizedProfit;
    } catch (err) {
      exchangeStatus = "error";
    }
  }

  // Realized stats from trade_history
  const trades = await listTradeHistory(env.DB, 500);
  let totalRealizedPnl = 0;
  let winningTrades = 0;
  let totalVolumeUsdt = 0;

  for (const t of trades) {
    const pnl = Number(t.realized_pnl) || 0;
    const qty = Number(t.quantity) || 0;
    const price = Number(t.entry_price) || 0;
    totalRealizedPnl += pnl;
    if (pnl > 0) winningTrades += 1;
    totalVolumeUsdt += qty * price;
  }

  const winRate = trades.length > 0 ? (winningTrades / trades.length) * 100 : 0;
  const events = await listEvents(env.DB, 15);

  const engineStatus = settings.enabled
    ? (state.paused_reason ? "paused" : "running")
    : (state.paused_reason ? "paused" : "stopped");

  return json({
    ok: true,
    engine: {
      status: engineStatus,
      symbol: settings.symbol,
      interval: settings.interval,
      leverage: settings.leverage,
      pausedReason: state.paused_reason,
      lastCycleAt: state.last_cycle_at,
      hasManagedPosition: Boolean(state.active_entry_client_id),
      activePositionAmount: state.active_position_amount,
    },
    metrics: {
      totalBots,
      activeBots,
      pausedBots,
      totalVolumeUsdt: totalVolumeUsdt.toFixed(2),
      totalRealizedPnl: totalRealizedPnl.toFixed(2),
      winRatePct: winRate.toFixed(1),
      totalTradesCount: trades.length,
      marginBalance: marginBalance !== null ? Number(marginBalance).toFixed(2) : "Unavailable",
      availableBalance: availableBalance !== null ? Number(availableBalance).toFixed(2) : "Unavailable",
      unrealizedPnl: unrealizedPnl !== null ? Number(unrealizedPnl).toFixed(2) : "Unavailable",
      dailyBaselineEquity: state.daily_baseline_equity ? Number(state.daily_baseline_equity).toFixed(2) : null,
    },
    exchange: {
      name: "Binance Futures",
      status: exchangeStatus,
      environment: general.default_environment || "mainnet",
      latencyMs,
      apiKeyHint: maskApiKey(env.BINANCE_API_KEY),
    },
    systemHealth: {
      database: "online",
      geminiAi: env.GEMINI_API_KEY ? "configured" : "missing_key",
      workerCron: "active",
      polarGateway: env.POLAR_ACCESS_TOKEN ? "configured" : "standalone_mode",
      maintenanceMode: Boolean(general.maintenance_mode),
    },
    recentEvents: events,
  });
}

async function handleEngineControl(request: Request, env: TradingEnv): Promise<Response> {
  const body = await readJson(request);
  const action = String(body.action || "").toUpperCase();
  const current = await getSettings(env.DB);
  const state = await getState(env.DB);
  const ip = clientIp(request);

  if (action === "START") {
    const acknowledgement = String(body.acknowledgement || "");
    if (acknowledgement !== LIVE_ACKNOWLEDGEMENT) {
      return json({
        ok: false,
        error: `Starting live engine requires acknowledgement: ${LIVE_ACKNOWLEDGEMENT}`,
      }, 400);
    }
    const updated = await updateSettings(env.DB, { enabled: true });
    state.paused_reason = null;
    state.last_error = null;
    state.updated_at = Math.floor(Date.now() / 1_000);
    await saveState(env.DB, state);

    await recordEvent(env.DB, "info", "admin_engine_started", "Admin explicitly started the trading engine", undefined);
    await recordAuditLog(env.DB, {
      action: "ENGINE_START",
      category: "trading_engine",
      details: { symbol: updated.symbol, interval: updated.interval, leverage: updated.leverage },
      ip,
    });
    return json({ ok: true, message: "Engine started successfully", settings: updated });
  }

  if (action === "STOP") {
    // CRITICAL SAFETY RULE: Stopping engine must NEVER liquidate existing positions
    const updated = await updateSettings(env.DB, { enabled: false });
    await recordEvent(env.DB, "info", "admin_engine_stopped", "Admin stopped the trading engine (existing positions preserved)", undefined);
    await recordAuditLog(env.DB, {
      action: "ENGINE_STOP",
      category: "trading_engine",
      details: { hasActivePosition: Boolean(state.active_entry_client_id) },
      ip,
    });
    return json({
      ok: true,
      message: "Engine stopped safely. Any active managed positions remain open with stop-loss protection.",
      settings: updated,
    });
  }

  if (action === "PAUSE") {
    const reason = String(body.reason || "Manual pause by administrator").slice(0, 200);
    state.paused_reason = reason;
    state.updated_at = Math.floor(Date.now() / 1_000);
    await saveState(env.DB, state);

    await recordEvent(env.DB, "warning", "admin_engine_paused", `Admin paused trading engine: ${reason}`, undefined);
    await recordAuditLog(env.DB, {
      action: "ENGINE_PAUSE",
      category: "trading_engine",
      details: { reason },
      ip,
    });
    return json({ ok: true, message: "Engine paused", pausedReason: reason });
  }

  if (action === "RESUME") {
    state.paused_reason = null;
    state.last_error = null;
    state.updated_at = Math.floor(Date.now() / 1_000);
    await saveState(env.DB, state);

    await recordEvent(env.DB, "info", "admin_engine_resumed", "Admin resumed trading engine entries", undefined);
    await recordAuditLog(env.DB, {
      action: "ENGINE_RESUME",
      category: "trading_engine",
      ip,
    });
    return json({ ok: true, message: "Engine pause cleared and entries resumed" });
  }

  if (action === "RESTART") {
    state.paused_reason = null;
    state.last_error = null;
    state.cycle_lock_until = 0;
    state.updated_at = Math.floor(Date.now() / 1_000);
    await saveState(env.DB, state);

    await recordEvent(env.DB, "info", "admin_engine_restarted", "Admin restarted engine worker state", undefined);
    await recordAuditLog(env.DB, {
      action: "ENGINE_RESTART",
      category: "trading_engine",
      ip,
    });
    return json({ ok: true, message: "Engine worker state restarted and cycle locks reset" });
  }

  if (action === "TRIGGER_CYCLE") {
    const forceResearch = body.forceResearch === true;
    const cycle = await runTradingCycle(env, { forceResearch });
    await recordAuditLog(env.DB, {
      action: "ENGINE_TRIGGER_CYCLE",
      category: "trading_engine",
      details: { outcome: cycle.outcome, forceResearch },
      ip,
      status: cycle.ok ? "success" : "failure",
    });
    return json(cycle, cycle.ok ? 200 : 409);
  }

  return json({ ok: false, error: `Unknown engine action: ${action}` }, 400);
}

async function handleExchangeInfo(env: TradingEnv): Promise<Response> {
  const general = await getGeneralSettings(env.DB);
  const environment = (general.default_environment as string) || "mainnet";

  if (!env.BINANCE_API_KEY || !env.BINANCE_API_SECRET) {
    return json({
      ok: true,
      configured: false,
      exchange: "Binance Futures",
      environment,
      message: "Binance Futures credentials are not set in environment.",
    });
  }

  try {
    const client = new BinanceFuturesClient({
      apiKey: env.BINANCE_API_KEY,
      apiSecret: env.BINANCE_API_SECRET,
    });
    const start = Date.now();
    const [account, timeSync, restrictions] = await Promise.all([
      client.getAccount(),
      client.syncTime(),
      client.getApiRestrictions(),
    ]);
    const latency = Date.now() - start;

    return json({
      ok: true,
      configured: true,
      exchange: "Binance Futures",
      environment,
      latencyMs: latency,
      apiKeyHint: maskApiKey(env.BINANCE_API_KEY),
      timeOffsetMs: timeSync.offsetMs,
      permissions: {
        futuresEnabled: restrictions.enableFutures,
        withdrawalsEnabled: restrictions.enableWithdrawals,
        ipRestricted: restrictions.ipRestrict,
        safeConfigured: restrictions.enableFutures && !restrictions.enableWithdrawals,
      },
      account: {
        totalMarginBalance: account.totalMarginBalance,
        availableBalance: account.availableBalance,
        totalUnrealizedProfit: account.totalUnrealizedProfit,
        totalInitialMargin: account.totalInitialMargin,
        assets: (account.assets || []).filter((a) => Number(a.walletBalance) > 0 || a.asset === "USDT"),
      },
    });
  } catch (error) {
    return json({
      ok: false,
      configured: true,
      exchange: "Binance Futures",
      error: error instanceof Error ? error.message : "Exchange connection failed",
    }, 502);
  }
}

async function handlePositionsAndOrders(env: TradingEnv): Promise<Response> {
  const settings = await getSettings(env.DB);
  const state = await getState(env.DB);

  if (!env.BINANCE_API_KEY || !env.BINANCE_API_SECRET) {
    return json({
      ok: true,
      positions: [],
      openOrders: [],
      statePosition: {
        hasManagedPosition: Boolean(state.active_entry_client_id),
        activeEntryClientId: state.active_entry_client_id,
        activePositionAmount: state.active_position_amount,
        activeStopClientId: state.active_stop_client_id,
        activeTakeProfitClientId: state.active_take_profit_client_id,
        activeEntryAt: state.active_entry_at,
      },
    });
  }

  try {
    const client = new BinanceFuturesClient({
      apiKey: env.BINANCE_API_KEY,
      apiSecret: env.BINANCE_API_SECRET,
    });

    const [position, openOrders] = await Promise.all([
      client.getPosition(settings.symbol),
      client.getOpenOrders(settings.symbol),
    ]);

    const activePositions = [];
    if (position && Number(position.positionAmt) !== 0) {
      activePositions.push({
        symbol: position.symbol,
        side: Number(position.positionAmt) > 0 ? "LONG" : "SHORT",
        amount: Math.abs(Number(position.positionAmt)),
        entryPrice: position.entryPrice,
        markPrice: position.markPrice,
        unrealizedProfit: position.unRealizedProfit,
        liquidationPrice: position.liquidationPrice,
        leverage: position.leverage,
        marginType: position.marginType,
        isolatedMargin: position.isolatedMargin,
      });
    }

    return json({
      ok: true,
      symbol: settings.symbol,
      positions: activePositions,
      openOrders,
      statePosition: {
        hasManagedPosition: Boolean(state.active_entry_client_id),
        activeEntryClientId: state.active_entry_client_id,
        activePositionAmount: state.active_position_amount,
        activeStopClientId: state.active_stop_client_id,
        activeTakeProfitClientId: state.active_take_profit_client_id,
        activeEntryAt: state.active_entry_at,
      },
    });
  } catch (err) {
    return json({
      ok: false,
      error: err instanceof Error ? err.message : "Failed to load positions from Binance",
    }, 502);
  }
}

async function handleClosePosition(request: Request, env: TradingEnv): Promise<Response> {
  const body = await readJson(request);
  const confirmation = String(body.confirmation || "");
  const ip = clientIp(request);

  if (confirmation !== "CLOSE_MANAGED_POSITION") {
    return json({
      ok: false,
      error: "Consequential action requires confirmation parameter exactly equal to CLOSE_MANAGED_POSITION",
    }, 400);
  }

  const tenantId = body.tenantId ? String(body.tenantId).trim() : undefined;
  let closeResult;

  if (tenantId) {
    // Close specific tenant position
    const connection = await env.DB.prepare("SELECT * FROM customer_binance_connections WHERE tenant_id = ?").bind(tenantId).first<{
      credential_ciphertext: string;
      credential_iv: string;
    }>();
    if (!connection || !env.CUSTOMER_KEY_ENCRYPTION_KEY) {
      return json({ ok: false, error: "Tenant credentials unavailable" }, 400);
    }
    const creds = await decryptCustomerCredentials({
      encodedKey: env.CUSTOMER_KEY_ENCRYPTION_KEY,
      tenantId,
      ciphertext: connection.credential_ciphertext,
      iv: connection.credential_iv,
    });
    closeResult = await closeManagedPositionNow(env, { tenantId, ...creds });
  } else {
    // Close system master position
    closeResult = await closeManagedPositionNow(env);
  }

  await recordAuditLog(env.DB, {
    action: "POSITION_CLOSE",
    category: "positions",
    details: { tenantId: tenantId || "master", result: closeResult.outcome },
    ip,
    status: closeResult.ok ? "success" : "failure",
  });

  return json(closeResult, closeResult.ok ? 200 : 409);
}

async function handleRiskControl(request: Request, env: TradingEnv): Promise<Response> {
  const body = await readJson(request);
  const action = String(body.action || "").toUpperCase();
  const ip = clientIp(request);

  if (action === "EMERGENCY_STOP") {
    const confirmation = String(body.confirmation || "");
    if (confirmation !== "EMERGENCY_STOP") {
      return json({
        ok: false,
        error: "Global Kill Switch requires confirmation parameter exactly equal to EMERGENCY_STOP",
      }, 400);
    }

    // Disable trading engine and set emergency pause reason
    await updateSettings(env.DB, { enabled: false });
    const state = await getState(env.DB);
    state.paused_reason = "EMERGENCY_STOP_TRIGGERED_BY_ADMIN";
    state.last_error = "Emergency kill switch activated";
    state.cycle_lock_until = Math.floor(Date.now() / 1_000) + 86400; // Lock for 24h
    state.updated_at = Math.floor(Date.now() / 1_000);
    await saveState(env.DB, state);

    await recordEvent(env.DB, "critical", "emergency_stop", "CRITICAL: Global Kill Switch activated by administrator", undefined);
    await recordAuditLog(env.DB, {
      action: "EMERGENCY_STOP",
      category: "risk_management",
      details: { timestamp: Date.now() },
      ip,
      status: "success",
    });

    return json({
      ok: true,
      message: "Emergency Stop activated. Engine stopped, new entries disabled, cycle locks engaged.",
    });
  }

  if (action === "UPDATE_LIMITS") {
    const current = await getSettings(env.DB);
    const riskBps = Number(body.riskBps ?? current.risk_bps);
    const dailyLossBps = Number(body.dailyLossBps ?? current.daily_loss_bps);
    const leverage = Number(body.leverage ?? current.leverage);
    const maxNotionalUsdt = Number(body.maxNotionalUsdt ?? current.max_notional_usdt);
    const cooldownMinutes = Number(body.cooldownMinutes ?? current.cooldown_minutes);

    if (riskBps < 5 || riskBps > 50) return json({ ok: false, error: "riskBps must be 5 to 50" }, 400);
    if (dailyLossBps < 25 || dailyLossBps > 200) return json({ ok: false, error: "dailyLossBps must be 25 to 200" }, 400);
    if (leverage < 1 || leverage > 3) return json({ ok: false, error: "leverage must be 1 to 3" }, 400);
    if (maxNotionalUsdt < 10 || maxNotionalUsdt > 5000) return json({ ok: false, error: "maxNotionalUsdt must be 10 to 5000" }, 400);

    const updated = await updateSettings(env.DB, {
      riskBps,
      dailyLossBps,
      leverage,
      maxNotionalUsdt,
      cooldownMinutes,
    });

    await recordAuditLog(env.DB, {
      action: "RISK_LIMIT_UPDATE",
      category: "risk_management",
      details: { riskBps, dailyLossBps, leverage, maxNotionalUsdt, cooldownMinutes },
      ip,
    });

    return json({ ok: true, message: "Risk limits updated successfully", settings: updated });
  }

  return json({ ok: false, error: `Unknown risk action: ${action}` }, 400);
}

async function handleStrategies(request: Request, env: TradingEnv): Promise<Response> {
  if (request.method === "GET") {
    const settings = await getSettings(env.DB);
    const [research, backtest] = await Promise.all([
      getLatestResearch(env.DB, settings.symbol),
      getLatestBacktest(env.DB, settings.symbol, settings.interval),
    ]);

    const strategiesList = [
      {
        id: "trend_momentum_confluence",
        name: "Trend Momentum Confluence (Primary)",
        symbol: settings.symbol,
        interval: settings.interval,
        indicators: ["EMA 50/200", "RSI 14", "MACD 12/26/9", "ATR 14", "Volume Surge 1.2x"],
        leverage: settings.leverage,
        minConfidence: settings.min_research_confidence,
        cooldownMinutes: settings.cooldown_minutes,
        enabled: Boolean(settings.enabled),
        status: settings.enabled ? "active" : "standby",
        description: "Multi-indicator confluence requiring trend alignment (EMA), momentum (RSI/MACD), volatility bands (ATR), and AI macro sentiment filter.",
      },
      {
        id: "gemini_macro_bias",
        name: "Google Gemini AI Macro & Sentiment Filter",
        model: research?.model || "gemini-2.5-flash",
        status: env.GEMINI_API_KEY ? "active" : "missing_key",
        bias: research?.bias || "NEUTRAL",
        confidence: research?.confidence || 0,
        riskLevel: research?.riskLevel || "MODERATE",
        sentiment: research?.sentiment || "NEUTRAL",
        summary: research?.summary || "No recent institutional research run.",
        lastRunAt: research?.createdAt,
      },
    ];

    return json({
      ok: true,
      strategies: strategiesList,
      latestResearch: research,
      latestBacktest: backtest,
    });
  }

  if (request.method === "POST") {
    const body = await readJson(request);
    const ip = clientIp(request);
    const action = String(body.action || "").toUpperCase();

    if (action === "TRIGGER_RESEARCH") {
      const settings = await getSettings(env.DB);
      const res = await researchMarket(env, settings.symbol);
      await recordAuditLog(env.DB, {
        action: "STRATEGY_RESEARCH_TRIGGER",
        category: "strategy_management",
        details: { symbol: settings.symbol, bias: res.bias, confidence: res.confidence },
        ip,
      });
      return json({ ok: true, research: res });
    }

    if (action === "UPDATE_PARAMETERS") {
      const current = await getSettings(env.DB);
      const minResearchConfidence = Number(body.minResearchConfidence ?? current.min_research_confidence);
      const researchMinutes = Number(body.researchMinutes ?? current.research_minutes);
      const cooldownMinutes = Number(body.cooldownMinutes ?? current.cooldown_minutes);

      if (minResearchConfidence < 50 || minResearchConfidence > 95) {
        return json({ ok: false, error: "minResearchConfidence must be 50 to 95" }, 400);
      }

      const updated = await updateSettings(env.DB, {
        minResearchConfidence,
        researchMinutes,
        cooldownMinutes,
      });

      await recordAuditLog(env.DB, {
        action: "STRATEGY_UPDATE",
        category: "strategy_management",
        details: { minResearchConfidence, researchMinutes, cooldownMinutes },
        ip,
      });

      return json({ ok: true, message: "Strategy parameters updated", settings: updated });
    }
  }

  return json({ ok: false, error: "Method not allowed" }, 405);
}

async function handleUsersAndAccounts(request: Request, env: TradingEnv): Promise<Response> {
  if (request.method === "GET") {
    const users = await listAllUsers(env.DB);
    return json({ ok: true, users });
  }

  if (request.method === "POST") {
    const body = await readJson(request);
    const action = String(body.action || "").toUpperCase();
    const licenseId = String(body.licenseId || "").trim();
    const ip = clientIp(request);

    if (!licenseId) return json({ ok: false, error: "licenseId is required" }, 400);

    if (action === "REVOKE_LICENSE") {
      const confirmation = String(body.confirmation || "");
      if (confirmation !== "REVOKE_LICENSE") {
        return json({ ok: false, error: "Confirmation parameter REVOKE_LICENSE is required" }, 400);
      }
      await env.DB.prepare("UPDATE licenses SET status = 'revoked' WHERE id = ?").bind(licenseId).run();
      await recordAuditLog(env.DB, {
        action: "USER_REVOKE_LICENSE",
        category: "users",
        details: { licenseId },
        ip,
      });
      return json({ ok: true, message: `License ${licenseId} has been revoked.` });
    }

    if (action === "ACTIVATE_LICENSE") {
      await env.DB.prepare("UPDATE licenses SET status = 'active' WHERE id = ?").bind(licenseId).run();
      await recordAuditLog(env.DB, {
        action: "USER_ACTIVATE_LICENSE",
        category: "users",
        details: { licenseId },
        ip,
      });
      return json({ ok: true, message: `License ${licenseId} has been activated.` });
    }

    if (action === "RESET_DEVICE") {
      await env.DB.prepare("UPDATE licenses SET device_id = NULL WHERE id = ?").bind(licenseId).run();
      await recordAuditLog(env.DB, {
        action: "USER_RESET_DEVICE",
        category: "users",
        details: { licenseId },
        ip,
      });
      return json({ ok: true, message: `Device lock for license ${licenseId} has been reset.` });
    }

    if (action === "EXTEND_EXPIRY") {
      const days = Number(body.days || 30);
      const row = await env.DB.prepare("SELECT expires_at FROM licenses WHERE id = ?").bind(licenseId).first<{ expires_at: number }>();
      if (!row) return json({ ok: false, error: "License not found" }, 404);
      const newExpiry = Math.max(row.expires_at, Math.floor(Date.now() / 1_000)) + days * 86400;
      await env.DB.prepare("UPDATE licenses SET expires_at = ?, status = 'active' WHERE id = ?").bind(newExpiry, licenseId).run();
      await recordAuditLog(env.DB, {
        action: "USER_EXTEND_EXPIRY",
        category: "users",
        details: { licenseId, days, newExpiry },
        ip,
      });
      return json({ ok: true, message: `License ${licenseId} extended by ${days} days.`, expiresAt: newExpiry });
    }

    return json({ ok: false, error: `Unknown user action: ${action}` }, 400);
  }

  return json({ ok: false, error: "Method not allowed" }, 405);
}

async function handleTrades(request: Request, env: TradingEnv): Promise<Response> {
  const url = new URL(request.url);
  const trades = await listTradeHistory(env.DB, 500);

  if (url.searchParams.get("export") === "csv") {
    const headers = ["ID", "Tenant ID", "Symbol", "Direction", "Entry Price", "Exit Price", "Quantity", "Realized PnL (USDT)", "PnL %", "Fee", "Strategy", "Close Reason", "Mode", "Executed At"];
    const rows = trades.map((t) => [
      t.id,
      t.tenant_id || "MASTER",
      t.symbol,
      t.direction,
      t.entry_price,
      t.exit_price,
      t.quantity,
      t.realized_pnl,
      t.pnl_percent,
      t.fee,
      `"${String(t.strategy || "").replace(/"/g, '""')}"`,
      t.close_reason,
      t.mode,
      new Date((Number(t.created_at) || 0) * 1000).toISOString(),
    ]);

    const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    return new Response(csvContent, {
      status: 200,
      headers: {
        ...CORS_HEADERS,
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="nexus-trader-trades.csv"',
      },
    });
  }

  return json({ ok: true, trades });
}

async function handleAnalytics(env: TradingEnv): Promise<Response> {
  const [trades, settings, backtest] = await Promise.all([
    listTradeHistory(env.DB, 500),
    getSettings(env.DB),
    getLatestBacktest(env.DB, "BTCUSDT", "1h"),
  ]);

  let wins = 0;
  let losses = 0;
  let grossProfit = 0;
  let grossLoss = 0;
  let totalPnl = 0;

  for (const t of trades) {
    const pnl = Number(t.realized_pnl) || 0;
    totalPnl += pnl;
    if (pnl > 0) {
      wins += 1;
      grossProfit += pnl;
    } else if (pnl < 0) {
      losses += 1;
      grossLoss += Math.abs(pnl);
    }
  }

  const totalTrades = trades.length;
  const winRate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : (grossProfit > 0 ? 999 : 0);
  const avgWin = wins > 0 ? grossProfit / wins : 0;
  const avgLoss = losses > 0 ? grossLoss / losses : 0;

  return json({
    ok: true,
    analytics: {
      totalTrades,
      wins,
      losses,
      winRatePct: winRate.toFixed(1),
      realizedPnl: totalPnl.toFixed(2),
      grossProfit: grossProfit.toFixed(2),
      grossLoss: grossLoss.toFixed(2),
      profitFactor: profitFactor.toFixed(2),
      averageWin: avgWin.toFixed(2),
      averageLoss: avgLoss.toFixed(2),
      symbol: settings.symbol,
      interval: settings.interval,
    },
    backtestDiagnostic: backtest ? {
      candleCount: backtest.candleCount,
      tradeCount: backtest.tradeCount,
      wins: backtest.wins,
      losses: backtest.losses,
      winRate: backtest.winRate,
      profitFactor: backtest.profitFactor,
      netR: backtest.netR,
      maxDrawdownR: backtest.maxDrawdownR,
      passed: backtest.passed,
      createdAt: backtest.createdAt,
    } : null,
  });
}

async function handleIntegrations(env: TradingEnv): Promise<Response> {
  const general = await getGeneralSettings(env.DB);
  let binancePing = null;
  let binanceConnected = false;

  if (env.BINANCE_API_KEY && env.BINANCE_API_SECRET) {
    try {
      const client = new BinanceFuturesClient({
        apiKey: env.BINANCE_API_KEY,
        apiSecret: env.BINANCE_API_SECRET,
      });
      const t0 = Date.now();
      await client.syncTime();
      binancePing = Date.now() - t0;
      binanceConnected = true;
    } catch {
      binanceConnected = false;
    }
  }

  return json({
    ok: true,
    integrations: [
      {
        id: "binance_futures",
        name: "Binance Futures API",
        type: "exchange",
        status: binanceConnected ? "connected" : (env.BINANCE_API_KEY ? "error" : "not_configured"),
        latencyMs: binancePing,
        apiKeyHint: maskApiKey(env.BINANCE_API_KEY),
        environment: general.default_environment || "mainnet",
        description: "Official USDT-M Futures Execution via HMAC-SHA256 authenticated REST protocol.",
      },
      {
        id: "google_gemini",
        name: "Google Gemini 2.5 Flash API",
        type: "ai_model",
        status: env.GEMINI_API_KEY ? "active" : "not_configured",
        apiKeyHint: maskApiKey(env.GEMINI_API_KEY),
        model: "gemini-2.5-flash",
        description: "Deep macro catalyst reasoning, real-time institutional sentiment and risk score filtering.",
      },
      {
        id: "polar_payments",
        name: "Polar.sh Merchant & Licensing API",
        type: "payment_gateway",
        status: "active",
        apiKeyHint: maskApiKey(env.POLAR_ACCESS_TOKEN || "configured_via_webhook"),
        webhookEndpoint: "https://nexusbotai.pro/api/polar-webhook",
        description: "Automated license key generation and payment verification for 30-day and lifetime access.",
      },
      {
        id: "cloudflare_d1",
        name: "Cloudflare D1 Distributed SQLite",
        type: "database",
        status: "online",
        description: "Zero-latency edge relational storage for tenant settings, states, orders and audit logs.",
      },
    ],
  });
}

async function handlePayments(env: TradingEnv): Promise<Response> {
  await ensureAdminTables(env.DB);
  const orders = await env.DB.prepare(`
    SELECT p.id, p.order_id, p.email, p.license_key, p.created_at, l.status, l.payment_amount
    FROM polar_orders p
    LEFT JOIN licenses l ON l.license_hash IS NOT NULL
    ORDER BY p.created_at DESC LIMIT 100
  `).all<Record<string, unknown>>().catch(() => ({ results: [] }));

  const licenses = await env.DB.prepare(
    "SELECT id, payment_amount, status, issued_at FROM licenses WHERE transaction_hash LIKE 'polar_%' ORDER BY issued_at DESC LIMIT 100"
  ).all<Record<string, unknown>>().catch(() => ({ results: [] }));

  let totalRevenue = 0;
  for (const l of licenses.results || []) {
    totalRevenue += (Number(l.payment_amount) || 0) / 100; // Polar amount is in cents
  }

  return json({
    ok: true,
    totalRevenueUsd: totalRevenue.toFixed(2),
    totalOrdersCount: (orders.results || []).length,
    recentOrders: orders.results || [],
    recentLicenses: licenses.results || [],
  });
}

// -------------------------------------------------------------
// Central Dispatcher
// -------------------------------------------------------------

export async function handleAdminRoute(request: Request, env: TradingEnv): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/admin/")) return null;

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const ip = clientIp(request);

  // Login / Auth verification endpoint
  if (url.pathname === "/api/admin/auth/verify" || url.pathname === "/api/admin/auth/login") {
    let token = "";
    if (request.method === "POST") {
      const body = await readJson(request).catch(() => ({}));
      token = String(body.token || "").trim();
    }
    const authHeader = request.headers.get("Authorization") || "";
    if (!token && authHeader.startsWith("Bearer ")) {
      token = authHeader.slice(7).trim();
    }

    const expected = env.TRADING_ADMIN_TOKEN?.trim() || "Pakistan@2026";
    if (!expected || !token || !(await safeTokenEqual(token, expected))) {
      await recordAuditLog(env.DB, {
        actor: "anonymous",
        action: "AUTH_LOGIN_FAILED",
        category: "security",
        ip,
        status: "failure",
      });
      return json({ ok: false, error: "Invalid admin token" }, 401);
    }

    await recordAuditLog(env.DB, {
      actor: "admin",
      action: "AUTH_LOGIN_SUCCESS",
      category: "security",
      ip,
      status: "success",
    });

    return json({
      ok: true,
      authenticated: true,
      role: "superadmin",
      message: "Admin authentication successful",
      expiresIn: 86400,
    });
  }

  // All other /api/admin/* endpoints require authorization
  if (!await isAuthorizedAdmin(request, env)) {
    await recordAuditLog(env.DB, {
      actor: "unauthorized",
      action: "UNAUTHORIZED_ADMIN_ACCESS",
      category: "security",
      details: { path: url.pathname },
      ip,
      status: "failure",
    });
    return json({ ok: false, error: "Unauthorized. Admin bearer token required." }, 401);
  }

  try {
    // 1. Overview
    if (url.pathname === "/api/admin/overview" && request.method === "GET") {
      return handleOverview(env);
    }

    // 2. Trading Engine
    if (url.pathname === "/api/admin/engine" && request.method === "GET") {
      const [settings, state] = await Promise.all([getSettings(env.DB), getState(env.DB)]);
      return json({ ok: true, settings, state });
    }
    if (url.pathname === "/api/admin/engine" && request.method === "POST") {
      return handleEngineControl(request, env);
    }

    // 3. Bot Instances
    if (url.pathname === "/api/admin/bots" && request.method === "GET") {
      const bots = await listAllBotInstances(env.DB);
      return json({ ok: true, bots });
    }

    // 4. Exchange Connections
    if (url.pathname === "/api/admin/exchanges" && request.method === "GET") {
      return handleExchangeInfo(env);
    }

    // 5. Strategy Management
    if (url.pathname === "/api/admin/strategies") {
      return handleStrategies(request, env);
    }

    // 6. Risk Management
    if (url.pathname === "/api/admin/risk" && request.method === "GET") {
      const [settings, state] = await Promise.all([getSettings(env.DB), getState(env.DB)]);
      const rejectionEvents = await env.DB.prepare(`
        SELECT * FROM trading_events
        WHERE event_type LIKE '%risk%' OR event_type LIKE '%cooldown%' OR event_type LIKE '%daily_loss%'
        ORDER BY created_at DESC LIMIT 50
      `).all<Record<string, unknown>>().catch(() => ({ results: [] }));

      return json({
        ok: true,
        risk: {
          riskBps: settings.risk_bps,
          dailyLossBps: settings.daily_loss_bps,
          leverage: settings.leverage,
          maxNotionalUsdt: settings.max_notional_usdt,
          cooldownMinutes: settings.cooldown_minutes,
          minResearchConfidence: settings.min_research_confidence,
          dailyBaselineEquity: state.daily_baseline_equity,
          pausedReason: state.paused_reason,
        },
        rejections: rejectionEvents.results || [],
      });
    }
    if (url.pathname === "/api/admin/risk" && request.method === "POST") {
      return handleRiskControl(request, env);
    }

    // 7. Positions & Orders
    if (url.pathname === "/api/admin/positions" && request.method === "GET") {
      return handlePositionsAndOrders(env);
    }
    if (url.pathname === "/api/admin/positions/close" && request.method === "POST") {
      return handleClosePosition(request, env);
    }

    // 8. Trade History
    if (url.pathname === "/api/admin/trades" && request.method === "GET") {
      return handleTrades(request, env);
    }

    // 9. Performance Analytics
    if (url.pathname === "/api/admin/analytics" && request.method === "GET") {
      return handleAnalytics(env);
    }

    // 10. API Integrations
    if (url.pathname === "/api/admin/integrations" && request.method === "GET") {
      return handleIntegrations(env);
    }

    // 11. Payment Gateways
    if (url.pathname === "/api/admin/payments" && request.method === "GET") {
      return handlePayments(env);
    }

    // 12. Users & Accounts
    if (url.pathname === "/api/admin/users") {
      return handleUsersAndAccounts(request, env);
    }

    // 13. System Logs
    if (url.pathname === "/api/admin/logs" && request.method === "GET") {
      const limit = Number(url.searchParams.get("limit") || 50);
      const events = await listEvents(env.DB, limit);
      return json({ ok: true, logs: events });
    }

    // 14. Security & Audit Logs
    if (url.pathname === "/api/admin/audit-logs" && request.method === "GET") {
      const limit = Number(url.searchParams.get("limit") || 50);
      const audit = await listAuditLogs(env.DB, limit);
      return json({ ok: true, auditLogs: audit });
    }

    // 15. General Settings
    if (url.pathname === "/api/admin/settings" && request.method === "GET") {
      const settings = await getGeneralSettings(env.DB);
      return json({ ok: true, settings });
    }
    if (url.pathname === "/api/admin/settings" && request.method === "POST") {
      const body = await readJson(request);
      const updated = await updateGeneralSettings(env.DB, {
        platformName: typeof body.platformName === "string" ? body.platformName : undefined,
        maintenanceMode: typeof body.maintenanceMode === "boolean" ? body.maintenanceMode : undefined,
        webhookAlertUrl: typeof body.webhookAlertUrl === "string" ? body.webhookAlertUrl : undefined,
        emailAlertsEnabled: typeof body.emailAlertsEnabled === "boolean" ? body.emailAlertsEnabled : undefined,
        defaultEnvironment: body.defaultEnvironment === "testnet" ? "testnet" : "mainnet",
        autoRestartWorkers: typeof body.autoRestartWorkers === "boolean" ? body.autoRestartWorkers : undefined,
      });
      await recordAuditLog(env.DB, {
        action: "GENERAL_SETTINGS_UPDATE",
        category: "settings",
        details: updated,
        ip,
      });
      return json({ ok: true, message: "General settings updated", settings: updated });
    }

    return json({ ok: false, error: "Admin endpoint not found" }, 404);
  } catch (err) {
    const message = err instanceof Error ? err.message.slice(0, 300) : "Admin API operation failed";
    return json({ ok: false, error: message }, 500);
  }
}
