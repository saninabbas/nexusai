import { hmacSha256, queryString } from "./crypto-utils.js";

const MAINNET = "https://fapi.binance.com";
const TESTNET = "https://demo-fapi.binance.com";

function baseUrl(useTestnet) {
  return useTestnet ? TESTNET : MAINNET;
}

async function parseResponse(response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.msg || payload.message || `Binance request failed (${response.status})`);
  return payload;
}

export async function publicRequest(path, params = {}, useTestnet = false) {
  const url = `${baseUrl(useTestnet)}${path}?${queryString(params)}`;
  return parseResponse(await fetch(url));
}

export async function signedRequest(path, method, params, credentials) {
  const timestamped = { ...params, timestamp: Date.now(), recvWindow: 5000 };
  const query = queryString(timestamped);
  const signature = await hmacSha256(credentials.secret, query);
  const response = await fetch(`${baseUrl(credentials.useTestnet)}${path}?${query}&signature=${signature}`, {
    method,
    headers: { "X-MBX-APIKEY": credentials.key },
  });
  return parseResponse(response);
}

export async function fetchCandles(symbol, interval, limit = 120, useTestnet = false) {
  const rows = await publicRequest("/fapi/v1/klines", { symbol, interval, limit }, useTestnet);
  return rows.map((row) => ({ open: row[1], high: row[2], low: row[3], close: row[4], closeTime: row[6] }));
}

export async function fetchPrice(symbol, useTestnet = false) {
  const ticker = await publicRequest("/fapi/v1/ticker/price", { symbol }, useTestnet);
  return Number(ticker.price);
}

export async function fetchAccount(credentials) {
  const balances = await signedRequest("/fapi/v3/balance", "GET", {}, credentials);
  const usdt = balances.find((item) => item.asset === "USDT");
  return { balance: Number(usdt?.balance || 0), availableBalance: Number(usdt?.availableBalance || 0) };
}

export async function fetchPosition(symbol, credentials) {
  const positions = await signedRequest("/fapi/v3/positionRisk", "GET", { symbol }, credentials);
  return positions.find((item) => item.symbol === symbol) || null;
}

export async function setLeverage(symbol, leverage, credentials) {
  return signedRequest("/fapi/v1/leverage", "POST", { symbol, leverage }, credentials);
}

async function symbolRules(symbol, useTestnet) {
  const info = await publicRequest("/fapi/v1/exchangeInfo", { symbol }, useTestnet);
  const item = info.symbols?.find((candidate) => candidate.symbol === symbol);
  if (!item) throw new Error(`Unknown Binance Futures symbol: ${symbol}`);
  const lot = item.filters.find((filter) => filter.filterType === "MARKET_LOT_SIZE") || item.filters.find((filter) => filter.filterType === "LOT_SIZE");
  return { stepSize: Number(lot?.stepSize || 0.001), minQty: Number(lot?.minQty || 0.001) };
}

function floorToStep(value, step) {
  const precision = Math.max(0, (String(step).split(".")[1] || "").replace(/0+$/, "").length);
  return Number((Math.floor(value / step) * step).toFixed(precision));
}

export async function calculateOrderQuantity({ symbol, price, balance, risk, stopLoss, leverage, useTestnet }) {
  const { stepSize, minQty } = await symbolRules(symbol, useTestnet);
  const riskBudget = Math.max(0, balance * (risk / 100));
  const stopDistance = Math.max(0.001, stopLoss / 100);
  const riskSizedNotional = riskBudget / stopDistance;
  const marginCappedNotional = Math.min(riskSizedNotional, balance * leverage);
  const quantity = floorToStep(marginCappedNotional / price, stepSize);
  if (!Number.isFinite(quantity) || quantity < minQty) throw new Error("Calculated order size is below Binance minimum quantity.");
  return quantity;
}

export async function placeMarketOrder(symbol, direction, quantity, credentials) {
  return signedRequest("/fapi/v1/order", "POST", {
    symbol,
    side: direction === "LONG" ? "BUY" : "SELL",
    type: "MARKET",
    quantity,
    newOrderRespType: "RESULT",
  }, credentials);
}

export async function closeMarketPosition(symbol, credentials) {
  const position = await fetchPosition(symbol, credentials);
  const amount = Number(position?.positionAmt || 0);
  if (!amount) return { closed: false, reason: "No open position" };
  const order = await signedRequest("/fapi/v1/order", "POST", {
    symbol,
    side: amount > 0 ? "SELL" : "BUY",
    type: "MARKET",
    quantity: Math.abs(amount),
    reduceOnly: true,
    newOrderRespType: "RESULT",
  }, credentials);
  return { closed: true, order, position };
}
