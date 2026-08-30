import { API_BASE_URL, DEFAULT_SETTINGS, OFFICIAL_SITE_URL } from "./config.js";

let botRunning = false;
let refreshTimer;

document.addEventListener("DOMContentLoaded", async () => {
  bindNavigation();
  bindActions();
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
  const values = [
    ["SYMBOL / SIDE", `${position.symbol} · ${position.direction}`],
    ["ENTRY", formatPrice(position.entry)],
    ["MARK", formatPrice(position.markPrice || position.entry)],
    ["TAKE PROFIT", formatPrice(position.tp)],
    ["STOP LOSS", formatPrice(position.sl)],
    ["UNREALIZED P&L", `${Number(position.pnlPct || 0).toFixed(2)}% / $${Number(position.pnl || 0).toFixed(2)}`],
  ];
  values.forEach(([label, value]) => {
    const cell = document.createElement("div");
    const labelNode = document.createElement("span");
    const valueNode = document.createElement("strong");
    labelNode.textContent = label;
    valueNode.textContent = value;
    cell.append(labelNode, valueNode);
    panel.appendChild(cell);
  });
  closeButton.classList.remove("hidden");
}

function renderSettingsSummary(settings) {
  setText("ov-symbol", settings.symbol || DEFAULT_SETTINGS.symbol);
  setText("ov-active-strategy", String(settings.strategy || DEFAULT_SETTINGS.strategy).toUpperCase());
  setText("h-mode", settings.mode === "testnet" ? "TESTNET" : "PAPER");
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
