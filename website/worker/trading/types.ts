export const LIVE_ACKNOWLEDGEMENT = "I_UNDERSTAND_REAL_MONEY_RISK";
export const FORWARD_VALIDATION_ACKNOWLEDGEMENT = "PAPER_FORWARD_GATE_PASSED";
export const REAL_MONEY_ENTRY_BUILD_ENABLED = false;

export interface TradingEnv {
  DB: D1Database;
  BINANCE_API_KEY?: string;
  BINANCE_API_SECRET?: string;
  CUSTOMER_KEY_ENCRYPTION_KEY?: string;
  GEMINI_API_KEY?: string;
  GEMINI_MODEL?: string;
  TRADING_ADMIN_TOKEN?: string;
  LIVE_TRADING_ALLOWED?: string;
  FORWARD_VALIDATION_APPROVED?: string;
}

export interface TenantExecutionContext {
  tenantId: string;
  apiKey: string;
  apiSecret: string;
}

export interface TradingSettings {
  id: number;
  enabled: number;
  symbol: string;
  interval: string;
  risk_bps: number;
  daily_loss_bps: number;
  leverage: number;
  max_notional_usdt: number;
  min_research_confidence: number;
  cooldown_minutes: number;
  research_minutes: number;
  updated_at: number;
}

export interface TradingState {
  id: number;
  day_key: string | null;
  daily_baseline_equity: string | null;
  paused_reason: string | null;
  last_error: string | null;
  last_cycle_at: number | null;
  last_research_at: number | null;
  last_trade_at: number | null;
  cycle_lock_until: number;
  active_entry_client_id: string | null;
  active_entry_at: number | null;
  active_position_amount: string | null;
  active_stop_client_id: string | null;
  active_take_profit_client_id: string | null;
  updated_at: number;
}

export type ResearchBias = "bullish" | "bearish" | "neutral";
export type ResearchRisk = "low" | "medium" | "high" | "extreme";

export interface MarketResearch {
  id?: number;
  symbol: string;
  bias: ResearchBias;
  riskLevel: ResearchRisk;
  sentiment: number;
  confidence: number;
  summary: string;
  catalysts: string[];
  sources: string[];
  model: string;
  createdAt: number;
}

export interface Candle {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closeTime: number;
}

export interface TechnicalSignal {
  action: "LONG" | "SHORT" | "WAIT";
  confidence: number;
  reason: string;
  price: number;
  atr: number;
  closeTime: number;
  indicators: {
    ema50: number;
    ema200: number;
    rsi14: number;
    macdHistogram: number;
    previousMacdHistogram: number;
  };
}

export interface BinancePosition {
  symbol: string;
  positionSide: string;
  positionAmt: string;
  entryPrice: string;
  markPrice: string;
  unRealizedProfit: string;
}

export interface BinanceAlgoOrder {
  algoId: number;
  clientAlgoId: string;
  orderType: string;
  symbol: string;
  side: string;
  algoStatus: string;
  triggerPrice: string;
}

export interface BinanceOrder {
  orderId: number;
  clientOrderId: string;
  avgPrice: string;
  executedQty: string;
  status: string;
}

export interface BinanceApiRestrictions {
  enableReading: boolean;
  enableWithdrawals: boolean;
  enableFutures: boolean;
  ipRestrict: boolean;
}

export interface BinanceSymbolRules {
  quantityStep: number;
  quantityPrecision: number;
  minQuantity: number;
  minNotional: number;
  priceTick: number;
  pricePrecision: number;
}

export interface CycleResult {
  ok: boolean;
  outcome: string;
  message: string;
  at: number;
  details?: Record<string, unknown>;
}

export interface BacktestResult {
  id?: number;
  symbol: string;
  interval: string;
  candleCount: number;
  tradeCount: number;
  wins: number;
  losses: number;
  winRate: number;
  netR: number;
  maxDrawdownR: number;
  profitFactor: number;
  grossGainR: number;
  grossLossR: number;
  windowCount: number;
  passedWindows: number;
  passed: boolean;
  createdAt: number;
}
