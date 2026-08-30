import { OFFICIAL_SITE_URL } from "./config.js";

document.addEventListener("DOMContentLoaded", async () => {
  bindActions();
  await refresh();
});

chrome.runtime.onMessage.addListener((message) => {
  if (["BOT_STATUS", "STATS_UPDATE", "POSITION_UPDATE", "ACTION_LOG"].includes(message.action)) refresh();
});

function bindActions() {
  document.getElementById("ui-site-link").addEventListener("click", () => chrome.tabs.create({ url: OFFICIAL_SITE_URL }));
  document.getElementById("ui-buy-license").addEventListener("click", () => chrome.tabs.create({ url: `${OFFICIAL_SITE_URL}/#pricing` }));
  document.getElementById("ui-activate-license").addEventListener("click", () => openDashboard("payments"));
  document.getElementById("ui-btn-dashboard").addEventListener("click", () => openDashboard("overview"));
  document.getElementById("ui-btn-overview").addEventListener("click", () => openDashboard("overview"));
  document.getElementById("ui-btn-settings").addEventListener("click", () => openDashboard("settings"));
  document.getElementById("ui-btn-assistant").addEventListener("click", () => chrome.tabs.create({ url: chrome.runtime.getURL("dashboard.html?tab=overview&chat=open") }));
  document.getElementById("nav-trade").addEventListener("click", () => openDashboard("overview"));
  document.getElementById("nav-history").addEventListener("click", () => openDashboard("history"));
  document.getElementById("nav-licence").addEventListener("click", () => openDashboard("payments"));
  document.getElementById("nav-config").addEventListener("click", () => openDashboard("settings"));
}

async function refresh() {
  const status = await sendMessage({ action: "GET_STATUS" });
  if (!status?.ok) return setBadge(false, false);
  const expiresAt = Number(status.licenseExpiresAt || 0);
  const licensed = expiresAt > Date.now() / 1000;
  setBadge(licensed, status.botRunning);
  renderLicence(licensed, expiresAt);
  renderStats(status.stats || {});
  renderLogs(status.actionLogs || []);
  document.getElementById("ui-mode").textContent = `${status.settings?.mode === "testnet" ? "BINANCE TESTNET" : "PAPER"} · LOCAL ENGINE 4.0`;
}

function setBadge(licensed, running) {
  const badge = document.getElementById("ui-db-status");
  if (!licensed) {
    badge.innerHTML = '<span class="dot red"></span> LICENCE REQUIRED';
    badge.className = "live-badge is-offline";
  } else if (running) {
    badge.innerHTML = '<span class="dot green"></span> RUNNING';
    badge.className = "live-badge";
  } else {
    badge.innerHTML = '<span class="dot red"></span> STOPPED';
    badge.className = "live-badge is-offline";
  }
}

function renderLicence(active, expiresAt) {
  const strip = document.getElementById("ui-license-strip");
  strip.classList.toggle("is-active", active);
  document.getElementById("ui-license-copy").textContent = active ? `Active until ${new Date(expiresAt * 1000).toLocaleDateString()}` : "Activate your key to start";
  document.getElementById("ui-activate-license").textContent = active ? "ACTIVE ✓" : "ACTIVATE";
}

function renderStats(stats) {
  const pnl = Number(stats.dailyPnl || 0);
  const winRate = Number(stats.winRate || 0);
  document.getElementById("ui-balance").textContent = Number(stats.balance || 0).toFixed(2);
  document.getElementById("ui-profit-pct").textContent = `${pnl >= 0 ? "+" : ""}$${pnl.toFixed(2)}`;
  document.getElementById("ui-winrate").textContent = winRate.toFixed(0);
  document.getElementById("ui-winrate-bar").style.height = `${Math.min(100, Math.max(0, winRate))}%`;
  document.getElementById("ui-total-trades").textContent = String(stats.totalTrades || 0);
  document.getElementById("ui-daily-pnl").textContent = `${pnl >= 0 ? "+" : ""}$${pnl.toFixed(2)}`;
  document.getElementById("ui-drawdown").textContent = `${Number(stats.maxDrawdown || 0).toFixed(2)}%`;
}

function renderLogs(logs) {
  const box = document.getElementById("ui-terminal-logs");
  box.replaceChildren();
  const items = logs.slice(0, 4);
  if (!items.length) items.push({ text: "Control center ready.", at: Date.now() });
  items.forEach((entry) => {
    const item = document.createElement("div");
    item.className = "log-item cyan";
    const copy = document.createElement("div");
    const message = document.createElement("div");
    const time = document.createElement("div");
    message.className = "log-msg";
    time.className = "log-sub";
    message.textContent = entry.text;
    time.textContent = new Date(entry.at).toLocaleTimeString();
    copy.append(message, time);
    item.appendChild(copy);
    box.appendChild(item);
  });
}

function openDashboard(tab) {
  chrome.tabs.create({ url: chrome.runtime.getURL(`dashboard.html?tab=${encodeURIComponent(tab)}`) });
}

function sendMessage(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) resolve(null);
      else resolve(response);
    });
  });
}
