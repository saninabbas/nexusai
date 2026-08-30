import { runTradingCycle } from "./engine";
import {
  getLatestBacktest,
  getLatestResearch,
  getSettings,
  getState,
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
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
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

async function isAuthorized(request: Request, env: TradingEnv): Promise<boolean> {
  const expected = env.TRADING_ADMIN_TOKEN?.trim();
  if (!expected) return false;
  const header = request.headers.get("Authorization") || "";
  if (!header.startsWith("Bearer ")) return false;
  return safeTokenEqual(header.slice(7), expected);
}

function guardFailures(env: TradingEnv): string[] {
  const failures: string[] = [];
  if (!REAL_MONEY_ENTRY_BUILD_ENABLED) failures.push("real-money entry is disabled in this public build");
  if (env.LIVE_TRADING_ALLOWED !== LIVE_ACKNOWLEDGEMENT) failures.push("live acknowledgement secret");
  if (env.FORWARD_VALIDATION_APPROVED !== FORWARD_VALIDATION_ACKNOWLEDGEMENT) {
    failures.push("paper-forward validation approval");
  }
  if (!env.BINANCE_API_KEY?.trim()) failures.push("Binance API key");
  if (!env.BINANCE_API_SECRET?.trim()) failures.push("Binance API secret");
  if (!env.GEMINI_API_KEY?.trim()) failures.push("Gemini API key");
  if (!env.TRADING_ADMIN_TOKEN?.trim()) failures.push("admin token");
  return failures;
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

async function readJson(request: Request): Promise<Record<string, unknown>> {
  const length = Number(request.headers.get("Content-Length") || 0);
  if (length > 20_000) throw new Error("Request body is too large");
  const payload = await request.json();
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("A JSON object is required");
  return payload as Record<string, unknown>;
}

function integerField(
  body: Record<string, unknown>,
  key: string,
  fallback: number,
  min: number,
  max: number,
): number {
  if (body[key] === undefined) return fallback;
  const value = Number(body[key]);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${key} must be an integer from ${min} to ${max}`);
  }
  return value;
}

async function statusResponse(env: TradingEnv): Promise<Response> {
  const [settings, state, events] = await Promise.all([
    getSettings(env.DB),
    getState(env.DB),
    listEvents(env.DB, 30),
  ]);
  const research = await getLatestResearch(env.DB, settings.symbol);
  const backtest = await getLatestBacktest(env.DB, settings.symbol, settings.interval);
  const missing = guardFailures(env);
  return json({
    ok: true,
    execution: "binance-futures-mainnet",
    scheduler: "worker-cron",
    liveReady: missing.length === 0,
    missingConfiguration: missing,
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
    },
    research,
    backtest,
    events,
    safety: {
      exchangeNativeProtection: true,
      isolatedMargin: true,
      maxOnePosition: true,
      paperForwardApprovalRequired: true,
      aiCanPlaceArbitraryOrders: false,
      profitGuaranteed: false,
    },
  });
}

async function controlResponse(request: Request, env: TradingEnv): Promise<Response> {
  const body = await readJson(request);
  const current = await getSettings(env.DB);
  const state = await getState(env.DB);
  const enabled = typeof body.enabled === "boolean" ? body.enabled : Boolean(current.enabled);
  const clearPause = body.clearPause === true;
  const acknowledgement = typeof body.acknowledgement === "string" ? body.acknowledgement : "";

  if ((enabled || clearPause) && acknowledgement !== LIVE_ACKNOWLEDGEMENT) {
    return json({ ok: false, error: `acknowledgement must exactly equal ${LIVE_ACKNOWLEDGEMENT}` }, 400);
  }
  const missing = guardFailures(env);
  if (enabled && missing.length) {
    return json({ ok: false, error: "Live execution configuration is incomplete", missingConfiguration: missing }, 409);
  }
  if (enabled && state.paused_reason && !clearPause) {
    return json({ ok: false, error: "Engine is paused; review the reason and explicitly clearPause before enabling", pausedReason: state.paused_reason }, 409);
  }

  const symbol = typeof body.symbol === "string" ? body.symbol.trim().toUpperCase() : current.symbol;
  const interval = typeof body.interval === "string" ? body.interval.trim() : current.interval;
  if (symbol !== "BTCUSDT") throw new Error("Initial live release is restricted to BTCUSDT");
  if (interval !== "1h") throw new Error("Initial live release is restricted to 1h candles");

  const updated = await updateSettings(env.DB, {
    enabled,
    symbol,
    interval,
    riskBps: integerField(body, "riskBps", current.risk_bps, 5, 50),
    dailyLossBps: integerField(body, "dailyLossBps", current.daily_loss_bps, 25, 200),
    leverage: integerField(body, "leverage", current.leverage, 1, 3),
    maxNotionalUsdt: integerField(body, "maxNotionalUsdt", current.max_notional_usdt, 10, 5_000),
    minResearchConfidence: integerField(body, "minResearchConfidence", current.min_research_confidence, 55, 90),
    cooldownMinutes: integerField(body, "cooldownMinutes", current.cooldown_minutes, 60, 10_080),
    researchMinutes: integerField(body, "researchMinutes", current.research_minutes, 15, 120),
  });

  if (clearPause) {
    state.paused_reason = null;
    state.last_error = null;
    state.updated_at = Math.floor(Date.now() / 1_000);
    await saveState(env.DB, state);
  }
  await recordEvent(env.DB, "info", enabled ? "engine_enabled" : "engine_disabled", enabled
    ? "Real-money execution was explicitly enabled"
    : "Real-money execution was disabled", {
    riskBps: updated.risk_bps,
    dailyLossBps: updated.daily_loss_bps,
    leverage: updated.leverage,
    maxNotionalUsdt: updated.max_notional_usdt,
  });
  return json({ ok: true, settings: publicSettings(updated), pausedReason: clearPause ? null : state.paused_reason });
}

export async function handleTradingRoute(request: Request, env: TradingEnv): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/trading/")) return null;
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (!await isAuthorized(request, env)) return json({ ok: false, error: "Unauthorized" }, 401);

  try {
    if (url.pathname === "/api/trading/status" && request.method === "GET") {
      return statusResponse(env);
    }
    if (url.pathname === "/api/trading/research" && request.method === "GET") {
      const settings = await getSettings(env.DB);
      return json({ ok: true, research: await getLatestResearch(env.DB, settings.symbol) });
    }
    if (url.pathname === "/api/trading/control" && request.method === "POST") {
      return controlResponse(request, env);
    }
    if (url.pathname === "/api/trading/run" && request.method === "POST") {
      const body = await readJson(request).catch(() => ({}));
      const cycle = await runTradingCycle(env, { forceResearch: body.forceResearch === true });
      return json(cycle, cycle.ok ? 200 : 409);
    }
    return json({ ok: false, error: "Trading route not found" }, 404);
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 300) : "Trading API failed";
    const migrationRequired = /no such table/i.test(message);
    return json({
      ok: false,
      error: migrationRequired ? "Trading database migration has not been applied" : message,
    }, migrationRequired ? 503 : 400);
  }
}
