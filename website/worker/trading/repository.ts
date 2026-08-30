import type { BacktestResult, MarketResearch, TradingSettings, TradingState } from "./types";

const DEFAULT_SETTINGS = {
  symbol: "BTCUSDT",
  interval: "1h",
  riskBps: 25,
  dailyLossBps: 100,
  leverage: 2,
  maxNotionalUsdt: 250,
  minResearchConfidence: 60,
  cooldownMinutes: 1920,
  researchMinutes: 30,
};

export async function ensureTradingRows(db: D1Database, tenantId?: string): Promise<void> {
  const now = Math.floor(Date.now() / 1_000);
  if (tenantId) {
    await db.batch([
      db.prepare(`INSERT OR IGNORE INTO tenant_trading_settings (
        tenant_id, enabled, symbol, interval, risk_bps, daily_loss_bps, leverage,
        max_notional_usdt, min_research_confidence, cooldown_minutes, research_minutes, updated_at
      ) VALUES (?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(
          tenantId,
          DEFAULT_SETTINGS.symbol,
          DEFAULT_SETTINGS.interval,
          DEFAULT_SETTINGS.riskBps,
          DEFAULT_SETTINGS.dailyLossBps,
          DEFAULT_SETTINGS.leverage,
          DEFAULT_SETTINGS.maxNotionalUsdt,
          DEFAULT_SETTINGS.minResearchConfidence,
          DEFAULT_SETTINGS.cooldownMinutes,
          DEFAULT_SETTINGS.researchMinutes,
          now,
        ),
      db.prepare("INSERT OR IGNORE INTO tenant_trading_state (tenant_id, cycle_lock_until, updated_at) VALUES (?, 0, ?)")
        .bind(tenantId, now),
    ]);
    return;
  }
  await db.batch([
    db.prepare(`INSERT OR IGNORE INTO trading_settings (
      id, enabled, symbol, interval, risk_bps, daily_loss_bps, leverage,
      max_notional_usdt, min_research_confidence, cooldown_minutes, research_minutes, updated_at
    ) VALUES (1, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(
        DEFAULT_SETTINGS.symbol,
        DEFAULT_SETTINGS.interval,
        DEFAULT_SETTINGS.riskBps,
        DEFAULT_SETTINGS.dailyLossBps,
        DEFAULT_SETTINGS.leverage,
        DEFAULT_SETTINGS.maxNotionalUsdt,
        DEFAULT_SETTINGS.minResearchConfidence,
        DEFAULT_SETTINGS.cooldownMinutes,
        DEFAULT_SETTINGS.researchMinutes,
        now,
      ),
    db.prepare("INSERT OR IGNORE INTO trading_state (id, cycle_lock_until, updated_at) VALUES (1, 0, ?)").bind(now),
  ]);
}

export async function getSettings(db: D1Database, tenantId?: string): Promise<TradingSettings> {
  await ensureTradingRows(db, tenantId);
  const row = tenantId
    ? await db.prepare("SELECT 1 AS id, enabled, symbol, interval, risk_bps, daily_loss_bps, leverage, max_notional_usdt, min_research_confidence, cooldown_minutes, research_minutes, updated_at FROM tenant_trading_settings WHERE tenant_id = ?")
      .bind(tenantId).first<TradingSettings>()
    : await db.prepare("SELECT * FROM trading_settings WHERE id = 1").first<TradingSettings>();
  if (!row) throw new Error("Trading settings are unavailable");
  return row;
}

export async function getState(db: D1Database, tenantId?: string): Promise<TradingState> {
  await ensureTradingRows(db, tenantId);
  const row = tenantId
    ? await db.prepare("SELECT 1 AS id, day_key, daily_baseline_equity, paused_reason, last_error, last_cycle_at, last_research_at, last_trade_at, cycle_lock_until, active_entry_client_id, active_entry_at, active_position_amount, active_stop_client_id, active_take_profit_client_id, updated_at FROM tenant_trading_state WHERE tenant_id = ?")
      .bind(tenantId).first<TradingState>()
    : await db.prepare("SELECT * FROM trading_state WHERE id = 1").first<TradingState>();
  if (!row) throw new Error("Trading state is unavailable");
  return row;
}

export async function saveState(db: D1Database, state: TradingState, tenantId?: string): Promise<void> {
  const statement = tenantId
    ? db.prepare(`UPDATE tenant_trading_state SET
      day_key = ?, daily_baseline_equity = ?, paused_reason = ?, last_error = ?,
      last_cycle_at = ?, last_research_at = ?, last_trade_at = ?, cycle_lock_until = ?,
      active_entry_client_id = ?, active_entry_at = ?, active_position_amount = ?,
      active_stop_client_id = ?, active_take_profit_client_id = ?, updated_at = ? WHERE tenant_id = ?`)
    : db.prepare(`UPDATE trading_state SET
    day_key = ?, daily_baseline_equity = ?, paused_reason = ?, last_error = ?,
    last_cycle_at = ?, last_research_at = ?, last_trade_at = ?, cycle_lock_until = ?,
    active_entry_client_id = ?, active_entry_at = ?, active_position_amount = ?,
    active_stop_client_id = ?, active_take_profit_client_id = ?, updated_at = ? WHERE id = 1`);
  const values: Array<string | number | null> = [
    state.day_key,
    state.daily_baseline_equity,
    state.paused_reason,
    state.last_error,
    state.last_cycle_at,
    state.last_research_at,
    state.last_trade_at,
    state.cycle_lock_until,
    state.active_entry_client_id,
    state.active_entry_at,
    state.active_position_amount,
    state.active_stop_client_id,
    state.active_take_profit_client_id,
    state.updated_at,
  ];
  if (tenantId) values.push(tenantId);
  await statement
    .bind(
      ...values,
    ).run();
}

export async function acquireCycleLock(db: D1Database, now: number, tenantId?: string): Promise<boolean> {
  await ensureTradingRows(db, tenantId);
  const result = tenantId
    ? await db.prepare("UPDATE tenant_trading_state SET cycle_lock_until = ?, updated_at = ? WHERE tenant_id = ? AND cycle_lock_until < ?")
      .bind(now + 240, now, tenantId, now).run()
    : await db.prepare("UPDATE trading_state SET cycle_lock_until = ?, updated_at = ? WHERE id = 1 AND cycle_lock_until < ?")
      .bind(now + 240, now, now).run();
  return Number(result.meta.changes || 0) === 1;
}

export async function releaseCycleLock(db: D1Database, tenantId?: string): Promise<void> {
  const now = Math.floor(Date.now() / 1_000);
  if (tenantId) {
    await db.prepare("UPDATE tenant_trading_state SET cycle_lock_until = 0, updated_at = ? WHERE tenant_id = ?")
      .bind(now, tenantId).run();
  } else {
    await db.prepare("UPDATE trading_state SET cycle_lock_until = 0, updated_at = ? WHERE id = 1")
      .bind(now).run();
  }
}

export async function updateSettings(
  db: D1Database,
  input: {
    enabled: boolean;
    symbol: string;
    interval: string;
    riskBps: number;
    dailyLossBps: number;
    leverage: number;
    maxNotionalUsdt: number;
    minResearchConfidence: number;
    cooldownMinutes: number;
    researchMinutes: number;
  },
  tenantId?: string,
): Promise<TradingSettings> {
  const now = Math.floor(Date.now() / 1_000);
  await ensureTradingRows(db, tenantId);
  const statement = tenantId
    ? db.prepare(`UPDATE tenant_trading_settings SET
      enabled = ?, symbol = ?, interval = ?, risk_bps = ?, daily_loss_bps = ?,
      leverage = ?, max_notional_usdt = ?, min_research_confidence = ?,
      cooldown_minutes = ?, research_minutes = ?, updated_at = ? WHERE tenant_id = ?`)
    : db.prepare(`UPDATE trading_settings SET
    enabled = ?, symbol = ?, interval = ?, risk_bps = ?, daily_loss_bps = ?,
    leverage = ?, max_notional_usdt = ?, min_research_confidence = ?,
    cooldown_minutes = ?, research_minutes = ?, updated_at = ? WHERE id = 1`);
  const values: Array<string | number> = [
    input.enabled ? 1 : 0,
    input.symbol,
    input.interval,
    input.riskBps,
    input.dailyLossBps,
    input.leverage,
    input.maxNotionalUsdt,
    input.minResearchConfidence,
    input.cooldownMinutes,
    input.researchMinutes,
    now,
  ];
  if (tenantId) values.push(tenantId);
  await statement
    .bind(
      ...values,
    ).run();
  return getSettings(db, tenantId);
}

export async function saveResearch(db: D1Database, research: MarketResearch): Promise<void> {
  await db.prepare(`INSERT INTO trading_research (
    symbol, bias, risk_level, sentiment, confidence, summary, catalysts_json,
    sources_json, model, created_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(
      research.symbol,
      research.bias,
      research.riskLevel,
      String(research.sentiment),
      research.confidence,
      research.summary,
      JSON.stringify(research.catalysts),
      JSON.stringify(research.sources),
      research.model,
      research.createdAt,
    ).run();
}

interface ResearchRow {
  id: number;
  symbol: string;
  bias: MarketResearch["bias"];
  risk_level: MarketResearch["riskLevel"];
  sentiment: string;
  confidence: number;
  summary: string;
  catalysts_json: string;
  sources_json: string;
  model: string;
  created_at: number;
}

function parseJsonList(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

export async function getLatestResearch(db: D1Database, symbol: string): Promise<MarketResearch | null> {
  const row = await db.prepare(
    "SELECT * FROM trading_research WHERE symbol = ? ORDER BY created_at DESC LIMIT 1",
  ).bind(symbol).first<ResearchRow>();
  if (!row) return null;
  return {
    id: row.id,
    symbol: row.symbol,
    bias: row.bias,
    riskLevel: row.risk_level,
    sentiment: Number(row.sentiment),
    confidence: row.confidence,
    summary: row.summary,
    catalysts: parseJsonList(row.catalysts_json),
    sources: parseJsonList(row.sources_json),
    model: row.model,
    createdAt: row.created_at,
  };
}

export async function saveBacktest(db: D1Database, backtest: BacktestResult): Promise<void> {
  await db.prepare(`INSERT INTO trading_backtests (
    symbol, interval, candle_count, trade_count, wins, losses, win_rate, net_r,
    max_drawdown_r, profit_factor, gross_gain_r, gross_loss_r, window_count,
    passed_windows, passed, created_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(
      backtest.symbol,
      backtest.interval,
      backtest.candleCount,
      backtest.tradeCount,
      backtest.wins,
      backtest.losses,
      String(backtest.winRate),
      String(backtest.netR),
      String(backtest.maxDrawdownR),
      String(backtest.profitFactor),
      String(backtest.grossGainR),
      String(backtest.grossLossR),
      backtest.windowCount,
      backtest.passedWindows,
      backtest.passed ? 1 : 0,
      backtest.createdAt,
    ).run();
}

interface BacktestRow {
  id: number;
  symbol: string;
  interval: string;
  candle_count: number;
  trade_count: number;
  wins: number;
  losses: number;
  win_rate: string;
  net_r: string;
  max_drawdown_r: string;
  profit_factor: string;
  gross_gain_r: string;
  gross_loss_r: string;
  window_count: number;
  passed_windows: number;
  passed: number;
  created_at: number;
}

export async function getLatestBacktest(db: D1Database, symbol: string, interval: string): Promise<BacktestResult | null> {
  const row = await db.prepare(
    "SELECT * FROM trading_backtests WHERE symbol = ? AND interval = ? ORDER BY created_at DESC LIMIT 1",
  ).bind(symbol, interval).first<BacktestRow>();
  if (!row) return null;
  return {
    id: row.id,
    symbol: row.symbol,
    interval: row.interval,
    candleCount: row.candle_count,
    tradeCount: row.trade_count,
    wins: row.wins,
    losses: row.losses,
    winRate: Number(row.win_rate),
    netR: Number(row.net_r),
    maxDrawdownR: Number(row.max_drawdown_r),
    profitFactor: Number(row.profit_factor),
    grossGainR: Number(row.gross_gain_r),
    grossLossR: Number(row.gross_loss_r),
    windowCount: row.window_count,
    passedWindows: row.passed_windows,
    passed: Boolean(row.passed),
    createdAt: row.created_at,
  };
}

export async function recordEvent(
  db: D1Database,
  level: "info" | "warning" | "critical",
  eventType: string,
  message: string,
  details?: Record<string, unknown>,
  tenantId?: string,
): Promise<void> {
  const statement = tenantId
    ? db.prepare("INSERT INTO tenant_trading_events (tenant_id, level, event_type, message, details_json, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    : db.prepare("INSERT INTO trading_events (level, event_type, message, details_json, created_at) VALUES (?, ?, ?, ?, ?)");
  const values: Array<string | number | null> = [
    level,
    eventType.slice(0, 80),
    message.slice(0, 500),
    details ? JSON.stringify(details).slice(0, 4_000) : null,
    Math.floor(Date.now() / 1_000),
  ];
  if (tenantId) values.unshift(tenantId);
  await statement.bind(...values).run();
}

export async function listEvents(db: D1Database, limit = 30, tenantId?: string): Promise<Array<Record<string, unknown>>> {
  const safeLimit = Math.max(1, Math.min(100, Math.floor(limit)));
  const rows = tenantId
    ? await db.prepare("SELECT id, level, event_type, message, details_json, created_at FROM tenant_trading_events WHERE tenant_id = ? ORDER BY created_at DESC LIMIT ?")
      .bind(tenantId, safeLimit).all<Record<string, unknown>>()
    : await db.prepare("SELECT id, level, event_type, message, details_json, created_at FROM trading_events ORDER BY created_at DESC LIMIT ?")
      .bind(safeLimit).all<Record<string, unknown>>();
  return rows.results || [];
}

export interface DueTenant {
  tenantId: string;
  licenseStatus: string;
  licenseExpiresAt: number;
  hasManagedPosition: boolean;
}

export async function listDueTenants(db: D1Database, limit = 5): Promise<DueTenant[]> {
  const now = Math.floor(Date.now() / 1_000);
  const safeLimit = Math.max(1, Math.min(20, Math.floor(limit)));
  const rows = await db.prepare(`SELECT s.tenant_id, l.status AS license_status,
      l.expires_at AS license_expires_at, st.active_entry_client_id
    FROM tenant_trading_settings s
    INNER JOIN tenant_trading_state st ON st.tenant_id = s.tenant_id
    INNER JOIN customer_binance_connections c ON c.tenant_id = s.tenant_id
    INNER JOIN licenses l ON l.id = s.tenant_id
    WHERE c.status = 'active' AND st.cycle_lock_until < ?
      AND ((s.enabled = 1 AND l.status = 'active' AND l.expires_at > ?)
        OR st.active_entry_client_id IS NOT NULL)
      AND (st.last_cycle_at IS NULL OR st.last_cycle_at <= ?)
    ORDER BY COALESCE(st.last_cycle_at, 0) ASC
    LIMIT ?`)
    .bind(now, now, now - 50, safeLimit)
    .all<{
      tenant_id: string;
      license_status: string;
      license_expires_at: number;
      active_entry_client_id: string | null;
    }>();
  return (rows.results || []).map((row: {
    tenant_id: string;
    license_status: string;
    license_expires_at: number;
    active_entry_client_id: string | null;
  }) => ({
    tenantId: row.tenant_id,
    licenseStatus: row.license_status,
    licenseExpiresAt: row.license_expires_at,
    hasManagedPosition: Boolean(row.active_entry_client_id),
  }));
}
