/**
 * trading-engine.js - Nexus AI Core Strategy Engine
 * 
 * Logic:
 * - Multi-strategy hub supporting 6 distinct algorithmic approaches.
 * - Strict 1% risk management and 3:1 RR ratio.
 * - Deep AI external analysis integration.
 */

import { generateSignature } from './hmac-sha256.js';

export class TradingEngine {
    constructor(apiKeys, settings, deepAi = {}) {
        this.apiKeys = apiKeys;
        this.settings = settings;
        this.deepAi = deepAi; // { endpoint, key }
        this.lastLog = "";
    }

    async runDecisionCycle(symbol = 'BTCUSDT', strategy = 'auto_rotate') {
        console.log(`[Nexus AI] Cycle Started | Strategy: ${strategy}`);
        
        try {
            // 1. Fetch Market Data (Klines)
            const klines = await this.binanceRequest('GET', '/fapi/v1/klines', { symbol, interval: '5m', limit: 100 });
            if (!klines.length) return;

            const marketData = this.parseKlines(klines);
            const currentPrice = marketData.closes[marketData.closes.length - 1];
            const atr = this.calculateATR(marketData.highs, marketData.lows, marketData.closes, 14).pop();

            let signal = { action: 'NONE', reason: 'Neutral market conditions' };

            // 2. Select Strategy
            switch (strategy) {
                case 'news_ai':
                    signal = await this.strategyNewsAI(symbol);
                    break;
                case 'ema_sentiment':
                    signal = await this.strategyEMA(symbol, marketData);
                    break;
                case 'rsi_volume':
                    signal = this.strategyRSIVolume(marketData);
                    break;
                case 'breakout_news':
                    signal = await this.strategyBreakoutNews(symbol, marketData);
                    break;
                case 'mean_reversion':
                    signal = this.strategyMeanReversion(marketData);
                    break;
                case 'scalp_momentum':
                    signal = this.strategyScalp(marketData);
                    break;
                case 'deep_ai':
                    signal = await this.strategyDeepAI(symbol, marketData);
                    break;
                default:
                    // For Auto-Rotate, the background script will pass the specific strategy to run
                    signal = { action: 'NONE', reason: 'Waiting for rotation cycle...' };
            }

            // 3. Execution Logic
            if (signal.action !== 'NONE') {
                this.logToPanel(`[SIGNAL] ${strategy.toUpperCase()} -> ${signal.action}: ${signal.reason}`);
                await this.executeTrade(symbol, signal.action, currentPrice, atr);
            } else {
                console.log(`[Nexus AI] No Signal: ${signal.reason}`);
            }

        } catch (e) {
            console.error("[Nexus AI] Engine Error:", e);
        }
    }

    // --- Strategy 1: EMATrend + Sentiment ---
    async strategyEMA(symbol, data) {
        const ema9 = this.calculateEMA(data.closes, 9).pop();
        const ema21 = this.calculateEMA(data.closes, 21).pop();
        const rsi = this.calculateRSI(data.closes, 14).pop();
        const sentiment = await this.fetchSentiment(symbol);

        if (ema9 > ema21 && rsi > 52 && sentiment >= 3) {
            return { action: 'LONG', reason: 'EMA Cross + Bullish Sentiment' };
        }
        if (ema9 < ema21 && rsi < 48 && sentiment <= -3) {
            return { action: 'SHORT', reason: 'EMA Cross + Bearish Sentiment' };
        }
        return { action: 'NONE', reason: 'Trend/Sentiment mismatch' };
    }

    // --- Strategy 2: RSI Divergence + Volume Spike ---
    strategyRSIVolume(data) {
        const rsi = this.calculateRSI(data.closes, 14).pop();
        const vol = data.volumes[data.volumes.length - 1];
        const avgVol = data.volumes.slice(-20).reduce((a, b) => a + b, 0) / 20;

        if (rsi < 30 && vol > avgVol * 1.5) {
            return { action: 'LONG', reason: 'Oversold RSI + Volume Spike' };
        }
        if (rsi > 70 && vol > avgVol * 1.5) {
            return { action: 'SHORT', reason: 'Overbought RSI + Volume Spike' };
        }
        return { action: 'NONE', reason: 'RSI/Volume within normal range' };
    }

    // --- Strategy 3: Breakout + News catalyst ---
    async strategyBreakoutNews(symbol, data) {
        const high20 = Math.max(...data.highs.slice(-21, -1));
        const low20 = Math.min(...data.lows.slice(-21, -1));
        const current = data.closes[data.closes.length - 1];
        const sentiment = await this.fetchSentiment(symbol);

        if (current > high20 && sentiment >= 5) {
            return { action: 'LONG', reason: 'Range Breakout + News Catalyst' };
        }
        if (current < low20 && sentiment <= -5) {
            return { action: 'SHORT', reason: 'Range Breakdown + News Catalyst' };
        }
        return { action: 'NONE', reason: 'Inside range or weak catalyst' };
    }

    // --- Strategy 4: Mean Reversion ---
    strategyMeanReversion(data) {
        const ema200 = this.calculateEMA(data.closes, 200).pop() || data.closes[0];
        const current = data.closes[data.closes.length - 1];
        const dev = (current - ema200) / ema200;

        if (dev < -0.05) return { action: 'LONG', reason: 'Critical dev from EMA200 (Mean Reversion)' };
        if (dev > 0.05) return { action: 'SHORT', reason: 'Critical dev from EMA200 (Mean Reversion)' };
        return { action: 'NONE', reason: 'Price near mean' };
    }

    // --- Strategy 5: Scalping Momentum ---
    strategyScalp(data) {
        const macd = this.calculateMACD(data.closes);
        const last = macd[macd.length - 1];
        const prev = macd[macd.length - 2];

        if (last.hist > 0 && prev.hist <= 0) return { action: 'LONG', reason: 'MACD Zero-Cross (Scalp)' };
        if (last.hist < 0 && prev.hist >= 0) return { action: 'SHORT', reason: 'MACD Zero-Cross (Scalp)' };
        return { action: 'NONE', reason: 'No momentum cross' };
    }

    // --- Strategy 6: Deep AI (Custom Endpoint) ---
    async strategyDeepAI(symbol, data) {
        if (!this.deepAi.endpoint) return { action: 'NONE', reason: 'Deep AI not configured' };
        try {
            const res = await fetch(this.deepAi.endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${this.deepAi.key}` },
                body: JSON.stringify({
                    symbol,
                    price: data.closes[data.closes.length - 1],
                    indicators: {
                        rsi: this.calculateRSI(data.closes, 14).pop(),
                        ema: this.calculateEMA(data.closes, 20).pop()
                    },
                    klines: data.closes.slice(-20)
                })
            });
            const result = await res.json();
            if (result.confidence >= 75) {
                return { action: result.decision === 'BUY' ? 'LONG' : (result.decision === 'SELL' ? 'SHORT' : 'NONE'), reason: `Deep AI: ${result.reason}` };
            }
            return { action: 'NONE', reason: `AI Confidence too low (${result.confidence}%)` };
        } catch (e) {
            return { action: 'NONE', reason: 'Deep AI Fetch Failed' };
        }
    }

    // --- Strategy 7: News AI (NewsAPI + Groq Qwen, 30-min throttle) ---
    async strategyNewsAI(symbol) {
        const THIRTY_MINUTES = 30 * 60 * 1000;

        // Check cooldown from chrome.storage
        const stored = await new Promise(res => chrome.storage.local.get(['newsAi', 'newsAiCache'], res));
        const newsAiConfig = stored.newsAi || {};
        const cache = stored.newsAiCache || {};

        if (!newsAiConfig.groqKey || !newsAiConfig.newsKey) {
            return { action: 'NONE', reason: 'News AI: Groq/NewsAPI keys not configured in Settings.' };
        }

        // 30-min throttle: reuse cached signal
        if (cache.timestamp && (Date.now() - cache.timestamp) < THIRTY_MINUTES) {
            const ageMin = Math.floor((Date.now() - cache.timestamp) / 60000);
            this.logToPanel(`[NEWS AI] Using cached signal from ${ageMin}m ago: ${cache.action} — ${cache.reason}`);
            return { action: cache.action, reason: cache.reason };
        }

        this.logToPanel(`[NEWS AI] Fetching fresh news & running Qwen analysis...`);

        try {
            // Call our Cloudflare Worker which handles NewsAPI + Groq internally
            const res = await fetch(`${this.apiKeys.workerUrl}/analyze-news`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    symbol,
                    groqKey: newsAiConfig.groqKey,
                    newsKey: newsAiConfig.newsKey
                })
            });

            if (!res.ok) throw new Error(`Worker returned ${res.status}`);
            const result = await res.json();

            // Validate response shape
            if (!result.decision) throw new Error('Invalid AI response shape');

            const action = result.decision === 'LONG' ? 'LONG' : (result.decision === 'SHORT' ? 'SHORT' : 'NONE');
            const reason = `[Groq Qwen] ${result.reason} (confidence: ${result.confidence}%)`;

            // Cache the result with timestamp
            await new Promise(res => chrome.storage.local.set({ newsAiCache: { action, reason, timestamp: Date.now() } }, res));

            if (result.confidence >= 65) {
                this.logToPanel(`[NEWS AI] HIGH CONVICTION: ${action} | ${reason}`);
                return { action, reason };
            } else {
                this.logToPanel(`[NEWS AI] Low confidence (${result.confidence}%) — skipping trade.`);
                return { action: 'NONE', reason: `Low AI confidence: ${result.reason}` };
            }
        } catch (e) {
            this.logToPanel(`[NEWS AI] Error: ${e.message}`);
            return { action: 'NONE', reason: `News AI failed: ${e.message}` };
        }
    }

    // --- Core Execution & Risk ---
    async executeTrade(symbol, side, currentPrice, atr) {
        const positions = await this.binanceRequest('GET', '/fapi/v2/positionRisk', { symbol });
        const exists = positions.find(p => p.symbol === symbol && parseFloat(p.positionAmt) !== 0);
        if (exists) return;

        const account = await this.binanceRequest('GET', '/fapi/v2/account');
        const equity = parseFloat(account.totalMarginBalance);
        
        // Strict 1% Risk
        const risk = parseFloat(this.settings.risk || 1) / 100;
        const slDistance = atr * 2;
        const stopPrice = side === 'LONG' ? (currentPrice - slDistance) : (currentPrice + slDistance);
        const tpPrice = side === 'LONG' ? (currentPrice + slDistance * 3) : (currentPrice - slDistance * 3);

        const riskAmount = equity * risk;
        let qty = riskAmount / slDistance;
        const leverage = Math.min(parseFloat(this.settings.leverage || 20), 50);

        await this.binanceRequest('POST', '/fapi/v1/leverage', { symbol, leverage });
        qty = Math.floor(qty * 1000) / 1000;

        if (qty <= 0) return;

        this.logToPanel(`[EXEC] Entering ${side} @ ${currentPrice} | SL: ${stopPrice.toFixed(2)} (RR 3:1)`);

        await this.binanceRequest('POST', '/fapi/v1/order', {
            symbol,
            side: side === 'LONG' ? 'BUY' : 'SELL',
            type: 'MARKET',
            quantity: qty.toString()
        });

        // Bracket Orders
        await this.binanceRequest('POST', '/fapi/v1/order', { symbol, side: side === 'LONG' ? 'SELL' : 'BUY', type: 'STOP_MARKET', stopPrice: stopPrice.toFixed(2), closePosition: 'true' });
        await this.binanceRequest('POST', '/fapi/v1/order', { symbol, side: side === 'LONG' ? 'SELL' : 'BUY', type: 'TAKE_PROFIT_MARKET', stopPrice: tpPrice.toFixed(2), closePosition: 'true' });
    }

    // --- Helpers ---
    parseKlines(klines) {
        return {
            closes: klines.map(k => parseFloat(k[4])),
            highs: klines.map(k => parseFloat(k[2])),
            lows: klines.map(k => parseFloat(k[3])),
            volumes: klines.map(k => parseFloat(k[5]))
        };
    }

    async fetchSentiment(symbol) {
        if (!this.apiKeys.workerUrl) return 0;
        try {
            const res = await fetch(`${this.apiKeys.workerUrl}/sentiment?symbol=${symbol}`);
            const data = await res.json();
            return data.score || 0;
        } catch { return 0; }
    }

    logToPanel(msg) {
        chrome.runtime.sendMessage({ action: "push_log", message: msg });
    }

    calculateEMA(data, period) {
        const k = 2 / (period + 1);
        let ema = [data[0]];
        for (let i = 1; i < data.length; i++) ema.push(data[i] * k + ema[i-1] * (1-k));
        return ema;
    }

    calculateRSI(data, period) {
        let gains = [], losses = [];
        for (let i = 1; i < data.length; i++) {
            const d = data[i] - data[i-1];
            gains.push(Math.max(0, d)); losses.push(Math.max(0, -d));
        }
        let avgG = gains.slice(0, period).reduce((a,b)=>a+b,0)/period;
        let avgL = losses.slice(0, period).reduce((a,b)=>a+b,0)/period;
        let rsi = [100 - (100 / (1 + (avgG / (avgL || 1))))];
        for (let i = period; i < gains.length; i++) {
            avgG = (avgG * (period - 1) + gains[i]) / period;
            avgL = (avgL * (period - 1) + losses[i]) / period;
            rsi.push(100 - (100 / (1 + (avgG / (avgL || 1)))));
        }
        return rsi;
    }

    calculateATR(h, l, c, p) {
        let tr = [h[0]-l[0]];
        for (let i=1; i<c.length; i++) tr.push(Math.max(h[i]-l[i], Math.abs(h[i]-c[i-1]), Math.abs(l[i]-c[i-1])));
        let atr = [tr.slice(0, p).reduce((a,b)=>a+b,0)/p];
        for (let i=p; i<tr.length; i++) atr.push((atr[atr.length-1]*(p-1)+tr[i])/p);
        return atr;
    }

    calculateMACD(data) {
        const ema12 = this.calculateEMA(data, 12);
        const ema26 = this.calculateEMA(data, 26);
        let macdLine = [];
        for (let i=0; i<ema12.length; i++) macdLine.push(ema12[i] - (ema26[i] || ema26[0]));
        const signalLine = this.calculateEMA(macdLine, 9);
        return macdLine.map((m, i) => ({ line: m, sig: signalLine[i], hist: m - signalLine[i] }));
    }

    async binanceRequest(method, endpoint, params = {}) {
        const baseUrl = this.apiKeys.testnet ? 'https://testnet.binancefuture.com' : 'https://fapi.binance.com';
        params.timestamp = Date.now();
        params.recvWindow = 5000;
        const qs = Object.keys(params).map(k => `${k}=${encodeURIComponent(params[k])}`).join('&');
        const sig = await generateSignature(qs, this.apiKeys.secret);
        const res = await fetch(`${baseUrl}${endpoint}?${qs}&signature=${sig}`, {
            method, headers: { 'X-MBX-APIKEY': this.apiKeys.key }
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.msg || "Binance API Error");
        return data;
    }
}
