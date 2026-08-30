import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const licenses = sqliteTable("licenses", {
  id: text("id").primaryKey(),
  licenseHash: text("license_hash").notNull(),
  transactionHash: text("transaction_hash").notNull(),
  paymentAmount: text("payment_amount").notNull(),
  deviceId: text("device_id"),
  status: text("status").notNull().default("active"),
  issuedAt: integer("issued_at").notNull(),
  expiresAt: integer("expires_at").notNull(),
  activatedAt: integer("activated_at"),
  lastValidatedAt: integer("last_validated_at"),
}, (table) => [
  uniqueIndex("licenses_hash_unique").on(table.licenseHash),
  uniqueIndex("licenses_transaction_unique").on(table.transactionHash),
]);

export const customerSessions = sqliteTable("customer_sessions", {
  id: text("id").primaryKey(),
  licenseId: text("license_id").notNull().references(() => licenses.id, { onDelete: "cascade" }),
  deviceId: text("device_id").notNull(),
  tokenHash: text("token_hash").notNull(),
  issuedAt: integer("issued_at").notNull(),
  expiresAt: integer("expires_at").notNull(),
  lastUsedAt: integer("last_used_at").notNull(),
  revokedAt: integer("revoked_at"),
}, (table) => [
  uniqueIndex("customer_sessions_token_unique").on(table.tokenHash),
  uniqueIndex("customer_sessions_license_device_unique").on(table.licenseId, table.deviceId),
  index("customer_sessions_expiry_idx").on(table.expiresAt),
]);

export const customerBinanceConnections = sqliteTable("customer_binance_connections", {
  tenantId: text("tenant_id").primaryKey().references(() => licenses.id, { onDelete: "cascade" }),
  credentialCiphertext: text("credential_ciphertext").notNull(),
  credentialIv: text("credential_iv").notNull(),
  keyVersion: integer("key_version").notNull().default(1),
  apiKeyHint: text("api_key_hint").notNull(),
  status: text("status").notNull().default("active"),
  accountEquity: text("account_equity"),
  connectedAt: integer("connected_at").notNull(),
  lastVerifiedAt: integer("last_verified_at").notNull(),
  lastError: text("last_error"),
  updatedAt: integer("updated_at").notNull(),
}, (table) => [
  index("customer_binance_status_idx").on(table.status),
]);

export const tenantTradingSettings = sqliteTable("tenant_trading_settings", {
  tenantId: text("tenant_id").primaryKey().references(() => licenses.id, { onDelete: "cascade" }),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(false),
  symbol: text("symbol").notNull().default("BTCUSDT"),
  interval: text("interval").notNull().default("1h"),
  riskBps: integer("risk_bps").notNull().default(25),
  dailyLossBps: integer("daily_loss_bps").notNull().default(100),
  leverage: integer("leverage").notNull().default(2),
  maxNotionalUsdt: integer("max_notional_usdt").notNull().default(250),
  minResearchConfidence: integer("min_research_confidence").notNull().default(60),
  cooldownMinutes: integer("cooldown_minutes").notNull().default(1920),
  researchMinutes: integer("research_minutes").notNull().default(30),
  updatedAt: integer("updated_at").notNull(),
}, (table) => [
  index("tenant_trading_enabled_idx").on(table.enabled),
]);

export const tenantTradingState = sqliteTable("tenant_trading_state", {
  tenantId: text("tenant_id").primaryKey().references(() => licenses.id, { onDelete: "cascade" }),
  dayKey: text("day_key"),
  dailyBaselineEquity: text("daily_baseline_equity"),
  pausedReason: text("paused_reason"),
  lastError: text("last_error"),
  lastCycleAt: integer("last_cycle_at"),
  lastResearchAt: integer("last_research_at"),
  lastTradeAt: integer("last_trade_at"),
  cycleLockUntil: integer("cycle_lock_until").notNull().default(0),
  activeEntryClientId: text("active_entry_client_id"),
  activeEntryAt: integer("active_entry_at"),
  activePositionAmount: text("active_position_amount"),
  activeStopClientId: text("active_stop_client_id"),
  activeTakeProfitClientId: text("active_take_profit_client_id"),
  updatedAt: integer("updated_at").notNull(),
}, (table) => [
  index("tenant_trading_due_idx").on(table.lastCycleAt, table.cycleLockUntil),
]);

export const tenantTradingEvents = sqliteTable("tenant_trading_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  tenantId: text("tenant_id").notNull().references(() => licenses.id, { onDelete: "cascade" }),
  level: text("level").notNull(),
  eventType: text("event_type").notNull(),
  message: text("message").notNull(),
  detailsJson: text("details_json"),
  createdAt: integer("created_at").notNull(),
}, (table) => [
  index("tenant_trading_events_tenant_created_idx").on(table.tenantId, table.createdAt),
]);

export const tradingSettings = sqliteTable("trading_settings", {
  id: integer("id").primaryKey(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(false),
  symbol: text("symbol").notNull().default("BTCUSDT"),
  interval: text("interval").notNull().default("1h"),
  riskBps: integer("risk_bps").notNull().default(25),
  dailyLossBps: integer("daily_loss_bps").notNull().default(100),
  leverage: integer("leverage").notNull().default(2),
  maxNotionalUsdt: integer("max_notional_usdt").notNull().default(250),
  minResearchConfidence: integer("min_research_confidence").notNull().default(60),
  cooldownMinutes: integer("cooldown_minutes").notNull().default(1920),
  researchMinutes: integer("research_minutes").notNull().default(30),
  updatedAt: integer("updated_at").notNull(),
});

export const tradingState = sqliteTable("trading_state", {
  id: integer("id").primaryKey(),
  dayKey: text("day_key"),
  dailyBaselineEquity: text("daily_baseline_equity"),
  pausedReason: text("paused_reason"),
  lastError: text("last_error"),
  lastCycleAt: integer("last_cycle_at"),
  lastResearchAt: integer("last_research_at"),
  lastTradeAt: integer("last_trade_at"),
  cycleLockUntil: integer("cycle_lock_until").notNull().default(0),
  activeEntryClientId: text("active_entry_client_id"),
  activeEntryAt: integer("active_entry_at"),
  activePositionAmount: text("active_position_amount"),
  activeStopClientId: text("active_stop_client_id"),
  activeTakeProfitClientId: text("active_take_profit_client_id"),
  updatedAt: integer("updated_at").notNull(),
});

export const tradingResearch = sqliteTable("trading_research", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  symbol: text("symbol").notNull(),
  bias: text("bias").notNull(),
  riskLevel: text("risk_level").notNull(),
  sentiment: text("sentiment").notNull(),
  confidence: integer("confidence").notNull(),
  summary: text("summary").notNull(),
  catalystsJson: text("catalysts_json").notNull(),
  sourcesJson: text("sources_json").notNull(),
  model: text("model").notNull(),
  createdAt: integer("created_at").notNull(),
}, (table) => [
  index("trading_research_created_idx").on(table.createdAt),
]);

export const tradingEvents = sqliteTable("trading_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  level: text("level").notNull(),
  eventType: text("event_type").notNull(),
  message: text("message").notNull(),
  detailsJson: text("details_json"),
  createdAt: integer("created_at").notNull(),
}, (table) => [
  index("trading_events_created_idx").on(table.createdAt),
]);

export const tradingBacktests = sqliteTable("trading_backtests", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  symbol: text("symbol").notNull(),
  interval: text("interval").notNull(),
  candleCount: integer("candle_count").notNull(),
  tradeCount: integer("trade_count").notNull(),
  wins: integer("wins").notNull(),
  losses: integer("losses").notNull(),
  winRate: text("win_rate").notNull(),
  netR: text("net_r").notNull(),
  maxDrawdownR: text("max_drawdown_r").notNull(),
  profitFactor: text("profit_factor").notNull(),
  grossGainR: text("gross_gain_r").notNull().default("0"),
  grossLossR: text("gross_loss_r").notNull().default("0"),
  windowCount: integer("window_count").notNull().default(1),
  passedWindows: integer("passed_windows").notNull().default(0),
  passed: integer("passed", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at").notNull(),
}, (table) => [
  index("trading_backtests_created_idx").on(table.createdAt),
]);
