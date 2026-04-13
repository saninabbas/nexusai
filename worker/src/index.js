// worker/src/index.js

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,HEAD,POST,OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Access-Control-Allow-Headers": "Content-Type",
};

function handleOptions(request) {
    if (request.headers.get("Origin") !== null && request.headers.get("Access-Control-Request-Method") !== null && request.headers.get("Access-Control-Request-Headers") !== null) {
        return new Response(null, { headers: corsHeaders });
    } else {
        return new Response(null, { headers: { Allow: "GET, HEAD, POST, OPTIONS" } });
    }
}

export default {
    async fetch(request, env, ctx) {
        if (request.method === "OPTIONS") {
            return handleOptions(request);
        }

        const url = new URL(request.url);

        try {
            if (url.pathname === "/verify-payment" && request.method === "POST") {
                return await this.verifyPayment(request, env);
            }
            if (url.pathname === "/check-subscription" && request.method === "GET") {
                return await this.checkSubscription(url, env);
            }
            if (url.pathname === "/chat" && request.method === "POST") {
                return await this.proxyChat(request, env);
            }
            return new Response("Not Found", { status: 404, headers: corsHeaders });
        } catch (e) {
            return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders });
        }
    },

    async verifyPayment(request, env) {
        const { txHash } = await request.json();
        if (!txHash) throw new Error("Missing txHash");

        // 1. MASTER BYPASS for internal testing
        if (txHash === "NEXUS-ADMIN-DEV") {
            const licenseKey = `NEXUS-KEY-` + crypto.randomUUID();
            const expiry = Date.now() + 1000 * 60 * 60 * 24 * 30; // 30 days
            
            await env.NEXUS_SUBSCRIPTIONS.put(licenseKey, JSON.stringify({ active: true, expiry }));
            
            return new Response(JSON.stringify({
                success: true,
                message: "Master Bypass Approved",
                licenseKey,
                license: { active: true, expiry }
            }), { headers: corsHeaders });
        }

        // 2. REAL VERIFICATION VIA BSCSCAN
        const masterWallet = env.MASTER_WALLET || "0xYOUR_BINANCE_WALLET";
        const bscApiKey = env.BSCSCAN_API_KEY || "YOUR_BSCSCAN_API_KEY";
        const expectedWei = 50000000000000000n; // 0.05 BNB in Wei

        const bscUrl = `https://api.bscscan.com/api?module=proxy&action=eth_getTransactionByHash&txhash=${txHash}&apikey=${bscApiKey}`;
        const res = await fetch(bscUrl);
        const data = await res.json();

        if (data && data.result) {
            const tx = data.result;
            // Validate to address (case insensitive) and value
            if (tx.to && tx.to.toLowerCase() === masterWallet.toLowerCase()) {
                const txValue = BigInt(tx.value); // Convert hex to BigInt
                if (txValue >= expectedWei) {
                    
                    // Mark TxHash as used in KV to prevent double spending
                    const isUsed = await env.NEXUS_SUBSCRIPTIONS.get(`tx_${txHash}`);
                    if (isUsed) throw new Error("Transaction already claimed");
                    
                    await env.NEXUS_SUBSCRIPTIONS.put(`tx_${txHash}`, "true");

                    // Generate License String
                    const licenseKey = `NEXUS-KEY-` + crypto.randomUUID();
                    const expiry = Date.now() + 1000 * 60 * 60 * 24 * 30; // 30 days

                    await env.NEXUS_SUBSCRIPTIONS.put(licenseKey, JSON.stringify({ active: true, expiry }));
                    
                    return new Response(JSON.stringify({
                        success: true,
                        licenseKey,
                        license: { active: true, expiry }
                    }), { headers: corsHeaders });

                } else {
                    throw new Error("Insufficient BNB value");
                }
            } else {
                throw new Error("Transaction not sent to the master wallet");
            }
        } else {
            throw new Error("Invalid Transaction Hash or BscScan error");
        }
    },

    async checkSubscription(url, env) {
        const key = url.searchParams.get("key");
        if (!key) throw new Error("Missing key");

        const dataStr = await env.NEXUS_SUBSCRIPTIONS.get(key);
        if (dataStr) {
            const data = JSON.parse(dataStr);
            if (data.expiry > Date.now()) {
                return new Response(JSON.stringify({ active: true, expiry: data.expiry }), { headers: corsHeaders });
            } else {
                return new Response(JSON.stringify({ active: false, status: "expired" }), { headers: corsHeaders });
            }
        }
        return new Response(JSON.stringify({ active: false, status: "not_found" }), { headers: corsHeaders });
    },

    async proxyChat(request, env) {
        const { prompt } = await request.json();
        const geminiApiKey = env.GEMINI_API_KEY || "AIzaSy_YOUR_API_KEY_HERE";
        
        let systemPrompt = "You are Nexus AI, an expert crypto futures trading assistant integrated right into the Chrome sidepanel. Be brief, authoritative, and direct.";
        
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiApiKey}`;
        
        const payload = {
            contents: [{
                role: "user",
                parts: [{ text: prompt }]
            }],
            systemInstruction: {
                role: "system",
                parts: [{ text: systemPrompt }]
            }
        };

        const res = await fetch(geminiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await res.json();
        if(data && data.candidates && data.candidates[0] && data.candidates[0].content) {
            const text = data.candidates[0].content.parts[0].text;
            return new Response(JSON.stringify({ reply: text }), { headers: corsHeaders });
        } else {
            return new Response(JSON.stringify({ error: "No response from AI", details: data }), { status: 500, headers: corsHeaders });
        }
    }
};
