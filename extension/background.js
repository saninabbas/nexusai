// background.js
import { generateSignature } from './hmac-sha256.js';

let isRunning = false;
let apiKeys = { key: '', secret: '', testnet: true };
let tradeSettings = { leverage: 20, risk: 5 };

chrome.runtime.onInstalled.addListener(() => {
    chrome.storage.local.set({ botStatus: { running: false } });
    // Set side panel to open when action icon is clicked
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

// Open side panel when toolbar icon is clicked
chrome.action.onClicked.addListener((tab) => {
    chrome.sidePanel.open({ tabId: tab.id });
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
    if (!isRunning) return;
    console.log("[Nexus AI] Analyzing markets...");
    
    try {
        await loadSettings();
        if (!apiKeys.key || !apiKeys.secret) {
            console.warn("[Nexus AI] API keys missing. Strategy skipped.");
            return;
        }

        const symbol = 'BTCUSDT';
        
        // 1. Check for current open positions for this symbol
        const positions = await binanceRequest('GET', '/fapi/v2/positionRisk', { symbol });
        const currentPos = positions.find(p => p.symbol === symbol && parseFloat(p.positionAmt) !== 0);
        
        if (currentPos) {
            console.log(`[Nexus AI] Already in a ${parseFloat(currentPos.positionAmt) > 0 ? 'LONG' : 'SHORT'} position. Watching for exit signals or taking no action.`);
            // Note: Exit logic (optional) could be added here.
            return;
        }

        // 2. Fetch last 100 klines (1h timeframe)
        const klines = await binanceRequest('GET', '/fapi/v1/klines', { 
            symbol, 
            interval: '1h', 
            limit: 100 
        });
        
        // Close prices (index 4)
        const closes = klines.map(k => parseFloat(k[4]));
        
        // 3. Calculate Indicators
        const ema9 = calculateEMA(closes, 9);
        const ema21 = calculateEMA(closes, 21);
        const rsi14 = calculateRSI(closes, 14);
        
        const lastEma9 = ema9[ema9.length - 1];
        const lastEma21 = ema21[ema21.length - 1];
        const lastRsi14 = rsi14[rsi14.length - 1];

        console.log(`[Nexus AI] Indicators for ${symbol}: EMA9=${lastEma9.toFixed(2)}, EMA21=${lastEma21.toFixed(2)}, RSI14=${lastRsi14.toFixed(2)}`);

        // 4. Signal Logic
        let side = null;
        if (lastEma9 > lastEma21 && lastRsi14 > 50) {
            side = 'BUY'; // LONG
        } else if (lastEma9 < lastEma21 && lastRsi14 < 50) {
            side = 'SELL'; // SHORT
        }

        if (side) {
            console.log(`[Nexus AI] SIGNAL DETECTED: ${side === 'BUY' ? 'LONG' : 'SHORT'}`);
            await placeOrder(symbol, side);
        } else {
            console.log("[Nexus AI] No clear signal. Waiting for next cycle.");
        }

    } catch (e) {
        console.error("[Nexus AI] Strategy Execution Error:", e);
    }
}

// Indicator Helpers
function calculateEMA(data, period) {
    const k = 2 / (period + 1);
    let ema = [data[0]];
    for (let i = 1; i < data.length; i++) {
        ema.push(data[i] * k + ema[i - 1] * (1 - k));
    }
    return ema;
}

function calculateRSI(data, period) {
    let gains = [];
    let losses = [];
    for (let i = 1; i < data.length; i++) {
        let diff = data[i] - data[i - 1];
        gains.push(diff > 0 ? diff : 0);
        losses.push(diff < 0 ? Math.abs(diff) : 0);
    }

    let avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
    let avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;

    let rsi = [];
    for (let i = period; i < gains.length; i++) {
        avgGain = (avgGain * (period - 1) + gains[i]) / period;
        avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
        let rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
        rsi.push(100 - (100 / (1 + rs)));
    }
    return rsi;
}

// Order Helpers
async function placeOrder(symbol, side) {
    try {
        const account = await binanceRequest('GET', '/fapi/v2/account');
        const equity = parseFloat(account.totalMarginBalance);
        
        // Calculate Quantity: (Equity * Risk%) / currentPrice * leverage
        const ticker = await binanceRequest('GET', '/fapi/v1/ticker/price', { symbol });
        const price = parseFloat(ticker.price);
        
        const riskVal = parseFloat(tradeSettings.risk) / 100;
        const leverage = parseFloat(tradeSettings.leverage);
        
        // Simplified quantity calculation
        let quantity = (equity * riskVal * leverage) / price;
        
        // Round to 3 decimals (BTCUSDT precision)
        quantity = Math.floor(quantity * 1000) / 1000;
        
        if (quantity === 0) {
            console.warn("[Nexus AI] Calculated quantity is too low. Check balance or risk settings.");
            return;
        }

        console.log(`[Nexus AI] Placing ${side} order for ${symbol}: Qty=${quantity}, Lev=${leverage}x`);
        
        // Set Leverage first
        await binanceRequest('POST', '/fapi/v1/leverage', { symbol, leverage });

        // Place Market Order
        const order = await binanceRequest('POST', '/fapi/v1/order', {
            symbol: symbol,
            side: side,
            type: 'MARKET',
            quantity: quantity.toString()
        });

        console.log("[Nexus AI] Order Placed Successfully:", order.orderId);
    } catch (e) {
        console.error("[Nexus AI] Order Placement Failed:", e);
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
