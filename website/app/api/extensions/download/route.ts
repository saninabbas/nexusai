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
    const isValidFormat = /^(NEXUS|BOT|FUTURES)-/i.test(normalizedKey) || normalizedKey.length >= 10;
    if (!isValidFormat) {
      return json({ error: "Enter a valid licence key (e.g. NEXUS-PRO88-99K21-X777A-PRO99)." }, 400);
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
