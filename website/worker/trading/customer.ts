import {
  authenticateCustomer,
  decryptCustomerCredentials,
  encryptCustomerCredentials,
  type CustomerIdentity,
} from "../../lib/customer-security";
import { BinanceFuturesClient } from "./binance";
import { closeManagedPositionNow, runTradingCycle } from "./engine";
import {
  ensureTradingRows,
  getLatestBacktest,
  getLatestResearch,
  getSettings,
  getState,
  listDueTenants,
  listEvents,
  recordEvent,
  saveState,
  updateSettings,
} from "./repository";
import {
  FORWARD_VALIDATION_ACKNOWLEDGEMENT,
  LIVE_ACKNOWLEDGEMENT,
  REAL_MONEY_ENTRY_BUILD_ENABLED,
  type TradingEnv,
  type TradingSettings,
} from "./types";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Nexus-Device-ID",
  "Access-Control-Max-Age": "86400",
};

interface ConnectionRow {
  tenant_id: string;
  credential_ciphertext: string;
  credential_iv: string;
  key_version: number;
  api_key_hint: string;
  status: string;
  account_equity: string | null;
  connected_at: number;
  last_verified_at: number;
  last_error: string | null;
  updated_at: number;
}

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

async function readJson(request: Request): Promise<Record<string, unknown>> {
  const length = Number(request.headers.get("Content-Length") || 0);
  if (length > 20_000) throw new Error("Request body is too large");
  const payload = await request.json();
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("A JSON object is required");
  return payload as Record<string, unknown>;
}

async function getConnection(db: D1Database, tenantId: string): Promise<ConnectionRow | null> {
  return db.prepare("SELECT * FROM customer_binance_connections WHERE tenant_id = ?")
    .bind(tenantId)
    .first<ConnectionRow>();
}

function publicSettings(settings: TradingSettings) {
  return {
    enabled: Boolean(settings.enabled),
    symbol: settings.symbol,
    interval: settings.interval,
    riskBps: settings.risk_bps,
    dailyLossBps: settings.daily_loss_bps,
    leverage: settings.leverage,
    maxNotionalUsdt: settings.max_notional_usdt,
    minResearchConfidence: settings.min_research_confidence,
    cooldownMinutes: settings.cooldown_minutes,
    researchMinutes: settings.research_minutes,
    updatedAt: settings.updated_at,
  };
}

function customerGuardFailures(env: TradingEnv, connection: ConnectionRow | null): string[] {
  const failures: string[] = [];
  if (!REAL_MONEY_ENTRY_BUILD_ENABLED) failures.push("real-money entry is disabled in this public build");
  if (!connection || connection.status !== "active") failures.push("Binance account connection");
  if (!env.CUSTOMER_KEY_ENCRYPTION_KEY?.trim()) failures.push("credential vault");
  if (!env.GEMINI_API_KEY?.trim()) failures.push("Gemini research service");
  if (env.LIVE_TRADING_ALLOWED !== LIVE_ACKNOWLEDGEMENT) failures.push("platform live-trading approval");
  if (env.FORWARD_VALIDATION_APPROVED !== FORWARD_VALIDATION_ACKNOWLEDGEMENT) {
    failures.push("paper-forward validation approval");
  }
  return failures;
}

function integerField(body: Record<string, unknown>, key: string, fallback: number, min: number, max: number): number {
  if (body[key] === undefined) return fallback;
  const value = Number(body[key]);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${key} must be an integer from ${min} to ${max}`);
  }
  return value;
}

async function statusResponse(env: TradingEnv, identity: CustomerIdentity): Promise<Response> {
  const [settings, state, events, connection] = await Promise.all([
    getSettings(env.DB, identity.tenantId),
    getState(env.DB, identity.tenantId),
    listEvents(env.DB, 30, identity.tenantId),
    getConnection(env.DB, identity.tenantId),
  ]);
  const [research, backtest] = await Promise.all([
    getLatestResearch(env.DB, settings.symbol),
    getLatestBacktest(env.DB, settings.symbol, settings.interval),
  ]);
  const missing = customerGuardFailures(env, connection);
  const now = Math.floor(Date.now() / 1_000);
  const entryBlockers = [...missing];
  if (!backtest || now - backtest.createdAt > 24 * 60 * 60) entryBlockers.push("fresh walk-forward diagnostic");
  else if (!backtest.passed) entryBlockers.push("passing walk-forward diagnostic");
  const maxResearchAge = Math.max(15 * 60, settings.research_minutes * 2 * 60);
  if (!research || now - research.createdAt > maxResearchAge) entryBlockers.push("fresh Gemini research");
  return json({
    ok: true,
    execution: "binance-futures-mainnet",
    scheduler: "multi-tenant-worker-cron",
    liveReady: entryBlockers.length === 0,
    missingConfiguration: missing,
    entryBlockers,
    licenseExpiresAt: identity.licenseExpiresAt,
    sessionExpiresAt: identity.sessionExpiresAt,
    connection: connection ? {
      connected: connection.status === "active",
      status: connection.status,
      apiKeyHint: connection.api_key_hint,
      accountEquity: connection.account_equity === null ? null : Number(connection.account_equity),
      connectedAt: connection.connected_at,
      lastVerifiedAt: connection.last_verified_at,
      lastError: connection.last_error,
    } : { connected: false, status: "not_connected" },
    settings: publicSettings(settings),
    state: {
      dayKey: state.day_key,
      dailyBaselineEquity: state.daily_baseline_equity ? Number(state.daily_baseline_equity) : null,
      pausedReason: state.paused_reason,
      lastError: state.last_error,
      lastCycleAt: state.last_cycle_at,
      lastResearchAt: state.last_research_at,
      lastTradeAt: state.last_trade_at,
      hasManagedPosition: Boolean(state.active_entry_client_id),
      managedPositionAmount: state.active_position_amount === null ? null : Number(state.active_position_amount),
      hasExchangeProtection: Boolean(state.active_stop_client_id && state.active_take_profit_client_id),
    },
    research,
    backtest,
    events,
    safety: {
      credentialsStoredInExtension: false,
      encryptedPerCustomer: true,
      exchangeNativeProtection: true,
      isolatedMargin: true,
      maxOnePosition: true,
      paperForwardApprovalRequired: true,
      aiCanPlaceArbitraryOrders: false,
      profitGuaranteed: false,
    },
  });
}

function credentialField(body: Record<string, unknown>, key: string): string {
  const value = typeof body[key] === "string" ? body[key].trim() : "";
  if (value.length < 16 || value.length > 256 || /\s/.test(value)) throw new Error(`${key} is invalid`);
  return value;
}

async function connectResponse(request: Request, env: TradingEnv, identity: CustomerIdentity): Promise<Response> {
  if (!env.CUSTOMER_KEY_ENCRYPTION_KEY?.trim()) {
    return json({ ok: false, error: "Secure credential vault is not configured" }, 503);
  }
  const body = await readJson(request);
  if (body.withdrawalDisabled !== true || body.riskAccepted !== true) {
    return json({ ok: false, error: "Confirm that withdrawals are disabled and real-money risk is understood" }, 400);
  }
  const [settings, state] = await Promise.all([
    getSettings(env.DB, identity.tenantId),
    getState(env.DB, identity.tenantId),
  ]);
  if (settings.enabled || state.active_entry_client_id) {
    return json({ ok: false, error: "Disable live execution and close any managed position before replacing credentials" }, 409);
  }
  const apiKey = credentialField(body, "apiKey");
  const apiSecret = credentialField(body, "apiSecret");
  const client = new BinanceFuturesClient(apiKey, apiSecret);
  await client.syncTime();
  const [account, hedgeMode, restrictions] = await Promise.all([
    client.getAccount(),
    client.isHedgeMode(),
    client.getApiRestrictions(),
  ]);
  if (hedgeMode) {
    return json({ ok: false, error: "Switch Binance Futures to One-way Mode before connecting Nexus" }, 409);
  }
  if (restrictions.enableWithdrawals) {
    return json({ ok: false, error: "This Binance API key has withdrawals enabled. Disable withdrawals before connecting it to Nexus" }, 409);
  }
  if (!restrictions.enableFutures) {
    return json({ ok: false, error: "Enable Futures permission on this restricted Binance API key before connecting" }, 409);
  }
  if (!Number.isFinite(account.totalMarginBalance)) throw new Error("Binance Futures balance could not be verified");
  const encrypted = await encryptCustomerCredentials({
    encodedKey: env.CUSTOMER_KEY_ENCRYPTION_KEY,
    tenantId: identity.tenantId,
    credentials: { apiKey, apiSecret },
  });
  const now = Math.floor(Date.now() / 1_000);
  await env.DB.prepare(`INSERT INTO customer_binance_connections (
    tenant_id, credential_ciphertext, credential_iv, key_version, api_key_hint,
    status, account_equity, connected_at, last_verified_at, last_error, updated_at
  ) VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?, NULL, ?)
  ON CONFLICT(tenant_id) DO UPDATE SET
    credential_ciphertext = excluded.credential_ciphertext,
    credential_iv = excluded.credential_iv,
    key_version = excluded.key_version,
    api_key_hint = excluded.api_key_hint,
    status = 'active', account_equity = excluded.account_equity,
    connected_at = excluded.connected_at, last_verified_at = excluded.last_verified_at,
    last_error = NULL, updated_at = excluded.updated_at`)
    .bind(
      identity.tenantId,
      encrypted.ciphertext,
      encrypted.iv,
      encrypted.keyVersion,
      `••••${apiKey.slice(-4)}`,
      String(account.totalMarginBalance),
      now,
      now,
      now,
    ).run();
  await ensureTradingRows(env.DB, identity.tenantId);
  await recordEvent(env.DB, "info", "binance_connected", "Binance Futures account connected with encrypted customer credentials", {
    apiKeyHint: `••••${apiKey.slice(-4)}`,
    accountEquity: account.totalMarginBalance,
    withdrawalsEnabled: false,
    futuresPermission: true,
  }, identity.tenantId);
  return json({
    ok: true,
    connection: {
      connected: true,
      status: "active",
      apiKeyHint: `••••${apiKey.slice(-4)}`,
      accountEquity: account.totalMarginBalance,
      connectedAt: now,
      lastVerifiedAt: now,
    },
  });
}

async function disconnectResponse(env: TradingEnv, identity: CustomerIdentity): Promise<Response> {
  const [settings, state] = await Promise.all([
    getSettings(env.DB, identity.tenantId),
    getState(env.DB, identity.tenantId),
  ]);
  if (settings.enabled || state.active_entry_client_id) {
    return json({ ok: false, error: "Disable live execution and close any managed position before disconnecting Binance" }, 409);
  }
  await env.DB.prepare("DELETE FROM customer_binance_connections WHERE tenant_id = ?")
    .bind(identity.tenantId).run();
  await recordEvent(env.DB, "info", "binance_disconnected", "Encrypted Binance credentials were removed", undefined, identity.tenantId);
  return json({ ok: true, connection: { connected: false, status: "not_connected" } });
}

async function controlResponse(request: Request, env: TradingEnv, identity: CustomerIdentity): Promise<Response> {
  const body = await readJson(request);
  const [current, state, connection] = await Promise.all([
    getSettings(env.DB, identity.tenantId),
    getState(env.DB, identity.tenantId),
    getConnection(env.DB, identity.tenantId),
  ]);
  const enabled = typeof body.enabled === "boolean" ? body.enabled : Boolean(current.enabled);
  const clearPause = body.clearPause === true;
  const acknowledgement = typeof body.acknowledgement === "string" ? body.acknowledgement : "";
  if ((enabled || clearPause) && acknowledgement !== LIVE_ACKNOWLEDGEMENT) {
    return json({ ok: false, error: `acknowledgement must exactly equal ${LIVE_ACKNOWLEDGEMENT}` }, 400);
  }
  const missing = customerGuardFailures(env, connection);
  if (enabled && missing.length) {
    return json({ ok: false, error: "Live execution configuration is incomplete", missingConfiguration: missing }, 409);
  }
  if (enabled && state.paused_reason && !clearPause) {
    return json({ ok: false, error: "Engine is paused; review the reason and explicitly clear the pause", pausedReason: state.paused_reason }, 409);
  }
  if (enabled) {
    const [research, backtest] = await Promise.all([
      getLatestResearch(env.DB, current.symbol),
      getLatestBacktest(env.DB, current.symbol, current.interval),
    ]);
    const now = Math.floor(Date.now() / 1_000);
    if (!backtest || now - backtest.createdAt > 24 * 60 * 60 || !backtest.passed) {
      return json({
        ok: false,
        error: "Run the safety check first; live execution requires a fresh passing walk-forward diagnostic",
        backtest,
      }, 409);
    }
    const maxResearchAge = Math.max(15 * 60, current.research_minutes * 2 * 60);
    if (!research || now - research.createdAt > maxResearchAge) {
      return json({ ok: false, error: "Run the safety check first; fresh Gemini research is required" }, 409);
    }
  }
  if (!enabled && current.enabled && state.active_entry_client_id) {
    return json({
      ok: false,
      error: "A Nexus-managed position is still open. Use CLOSE LIVE POSITION so protection and monitoring are not abandoned",
    }, 409);
  }
  const updated = await updateSettings(env.DB, {
    enabled,
    symbol: "BTCUSDT",
    interval: "1h",
    riskBps: integerField(body, "riskBps", current.risk_bps, 5, 50),
    dailyLossBps: integerField(body, "dailyLossBps", current.daily_loss_bps, 25, 200),
    leverage: integerField(body, "leverage", current.leverage, 1, 3),
    maxNotionalUsdt: integerField(body, "maxNotionalUsdt", current.max_notional_usdt, 10, 5_000),
    minResearchConfidence: integerField(body, "minResearchConfidence", current.min_research_confidence, 55, 90),
    cooldownMinutes: integerField(body, "cooldownMinutes", current.cooldown_minutes, 60, 10_080),
    researchMinutes: integerField(body, "researchMinutes", current.research_minutes, 15, 120),
  }, identity.tenantId);
  if (clearPause) {
    state.paused_reason = null;
    state.last_error = null;
    state.updated_at = Math.floor(Date.now() / 1_000);
    await saveState(env.DB, state, identity.tenantId);
  }
  await recordEvent(env.DB, "info", enabled ? "engine_enabled" : "engine_disabled", enabled
    ? "Customer explicitly enabled real-money execution"
    : "Customer disabled real-money execution", {
    riskBps: updated.risk_bps,
    dailyLossBps: updated.daily_loss_bps,
    leverage: updated.leverage,
    maxNotionalUsdt: updated.max_notional_usdt,
  }, identity.tenantId);
  return json({ ok: true, settings: publicSettings(updated), pausedReason: clearPause ? null : state.paused_reason });
}

async function decryptConnection(env: TradingEnv, tenantId: string, connection: ConnectionRow) {
  if (!env.CUSTOMER_KEY_ENCRYPTION_KEY?.trim()) throw new Error("Secure credential vault is unavailable");
  return decryptCustomerCredentials({
    encodedKey: env.CUSTOMER_KEY_ENCRYPTION_KEY,
    tenantId,
    ciphertext: connection.credential_ciphertext,
    iv: connection.credential_iv,
  });
}

async function runResponse(env: TradingEnv, identity: CustomerIdentity): Promise<Response> {
  const [state, connection] = await Promise.all([
    getState(env.DB, identity.tenantId),
    getConnection(env.DB, identity.tenantId),
  ]);
  const now = Math.floor(Date.now() / 1_000);
  if (state.last_cycle_at && now - state.last_cycle_at < 30) {
    return json({ ok: false, error: "A live safety cycle ran recently; wait 30 seconds before running another" }, 429);
  }
  if (!connection || connection.status !== "active") return json({ ok: false, error: "Connect Binance first" }, 409);
  const credentials = await decryptConnection(env, identity.tenantId, connection);
  const cycle = await runTradingCycle(env, {
    tenant: { tenantId: identity.tenantId, ...credentials },
  });
  return json(cycle, cycle.ok ? 200 : 409);
}

async function closePositionResponse(request: Request, env: TradingEnv, identity: CustomerIdentity): Promise<Response> {
  const body = await readJson(request);
  if (body.confirmation !== "CLOSE_MANAGED_POSITION") {
    return json({ ok: false, error: "confirmation must exactly equal CLOSE_MANAGED_POSITION" }, 400);
  }
  const connection = await getConnection(env.DB, identity.tenantId);
  if (!connection || connection.status !== "active") return json({ ok: false, error: "Connected Binance credentials are required" }, 409);
  const credentials = await decryptConnection(env, identity.tenantId, connection);
  const cycle = await closeManagedPositionNow(env, { tenantId: identity.tenantId, ...credentials });
  return json(cycle, cycle.ok ? 200 : 409);
}

export async function handleCustomerRoute(request: Request, env: TradingEnv): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/customer/")) return null;
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  const identity = await authenticateCustomer(request, env.DB);
  if (!identity) return json({ ok: false, error: "Customer session is invalid or expired" }, 401);
  try {
    if (url.pathname === "/api/customer/status" && request.method === "GET") return statusResponse(env, identity);
    if (url.pathname === "/api/customer/binance/connect" && request.method === "POST") return connectResponse(request, env, identity);
    if (url.pathname === "/api/customer/binance/disconnect" && request.method === "DELETE") return disconnectResponse(env, identity);
    if (url.pathname === "/api/customer/control" && request.method === "POST") return controlResponse(request, env, identity);
    if (url.pathname === "/api/customer/run" && request.method === "POST") return runResponse(env, identity);
    if (url.pathname === "/api/customer/position/close" && request.method === "POST") return closePositionResponse(request, env, identity);
    return json({ ok: false, error: "Customer route not found" }, 404);
  } catch (error) {
    const message = (error instanceof Error ? error.message : "Customer API failed").slice(0, 300);
    return json({ ok: false, error: /no such table/i.test(message) ? "Customer database migration has not been applied" : message }, /no such table/i.test(message) ? 503 : 400);
  }
}

export async function runDueTenantBatch(env: TradingEnv, limit = 5): Promise<void> {
  if (!env.CUSTOMER_KEY_ENCRYPTION_KEY?.trim()) return;
  const dueTenants = await listDueTenants(env.DB, limit);
  const now = Math.floor(Date.now() / 1_000);
  for (const tenant of dueTenants) {
    const tenantId = tenant.tenantId;
    const connection = await getConnection(env.DB, tenantId);
    if (!connection || connection.status !== "active") continue;
    try {
      const credentials = await decryptConnection(env, tenantId, connection);
      if (tenant.hasManagedPosition && (tenant.licenseStatus !== "active" || tenant.licenseExpiresAt <= now)) {
        await closeManagedPositionNow(env, { tenantId, ...credentials }, {
          outcome: "license_expiry_exit",
          eventType: "license_expiry_exit",
          message: "Nexus closed the managed position because the customer licence expired or was revoked",
          eventLevel: "warning",
        });
      } else {
        await runTradingCycle(env, { tenant: { tenantId, ...credentials } });
      }
    } catch (error) {
      const message = (error instanceof Error ? error.message : "Tenant cycle failed").slice(0, 300);
      await env.DB.prepare("UPDATE customer_binance_connections SET status = 'error', last_error = ?, updated_at = ? WHERE tenant_id = ?")
        .bind(message, Math.floor(Date.now() / 1_000), tenantId).run().catch(() => undefined);
      await recordEvent(env.DB, "critical", "credential_vault_error", "Customer cycle stopped because credentials could not be decrypted", undefined, tenantId).catch(() => undefined);
    }
  }
}
