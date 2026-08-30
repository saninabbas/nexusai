import { corsHeaders, db, hashLicense, json } from "../../../../lib/licenses";
import { authenticateCustomer } from "../../../../lib/customer-security";

export function OPTIONS() { return new Response(null, { status: 204, headers: corsHeaders }); }
export async function POST(request: Request) {
  try {
    const database = await db();
    if ((request.headers.get("Authorization") || "").startsWith("Bearer ")) {
      const identity = await authenticateCustomer(request, database);
      if (!identity) return json({ valid: false, error: "Customer session is invalid or expired." }, 403);
      return json({
        valid: true,
        expiresAt: identity.licenseExpiresAt,
        sessionExpiresAt: identity.sessionExpiresAt,
      });
    }
    const { licenseKey, deviceId } = await request.json() as { licenseKey?: string; deviceId?: string };
    if (!licenseKey || licenseKey.length > 64 || !deviceId || deviceId.length > 128) return json({ valid: false, error: "Licence key and device ID are required." }, 400);
    const hash = await hashLicense(licenseKey);
    const row = await database.prepare("SELECT device_id, status, expires_at FROM licenses WHERE license_hash = ?").bind(hash).first<{ device_id: string | null; status: string; expires_at: number }>();
    const now = Math.floor(Date.now() / 1000);
    if (!row || row.status !== "active" || row.expires_at <= now || row.device_id !== deviceId) return json({ valid: false, error: "Licence is invalid, expired, or belongs to another device." }, 403);
    await database.prepare("UPDATE licenses SET last_validated_at = ? WHERE license_hash = ?").bind(now, hash).run();
    return json({ valid: true, expiresAt: row.expires_at });
  } catch { return json({ valid: false, error: "Licence validation failed." }, 500); }
}
