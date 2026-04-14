/**
 * background.js - Nexus AI Core Service Worker
 * Entry point for alarms, global state, and engine orchestration.
 */

import { TradingEngine } from './trading-engine.js';
import { generateSignature } from './hmac-sha256.js';

let isRunning = false;
let apiKeys = { key: '', secret: '', workerUrl: '', testnet: true };
let tradeSettings = { leverage: 20, risk: 1, strategy: 'auto_rotate', trailingSL: true, scalpMode: false };
let deepAiSettings = { endpoint: '', key: '' };
let newsAiSettings = { groqKey: '', newsKey: '' };
let engine = null;

// Rotation State — includes News AI every ~30 mins via throttle in trading-engine
const ROTATION_LIST = ['ema_sentiment', 'rsi_volume', 'breakout_news', 'mean_reversion', 'scalp_momentum', 'news_ai'];
let currentRotateIndex = 0;
let lastRotationTime = Date.now();

// Risk State
let startOfDayEquity = 0;
let lastEquityCheckTime = 0;

// INIT
chrome.runtime.onInstalled.addListener(() => {
    chrome.storage.local.set({ botStatus: { running: false } });
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

// ACTION
chrome.action.onClicked.addListener((tab) => {
    chrome.sidePanel.open({ tabId: tab.id });
});

// ALARMS
chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'botLoop' && isRunning) {
        handleMainLoop();
    }
});

async function handleMainLoop() {
    await initEngine();
    if (!engine) return;

    // 1. Check Daily Loss Limit
    const limitHit = await checkLossLimit();
    if (limitHit) {
        stopBot("DAILY LOSS LIMIT (5%) REACHED. Stopping for safety.");
        return;
    }

    // 2. Resolve Strategy (Auto Rotate logic)
    let activeStrategy = tradeSettings.strategy;
    if (activeStrategy === 'auto_rotate') {
        const now = Date.now();
        if (now - lastRotationTime > 300000) { // 5 minutes
            currentRotateIndex = (currentRotateIndex + 1) % ROTATION_LIST.length;
            activeStrategy = ROTATION_LIST[currentRotateIndex];
            lastRotationTime = now;
            logToPanel(`[AUTO-ROTATE] Switching to ${activeStrategy.toUpperCase()} technique.`);
        } else {
            activeStrategy = ROTATION_LIST[currentRotateIndex];
        }
    }

    // 3. Run Decision Cycle
    await engine.runDecisionCycle('BTCUSDT', activeStrategy);
}

// MESSAGE HANDLER
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === "start_bot") {
        isRunning = true;
        loadSettings().then(() => {
            chrome.alarms.create('botLoop', { periodInMinutes: 1 });
            lastRotationTime = Date.now();
            sendResponse({ status: "started" });
        });
        return true;
    } 
    else if (msg.action === "stop_bot") {
        stopBot("User initiated stop.");
        sendResponse({ status: "stopped" });
    }
    else if (msg.action === "kill_session") {
        initEngine().then(async () => {
            await killAllPositions();
            stopBot("KILL SIGNAL EXECUTED.");
            sendResponse({ status: "killed" });
        });
        return true;
    }
    else if (msg.action === "get_dashboard_data") {
        loadSettings().then(async () => {
            if (!apiKeys.key) { sendResponse({ error: "Missing Keys" }); return; }
            try {
                const account = await binanceRequest('GET', '/fapi/v2/account');
                const positions = await binanceRequest('GET', '/fapi/v2/positionRisk');
                sendResponse({ account, positions });
            } catch (e) {
                sendResponse({ error: e.message });
            }
        });
        return true;
    }
    else if (msg.action === "update_settings") {
        tradeSettings = msg.settings;
        initEngine();
    }
    else if (msg.action === "reload_config") {
        loadSettings();
        initEngine();
    }
    else if (msg.action === "run_news_ai") {
        runNewsAiNow();
    }
});

async function loadSettings() {
    const data = await chrome.storage.local.get(['api', 'settings', 'botStatus', 'deepAi', 'newsAi']);
    if (data.api) apiKeys = data.api;
    if (data.settings) tradeSettings = data.settings;
    if (data.deepAi) deepAiSettings = data.deepAi;
    if (data.newsAi) newsAiSettings = data.newsAi;
    if (data.botStatus) isRunning = data.botStatus.running;
    
    // Auto-resume if running
    if (isRunning) {
        chrome.alarms.get('botLoop', (a) => {
            if (!a) chrome.alarms.create('botLoop', { periodInMinutes: 1 });
        });
    }
}

async function initEngine() {
    await loadSettings();
    if (apiKeys.key && apiKeys.secret) {
        engine = new TradingEngine(apiKeys, tradeSettings, deepAiSettings);
    }
}

// Manual News AI trigger from Chat /news command
async function runNewsAiNow() {
    await initEngine();
    if (!engine) { logToPanel('[NEWS AI] Engine not ready - check API keys.'); return; }
    const signal = await engine.strategyNewsAI('BTCUSDT');
    logToPanel(`[NEWS AI] Manual Check → ${signal.action} | ${signal.reason}`);
    if (signal.action !== 'NONE') {
        const klines = await engine.binanceRequest('GET', '/fapi/v1/klines', { symbol: 'BTCUSDT', interval: '5m', limit: 20 });
        const marketData = engine.parseKlines(klines);
        const atr = engine.calculateATR(marketData.highs, marketData.lows, marketData.closes, 14).pop();
        const price = marketData.closes[marketData.closes.length - 1];
        await engine.executeTrade('BTCUSDT', signal.action, price, atr);
    }
}

async function checkLossLimit() {
    try {
        const account = await binanceRequest('GET', '/fapi/v2/account');
        const currentEquity = parseFloat(account.totalMarginBalance);

        // Reset startOfDayEquity every 24h
        const now = Date.now();
        if (now - lastEquityCheckTime > 86400000 || startOfDayEquity === 0) {
            startOfDayEquity = currentEquity;
            lastEquityCheckTime = now;
            return false;
        }

        const drawdown = (startOfDayEquity - currentEquity) / startOfDayEquity;
        if (drawdown >= 0.05) return true; // 5% limit
        return false;
    } catch (e) {
        return false;
    }
}

function stopBot(reason) {
    isRunning = false;
    chrome.alarms.clear('botLoop');
    chrome.storage.local.set({ botStatus: { running: false } });
    if (reason) logToPanel(`[SYSTEM] ${reason}`);
}

function logToPanel(msg) {
    chrome.runtime.sendMessage({ action: "push_log", message: msg });
}

// Global Binance Request Helper
async function binanceRequest(method, endpoint, params = {}) {
    const baseUrl = apiKeys.testnet ? 'https://testnet.binancefuture.com' : 'https://fapi.binance.com';
    params.timestamp = Date.now();
    params.recvWindow = 5000;
    const queryString = Object.keys(params).map(k => `${k}=${encodeURIComponent(params[k])}`).join('&');
    const signature = await generateSignature(queryString, apiKeys.secret);
    const finalUrl = `${baseUrl}${endpoint}?${queryString}&signature=${signature}`;

    const res = await fetch(finalUrl, {
        method,
        headers: { 'X-MBX-APIKEY': apiKeys.key }
    });
    return await res.json();
}

async function killAllPositions() {
    console.log("[Nexus AI] FORCED KILL INITIATED");
    try {
        const positions = await binanceRequest('GET', '/fapi/v2/positionRisk');
        const active = positions.filter(p => parseFloat(p.positionAmt) !== 0);
        for (let p of active) {
            await binanceRequest('DELETE', '/fapi/v1/allOpenOrders', { symbol: p.symbol });
            const side = parseFloat(p.positionAmt) > 0 ? "SELL" : "BUY";
            await binanceRequest('POST', '/fapi/v1/order', {
                symbol: p.symbol,
                side: side,
                type: 'MARKET',
                quantity: Math.abs(parseFloat(p.positionAmt)).toString(),
                reduceOnly: 'true'
            });
        }
    } catch(e) {
        console.error("Kill failed:", e);
    }
}

// Initial Boot
loadSettings();
initEngine();
