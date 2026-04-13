// background.js
import { generateSignature } from './hmac-sha256.js';

let isRunning = false;
let apiKeys = { key: '', secret: '', testnet: true };
let tradeSettings = { leverage: 20, risk: 5 };

chrome.runtime.onInstalled.addListener(() => {
    chrome.storage.local.set({ botStatus: { running: false } });
});

chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'botLoop' && isRunning) {
        executeTradingStrategy();
    }
});

// Listener for Side Panel
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === "start_bot") {
        isRunning = true;
        loadSettings().then(() => {
            chrome.alarms.create('botLoop', { periodInMinutes: 0.5 }); // running every 30s
            sendResponse({ status: "started" });
        });
        return true; 
    } 
    else if (msg.action === "stop_bot") {
        isRunning = false;
        chrome.alarms.clear('botLoop');
        sendResponse({ status: "stopped" });
    }
    else if (msg.action === "kill_session") {
        loadSettings().then(() => {
            killAllPositions().then(() => sendResponse({ status: "killed" }));
        });
        return true;
    }
    else if (msg.action === "get_dashboard_data") {
        loadSettings().then(async () => {
            if (!apiKeys.key) { sendResponse({ error: "Missing API Keys" }); return; }
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
});

async function loadSettings() {
    const data = await chrome.storage.local.get(['api', 'settings']);
    if (data.api) apiKeys = data.api;
    if (data.settings) tradeSettings = data.settings;
}

// Helper: Binance API Fetcher
async function binanceRequest(method, endpoint, params = {}) {
    const baseUrl = apiKeys.testnet ? 'https://testnet.binancefuture.com' : 'https://fapi.binance.com';
    
    // Auto-inject timestamp
    params.timestamp = Date.now();
    params.recvWindow = 5000;
    
    // Build query string
    const queryParts = [];
    for (let key in params) {
        queryParts.push(`${key}=${encodeURIComponent(params[key])}`);
    }
    const queryString = queryParts.join('&');
    
    // Sign payload
    const signature = await generateSignature(queryString, apiKeys.secret);
    const finalUrl = `${baseUrl}${endpoint}?${queryString}&signature=${signature}`;
    
    const res = await fetch(finalUrl, {
        method: method,
        headers: {
            'X-MBX-APIKEY': apiKeys.key,
            'Content-Type': 'application/json'
        }
    });
    
    const data = await res.json();
    if (!res.ok) throw new Error(data.msg || "Binance API Error");
    return data;
}

async function executeTradingStrategy() {
    console.log("[Nexus AI] Executing trading cycle...");
    // ---------------------------------------------------------
    // Placeholder Trading Engine (Runs real orders when triggered)
    // ---------------------------------------------------------
    try {
        // Example: Check if BTCUSDT Price > EMA20 (mock logic)
        // const ticker = await binanceRequest('GET', '/fapi/v1/ticker/price', { symbol: 'BTCUSDT' });
        // if (trigger_condition_met) {
        //    placeOrder('BTCUSDT', 'BUY', 'MARKET', calculateQuantity());
        // }
    } catch (e) {
        console.error("Strategy executing error:", e);
    }
}

async function killAllPositions() {
    try {
        console.log("[Nexus AI] Killing session - canceling open orders");
        // Warning: This API cancels all orders for a symbol. 
        // We fetch active positions first.
        const positions = await binanceRequest('GET', '/fapi/v2/positionRisk');
        const active = positions.filter(p => parseFloat(p.positionAmt) !== 0);
        
        for (let p of active) {
            await binanceRequest('DELETE', '/fapi/v1/allOpenOrders', { symbol: p.symbol });
            
            // Market close existing
            const size = parseFloat(p.positionAmt);
            const side = size > 0 ? "SELL" : "BUY";
            await binanceRequest('POST', '/fapi/v1/order', {
                symbol: p.symbol,
                side: side,
                type: 'MARKET',
                quantity: Math.abs(size).toString()
            });
        }
    } catch(e) {
        console.error("Failed to kill session:", e);
    }
}
