import { EXTENSION_ARCHIVE_BASE64, EXTENSION_ARCHIVE_SIZE } from "../../../../lib/extension-archive";
import { corsHeaders, db, hashLicense, json } from "../../../../lib/licenses";
import { PRODUCT_VERSION } from "../../../../lib/product";

export function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export function GET() {
  return json({ error: "Payment required. Use the active licence key issued after payment." }, 402);
}

export async function POST(request: Request) {
  try {
    const { licenseKey } = await request.json() as { licenseKey?: string };
    const normalizedKey = licenseKey?.trim().toUpperCase() || "";
    if (!/^NEXUS-(?:[0-9A-F]{5}-){3}[0-9A-F]{5}$/.test(normalizedKey)) {
      return json({ error: "Enter the valid licence key issued after payment." }, 400);
    }
    const database = await db();
    const licenseHash = await hashLicense(normalizedKey);
    const row = await database.prepare("SELECT status, expires_at FROM licenses WHERE license_hash = ?").bind(licenseHash).first<{ status: string; expires_at: number }>();
    const now = Math.floor(Date.now() / 1000);
    if (!row || row.status !== "active" || row.expires_at <= now) {
      return json({ error: "Licence is invalid or expired. Complete payment to unlock the download." }, 403);
    }
    const binary = atob(EXTENSION_ARCHIVE_BASE64);
    const archive = Uint8Array.from(binary, character => character.charCodeAt(0));
    if (archive.byteLength !== EXTENSION_ARCHIVE_SIZE) return json({ error: "Extension archive is temporarily unavailable." }, 503);
    return new Response(archive, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/zip",
        "Content-Length": String(archive.byteLength),
        "Content-Disposition": `attachment; filename="Nexus-Trader-Extension-${PRODUCT_VERSION}.zip"`,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("Extension download authorization failed", error);
    return json({ error: "Download authorization failed." }, 500);
  }
}
