import { corsHeaders, json } from "../../../lib/http";
import {
  EXTENSION_DOWNLOAD_PATH,
  OFFICIAL_SITE_URL,
  PRODUCT_NAME,
  PRODUCT_VERSION,
} from "../../../lib/product";

export function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export function GET() {
  return json({
    ok: true,
    product: PRODUCT_NAME,
    version: PRODUCT_VERSION,
    environment: "production",
    execution: "browser-extension-local",
    testnetOnly: true,
    officialSite: OFFICIAL_SITE_URL,
    extensionDownload: `${OFFICIAL_SITE_URL}${EXTENSION_DOWNLOAD_PATH}`,
    downloadRequiresPayment: true,
  });
}
