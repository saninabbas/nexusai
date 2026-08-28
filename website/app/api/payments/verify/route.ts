import { createLicenseKey, corsHeaders, db, hashLicense, json } from "../../../../lib/licenses";

const RPC = "https://bsc-dataseed.binance.org/";
const TOKEN = "0x55d398326f99059ff775485246999027b3197955";
const RECEIVER = "9d35215728112c055c8d2472560d7e3ec58df135";
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const MINIMUM = 30n * 10n ** 18n;
const CONFIRMATIONS = 12n;

export function OPTIONS() { return new Response(null, { status: 204, headers: corsHeaders }); }

async function rpc(method: string, params: unknown[]) {
  const response = await fetch(RPC, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }), signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw new Error("Blockchain service is temporarily unavailable.");
  const payload = await response.json() as { result?: unknown; error?: { message?: string } };
  if (payload.error) throw new Error(payload.error.message || "Blockchain request failed.");
  return payload.result;
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { txHash?: string };
    const txHash = body.txHash?.trim().toLowerCase() || "";
    if (!/^0x[0-9a-f]{64}$/.test(txHash)) return json({ error: "Enter a valid BSC transaction hash." }, 400);
    const used = await db().prepare("SELECT id FROM licenses WHERE transaction_hash = ?").bind(txHash).first();
    if (used) return json({ error: "This transaction has already issued a licence." }, 409);

    const receipt = await rpc("eth_getTransactionReceipt", [txHash]) as { status?: string; blockNumber?: string; logs?: Array<{ address: string; topics: string[]; data: string }> } | null;
    if (!receipt) return json({ error: "Transaction is pending or was not found on BNB Smart Chain." }, 404);
    if (receipt.status !== "0x1" || !receipt.blockNumber) return json({ error: "This transaction was not successful." }, 400);
    const currentBlock = BigInt(await rpc("eth_blockNumber", []) as string);
    const confirmations = currentBlock - BigInt(receipt.blockNumber) + 1n;
    if (confirmations < CONFIRMATIONS) return json({ error: `Payment needs ${CONFIRMATIONS} confirmations. Current: ${confirmations}.` }, 425);
    const transfer = receipt.logs?.find(log => log.address.toLowerCase() === TOKEN && log.topics?.[0]?.toLowerCase() === TRANSFER_TOPIC && log.topics?.[2]?.toLowerCase().endsWith(RECEIVER) && BigInt(log.data || "0x0") >= MINIMUM);
    if (!transfer) return json({ error: "No payment of at least 30 USDT to the Nexus wallet was found in this transaction." }, 400);

    const licenseKey = createLicenseKey();
    const licenseHash = await hashLicense(licenseKey);
    const now = Math.floor(Date.now() / 1000);
    const expiresAt = now + 30 * 24 * 60 * 60;
    try {
      await db().prepare("INSERT INTO licenses (id, license_hash, transaction_hash, payment_amount, device_id, status, issued_at, expires_at) VALUES (?, ?, ?, ?, NULL, 'active', ?, ?)")
        .bind(crypto.randomUUID(), licenseHash, txHash, BigInt(transfer.data).toString(), now, expiresAt).run();
    } catch {
      return json({ error: "This transaction has already issued a licence." }, 409);
    }
    return json({ ok: true, licenseKey, expiresAt });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Payment verification failed." }, 500);
  }
}
