import { corsHeaders, db, hashLicense, json } from "../../../lib/licenses";

export function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const email = (url.searchParams.get("email") || "").trim().toLowerCase();
  const orderId = (url.searchParams.get("orderId") || url.searchParams.get("order_id") || "").trim();
  return handleLookup(email, orderId);
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({})) as { email?: string; orderId?: string; query?: string };
    const query = (body.query || "").trim();
    const email = (body.email || (query.includes("@") ? query : "")).trim().toLowerCase();
    const orderId = (body.orderId || (!query.includes("@") ? query : "")).trim();
    return handleLookup(email, orderId);
  } catch (error) {
    return json({ error: "Invalid request payload." }, 400);
  }
}

async function handleLookup(email: string, orderId: string): Promise<Response> {
  if (!email && !orderId) {
    return json({ error: "Please enter your checkout email or Polar Order ID." }, 400);
  }

  try {
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

    let row: { license_key: string; created_at: number } | null = null;

    if (email && orderId) {
      row = await database.prepare(
        "SELECT license_key, created_at FROM polar_orders WHERE LOWER(email) = ? OR order_id = ? ORDER BY created_at DESC LIMIT 1"
      ).bind(email, orderId).first();
    } else if (email) {
      row = await database.prepare(
        "SELECT license_key, created_at FROM polar_orders WHERE LOWER(email) = ? ORDER BY created_at DESC LIMIT 1"
      ).bind(email).first();
    } else {
      row = await database.prepare(
        "SELECT license_key, created_at FROM polar_orders WHERE order_id = ? ORDER BY created_at DESC LIMIT 1"
      ).bind(orderId).first();
    }

    if (!row || !row.license_key) {
      return json({ error: "No active Polar purchase found. Please confirm payment was completed." }, 404);
    }

    const licenseHash = await hashLicense(row.license_key);
    const licenseRow = await database.prepare(
      "SELECT expires_at, status FROM licenses WHERE license_hash = ?"
    ).bind(licenseHash).first<{ expires_at: number; status: string }>();

    const expiresAt = licenseRow?.expires_at || (row.created_at + 30 * 24 * 60 * 60);

    return json({
      ok: true,
      licenseKey: row.license_key,
      expiresAt,
    });
  } catch (error) {
    console.error("Polar lookup error:", error);
    return json({ error: "Could not retrieve licence key at this time." }, 500);
  }
}
