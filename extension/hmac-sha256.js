// hmac-sha256.js
// Utility to generate HMAC SHA256 signatures for Binance API using Web Crypto API.

async function generateSignature(queryString, apiSecret) {
    const encoder = new TextEncoder();
    const keyData = encoder.encode(apiSecret);
    const msgData = encoder.encode(queryString);

    const cryptoKey = await crypto.subtle.importKey(
        'raw', 
        keyData, 
        { name: 'HMAC', hash: 'SHA-256' }, 
        false, 
        ['sign']
    );

    const signature = await crypto.subtle.sign('HMAC', cryptoKey, msgData);
    
    // Convert ArrayBuffer to Hex string
    const hashArray = Array.from(new Uint8Array(signature));
    const hexString = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    
    return hexString;
}

// Attach to window for UI, and export for background service worker module.
if (typeof window !== 'undefined') {
    window.generateSignature = generateSignature;
}

export { generateSignature };
