import type {
  BinanceAlgoOrder,
  BinanceApiRestrictions,
  BinanceOrder,
  BinancePosition,
  BinanceSymbolRules,
  Candle,
} from "./types";

const BINANCE_FUTURES_URL = "https://fapi.binance.com";
const BINANCE_SPOT_URL = "https://api.binance.com";

interface BinanceErrorPayload {
  code?: number;
  msg?: string;
  message?: string;
}

export class BinanceApiError extends Error {
  readonly status: number;
  readonly code?: number;

  constructor(
    message: string,
    status: number,
    code?: number,
  ) {
    super(message);
    this.name = "BinanceApiError";
    this.status = status;
    this.code = code;
  }
}

function decimalPlaces(value: string): number {
  const normalized = value.replace(/0+$/, "");
  return normalized.includes(".") ? normalized.split(".")[1].length : 0;
}

function serialize(params: Record<string, string | number | boolean | undefined>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) query.set(key, String(value));
  }
  return query.toString();
}

async function hmacSha256(secret: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function parseResponse<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => ({})) as BinanceErrorPayload & T;
  if (!response.ok) {
    const rawMessage = payload.msg || payload.message || `Binance request failed (${response.status})`;
    throw new BinanceApiError(String(rawMessage).slice(0, 300), response.status, payload.code);
  }
  return payload as T;
}

export class BinanceFuturesClient {
  private timeOffsetMs = 0;
  private readonly apiKey: string;
  private readonly apiSecret: string;

  constructor(
    input: { apiKey: string; apiSecret: string } | string,
    maybeSecret?: string,
  ) {
    if (typeof input === "object") {
      this.apiKey = input.apiKey;
      this.apiSecret = input.apiSecret;
    } else {
      this.apiKey = input;
      this.apiSecret = maybeSecret || "";
    }
  }

  async syncTime(): Promise<void> {
    const startedAt = Date.now();
    const payload = await this.publicRequest<{ serverTime: number }>("/fapi/v1/time");
    const endedAt = Date.now();
    this.timeOffsetMs = payload.serverTime - Math.round((startedAt + endedAt) / 2);
  }

  async publicRequest<T>(path: string, params: Record<string, string | number | boolean | undefined> = {}): Promise<T> {
    const query = serialize(params);
    const suffix = query ? `?${query}` : "";
    return parseResponse<T>(await fetchWithTimeout(`${BINANCE_FUTURES_URL}${path}${suffix}`));
  }

  async signedRequest<T>(
    path: string,
    method: "GET" | "POST" | "DELETE",
    params: Record<string, string | number | boolean | undefined> = {},
  ): Promise<T> {
    return this.signedRequestAt(BINANCE_FUTURES_URL, path, method, params);
  }

  private async signedRequestAt<T>(
    baseUrl: string,
    path: string,
    method: "GET" | "POST" | "DELETE",
    params: Record<string, string | number | boolean | undefined> = {},
  ): Promise<T> {
    const query = serialize({
      ...params,
      timestamp: Date.now() + this.timeOffsetMs,
      recvWindow: 5000,
    });
    const signature = await hmacSha256(this.apiSecret, query);
    return parseResponse<T>(await fetchWithTimeout(
      `${baseUrl}${path}?${query}&signature=${signature}`,
      { method, headers: { "X-MBX-APIKEY": this.apiKey } },
    ));
  }

  async getCandles(symbol: string, interval: string, limit = 200, endTime?: number): Promise<Candle[]> {
    const rows = await this.publicRequest<Array<Array<string | number>>>("/fapi/v1/klines", {
      symbol,
      interval,
      limit,
      endTime,
    });
    return rows.map((row) => ({
      openTime: Number(row[0]),
      open: Number(row[1]),
      high: Number(row[2]),
      low: Number(row[3]),
      close: Number(row[4]),
      volume: Number(row[5]),
      closeTime: Number(row[6]),
    })).filter((candle) => [candle.open, candle.high, candle.low, candle.close].every(Number.isFinite));
  }

  async getSymbolRules(symbol: string): Promise<BinanceSymbolRules> {
    const payload = await this.publicRequest<{
      symbols?: Array<{
        symbol: string;
        pricePrecision: number;
        quantityPrecision: number;
        filters: Array<Record<string, string>>;
      }>;
    }>("/fapi/v1/exchangeInfo", { symbol });
    const market = payload.symbols?.find((item) => item.symbol === symbol);
    if (!market) throw new Error(`Unsupported Binance Futures symbol: ${symbol}`);
    const lot = market.filters.find((filter) => filter.filterType === "MARKET_LOT_SIZE")
      || market.filters.find((filter) => filter.filterType === "LOT_SIZE");
    const price = market.filters.find((filter) => filter.filterType === "PRICE_FILTER");
    const notional = market.filters.find((filter) => filter.filterType === "MIN_NOTIONAL")
      || market.filters.find((filter) => filter.filterType === "NOTIONAL");
    const quantityStepText = lot?.stepSize || "0.001";
    const priceTickText = price?.tickSize || "0.1";
    return {
      quantityStep: Number(quantityStepText),
      quantityPrecision: Math.min(market.quantityPrecision, decimalPlaces(quantityStepText)),
      minQuantity: Number(lot?.minQty || quantityStepText),
      minNotional: Number(notional?.notional || notional?.minNotional || 5),
      priceTick: Number(priceTickText),
      pricePrecision: Math.min(market.pricePrecision, decimalPlaces(priceTickText)),
    };
  }

  async getAccount(): Promise<{ totalWalletBalance: number; totalMarginBalance: number; availableBalance: number }> {
    const account = await this.signedRequest<Record<string, string>>("/fapi/v3/account", "GET");
    return {
      totalWalletBalance: Number(account.totalWalletBalance || 0),
      totalMarginBalance: Number(account.totalMarginBalance || account.totalWalletBalance || 0),
      availableBalance: Number(account.availableBalance || 0),
    };
  }

  async getPositions(symbol?: string): Promise<BinancePosition[]> {
    return this.signedRequest<BinancePosition[]>("/fapi/v3/positionRisk", "GET", { symbol });
  }

  async isHedgeMode(): Promise<boolean> {
    const result = await this.signedRequest<{ dualSidePosition: boolean }>("/fapi/v1/positionSide/dual", "GET");
    return Boolean(result.dualSidePosition);
  }

  async getApiRestrictions(): Promise<BinanceApiRestrictions> {
    return this.signedRequestAt<BinanceApiRestrictions>(
      BINANCE_SPOT_URL,
      "/sapi/v1/account/apiRestrictions",
      "GET",
    );
  }

  async setIsolatedMargin(symbol: string): Promise<void> {
    try {
      await this.signedRequest("/fapi/v1/marginType", "POST", { symbol, marginType: "ISOLATED" });
    } catch (error) {
      if (error instanceof BinanceApiError && error.code === -4046) return;
      throw error;
    }
  }

  async setLeverage(symbol: string, leverage: number): Promise<void> {
    await this.signedRequest("/fapi/v1/leverage", "POST", { symbol, leverage });
  }

  async placeMarketEntry(input: {
    symbol: string;
    side: "BUY" | "SELL";
    quantity: string;
    clientOrderId: string;
  }): Promise<BinanceOrder> {
    return this.signedRequest("/fapi/v1/order", "POST", {
      symbol: input.symbol,
      side: input.side,
      type: "MARKET",
      quantity: input.quantity,
      newClientOrderId: input.clientOrderId,
      newOrderRespType: "RESULT",
    });
  }

  async placeCloseAllProtection(input: {
    symbol: string;
    side: "BUY" | "SELL";
    type: "STOP_MARKET" | "TAKE_PROFIT_MARKET";
    triggerPrice: string;
    clientAlgoId: string;
  }): Promise<{ algoId: number; clientAlgoId: string; algoStatus: string }> {
    return this.signedRequest("/fapi/v1/algoOrder", "POST", {
      algoType: "CONDITIONAL",
      symbol: input.symbol,
      side: input.side,
      type: input.type,
      triggerPrice: input.triggerPrice,
      closePosition: true,
      workingType: "MARK_PRICE",
      clientAlgoId: input.clientAlgoId,
      newOrderRespType: "ACK",
    });
  }

  async getOpenAlgoOrders(symbol: string): Promise<BinanceAlgoOrder[]> {
    return this.signedRequest<BinanceAlgoOrder[]>("/fapi/v1/openAlgoOrders", "GET", {
      symbol,
      algoType: "CONDITIONAL",
    });
  }

  async cancelAlgoOrder(symbol: string, clientAlgoId: string): Promise<void> {
    await this.signedRequest("/fapi/v1/algoOrder", "DELETE", {
      symbol,
      clientAlgoId,
      algoType: "CONDITIONAL",
    });
  }

  async getOrderByClientId(symbol: string, origClientOrderId: string): Promise<BinanceOrder> {
    return this.signedRequest<BinanceOrder>("/fapi/v1/order", "GET", {
      symbol,
      origClientOrderId,
    });
  }

  async emergencyClose(input: {
    symbol: string;
    side: "BUY" | "SELL";
    quantity: string;
    clientOrderId: string;
  }): Promise<BinanceOrder> {
    return this.signedRequest<BinanceOrder>("/fapi/v1/order", "POST", {
      symbol: input.symbol,
      side: input.side,
      type: "MARKET",
      quantity: input.quantity,
      reduceOnly: true,
      newClientOrderId: input.clientOrderId,
      newOrderRespType: "RESULT",
    });
  }
}

export function formatToPrecision(value: number, precision: number): string {
  return value.toFixed(Math.max(0, precision));
}

export function roundPrice(value: number, rules: BinanceSymbolRules): number {
  const ticks = Math.round(value / rules.priceTick);
  return Number((ticks * rules.priceTick).toFixed(rules.pricePrecision));
}

export function newClientId(kind: string): string {
  return `nx_${kind}_${Date.now().toString(36)}_${crypto.randomUUID().slice(0, 6)}`.slice(0, 36);
}
