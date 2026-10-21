import { API_BASE_URL, DEFAULT_SETTINGS, OFFICIAL_SITE_URL } from "./config.js";

let botRunning = false;
let refreshTimer;

document.addEventListener("DOMContentLoaded", async () => {
  bindNavigation();
  bindActions();
  initWorkflow();
  await loadSettings();
  await refreshAll(true);
  openRequestedTab();
  refreshTimer = setInterval(() => refreshAll(false), 5000);
});

window.addEventListener("unload", () => clearInterval(refreshTimer));
chrome.runtime.onMessage.addListener((message) => {
  if (message.action === "BOT_STATUS") setBotState(message.status === "running");
  if (message.action === "POSITION_UPDATE") renderPosition(message.position);
  if (message.action === "STATS_UPDATE") renderStats(message.stats);
  if (message.action === "ACTION_LOG") prependLog(message.text);
});

function bindNavigation() {
  document.querySelectorAll(".nav-item").forEach((item) => item.addEventListener("click", (event) => {
    event.preventDefault();
    activateTab(item.dataset.tab);
  }));
}

function bindActions() {
  document.getElementById("official-site-btn").addEventListener("click", () => openExternal(OFFICIAL_SITE_URL));
  document.getElementById("verify-payment-btn").addEventListener("click", () => openExternal(`${OFFICIAL_SITE_URL}/#pricing`));
  document.getElementById("save-settings-btn").addEventListener("click", saveSettings);
  document.getElementById("start-btn-dash").addEventListener("click", toggleBot);
  document.getElementById("close-pos-btn").addEventListener("click", closePosition);
  document.getElementById("activate-btn").addEventListener("click", activateLicense);
  document.getElementById("copy-payment-btn").addEventListener("click", copyPaymentAddress);
  document.getElementById("live-connect-btn").addEventListener("click", saveAndCheckLiveBackend);
  document.getElementById("live-disconnect-btn").addEventListener("click", disconnectLiveBackend);
  document.getElementById("live-research-btn").addEventListener("click", refreshLiveResearch);
  document.getElementById("live-enable-btn").addEventListener("click", () => setLiveExecution(true));
  document.getElementById("live-disable-btn").addEventListener("click", () => setLiveExecution(false));
  document.getElementById("live-close-btn").addEventListener("click", closeLivePosition);
  document.getElementById("chat-toggle-btn").addEventListener("click", () => document.getElementById("chat-panel").classList.toggle("hidden"));
  document.getElementById("chat-close-btn").addEventListener("click", () => document.getElementById("chat-panel").classList.add("hidden"));
  document.getElementById("chat-send-btn").addEventListener("click", sendChatMessage);
  document.getElementById("chat-input").addEventListener("keydown", (event) => {
    if (event.key === "Enter") sendChatMessage();
  });
}

function activateTab(tab) {
  document.querySelectorAll(".nav-item").forEach((item) => item.classList.toggle("active", item.dataset.tab === tab));
  document.querySelectorAll(".tab-pane").forEach((pane) => pane.classList.toggle("active", pane.id === `tab-${tab}`));
  history.replaceState(null, "", `#${tab}`);
}

function openRequestedTab() {
  const params = new URLSearchParams(location.search);
  const requested = params.get("tab") || location.hash.slice(1);
  if (document.getElementById(`tab-${requested}`)) activateTab(requested);
  if (params.get("chat") === "open") document.getElementById("chat-panel").classList.remove("hidden");
}

async function refreshAll(includeHealth) {
  const status = await sendMessage({ action: "GET_STATUS" });
  if (status?.ok) renderStatus(status);
  if (includeHealth || !document.getElementById("h-api").dataset.checked) {
    const health = await sendMessage({ action: "GET_HEALTH" });
    renderHealth(health);
  }
}

function renderStatus(status) {
  setBotState(status.botRunning);
  renderStats(status.stats || {});
  renderPosition(status.activeTrade);
  renderLogs(status.actionLogs || []);
  renderSettingsSummary(status.settings || DEFAULT_SETTINGS);
  renderLicence(status.licenseExpiresAt);
  renderHistoryFromStorage();
}

function renderStats(stats) {
  const pnl = Number(stats.dailyPnl || 0);
  setText("ov-balance", `${Number(stats.balance || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT`);
  setText("ov-pnl", `${pnl >= 0 ? "+" : ""}$${pnl.toFixed(2)}`);
  setText("ov-winrate", `${Number(stats.winRate || 0).toFixed(1)}%`);
  setText("ov-total", String(stats.totalTrades || 0));
  document.getElementById("ov-pnl").style.color = pnl >= 0 ? "var(--accent)" : "var(--red)";
}

function renderPosition(position) {
  const panel = document.getElementById("position-panel");
  const closeButton = document.getElementById("close-pos-btn");
  panel.replaceChildren();
  if (!position) {
    panel.className = "empty-position";
    panel.textContent = "No active position. The engine is waiting for a confirmed setup.";
    closeButton.classList.add("hidden");
    return;
  }
  panel.className = "position-grid";
  const pnlNumber = Number(position.pnl || 0);
  const pnlSign = pnlNumber >= 0 ? "+" : "";
  const values = [
    ["SYMBOL / SIDE", `${position.symbol} · ${position.direction}`],
    ["ENTRY", formatPrice(position.entry)],
    ["MARK", formatPrice(position.markPrice || position.entry)],
    ["TAKE PROFIT", `${formatPrice(position.tp)}${position.tpOrderId ? ` (Order #${position.tpOrderId})` : ""}`],
    ["STOP LOSS", `${formatPrice(position.sl)}${position.slOrderId ? ` (Order #${position.slOrderId})` : ""}`],
    ["EXCHANGE SL/TP", position.verifiedExchangeProtection ? "✅ VERIFIED ACTIVE" : position.mode === "testnet" ? "⚠️ PENDING CONFIRMATION" : "SIMULATED"],
    ["UNREALIZED P&L", `${Number(position.pnlPct || 0).toFixed(2)}% / ${pnlSign}$${pnlNumber.toFixed(2)}`],
    ["ESTIMATED FEES", `$${Number(position.fee || 0).toFixed(4)}`],
  ];
  values.forEach(([label, value]) => {
    const cell = document.createElement("div");
    const labelNode = document.createElement("span");
    const valueNode = document.createElement("strong");
    labelNode.textContent = label;
    valueNode.textContent = value;
    if (label === "UNREALIZED P&L") {
      valueNode.style.color = pnlNumber >= 0 ? "var(--accent)" : "var(--red)";
    }
    cell.append(labelNode, valueNode);
    panel.appendChild(cell);
  });
  closeButton.classList.remove("hidden");
}

function renderSettingsSummary(settings) {
  setText("ov-symbol", settings.symbol || DEFAULT_SETTINGS.symbol);
  setText("ov-active-strategy", String(settings.strategy || DEFAULT_SETTINGS.strategy).toUpperCase());
  const modeBadge = document.getElementById("h-mode");
  if (settings.mode === "testnet") {
    modeBadge.textContent = "TESTNET";
    modeBadge.className = "st-val info";
  } else {
    modeBadge.textContent = "PAPER";
    modeBadge.className = "st-val warn";
  }
}

function renderHealth(health) {
  if (!health) return;
  const api = document.getElementById("h-api");
  api.dataset.checked = "true";
  api.textContent = health.backend ? "ONLINE" : "OFFLINE";
  api.className = `st-val ${health.backend ? "good" : "bad"}`;
  setText("h-mode", health.mode || "PAPER");
  const licence = document.getElementById("h-license");
  licence.textContent = health.license || "REQUIRED";
  licence.className = `st-val ${health.license === "PRO" ? "good" : "bad"}`;
}

function setBotState(running) {
  botRunning = Boolean(running);
  const button = document.getElementById("start-btn-dash");
  button.textContent = botRunning ? "⛔ STOP ENGINE" : "⚡ START ENGINE";
  button.classList.toggle("is-stop", botRunning);
  ["h-bot", "hf-bot-status"].forEach((id) => {
    const element = document.getElementById(id);
    element.textContent = botRunning ? "RUNNING" : "STOPPED";
    element.className = id === "h-bot" ? `st-val ${botRunning ? "good" : "bad"}` : "stat-val";
  });
}

async function loadSettings() {
  const stored = await chrome.storage.local.get(["savedSettings", "apiKey", "apiSecret", "customerSessionToken"]);
  const settings = { ...DEFAULT_SETTINGS, ...stored.savedSettings };
  setInput("s-symbol", settings.symbol);
  setInput("s-interval", settings.interval);
  setInput("s-strategy", settings.strategy);
  setInput("s-mode", settings.mode === "testnet" ? "testnet" : "paper");
  setInput("s-tp", settings.takeProfit);
  setInput("s-sl", settings.stopLoss);
  setInput("s-leverage", settings.leverage);
  setInput("s-risk", settings.risk);
  setInput("s-paper-balance", settings.paperBalance);
  setInput("s-api-key", stored.apiKey || "");
  setInput("s-api-secret", stored.apiSecret || "");
  setInput("l-api-key", "");
  setInput("l-api-secret", "");
  if (stored.customerSessionToken) refreshLiveStatus(false);
}

async function liveConnection() {
  const stored = await chrome.storage.local.get(["customerSessionToken", "deviceId"]);
  return {
    baseUrl: API_BASE_URL,
    token: String(stored.customerSessionToken || "").trim(),
    deviceId: String(stored.deviceId || "").trim(),
  };
}

async function liveRequest(path, options = {}) {
  const connection = await liveConnection();
  if (!connection.token || !connection.deviceId) throw new Error("Activate your Nexus licence first.");
  const response = await fetch(`${connection.baseUrl}/customer/${path}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${connection.token}`,
      "Content-Type": "application/json",
      "X-Nexus-Device-ID": connection.deviceId,
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `Live backend request failed (${response.status})`);
  return payload;
}

async function saveAndCheckLiveBackend() {
  const apiKey = value("l-api-key").trim();
  const apiSecret = value("l-api-secret").trim();
  if (!apiKey || !apiSecret) return showFeedback("Enter your Binance mainnet API key and secret.", true);
  if (!document.getElementById("l-withdraw-disabled").checked) return showFeedback("Confirm that withdrawals are disabled on this API key.", true);
  if (!document.getElementById("l-risk-accepted").checked) return showFeedback("Confirm that you understand the real-money risk.", true);
  try {
    showFeedback("Verifying and encrypting your Binance connection…");
    await liveRequest("binance/connect", {
      method: "POST",
      body: { apiKey, apiSecret, withdrawalDisabled: true, riskAccepted: true },
    });
    setInput("l-api-key", "");
    setInput("l-api-secret", "");
    document.getElementById("l-withdraw-disabled").checked = false;
    document.getElementById("l-risk-accepted").checked = false;
    await refreshLiveStatus(false);
    showFeedback("Binance account connected. Credentials are encrypted and were not saved in this browser.");
  } catch (error) {
    setInput("l-api-secret", "");
    showFeedback(error.message, true);
  }
}

async function disconnectLiveBackend() {
  if (!confirm("Remove the encrypted Binance connection? Live execution must already be disabled.")) return;
  try {
    await liveRequest("binance/disconnect", { method: "DELETE" });
    await refreshLiveStatus(false);
    showFeedback("Binance connection removed from the backend.");
  } catch (error) {
    showFeedback(error.message, true);
  }
}

async function refreshLiveStatus(showSuccess = false) {
  try {
    const payload = await liveRequest("status");
    renderLiveStatus(payload);
    if (showSuccess) showFeedback("Your customer account is connected securely.");
    return payload;
  } catch (error) {
    setText("live-ready", "OFFLINE / LOCKED");
    if (showSuccess) showFeedback(error.message, true);
    return null;
  }
}

function renderLiveStatus(payload) {
  const settings = payload.settings || {};
  const state = payload.state || {};
  const connection = payload.connection || {};
  const research = payload.research;
  setText("live-ready", connection.connected ? "CONNECTED" : "NOT CONNECTED");
  setText("live-enabled", settings.enabled ? "LIVE ENABLED" : "DISABLED");
  const liveCloseButton = document.getElementById("live-close-btn");
  const hasManagedPosition = Boolean(state.hasManagedPosition);
  liveCloseButton.classList.toggle("hidden", !hasManagedPosition);
  setText("live-position", hasManagedPosition
    ? `${Number(state.managedPositionAmount || 0) > 0 ? "LONG" : "SHORT"} ${Math.abs(Number(state.managedPositionAmount || 0))} BTC · ${state.hasExchangeProtection ? "PROTECTED" : "CHECKING"}`
    : "FLAT");
  setText("live-cycle", state.lastCycleAt ? new Date(state.lastCycleAt * 1000).toLocaleString() : "NOT RUN YET");
  setText("live-news-risk", research ? `${String(research.riskLevel).toUpperCase()} / ${research.confidence}%` : "NO RESEARCH");
  setInput("l-risk-bps", settings.riskBps ?? 25);
  setInput("l-daily-loss-bps", settings.dailyLossBps ?? 100);
  setInput("l-leverage", settings.leverage ?? 2);
  setInput("l-max-notional", settings.maxNotionalUsdt ?? 250);
  setText("live-key-hint", connection.apiKeyHint || "—");
  setText("live-equity", connection.accountEquity !== null && connection.accountEquity !== undefined && Number.isFinite(Number(connection.accountEquity))
    ? `${Number(connection.accountEquity).toFixed(2)} USDT`
    : "—");
  setText("live-license-expiry", payload.licenseExpiresAt ? new Date(payload.licenseExpiresAt * 1000).toLocaleString() : "—");
  setText("live-research-summary", research?.summary || "No current Gemini Search-grounded research is available. The engine will not trade without it.");
  const sourceBox = document.getElementById("live-research-sources");
  sourceBox.replaceChildren();
  (research?.sources || []).forEach((url) => {
    const link = document.createElement("a");
    link.href = url;
    link.textContent = url;
    link.target = "_blank";
    link.rel = "noreferrer";
    sourceBox.appendChild(link);
  });
  const missing = payload.missingConfiguration || [];
  const entryBlockers = payload.entryBlockers || [];
  const backtestNote = payload.backtest
    ? ` Walk-forward: ${payload.backtest.passed ? "PASSED" : "BLOCKED"} (${payload.backtest.tradeCount} trades, net ${payload.backtest.netR}R, PF ${payload.backtest.profitFactor}).`
    : " Walk-forward diagnostic has not run yet; live entries remain blocked.";
  const readinessNote = missing.length
    ? `Server setup still required: ${missing.join(", ")}.`
    : state.pausedReason
      ? `Paused: ${state.pausedReason}`
      : entryBlockers.length
        ? `Live entry blocked: ${entryBlockers.join(", ")}.`
        : "All live-entry guards are ready.";
  setText("live-missing-config", readinessNote + backtestNote);
}

async function refreshLiveResearch() {
  try {
    showFeedback("Running your account safety check…");
    await liveRequest("run", { method: "POST", body: {} });
    await refreshLiveStatus(false);
    showFeedback("Account safety check completed.");
  } catch (error) {
    showFeedback(error.message, true);
  }
}

async function setLiveExecution(enabled) {
  if (enabled && !confirm("This can place real Binance Futures orders and lose real money. Continue?")) return;
  try {
    const acknowledgement = value("l-ack").trim();
    const body = enabled ? {
      enabled: true,
      acknowledgement,
      riskBps: Number(value("l-risk-bps")),
      dailyLossBps: Number(value("l-daily-loss-bps")),
      leverage: Number(value("l-leverage")),
      maxNotionalUsdt: Number(value("l-max-notional")),
    } : { enabled: false };
    await liveRequest("control", { method: "POST", body });
    await refreshLiveStatus(false);
    showFeedback(enabled ? "Real-money engine enabled with hard limits." : "Real-money engine disabled.");
  } catch (error) {
    showFeedback(error.message, true);
  }
}

async function closeLivePosition() {
  if (!confirm("Close the Nexus-managed BTCUSDT position at market now? This can realize a loss and will disable live execution.")) return;
  try {
    showFeedback("Submitting reduce-only live close and reconciling Nexus protection orders…");
    const result = await liveRequest("position/close", {
      method: "POST",
      body: { confirmation: "CLOSE_MANAGED_POSITION" },
    });
    await refreshLiveStatus(false);
    showFeedback(result.message || "Managed live position closed; live execution is disabled.");
  } catch (error) {
    showFeedback(error.message, true);
  }
}

async function saveSettings() {
  const settings = {
    symbol: value("s-symbol").toUpperCase(),
    interval: value("s-interval"),
    strategy: value("s-strategy"),
    mode: value("s-mode") === "testnet" ? "testnet" : "paper",
    useTestnet: true,
    takeProfit: Number(value("s-tp")),
    stopLoss: Number(value("s-sl")),
    leverage: Number(value("s-leverage")),
    risk: Number(value("s-risk")),
    paperBalance: Number(value("s-paper-balance")),
  };
  if (!/^[A-Z0-9]{5,20}$/.test(settings.symbol)) return showFeedback("Enter a valid Binance symbol such as BTCUSDT.", true);
  await chrome.storage.local.set({
    savedSettings: settings,
    selectedStrategy: settings.strategy,
    apiKey: value("s-api-key").trim(),
    apiSecret: value("s-api-secret").trim(),
    useTestnet: true,
  });
  showFeedback("Settings saved locally. Mainnet remains disabled.");
  renderSettingsSummary(settings);
}

async function toggleBot() {
  const response = await sendMessage({
    action: botRunning ? "STOP_BOT" : "START_BOT",
    settings: await currentSettings(),
  });
  if (!response?.ok) return showFeedback(response?.error || "Engine request failed.", true);
  setBotState(response.status === "running");
  showFeedback(response.status === "running" ? "Engine started." : "Engine stopped.");
  await refreshAll(false);
}

async function closePosition() {
  if (!confirm("Close the currently tracked position now?")) return;
  const response = await sendMessage({ action: "CLOSE_POSITION" });
  if (!response?.ok) return showFeedback(response?.error || "Position close failed.", true);
  showFeedback(response.closed ? "Position closed." : "No active position found.");
  await refreshAll(false);
}

async function activateLicense() {
  const key = value("license-key-input").trim().toUpperCase();
  const response = await sendMessage({ action: "VALIDATE_KEY", key });
  if (!response?.valid) return showFeedback(response?.error || "Licence activation failed.", true);
  renderLicence(response.expiresAt);
  showFeedback("Licence activated on this device.");
  await refreshAll(true);
  await refreshLiveStatus(false);
}

function renderLicence(expiresAt) {
  const active = Number(expiresAt || 0) > Date.now() / 1000;
  const status = document.getElementById("ls-status");
  status.textContent = active ? "ACTIVE PRO" : "NOT ACTIVE";
  status.style.color = active ? "#4f8200" : "var(--red)";
  setText("ls-activated", active ? `Expires ${new Date(expiresAt * 1000).toLocaleString()}` : "One key activates on one browser device.");
}

async function copyPaymentAddress() {
  await navigator.clipboard.writeText(document.getElementById("payment-address").textContent);
  showFeedback("Payment address copied.");
}

function renderLogs(logs) {
  const box = document.getElementById("action-log");
  box.replaceChildren();
  if (!logs.length) return prependLog("Control center ready.");
  logs.slice(0, 30).reverse().forEach((entry) => prependLog(entry.text, entry.at));
}

function prependLog(text, at = Date.now()) {
  const line = document.createElement("div");
  line.textContent = `[${new Date(at).toLocaleTimeString()}] ${text}`;
  document.getElementById("action-log").prepend(line);
}

async function renderHistoryFromStorage() {
  const stored = await chrome.storage.local.get("tradeHistory");
  const body = document.getElementById("history-body");
  body.replaceChildren();
  const rows = stored.tradeHistory || [];
  if (!rows.length) {
    const row = body.insertRow();
    const cell = row.insertCell();
    cell.colSpan = 7;
    cell.textContent = "No closed trades yet.";
    return;
  }
  rows.slice(0, 50).forEach((trade) => {
    const row = body.insertRow();
    [trade.symbol, trade.direction, formatPrice(trade.entry), formatPrice(trade.exit), `${Number(trade.pnlPct || 0).toFixed(2)}%`, trade.closeReason || "Closed", new Date(trade.closedAt).toLocaleString()]
      .forEach((content) => { row.insertCell().textContent = content; });
  });
}

async function sendChatMessage() {
  const input = document.getElementById("chat-input");
  const query = input.value.trim();
  if (!query) return;
  appendChat("YOU", query);
  input.value = "";
  const response = await sendMessage({ action: "CHAT_QUERY", query });
  appendChat("SYSTEM", response?.reply || response?.error || "No response available.");
}

function appendChat(sender, text) {
  const message = document.createElement("div");
  const label = document.createElement("strong");
  const copy = document.createElement("span");
  label.textContent = sender;
  copy.textContent = text;
  message.append(label, copy);
  document.getElementById("chat-messages").appendChild(message);
}

async function currentSettings() {
  const stored = await chrome.storage.local.get("savedSettings");
  return { ...DEFAULT_SETTINGS, ...stored.savedSettings };
}

function showFeedback(message, isError = false) {
  const feedback = document.getElementById("feedback");
  feedback.textContent = message;
  feedback.className = `feedback ${isError ? "error" : "success"}`;
  setTimeout(() => feedback.classList.add("hidden"), 5000);
}

function sendMessage(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) resolve({ ok: false, error: chrome.runtime.lastError.message });
      else resolve(response);
    });
  });
}

function openExternal(url) {
  chrome.tabs.create({ url });
}

function setText(id, text) {
  document.getElementById(id).textContent = text;
}

function setInput(id, valueToSet) {
  document.getElementById(id).value = String(valueToSet ?? "");
}

function value(id) {
  return document.getElementById(id).value;
}

function formatPrice(price) {
  const number = Number(price || 0);
  return number >= 100 ? `$${number.toFixed(2)}` : `$${number.toFixed(6)}`;
}

/* ════════ INTERACTIVE WORKFLOW TOPOLOGY ════════ */
const WORKFLOW_NODES = {
  "market-feed": {
    id: "market-feed",
    stepNumber: "01",
    title: "Market Data Stream",
    category: "Ingestion Layer",
    icon: "⚡",
    status: "ACTIVE",
    subtitle: "Binance Kline Stream • REST & WebSocket Ticker",
    payload: "120 Closed Candles (1m/5m/15m)",
    description: "Continuously streams real-time Kline OHLCV candles and live ticker prices directly from Binance Futures endpoints. Buffers completed historical periods for deterministic indicator computation.",
    details: [
      { label: "Target Symbol", value: "BTCUSDT Perpetual" },
      { label: "Candle Limits", value: "120 historical bars" },
      { label: "Timeframe Sync", value: "Every 60s / WebSocket tick" },
      { label: "Price Source", value: "Mark Price (prevents wicks)" },
    ],
    formula: "Price = MarkPrice(Binance Index + Funding Basis)",
    safetyCheck: "Automatic reconnection on WebSocket drops; REST fallback enabled.",
  },
  "data-sanitizer": {
    id: "data-sanitizer",
    stepNumber: "02",
    title: "Data Sanitizer & Guard",
    category: "Integrity Layer",
    icon: "🛡️",
    status: "VERIFIED",
    subtitle: "Deduplication • Geometry Audit • Closed Filter",
    payload: "Clean OHLCV Series",
    description: "Sanitizes all market data before quantitative evaluation. Filters out forming/unclosed candles to prevent lookahead bias. Validates candle geometry and eliminates corrupt spikes.",
    details: [
      { label: "Lookahead Guard", value: "closeTime <= currentTime" },
      { label: "Geometry Check", value: "high >= max(open,close) & low <= min(open,close)" },
      { label: "Price Sanity", value: "open, high, low, close > 0" },
      { label: "Deduplication", value: "Chronological ascending timestamp sort" },
    ],
    formula: "Validate(c) : c.closeTime <= now ∧ c.high >= c.low ∧ c.price > 0",
    safetyCheck: "Prevents execution on malformed or incomplete candles.",
  },
  "signal-engine": {
    id: "signal-engine",
    stepNumber: "03",
    title: "Quantitative Signal Engine",
    category: "Strategy Engine",
    icon: "🤖",
    status: "COMPLETED",
    subtitle: "RSI Guard • MACD Crossover • 40-Bar Breakout",
    payload: "LONG Setup (Confidence: 82%)",
    description: "Evaluates multi-timeframe mathematical indicators. Validates EMA 50/200 trend alignment, 40-candle Donchian breakout thresholds, and filters out false moves with the 14-period RSI guard.",
    details: [
      { label: "Trend Filter", value: "Price > EMA50 > EMA200 (Bullish regime)" },
      { label: "Breakout Rule", value: "Price > 40-candle prior high" },
      { label: "RSI Filter", value: "RSI-14 <= 75 (Not overbought)" },
      { label: "MACD Crossover", value: "Histogram > 0 & Line > Signal (+2 score)" },
    ],
    formula: "Score = Breakout(3) + Trend(2) + RSI_Guard(2) + MACD(2) >= Threshold(2)",
    safetyCheck: "RSI edge-case guard prevents false triggers on flat/oscillating markets.",
  },
  "gemini-research": {
    id: "gemini-research",
    stepNumber: "04",
    title: "Gemini AI News Guard",
    category: "Cloud Intelligence",
    icon: "🌐",
    status: "GUARDED",
    subtitle: "24h Macro Sentiment • Google Search Grounding",
    payload: "Risk Level: LOW (Score 88/100)",
    description: "Server-side Gemini 3.7 Flash agent performs search-grounded market intelligence. Scans the last 24 hours of breaking news, Federal Reserve catalysts, and exchange risks to veto risky trades.",
    details: [
      { label: "Model", value: "Gemini 3.7 Flash with Search Grounding" },
      { label: "Scan Frequency", value: "Hourly + On-demand before entries" },
      { label: "News Bias", value: "Neutral to Bullish" },
      { label: "Veto Condition", value: "High / Extreme risk vetoes technical setup" },
    ],
    formula: "VetoIf(newsRisk == 'extreme' || newsRisk == 'high')",
    safetyCheck: "Prevents entering right before catastrophic news spikes or regulatory bans.",
  },
  "risk-sizer": {
    id: "risk-sizer",
    stepNumber: "05",
    title: "Dynamic Risk & Lot Sizing",
    category: "Risk Control",
    icon: "⚖️",
    status: "COMPLETED",
    subtitle: "1% Equity Budget • Max 10x Leverage • Min Notional",
    payload: "Qty: 0.045 BTC ($3,034 Notional)",
    description: "Computes position size mathematically based on stop-loss distance, available balance, and exchange lot step constraints. Hard clamps leverage to 10x maximum to prevent liquidation.",
    details: [
      { label: "Account Balance", value: "10,000.00 USDT" },
      { label: "Risk Budget", value: "1.00% ($100 max risk per trade)" },
      { label: "Stop Distance", value: "2.5 * ATR ($1,051 = 1.56%)" },
      { label: "Leverage Limit", value: "Max 10× clamp (Strictly enforced)" },
    ],
    formula: "Qty = floor((Balance * Risk%) / (Entry - StopPrice), StepSize)",
    safetyCheck: "Enforces Binance minNotional ($5) and minimum lot size (0.001 BTC).",
  },
  "order-exec": {
    id: "order-exec",
    stepNumber: "06",
    title: "Binance Futures Entry",
    category: "Execution Layer",
    icon: "🚀",
    status: "RUNNING",
    subtitle: "Market IOC Order • Testnet & Guarded Live",
    payload: "Filled @ $67,420.50 (Order #883912)",
    description: "Submits authenticated signed POST order to Binance Futures API. Validates execution response, average fill price, and executed quantity with millisecond clock offset synchronization.",
    details: [
      { label: "Execution Side", value: "BUY (LONG Entry)" },
      { label: "Order Type", value: "MARKET IOC" },
      { label: "Fill Price", value: "$67,420.50" },
      { label: "Client Order ID", value: "nx_entry_l9p2a1_f4c" },
    ],
    formula: "Sign(HMAC_SHA256, QueryString, ApiSecret)",
    safetyCheck: "In-memory mutex and cycle lock prevent duplicate order submissions.",
  },
  "native-protection": {
    id: "native-protection",
    stepNumber: "07",
    title: "Exchange-Native Protection",
    category: "Capital Preservation",
    icon: "🎯",
    status: "ACTIVE",
    subtitle: "STOP_MARKET & TAKE_PROFIT_MARKET on Binance",
    payload: "SL: $66,410 | TP: $69,440 (Verified)",
    description: "Instantly places hardware-level conditional bracket orders on Binance exchange servers. If protective orders fail or are rejected, the failsafe triggers an IMMEDIATE MARKET CLOSE for safety.",
    details: [
      { label: "Stop Loss", value: "$66,410.00 (Order #90214 • STOP_MARKET)" },
      { label: "Take Profit", value: "$69,440.00 (Order #90215 • TAKE_PROFIT_MARKET)" },
      { label: "Trigger Type", value: "MARK_PRICE (Immunized against manipulation)" },
      { label: "Working Flags", value: "reduceOnly: true, closePosition: true" },
    ],
    formula: "SL = Entry * (1 - StopLoss%) ; TP = Entry * (1 + TakeProfit%)",
    safetyCheck: "EMERGENCY SAFETY: If SL/TP fails, newly opened position is instantly liquidated.",
  },
  "pnl-monitor": {
    id: "pnl-monitor",
    stepNumber: "08",
    title: "Real-Time PnL & Circuit Breaker",
    category: "Monitoring & Exit",
    icon: "📊",
    status: "ACTIVE",
    subtitle: "Live PnL • Fee Accounting • -5% Drawdown Breaker",
    payload: "Unrealized: +2.85% (+$192.40 Net)",
    description: "Tracks mark price live, updates unrealized P&L, accounts for 0.1% round-trip taker fees, and monitors daily loss limits. If daily drawdown reaches -5%, trading pauses for capital safety.",
    details: [
      { label: "Unrealized PnL", value: "+$192.40 (+2.85%)" },
      { label: "Estimated Fees", value: "$14.80 (0.05% taker * 2)" },
      { label: "Daily Circuit Breaker", value: "Max 5% daily drawdown (Halts bot)" },
      { label: "Cleanup Routine", value: "Cancels orphan orders upon position exit" },
    ],
    formula: "PnL = (MarkPrice - Entry) * Qty - TotalFees ; Breaker: DailyPnL <= -0.05 * Balance",
    safetyCheck: "Clean-up hook cancels all orphan conditional orders when position closes.",
  },
};

function selectWorkflowNode(nodeId) {
  const node = WORKFLOW_NODES[nodeId];
  if (!node) return;

  document.querySelectorAll(".workflow-node-card").forEach((card) => {
    card.classList.toggle("selected", card.dataset.nodeId === nodeId);
  });
  document.querySelectorAll(".step-card").forEach((card) => {
    card.classList.toggle("active-step", card.dataset.nodeId === nodeId);
  });

  const inspIcon = document.getElementById("wf-insp-icon");
  const inspTitle = document.getElementById("wf-insp-title");
  const inspCat = document.getElementById("wf-insp-cat");
  const inspStatus = document.getElementById("wf-insp-status");
  const inspDesc = document.getElementById("wf-insp-desc");
  const inspParams = document.getElementById("wf-insp-params");
  const inspFormula = document.getElementById("wf-insp-formula");
  const inspSafety = document.getElementById("wf-insp-safety");

  if (inspIcon) inspIcon.textContent = node.icon;
  if (inspTitle) inspTitle.textContent = node.title;
  if (inspCat) inspCat.textContent = `${node.category} • Step ${node.stepNumber}`;
  if (inspStatus) inspStatus.textContent = node.status;
  if (inspDesc) inspDesc.textContent = node.description;
  if (inspFormula) inspFormula.textContent = node.formula || "Deterministic event loop execution";
  if (inspSafety) inspSafety.textContent = node.safetyCheck;

  if (inspParams) {
    inspParams.innerHTML = "";
    node.details.forEach((item) => {
      const row = document.createElement("div");
      row.className = "param-row";
      const name = document.createElement("span");
      name.className = "param-name";
      name.textContent = item.label;
      const val = document.createElement("span");
      val.className = "param-val";
      val.textContent = item.value;
      row.appendChild(name);
      row.appendChild(val);
      inspParams.appendChild(row);
    });
  }
}

function initWorkflow() {
  const flowBtn = document.getElementById("wf-toggle-flow");
  const stepsBtn = document.getElementById("wf-toggle-steps");
  const flowView = document.getElementById("wf-flow-view");
  const stepsView = document.getElementById("wf-steps-view");

  if (flowBtn && stepsBtn && flowView && stepsView) {
    flowBtn.addEventListener("click", () => {
      flowBtn.classList.add("active");
      stepsBtn.classList.remove("active");
      flowView.classList.remove("hidden");
      stepsView.classList.add("hidden");
    });

    stepsBtn.addEventListener("click", () => {
      stepsBtn.classList.add("active");
      flowBtn.classList.remove("active");
      stepsView.classList.remove("hidden");
      flowView.classList.add("hidden");
    });
  }

  document.querySelectorAll(".workflow-node-card").forEach((card) => {
    card.addEventListener("click", () => {
      const id = card.dataset.nodeId;
      if (id) selectWorkflowNode(id);
    });
  });

  document.querySelectorAll(".step-card").forEach((card) => {
    card.addEventListener("click", () => {
      const id = card.dataset.nodeId;
      if (id) selectWorkflowNode(id);
    });
  });

  selectWorkflowNode("signal-engine");
}

