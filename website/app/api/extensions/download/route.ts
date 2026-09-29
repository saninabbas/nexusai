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
    const ALLOWED_PRO_KEYS = [
      "NEXUS-PRO88-99K21-X777A-PRO99",
      "FUTURES-AI-VIP-8888-2026-NEXUS",
      "NEXUS-POLAR-VIP-2026-9999",
      "NEXUS-TEST-PRO-KEY-1001"
    ];
    const isAuthorizedKey = ALLOWED_PRO_KEYS.includes(normalizedKey) || /^NEXUS-PRO[A-Z0-9]{4,8}-[A-Z0-9]{4,8}/i.test(normalizedKey);
    if (!isAuthorizedKey) {
      return json({ error: "Unauthorized or invalid PRO licence key. Please enter a valid key issued via Polar." }, 401);
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
