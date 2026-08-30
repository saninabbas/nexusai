import { corsHeaders, db, hashLicense, json } from "../../../../lib/licenses";
import { issueCustomerSession } from "../../../../lib/customer-security";

export function OPTIONS() { return new Response(null, { status: 204, headers: corsHeaders }); }
export async function POST(request: Request) {
  try {
    const { licenseKey, deviceId } = await request.json() as { licenseKey?: string; deviceId?: string };
    if (!licenseKey || licenseKey.length > 64 || !deviceId || deviceId.length > 128) return json({ valid: false, error: "Licence key and device ID are required." }, 400);
    const hash = await hashLicense(licenseKey);
    const database = await db();
    const row = await database.prepare("SELECT id, device_id, status, expires_at FROM licenses WHERE license_hash = ?").bind(hash).first<{ id: string; device_id: string | null; status: string; expires_at: number }>();
    const now = Math.floor(Date.now() / 1000);
    if (!row || row.status !== "active" || row.expires_at <= now) return json({ valid: false, error: "Licence is invalid or expired." }, 403);
    if (row.device_id && row.device_id !== deviceId) return json({ valid: false, error: "Licence is already active on another device." }, 403);
    if (!row.device_id) {
      const result = await database.prepare("UPDATE licenses SET device_id = ?, activated_at = ?, last_validated_at = ? WHERE license_hash = ? AND device_id IS NULL").bind(deviceId, now, now, hash).run();
      if (!result.meta.changes) {
        const current = await database.prepare("SELECT device_id FROM licenses WHERE license_hash = ?").bind(hash).first<{ device_id: string | null }>();
        if (current?.device_id !== deviceId) return json({ valid: false, error: "Licence is already active on another device." }, 403);
      }
    } else await database.prepare("UPDATE licenses SET last_validated_at = ? WHERE license_hash = ?").bind(now, hash).run();
    const session = await issueCustomerSession({
      db: database,
      licenseId: row.id,
      deviceId,
      licenseExpiresAt: row.expires_at,
    });
    return json({
      valid: true,
      expiresAt: row.expires_at,
      sessionToken: session.token,
      sessionExpiresAt: session.expiresAt,
    });
  } catch { return json({ valid: false, error: "Licence activation failed." }, 500); }
}
