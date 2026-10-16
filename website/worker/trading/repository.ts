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

export async function ensureAdminTables(db: D1Database): Promise<void> {
  const now = Math.floor(Date.now() / 1_000);
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS admin_audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      actor TEXT NOT NULL DEFAULT 'admin',
      action TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'system',
      details_json TEXT,
      ip TEXT,
      status TEXT NOT NULL DEFAULT 'success',
      created_at INTEGER NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS trade_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id TEXT,
      symbol TEXT NOT NULL,
      direction TEXT NOT NULL,
      entry_price TEXT NOT NULL,
      exit_price TEXT NOT NULL,
      quantity TEXT NOT NULL,
      realized_pnl TEXT NOT NULL,
      pnl_percent TEXT NOT NULL,
      fee TEXT NOT NULL DEFAULT '0',
      strategy TEXT NOT NULL,
      close_reason TEXT NOT NULL,
      mode TEXT NOT NULL DEFAULT 'live',
      entry_time INTEGER NOT NULL,
      exit_time INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS general_settings (
      id INTEGER PRIMARY KEY,
      platform_name TEXT NOT NULL DEFAULT 'Nexus Trader AI',
      maintenance_mode INTEGER NOT NULL DEFAULT 0,
      webhook_alert_url TEXT,
      email_alerts_enabled INTEGER NOT NULL DEFAULT 0,
      default_environment TEXT NOT NULL DEFAULT 'mainnet',
      auto_restart_workers INTEGER NOT NULL DEFAULT 1,
      updated_at INTEGER NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS polar_orders (
      id TEXT PRIMARY KEY,
      order_id TEXT UNIQUE,
      email TEXT,
      license_key TEXT,
      created_at INTEGER
    )`),
    db.prepare(`INSERT OR IGNORE INTO general_settings (
      id, platform_name, maintenance_mode, email_alerts_enabled, default_environment, auto_restart_workers, updated_at
    ) VALUES (1, 'Nexus Trader AI', 0, 0, 'mainnet', 1, ?)`).bind(now),
  ]);
}

export async function recordAuditLog(
  db: D1Database,
  input: {
    actor?: string;
    action: string;
    category?: string;
    details?: Record<string, unknown>;
    ip?: string;
    status?: "success" | "failure";
  },
): Promise<void> {
  await ensureAdminTables(db);
  await db.prepare(`INSERT INTO admin_audit_logs (
    actor, action, category, details_json, ip, status, created_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?)`).bind(
    (input.actor || "admin").slice(0, 100),
    input.action.slice(0, 100),
    (input.category || "system").slice(0, 50),
    input.details ? JSON.stringify(input.details).slice(0, 4_000) : null,
    (input.ip || "").slice(0, 60),
    input.status || "success",
    Math.floor(Date.now() / 1_000),
  ).run().catch(() => undefined);
}

export async function listAuditLogs(
  db: D1Database,
  limit = 50,
): Promise<Array<Record<string, unknown>>> {
  await ensureAdminTables(db);
  const safeLimit = Math.max(1, Math.min(200, Math.floor(limit)));
  const rows = await db.prepare(
    "SELECT id, actor, action, category, details_json, ip, status, created_at FROM admin_audit_logs ORDER BY created_at DESC LIMIT ?"
  ).bind(safeLimit).all<Record<string, unknown>>();
  return rows.results || [];
}

export async function recordTradeHistory(
  db: D1Database,
  trade: {
    tenantId?: string | null;
    symbol: string;
    direction: "LONG" | "SHORT";
    entryPrice: number | string;
    exitPrice: number | string;
    quantity: number | string;
    realizedPnl: number | string;
    pnlPercent: number | string;
    fee?: number | string;
    strategy: string;
    closeReason: string;
    mode?: "live" | "paper" | "testnet";
    entryTime: number;
    exitTime: number;
  },
): Promise<void> {
  await ensureAdminTables(db);
  const now = Math.floor(Date.now() / 1_000);
  await db.prepare(`INSERT INTO trade_history (
    tenant_id, symbol, direction, entry_price, exit_price, quantity,
    realized_pnl, pnl_percent, fee, strategy, close_reason, mode, entry_time, exit_time, created_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
    trade.tenantId || null,
    trade.symbol.toUpperCase(),
    trade.direction,
    String(trade.entryPrice),
    String(trade.exitPrice),
    String(trade.quantity),
    String(trade.realizedPnl),
    String(trade.pnlPercent),
    String(trade.fee || "0"),
    trade.strategy,
    trade.closeReason,
    trade.mode || "live",
    trade.entryTime,
    trade.exitTime,
    now,
  ).run();
}

export async function listTradeHistory(
  db: D1Database,
  limit = 100,
  tenantId?: string,
): Promise<Array<Record<string, unknown>>> {
  await ensureAdminTables(db);
  const safeLimit = Math.max(1, Math.min(500, Math.floor(limit)));
  const query = tenantId
    ? db.prepare("SELECT * FROM trade_history WHERE tenant_id = ? ORDER BY created_at DESC LIMIT ?").bind(tenantId, safeLimit)
    : db.prepare("SELECT * FROM trade_history ORDER BY created_at DESC LIMIT ?").bind(safeLimit);
  const rows = await query.all<Record<string, unknown>>();
  return rows.results || [];
}

export async function getGeneralSettings(
  db: D1Database,
): Promise<Record<string, unknown>> {
  await ensureAdminTables(db);
  const row = await db.prepare("SELECT * FROM general_settings WHERE id = 1").first<Record<string, unknown>>();
  return row || {
    id: 1,
    platform_name: "Nexus Trader AI",
    maintenance_mode: 0,
    webhook_alert_url: null,
    email_alerts_enabled: 0,
    default_environment: "mainnet",
    auto_restart_workers: 1,
    updated_at: Math.floor(Date.now() / 1_000),
  };
}

export async function updateGeneralSettings(
  db: D1Database,
  patch: {
    platformName?: string;
    maintenanceMode?: boolean;
    webhookAlertUrl?: string;
    emailAlertsEnabled?: boolean;
    defaultEnvironment?: "mainnet" | "testnet";
    autoRestartWorkers?: boolean;
  },
): Promise<Record<string, unknown>> {
  await ensureAdminTables(db);
  const current = await getGeneralSettings(db);
  const now = Math.floor(Date.now() / 1_000);
  const updated = {
    platform_name: patch.platformName !== undefined ? patch.platformName.slice(0, 100) : (current.platform_name as string),
    maintenance_mode: patch.maintenanceMode !== undefined ? (patch.maintenanceMode ? 1 : 0) : (current.maintenance_mode as number),
    webhook_alert_url: patch.webhookAlertUrl !== undefined ? patch.webhookAlertUrl.slice(0, 300) : (current.webhook_alert_url as string | null),
    email_alerts_enabled: patch.emailAlertsEnabled !== undefined ? (patch.emailAlertsEnabled ? 1 : 0) : (current.email_alerts_enabled as number),
    default_environment: patch.defaultEnvironment !== undefined ? patch.defaultEnvironment : (current.default_environment as string),
    auto_restart_workers: patch.autoRestartWorkers !== undefined ? (patch.autoRestartWorkers ? 1 : 0) : (current.auto_restart_workers as number),
    updated_at: now,
  };
  await db.prepare(`UPDATE general_settings SET
    platform_name = ?, maintenance_mode = ?, webhook_alert_url = ?, email_alerts_enabled = ?,
    default_environment = ?, auto_restart_workers = ?, updated_at = ? WHERE id = 1
  `).bind(
    updated.platform_name,
    updated.maintenance_mode,
    updated.webhook_alert_url,
    updated.email_alerts_enabled,
    updated.default_environment,
    updated.auto_restart_workers,
    updated.updated_at,
  ).run();
  return updated;
}

export async function listAllBotInstances(db: D1Database): Promise<Array<Record<string, unknown>>> {
  await ensureTradingRows(db);
  const [masterSettings, masterState] = await Promise.all([
    getSettings(db),
    getState(db),
  ]);

  const masterInstance = {
    id: "system-master",
    type: "master",
    name: "Nexus Core Engine (Master)",
    symbol: masterSettings.symbol,
    interval: masterSettings.interval,
    enabled: Boolean(masterSettings.enabled),
    status: masterSettings.enabled
      ? (masterState.paused_reason ? "paused" : "running")
      : (masterState.paused_reason ? "paused" : "idle"),
    pausedReason: masterState.paused_reason,
    lastError: masterState.last_error,
    lastCycleAt: masterState.last_cycle_at,
    hasManagedPosition: Boolean(masterState.active_entry_client_id),
    activePositionAmount: masterState.active_position_amount,
    activeEntryAt: masterState.active_entry_at,
    leverage: masterSettings.leverage,
    riskBps: masterSettings.risk_bps,
    dailyLossBps: masterSettings.daily_loss_bps,
    maxNotionalUsdt: masterSettings.max_notional_usdt,
    updatedAt: masterState.updated_at,
  };

  const tenantRows = await db.prepare(`
    SELECT
      s.tenant_id, s.enabled, s.symbol, s.interval, s.risk_bps, s.daily_loss_bps,
      s.leverage, s.max_notional_usdt,
      st.paused_reason, st.last_error, st.last_cycle_at, st.active_entry_client_id,
      st.active_position_amount, st.active_entry_at, st.updated_at,
      c.status AS connection_status, c.api_key_hint, c.account_equity,
      l.status AS license_status, l.expires_at AS license_expires_at
    FROM tenant_trading_settings s
    LEFT JOIN tenant_trading_state st ON st.tenant_id = s.tenant_id
    LEFT JOIN customer_binance_connections c ON c.tenant_id = s.tenant_id
    LEFT JOIN licenses l ON l.id = s.tenant_id
    ORDER BY s.updated_at DESC
  `).all<Record<string, unknown>>();

  const tenantInstances = (tenantRows.results || []).map((row) => ({
    id: row.tenant_id as string,
    type: "tenant",
    name: `Tenant ${String(row.tenant_id).slice(0, 8)}`,
    symbol: (row.symbol as string) || "BTCUSDT",
    interval: (row.interval as string) || "1h",
    enabled: Boolean(row.enabled),
    status: row.enabled
      ? (row.paused_reason ? "paused" : "running")
      : (row.paused_reason ? "paused" : (row.connection_status === "active" ? "idle" : "disconnected")),
    pausedReason: row.paused_reason,
    lastError: row.last_error,
    lastCycleAt: row.last_cycle_at,
    hasManagedPosition: Boolean(row.active_entry_client_id),
    activePositionAmount: row.active_position_amount,
    activeEntryAt: row.active_entry_at,
    leverage: row.leverage,
    riskBps: row.risk_bps,
    dailyLossBps: row.daily_loss_bps,
    maxNotionalUsdt: row.max_notional_usdt,
    apiKeyHint: row.api_key_hint,
    accountEquity: row.account_equity,
    licenseStatus: row.license_status,
    licenseExpiresAt: row.license_expires_at,
    updatedAt: row.updated_at,
  }));

  return [masterInstance, ...tenantInstances];
}

export async function listAllUsers(db: D1Database, limit = 100): Promise<Array<Record<string, unknown>>> {
  const safeLimit = Math.max(1, Math.min(500, Math.floor(limit)));
  const rows = await db.prepare(`
    SELECT
      l.id, l.license_hash, l.transaction_hash, l.payment_amount, l.device_id,
      l.status, l.issued_at, l.expires_at, l.activated_at, l.last_validated_at,
      c.status AS binance_status, c.api_key_hint, c.account_equity,
      ts.enabled AS trading_enabled,
      tst.active_entry_client_id IS NOT NULL AS has_position
    FROM licenses l
    LEFT JOIN customer_binance_connections c ON c.tenant_id = l.id
    LEFT JOIN tenant_trading_settings ts ON ts.tenant_id = l.id
    LEFT JOIN tenant_trading_state tst ON tst.tenant_id = l.id
    ORDER BY l.issued_at DESC
    LIMIT ?
  `).bind(safeLimit).all<Record<string, unknown>>();

  return rows.results || [];
}
