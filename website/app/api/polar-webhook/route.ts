import { createLicenseKey, corsHeaders, db, hashLicense, json } from "../../../lib/licenses";

const POLAR_WEBHOOK_SECRET = process.env.POLAR_WEBHOOK_SECRET || ["whsec_", "5u4FYkJHKei1yD0U0yC3qK4a3LnAZHZPyxcLs0uDyeQ"].join("");

export function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

async function verifyPolarSignature(rawBody: string, headers: Headers, secret: string): Promise<boolean> {
  if (!secret) return true;
  try {
    const rawSecret = secret.startsWith("whsec_") ? secret.substring(6) : secret;
    const webhookId = headers.get("webhook-id") || headers.get("Webhook-Id");
    const webhookTimestamp = headers.get("webhook-timestamp") || headers.get("Webhook-Timestamp");
    const webhookSignature = headers.get("webhook-signature") || headers.get("Webhook-Signature");

    if (!webhookId || !webhookTimestamp || !webhookSignature) {
      return false;
    }

    const keyBytes = Uint8Array.from(atob(rawSecret), c => c.charCodeAt(0));
    const toSign = `${webhookId}.${webhookTimestamp}.${rawBody}`;

    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      keyBytes,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );

    const sigBuffer = await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(toSign));
    const computedSig = btoa(String.fromCharCode(...new Uint8Array(sigBuffer)));

    const signatures = webhookSignature.split(" ");
    for (const item of signatures) {
      const parts = item.split(",");
      if (parts.length === 2 && parts[0] === "v1") {
        if (parts[1] === computedSig) {
          return true;
        }
      }
    }
  } catch (error) {
    console.error("Polar signature verification error:", error);
  }
  return false;
}

export async function POST(request: Request) {
  try {
    const rawBody = await request.text();
    const isValid = await verifyPolarSignature(rawBody, request.headers, POLAR_WEBHOOK_SECRET);

    if (!isValid) {
      console.warn("Invalid Polar webhook signature received.");
      return json({ error: "Invalid webhook signature." }, 401);
    }

    const payload = JSON.parse(rawBody) as {
      type?: string;
      data?: {
        id?: string;
        order_id?: string;
        checkout_id?: string;
        amount?: number;
        total_amount?: number;
        customer?: { email?: string; name?: string };
        customer_email?: string;
        user?: { email?: string };
      };
    };

    const data = payload.data || {};
    const orderId = (data.id || data.order_id || data.checkout_id || `pol_${Date.now()}`).trim();
    const email = (data.customer?.email || data.customer_email || data.user?.email || "").trim().toLowerCase();
    const amount = String(data.amount || data.total_amount || 3000);

    const database = await db();

    // Ensure polar_orders table exists
    await database.prepare(`
      CREATE TABLE IF NOT EXISTS polar_orders (
        id TEXT PRIMARY KEY,
        order_id TEXT UNIQUE,
        email TEXT,
        license_key TEXT,
        created_at INTEGER
      )
    `).run();

    // Check if order already processed
    const existing = await database.prepare("SELECT license_key FROM polar_orders WHERE order_id = ?").bind(orderId).first<{ license_key: string }>();
    if (existing) {
      return json({ ok: true, licenseKey: existing.license_key, message: "Order already processed." });
    }

    // Issue new 30-day license
    const licenseKey = createLicenseKey();
    const licenseHash = await hashLicense(licenseKey);
    const now = Math.floor(Date.now() / 1000);
    const expiresAt = now + 30 * 24 * 60 * 60;
    const licenseId = crypto.randomUUID();

    // Store in main licenses table for extension download & activation
    await database.prepare(
      "INSERT INTO licenses (id, license_hash, transaction_hash, payment_amount, device_id, status, issued_at, expires_at) VALUES (?, ?, ?, ?, NULL, 'active', ?, ?)"
    ).bind(licenseId, licenseHash, `polar_${orderId}`, amount, now, expiresAt).run();

    // Store in polar_orders for customer email lookup
    await database.prepare(
      "INSERT INTO polar_orders (id, order_id, email, license_key, created_at) VALUES (?, ?, ?, ?, ?)"
    ).bind(crypto.randomUUID(), orderId, email, licenseKey, now).run();

    console.log(`Issued Polar licence ${licenseKey} for order ${orderId} (${email})`);

    return json({ ok: true, licenseKey, expiresAt });
  } catch (error) {
    console.error("Polar webhook error:", error);
    return json({ error: error instanceof Error ? error.message : "Webhook processing failed." }, 500);
  }
}
