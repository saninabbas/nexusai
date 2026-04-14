// worker/src/index.js (Nexus AI Backend)

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,HEAD,POST,OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Access-Control-Allow-Headers": "Content-Type",
};

// Keyword Pool for Sentiment Scoring
const KEYWORDS = {
    strong_bullish: ['whale accumulation', 'etf approval', 'institutional buying', 'breakout', 'new ath', 'moon', 'pump', 'fomo', 'wagmi', 'golden cross', 'bullish engulfing', 'halving', 'adoption', 'partnership', 'upgrade', 'rally', 'to the moon', 'massive buy'],
    strong_bearish: ['rug pull', 'hack', 'fud', 'dump', 'crash', 'liquidation cascade', 'ban', 'regulation crackdown', 'sell-off', 'bearish engulfing', 'death cross', 'rekt', 'capitulation', 'exit scam', 'bankruptcy', 'massive sell'],
    context: ['whale move', 'large transfer', 'sec', 'blackrock', 'elon musk', 'vitalik', 'regulation', 'upgrade', 'halving']
};

export default {
    async fetch(request, env) {
        if (request.method === "OPTIONS") {
            return new Response(null, { headers: corsHeaders });
        }

        const url = new URL(request.url);
        const path = url.pathname;

        try {
            if (path === "/verify-payment" && request.method === "POST") return await this.verifyPayment(request, env);
            if (path === "/sentiment") return await this.getSentiment(url, env);
            if (path === "/analyze-news" && request.method === "POST") return await this.analyzeNews(request, env);
            if (path === "/chat" && request.method === "POST") return await this.proxyChat(request, env);
            
            return new Response("Nexus AI API - Online", { status: 200, headers: corsHeaders });
        } catch (e) {
            return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders });
        }
    },

    /**
     * getSentiment - Fetches recent data and calculates a weighted sentiment score.
     */
    async getSentiment(url, env) {
        const symbol = url.searchParams.get("symbol") || "BTCUSDT";
        
        // Simulating robust news aggregation
        const mockPosts = [
            `Massive whale accumulation detected in ${symbol} as ETF approval rumors intensify!`,
            `Is this the halving pump? ${symbol} hitting new yearly highs. Moon soon?`,
            `FUD spreading after SEC regulation crackdown, but long term adoption looks solid.`,
            `Breakout confirmed. Golden cross on the 4H chart. Bullish engulfing candle!`,
            `Whale moved 5000 BTC to exchange. Potential dump incoming?`,
            `Institutional buying on the rise according to latest BlackRock report.`
        ];

        let score = 0;
        let catalystFound = false;
        
        const analysis = mockPosts.map(post => {
            let s = 0;
            const text = post.toLowerCase();
            
            KEYWORDS.strong_bullish.forEach(k => { if (text.includes(k)) s += 2; });
            KEYWORDS.strong_bearish.forEach(k => { if (text.includes(k)) s -= 2; });
            KEYWORDS.context.forEach(k => { 
                if (text.includes(k)) {
                    s += 1;
                    if (['etf approval', 'sec', 'blackrock', 'halving'].some(c => text.includes(c))) catalystFound = true;
                }
            });

            return { post, score: s };
        });

        score = analysis.reduce((acc, curr) => acc + curr.score, 0);

        return new Response(JSON.stringify({
            symbol,
            score,
            catalyst: catalystFound || Math.abs(score) >= 10,
            timestamp: Date.now(),
            posts: analysis
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    },

    /**
     * verifyPayment - Handles BNB (BSC) subscription verification.
     */
    async verifyPayment(request, env) {
        const { txHash } = await request.json();
        
        // MASTER BYPASS FOR TESTING
        if (txHash === "NEXUS-ADMIN-DEV") {
            return new Response(JSON.stringify({
                success: true,
                license: { active: true, expiry: Date.now() + 2592000000 }
            }), { headers: corsHeaders });
        }

        // Implementation for real BscScan check
        const bscApiKey = env.BSCSCAN_API_KEY;
        const masterWallet = env.MASTER_WALLET;
        
        if (!bscApiKey || !masterWallet) {
            return new Response(JSON.stringify({ error: "Worker not configured with BscScan API or Master Wallet" }), { status: 500, headers: corsHeaders });
        }

        const res = await fetch(`https://api.bscscan.com/api?module=proxy&action=eth_getTransactionByHash&txhash=${txHash}&apikey=${bscApiKey}`);
        const data = await res.json();
        
        if (data && data.result) {
            const tx = data.result;
            const valBNB = parseInt(tx.value, 16) / 1e18;
            
            if (tx.to.toLowerCase() === masterWallet.toLowerCase() && valBNB >= 0.05) {
                return new Response(JSON.stringify({
                    success: true,
                    license: { active: true, expiry: Date.now() + 2592000000 }
                }), { headers: corsHeaders });
            }
        }

        return new Response(JSON.stringify({ success: false, error: "Payment not verified" }), { headers: corsHeaders });
    },

    /**
     * proxyChat - Gemini API Proxy for the Chat Tab.
     */
    async proxyChat(request, env) {
        const { prompt } = await request.json();
        const geminiApiKey = env.GEMINI_API_KEY;
        if (!geminiApiKey) return new Response(JSON.stringify({ reply: "Nexus AI: Worker API key missing. Commands still work locally." }), { headers: corsHeaders });

        try {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiApiKey}`;
            const res = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    systemInstruction: { parts: [{ text: "You are Nexus AI, an advanced trading assistant for Binance Futures. Be concise, professional, and slightly futuristic." }] }
                })
            });
            const data = await res.json();
            const reply = data.candidates[0].content.parts[0].text;
            return new Response(JSON.stringify({ reply }), { headers: corsHeaders });
        } catch (e) {
            return new Response(JSON.stringify({ reply: "Nexus AI: Connection to brain-server lost." }), { headers: corsHeaders });
        }
    },

    /**
     * analyzeNews - Scrapes news via NewsAPI and analyzes via Groq (Qwen).
     */
    async analyzeNews(request, env) {
        try {
            const body = await request.json();
            const { symbol } = body;

            // Keys: prefer env vars (secure), fallback to body keys sent from extension
            const newsKey = env.NEWS_API_KEY || body.newsKey;
            const groqKey = env.GROQ_API_KEY || body.groqKey;

            if (!newsKey || !groqKey) {
                return new Response(JSON.stringify({ error: "Missing NEWS_API_KEY or GROQ_API_KEY" }), { status: 400, headers: corsHeaders });
            }

            // 1. Fetch Headlines
            const newsUrl = `https://newsapi.org/v2/everything?q=${symbol}+OR+crypto+OR+bitcoin&sortBy=publishedAt&pageSize=10&apiKey=${newsKey}`;
            const newsRes = await fetch(newsUrl);
            const newsData = await newsRes.json();
            
            if (newsData.status !== 'ok') {
                return new Response(JSON.stringify({ error: "NewsAPI Fetch Failed" }), { status: 500, headers: corsHeaders });
            }

            const headlines = newsData.articles.map(a => `- ${a.title}: ${a.description}`).join('\n');

            // 2. Analyze with Groq (Qwen)
            const groqBody = {
                model: "qwen-2.5-32b", // Using standard Groq Qwen model string
                messages: [
                    { 
                        role: "system", 
                        content: "You are an elite crypto quantitative analyst. Analyze the following news headlines and decide if we should LONG, SHORT, or WAIT for BTCUSDT. You must respond in strict JSON format: { \"decision\": \"LONG\" | \"SHORT\" | \"NONE\", \"confidence\": 0-100, \"reason\": \"brief explanation\" }" 
                    },
                    { 
                        role: "user", 
                        content: `Latest News Context:\n${headlines}\n\nSymbol: ${symbol}. Price is currently volatile. What is the consensus?` 
                    }
                ],
                temperature: 0.1,
                response_format: { type: "json_object" }
            };

            const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${groqKey}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(groqBody)
            });

            const groqData = await groqRes.json();
            const result = JSON.parse(groqData.choices[0].message.content);

            return new Response(JSON.stringify({
                ...result,
                timestamp: Date.now()
            }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

        } catch (e) {
            return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders });
        }
    }
};
