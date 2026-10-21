import { API_BASE_URL, DEFAULT_SETTINGS, OFFICIAL_SITE_URL, PRODUCT_VERSION } from "./config.js";
import {
  calculateOrderQuantity,
  cancelAllOpenOrders,
  closeMarketPosition,
  fetchAccount,
  fetchCandles,
  fetchOpenOrders,
  fetchPosition,
  fetchPrice,
  getSymbolRules,
  placeMarketOrder,
  placeStopMarketOrder,
  placeTakeProfitMarketOrder,
  roundPrice,
  setLeverage,
} from "./binance.js";
import { evaluateStrategy } from "./strategies.js";

const ALARM_NAME = "nexus-trading-cycle";
const STRATEGIES = new Set(["Auto Switch", "RSI + EMA", "MACD", "Breakout", "Scalping"]);
const INTERVALS = new Set(["1m", "3m", "5m", "15m", "30m", "1h"]);

let isCycleRunning = false;

const emptyStats = (balance = DEFAULT_SETTINGS.paperBalance) => ({
  balance,
  dailyPnl: 0,
  totalTrades: 0,
  wins: 0,
  losses: 0,
  winRate: 0,
  maxDrawdown: 0,
});

chrome.runtime.onInstalled.addListener(() => initialize());
chrome.runtime.onStartup.addListener(() => initialize());
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) runCycle().catch((error) => failCycle(error));
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  handleMessage(message)
    .then(sendResponse)
    .catch((error) => sendResponse({ ok: false, error: errorMessage(error) }));
  return true;
});

async function initialize() {
  const current = await chrome.storage.local.get([
    "savedSettings",
    "selectedStrategy",
    "stats",
    "botRunning",
    "apiKey",
    "apiSecret",
  ]);
  const settings = normalizeSettings({
    ...DEFAULT_SETTINGS,
    ...current.savedSettings,
    strategy: current.selectedStrategy || current.savedSettings?.strategy,
  });
  await chrome.storage.local.set({
    savedSettings: settings,
    selectedStrategy: settings.strategy,
    useTestnet: true,
    stats: current.stats || emptyStats(settings.paperBalance),
    botRunning: Boolean(current.botRunning),
  });
  await chrome.storage.local.remove(["licenseKey", "liveBackendUrl", "liveAdminToken"]);
  await chrome.storage.local.remove("cycleLockUntil").catch(() => {});
  if (settings.mode === "testnet" && current.apiKey && current.apiSecret) {
    await reconcileTestnetPosition(settings.symbol, { key: current.apiKey, secret: current.apiSecret, useTestnet: true }, settings);
  }
  if (current.botRunning) chrome.alarms.create(ALARM_NAME, { periodInMinutes: 1 });
}

async function handleMessage(message = {}) {
  switch (message.action) {
    case "VALIDATE_KEY":
      return activateLicense(message.key);
    case "GET_STATUS":
      return getStatus();
    case "GET_HEALTH":
      return getHealth();
    case "START_BOT":
      return startBot({ ...message.settings, strategy: message.strategy });
    case "STOP_BOT":
      return stopBot("Stopped by user");
    case "CLOSE_POSITION":
      return closeActivePosition("Manual close");
    case "CHAT_QUERY":
      return systemReply(message.query);
    case "RUN_CYCLE":
      return runCycle();
    default:
      return { ok: false, error: "Unknown extension action." };
  }
}

function normalizeSettings(input = {}) {
  const symbol = String(input.symbol || DEFAULT_SETTINGS.symbol).trim().toUpperCase();
  const mode = input.mode === "testnet" ? "testnet" : "paper";
  const strategy = STRATEGIES.has(input.strategy) ? input.strategy : DEFAULT_SETTINGS.strategy;
  const interval = INTERVALS.has(input.interval) ? input.interval : DEFAULT_SETTINGS.interval;
  return {
    symbol: /^[A-Z0-9]{5,20}$/.test(symbol) ? symbol : DEFAULT_SETTINGS.symbol,
    interval,
    strategy,
    mode,
    useTestnet: true,
    takeProfit: clamp(input.takeProfit, 0.2, 20, DEFAULT_SETTINGS.takeProfit),
    stopLoss: clamp(input.stopLoss, 0.2, 10, DEFAULT_SETTINGS.stopLoss),
    leverage: Math.round(clamp(input.leverage, 1, 10, Math.min(10, DEFAULT_SETTINGS.leverage))),
    risk: clamp(input.risk, 0.1, 5, DEFAULT_SETTINGS.risk),
    paperBalance: clamp(input.paperBalance, 100, 1000000, DEFAULT_SETTINGS.paperBalance),
  };
}

function clamp(value, minimum, maximum, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(maximum, Math.max(minimum, number)) : fallback;
}

async function reconcileTestnetPosition(symbol, credentials, settings) {
  try {
    if (!credentials?.key || !credentials?.secret) return null;
    const position = await fetchPosition(symbol, credentials);
    const posAmt = Number(position?.positionAmt || 0);
    const stored = await chrome.storage.local.get(["activeTrade", "stats"]);

    if (posAmt === 0) {
      if (stored.activeTrade && stored.activeTrade.mode === "testnet") {
        await addLog(`Reconciled: Testnet position on ${symbol} was closed externally.`);
        await chrome.storage.local.set({ activeTrade: null });
        broadcast({ action: "POSITION_UPDATE", position: null });
      }
      return null;
    }

    const direction = posAmt > 0 ? "LONG" : "SHORT";
    const entry = Number(position.entryPrice);
    const quantity = Math.abs(posAmt);
    const unRealizedPnl = Number(position.unRealizedProfit || 0);
    const rules = await getSymbolRules(symbol, true).catch(() => ({ tickSize: 0.1 }));

    const openOrders = await fetchOpenOrders(symbol, credentials).catch(() => []);
    const slOrder = openOrders.find((o) => o.type === "STOP_MARKET" || o.origType === "STOP_MARKET");
    const tpOrder = openOrders.find((o) => o.type === "TAKE_PROFIT_MARKET" || o.origType === "TAKE_PROFIT_MARKET");

    let slOrderId = slOrder?.orderId || stored.activeTrade?.slOrderId || null;
    let tpOrderId = tpOrder?.orderId || stored.activeTrade?.tpOrderId || null;
    const tpPrice = tpOrder ? Number(tpOrder.stopPrice) : roundPrice(entry * (1 + (direction === "LONG" ? 1 : -1) * (settings.takeProfit / 100)), rules.tickSize);
    const slPrice = slOrder ? Number(slOrder.stopPrice) : roundPrice(entry * (1 + (direction === "LONG" ? -1 : 1) * (settings.stopLoss / 100)), rules.tickSize);

    const closeSide = direction === "LONG" ? "SELL" : "BUY";
    if (!slOrder) {
      try {
        const newSl = await placeStopMarketOrder(symbol, closeSide, slPrice, credentials, quantity);
        slOrderId = newSl.orderId;
        await addLog(`Reconciliation: Restored missing Stop-Loss on exchange for ${symbol} @ ${slPrice}`);
      } catch (err) {
        await addLog(`Reconciliation warning: Could not place missing SL: ${errorMessage(err)}`);
      }
    }
    if (!tpOrder) {
      try {
        const newTp = await placeTakeProfitMarketOrder(symbol, closeSide, tpPrice, credentials, quantity);
        tpOrderId = newTp.orderId;
        await addLog(`Reconciliation: Restored missing Take-Profit on exchange for ${symbol} @ ${tpPrice}`);
      } catch (err) {
        await addLog(`Reconciliation warning: Could not place missing TP: ${errorMessage(err)}`);
      }
    }

    const trade = {
      symbol,
      direction,
      entry,
      quantity,
      tp: tpPrice,
      sl: slPrice,
      pnl: unRealizedPnl,
      pnlPct: entry > 0 ? (unRealizedPnl / (entry * quantity)) * 100 : 0,
      mode: "testnet",
      strategy: settings.strategy,
      openedAt: stored.activeTrade?.openedAt || Date.now(),
      orderId: stored.activeTrade?.orderId || null,
      slOrderId,
      tpOrderId,
      verifiedExchangeProtection: Boolean(slOrderId && tpOrderId),
    };

    await chrome.storage.local.set({ activeTrade: trade });
    broadcast({ action: "POSITION_UPDATE", position: trade });
    await addLog(`Reconciled active ${direction} position on ${symbol} (${quantity} @ ${entry}). Exchange SL/TP: ${trade.verifiedExchangeProtection ? "Verified" : "Pending"}`);
    return trade;
  } catch (err) {
    await addLog(`Reconciliation error for ${symbol}: ${errorMessage(err)}`);
    return null;
  }
}

async function ensureDeviceId() {
  const stored = await chrome.storage.local.get("deviceId");
  if (stored.deviceId) return stored.deviceId;
  const deviceId = crypto.randomUUID();
  await chrome.storage.local.set({ deviceId });
  return deviceId;
}

async function activateLicense(rawKey) {
  const licenseKey = String(rawKey || "").trim().toUpperCase();
  if (!/^NEXUS-[A-F0-9]{5}-[A-F0-9]{5}-[A-F0-9]{5}-[A-F0-9]{5}$/.test(licenseKey)) {
    return { ok: false, valid: false, error: "Enter a valid Nexus licence key." };
  }
  const deviceId = await ensureDeviceId();
  const response = await fetch(`${API_BASE_URL}/licenses/activate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ licenseKey, deviceId }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.valid) {
    return { ok: false, valid: false, error: data.error || "Licence activation failed." };
  }
  if (!data.sessionToken || !data.sessionExpiresAt) {
    return { ok: false, valid: false, error: "Secure customer session was not issued." };
  }
  await chrome.storage.local.set({
    licenseExpiresAt: data.expiresAt,
    customerSessionToken: data.sessionToken,
    customerSessionExpiresAt: data.sessionExpiresAt,
    licenseLastValidatedAt: Date.now(),
  });
  await chrome.storage.local.remove("licenseKey");
  await addLog("Licence activated on this device.");
  return { ok: true, valid: true, expiresAt: data.expiresAt };
}

async function validateStoredLicense(force = false) {
  const stored = await chrome.storage.local.get([
    "customerSessionToken",
    "customerSessionExpiresAt",
    "licenseExpiresAt",
    "licenseLastValidatedAt",
  ]);
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (!stored.customerSessionToken || Number(stored.customerSessionExpiresAt || 0) <= nowSeconds || Number(stored.licenseExpiresAt || 0) <= nowSeconds) {
    return { valid: false, error: "An active Nexus licence is required." };
  }
  if (!force && Date.now() - Number(stored.licenseLastValidatedAt || 0) < 6 * 60 * 60 * 1000) {
    return { valid: true, expiresAt: stored.licenseExpiresAt };
  }
  const deviceId = await ensureDeviceId();
  const response = await fetch(`${API_BASE_URL}/licenses/validate`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${stored.customerSessionToken}`,
      "Content-Type": "application/json",
      "X-Nexus-Device-ID": deviceId,
    },
    body: JSON.stringify({}),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.valid) return { valid: false, error: data.error || "Licence validation failed." };
  await chrome.storage.local.set({
    licenseExpiresAt: data.expiresAt,
    customerSessionExpiresAt: data.sessionExpiresAt,
    licenseLastValidatedAt: Date.now(),
  });
  return { valid: true, expiresAt: data.expiresAt };
}

async function startBot(inputSettings = {}) {
  const licence = await validateStoredLicense(true);
  if (!licence.valid) return { ok: false, error: licence.error };

  const current = await chrome.storage.local.get(["savedSettings", "apiKey", "apiSecret", "stats"]);
  const settings = normalizeSettings({ ...DEFAULT_SETTINGS, ...current.savedSettings, ...inputSettings });
  if (settings.mode === "testnet" && (!current.apiKey || !current.apiSecret)) {
    return { ok: false, error: "Binance Futures Testnet API key and secret are required for Testnet execution." };
  }

  const stats = current.stats || emptyStats(settings.paperBalance);
  if (settings.mode === "paper" && !Number(stats.balance)) stats.balance = settings.paperBalance;
  await chrome.storage.local.set({
    botRunning: true,
    savedSettings: settings,
    selectedStrategy: settings.strategy,
    useTestnet: true,
    stats,
  });

  if (settings.mode === "testnet" && current.apiKey && current.apiSecret) {
    await reconcileTestnetPosition(settings.symbol, { key: current.apiKey, secret: current.apiSecret, useTestnet: true }, settings);
  }

  chrome.alarms.create(ALARM_NAME, { periodInMinutes: 1 });
  await addLog(`Engine started in ${settings.mode === "paper" ? "Paper" : "Binance Testnet"} mode.`);
  broadcast({ action: "BOT_STATUS", status: "running" });
  const cycle = await runCycle();
  return { ok: true, status: "running", settings, cycle };
}

async function stopBot(reason) {
  await chrome.storage.local.set({ botRunning: false });
  await chrome.alarms.clear(ALARM_NAME);
  await addLog(reason || "Engine stopped.");
  broadcast({ action: "BOT_STATUS", status: "stopped" });
  return { ok: true, status: "stopped" };
}

async function runCycle() {
  if (isCycleRunning) {
    return { ok: true, skipped: true, reason: "Trading cycle already in progress." };
  }

  const stored = await chrome.storage.local.get([
    "botRunning",
    "savedSettings",
    "apiKey",
    "apiSecret",
    "activeTrade",
    "stats",
    "cycleLockUntil",
  ]);
  if (!stored.botRunning) return { ok: true, skipped: true, reason: "Engine is stopped." };

  const now = Date.now();
  if (stored.cycleLockUntil && stored.cycleLockUntil > now) {
    return { ok: true, skipped: true, reason: "Trading cycle locked by previous execution." };
  }

  isCycleRunning = true;
  await chrome.storage.local.set({ cycleLockUntil: now + 45000 });

  try {
    const licence = await validateStoredLicense(false);
    if (!licence.valid) {
      await stopBot("Engine stopped: licence invalid or expired.");
      return { ok: false, error: licence.error };
    }

    const settings = normalizeSettings({ ...DEFAULT_SETTINGS, ...stored.savedSettings });
    if (settings.mode !== "paper" && settings.mode !== "testnet") {
      await stopBot("Mainnet execution is disabled in the local browser engine.");
      return { ok: false, error: "Use My Live Account for guarded server-side mainnet execution." };
    }

    // Daily loss circuit breaker check
    const stats = stored.stats || emptyStats(settings.paperBalance);
    const baselineBalance = Number(stats.balance || settings.paperBalance);
    const maxAllowedDailyLoss = baselineBalance * 0.05; // 5% max daily drawdown circuit breaker
    if (Number(stats.dailyPnl || 0) <= -maxAllowedDailyLoss) {
      await stopBot(`Circuit Breaker: Daily loss ($${Number(stats.dailyPnl).toFixed(2)}) reached -5% threshold. Engine halted for safety.`);
      return { ok: false, error: "Daily loss circuit breaker triggered." };
    }

    const marketIsTestnet = settings.mode === "testnet";
    const credentials = marketIsTestnet && stored.apiKey && stored.apiSecret
      ? { key: stored.apiKey, secret: stored.apiSecret, useTestnet: true }
      : null;

    // Check if testnet position was closed on exchange by SL/TP
    if (marketIsTestnet && stored.activeTrade && credentials) {
      const exchangePos = await fetchPosition(settings.symbol, credentials).catch(() => null);
      if (exchangePos && Number(exchangePos.positionAmt || 0) === 0) {
        return await closeActivePosition("Exchange protective order filled", null);
      }
    }

    const candles = await fetchCandles(settings.symbol, settings.interval, 120, marketIsTestnet);
    const signal = evaluateStrategy(candles, settings.strategy, { requireClosed: true });
    const price = Number(signal.price || candles.at(-1)?.close);
    await addLog(`${settings.symbol} ${settings.interval}: ${signal.action} · ${signal.reason}`);

    if (stored.activeTrade) {
      const tracked = withPnl(stored.activeTrade, price);
      await chrome.storage.local.set({ activeTrade: tracked });
      broadcast({ action: "POSITION_UPDATE", position: tracked });
      const targetHit = tracked.direction === "LONG" ? price >= tracked.tp : price <= tracked.tp;
      const stopHit = tracked.direction === "LONG" ? price <= tracked.sl : price >= tracked.sl;
      if (targetHit || stopHit) return await closeActivePosition(targetHit ? "Take profit" : "Stop loss", price);
      return { ok: true, signal, position: tracked };
    }

    if (signal.action === "WAIT") return { ok: true, signal };
    const trade = settings.mode === "paper"
      ? await openPaperTrade(signal, settings, stats)
      : await openTestnetTrade(signal, settings, credentials);
    return { ok: true, signal, position: trade };
  } finally {
    isCycleRunning = false;
    await chrome.storage.local.remove("cycleLockUntil").catch(() => {});
  }
}

async function openPaperTrade(signal, settings, statsInput) {
  const stats = statsInput || emptyStats(settings.paperBalance);
  const balance = Number(stats.balance || settings.paperBalance);
  const stopDistance = settings.stopLoss / 100;
  const riskBudget = balance * (settings.risk / 100);
  const riskQuantity = riskBudget / Math.max(0.000001, signal.price * stopDistance);
  const maxQuantity = (balance * settings.leverage) / signal.price;
  const quantity = Number(Math.min(riskQuantity, maxQuantity).toFixed(6));
  const trade = buildTrade(signal, settings, quantity);
  await chrome.storage.local.set({ activeTrade: trade, stats: { ...stats, balance } });
  await addLog(`Paper ${trade.direction} opened: ${trade.symbol} @ ${trade.entry}.`);
  broadcast({ action: "POSITION_UPDATE", position: trade });
  return trade;
}

async function openTestnetTrade(signal, settings, credentials) {
  if (!credentials?.key || !credentials?.secret) throw new Error("Testnet API credentials are missing.");

  // Check if position already exists on exchange to prevent duplicate submission
  const existingPos = await fetchPosition(settings.symbol, credentials).catch(() => null);
  if (existingPos && Number(existingPos.positionAmt || 0) !== 0) {
    throw new Error(`Open position already exists on Binance (${existingPos.positionAmt} ${settings.symbol}). Trade aborted.`);
  }

  const account = await fetchAccount(credentials);
  const safeLeverage = Math.min(10, Math.max(1, settings.leverage));
  await setLeverage(settings.symbol, safeLeverage, credentials);

  const quantity = await calculateOrderQuantity({
    symbol: settings.symbol,
    price: signal.price,
    balance: account.availableBalance,
    risk: settings.risk,
    stopLoss: settings.stopLoss,
    leverage: safeLeverage,
    useTestnet: true,
  });

  const order = await placeMarketOrder(settings.symbol, signal.action, quantity, credentials);
  if (!order || !order.orderId || order.status === "REJECTED") {
    throw new Error(`Binance entry order rejected: ${order?.status || "Unknown"}`);
  }
  const entry = Number(order.avgPrice || signal.price);

  // Calculate rounded exchange stop and take profit prices
  const rules = await getSymbolRules(settings.symbol, true).catch(() => ({ tickSize: 0.1 }));
  const isLong = signal.action === "LONG";
  const closeSide = isLong ? "SELL" : "BUY";
  const rawTp = entry * (1 + (isLong ? 1 : -1) * (settings.takeProfit / 100));
  const rawSl = entry * (1 + (isLong ? -1 : 1) * (settings.stopLoss / 100));
  const tpPrice = roundPrice(rawTp, rules.tickSize);
  const slPrice = roundPrice(rawSl, rules.tickSize);

  // Immediately place exchange-native Stop-Loss and Take-Profit orders
  let slOrder = null;
  let tpOrder = null;
  try {
    slOrder = await placeStopMarketOrder(settings.symbol, closeSide, slPrice, credentials, quantity);
    if (!slOrder || !slOrder.orderId) {
      throw new Error("Exchange rejected Stop-Loss conditional order.");
    }
    tpOrder = await placeTakeProfitMarketOrder(settings.symbol, closeSide, tpPrice, credentials, quantity);
    if (!tpOrder || !tpOrder.orderId) {
      throw new Error("Exchange rejected Take-Profit conditional order.");
    }
  } catch (protectionErr) {
    // EMERGENCY SAFETY: If protective orders fail or are rejected, immediately close position!
    await addLog(`EMERGENCY: Protective order failed (${errorMessage(protectionErr)}). Immediately liquidating position for safety...`);
    try {
      await closeMarketPosition(settings.symbol, credentials);
      await cancelAllOpenOrders(settings.symbol, credentials);
    } catch (emergencyErr) {
      await addLog(`CRITICAL: Emergency close failed: ${errorMessage(emergencyErr)}`);
    }
    await stopBot(`Engine stopped: Protective order failed (${errorMessage(protectionErr)}). Position closed.`);
    throw new Error(`Protection failed: Emergency closed position. ${errorMessage(protectionErr)}`);
  }

  const trade = {
    ...buildTrade({ ...signal, price: entry }, settings, quantity, order.orderId),
    slOrderId: slOrder.orderId,
    tpOrderId: tpOrder.orderId,
    verifiedExchangeProtection: true,
  };

  const current = await chrome.storage.local.get("stats");
  await chrome.storage.local.set({
    activeTrade: trade,
    stats: { ...(current.stats || emptyStats()), balance: account.balance },
  });
  await addLog(`Testnet ${trade.direction} opened: ${trade.symbol} @ ${trade.entry}. Exchange SL: ${slPrice}, TP: ${tpPrice} verified.`);
  broadcast({ action: "POSITION_UPDATE", position: trade });
  return trade;
}

function buildTrade(signal, settings, quantity, orderId = null) {
  const isLong = signal.action === "LONG";
  const entry = Number(signal.price);
  return {
    symbol: settings.symbol,
    direction: signal.action,
    entry,
    quantity,
    tp: entry * (1 + (isLong ? 1 : -1) * settings.takeProfit / 100),
    sl: entry * (1 + (isLong ? -1 : 1) * settings.stopLoss / 100),
    pnl: 0,
    pnlPct: 0,
    mode: settings.mode,
    strategy: signal.strategy,
    openedAt: Date.now(),
    orderId,
  };
}

function withPnl(trade, price) {
  const multiplier = trade.direction === "LONG" ? 1 : -1;
  const grossPnl = (price - Number(trade.entry)) * Number(trade.quantity) * multiplier;
  // Realistic fee calculation (0.05% taker entry + 0.05% taker exit)
  const estFee = (Number(trade.entry) * Number(trade.quantity) * 0.0005) + (price * Number(trade.quantity) * 0.0005);
  const pnl = grossPnl - estFee;
  const pnlPct = trade.entry > 0 ? (pnl / (Number(trade.entry) * Number(trade.quantity))) * 100 : 0;
  return { ...trade, markPrice: price, pnl, pnlPct, fee: estFee, grossPnl };
}

async function closeActivePosition(reason = "Manual close", suppliedPrice = null) {
  const stored = await chrome.storage.local.get([
    "activeTrade",
    "savedSettings",
    "apiKey",
    "apiSecret",
    "stats",
    "tradeHistory",
  ]);
  if (!stored.activeTrade) return { ok: true, closed: false, reason: "No active position." };
  const settings = normalizeSettings({ ...DEFAULT_SETTINGS, ...stored.savedSettings });
  if (settings.mode === "testnet") {
    if (!stored.apiKey || !stored.apiSecret) throw new Error("Testnet API credentials are missing.");
    const credentials = {
      key: stored.apiKey,
      secret: stored.apiSecret,
      useTestnet: true,
    };
    await closeMarketPosition(stored.activeTrade.symbol, credentials);
    try {
      await cancelAllOpenOrders(stored.activeTrade.symbol, credentials);
    } catch (cleanErr) {
      await addLog(`Open order cleanup: ${errorMessage(cleanErr)}`);
    }
  }
  const price = Number(suppliedPrice || await fetchPrice(stored.activeTrade.symbol, settings.mode === "testnet"));
  const closedTrade = {
    ...withPnl(stored.activeTrade, price),
    exit: price,
    closedAt: Date.now(),
    closeReason: reason,
  };
  const stats = stored.stats || emptyStats(settings.paperBalance);
  const totalTrades = Number(stats.totalTrades || 0) + 1;
  const wins = Number(stats.wins || 0) + (closedTrade.pnl >= 0 ? 1 : 0);
  const losses = Number(stats.losses || 0) + (closedTrade.pnl < 0 ? 1 : 0);
  const balance = settings.mode === "paper"
    ? Number(stats.balance || settings.paperBalance) + closedTrade.pnl
    : Number(stats.balance || 0);
  const nextStats = {
    ...stats,
    balance,
    dailyPnl: Number(stats.dailyPnl || 0) + closedTrade.pnl,
    totalTrades,
    wins,
    losses,
    winRate: Number(((wins / totalTrades) * 100).toFixed(1)),
    maxDrawdown: Math.min(Number(stats.maxDrawdown || 0), closedTrade.pnlPct),
  };
  const tradeHistory = [closedTrade, ...(stored.tradeHistory || [])].slice(0, 100);
  await chrome.storage.local.set({ activeTrade: null, stats: nextStats, tradeHistory });
  await addLog(`${reason}: ${closedTrade.symbol} closed at ${price} (${closedTrade.pnlPct.toFixed(2)}%).`);
  broadcast({ action: "POSITION_UPDATE", position: null });
  broadcast({ action: "STATS_UPDATE", stats: nextStats });
  return { ok: true, closed: true, trade: closedTrade, stats: nextStats };
}

async function getStatus() {
  const stored = await chrome.storage.local.get([
    "botRunning",
    "stats",
    "activeTrade",
    "savedSettings",
    "actionLogs",
    "licenseExpiresAt",
  ]);
  return {
    ok: true,
    status: stored.botRunning ? "running" : "stopped",
    botRunning: Boolean(stored.botRunning),
    stats: stored.stats || emptyStats(),
    activeTrade: stored.activeTrade || null,
    settings: normalizeSettings({ ...DEFAULT_SETTINGS, ...stored.savedSettings }),
    actionLogs: stored.actionLogs || [],
    licenseExpiresAt: stored.licenseExpiresAt || null,
  };
}

async function getHealth() {
  const stored = await chrome.storage.local.get([
    "botRunning",
    "savedSettings",
    "apiKey",
    "apiSecret",
    "customerSessionToken",
    "customerSessionExpiresAt",
    "licenseExpiresAt",
  ]);
  const settings = normalizeSettings({ ...DEFAULT_SETTINGS, ...stored.savedSettings });
  const licensed = Boolean(
    stored.customerSessionToken
    && Number(stored.customerSessionExpiresAt || 0) > Date.now() / 1000
    && Number(stored.licenseExpiresAt || 0) > Date.now() / 1000
  );
  let backend = false;
  try {
    const response = await fetch(`${API_BASE_URL}/health`, { cache: "no-store" });
    backend = response.ok;
  } catch {
    backend = false;
  }
  return {
    ok: true,
    api: backend,
    backend,
    broker: settings.mode === "paper" || Boolean(stored.apiKey && stored.apiSecret),
    mode: settings.mode === "paper" ? "PAPER" : "TESTNET",
    license: licensed ? "PRO" : "REQUIRED",
    bot: stored.botRunning ? "RUNNING" : "STOPPED",
    version: PRODUCT_VERSION,
    officialSite: OFFICIAL_SITE_URL,
  };
}

async function systemReply(rawQuery) {
  const query = String(rawQuery || "").trim().toLowerCase();
  const status = await getStatus();
  const settings = status.settings;
  let reply = `Engine is ${status.status}. Mode: ${settings.mode.toUpperCase()}, symbol: ${settings.symbol}, strategy: ${settings.strategy}.`;
  if (query.includes("risk")) {
    reply = `Local ${settings.mode.toUpperCase()} risk is ${settings.risk}% per trade with ${settings.stopLoss}% stop loss and ${settings.takeProfit}% take profit. Each customer's live backend account has separate hard limits and never guarantees profit.`;
  } else if (query.includes("key") || query.includes("api")) {
    reply = "Testnet keys stay in this browser. A paid customer can submit one mainnet Binance key in My Live Account; it is encrypted per customer on the backend, never retained locally, and must have withdrawals disabled.";
  } else if (query.includes("license")) {
    reply = status.licenseExpiresAt
      ? `Licence expiry: ${new Date(status.licenseExpiresAt * 1000).toLocaleString()}.`
      : "No active licence is stored. Open Payment / Licence to activate one.";
  } else if (query.includes("position") || query.includes("trade")) {
    reply = status.activeTrade
      ? `${status.activeTrade.direction} ${status.activeTrade.symbol} from ${status.activeTrade.entry}; unrealized P&L ${Number(status.activeTrade.pnlPct || 0).toFixed(2)}%.`
      : "There is no active position.";
  }
  return { ok: true, reply };
}

async function addLog(text) {
  const stored = await chrome.storage.local.get("actionLogs");
  const entry = { text, at: Date.now() };
  const actionLogs = [entry, ...(stored.actionLogs || [])].slice(0, 100);
  await chrome.storage.local.set({ actionLogs });
  broadcast({ action: "ACTION_LOG", text });
}

async function failCycle(error) {
  await addLog(`Cycle error: ${errorMessage(error)}`);
}

function broadcast(message) {
  chrome.runtime.sendMessage(message).catch(() => undefined);
}

function errorMessage(error) {
  return error instanceof Error ? error.message : "Unexpected extension error.";
}
