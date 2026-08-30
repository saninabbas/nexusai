const encoder = new TextEncoder();
const decoder = new TextDecoder();
const SESSION_SECONDS = 7 * 24 * 60 * 60;

export interface CustomerIdentity {
  tenantId: string;
  deviceId: string;
  licenseExpiresAt: number;
  sessionExpiresAt: number;
}

export interface CustomerCredentials {
  apiKey: string;
  apiSecret: string;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function asArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function randomToken(size = 32): string {
  return bytesToBase64(crypto.getRandomValues(new Uint8Array(size)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function issueCustomerSession(input: {
  db: D1Database;
  licenseId: string;
  deviceId: string;
  licenseExpiresAt: number;
}): Promise<{ token: string; expiresAt: number }> {
  const now = Math.floor(Date.now() / 1_000);
  const token = randomToken();
  const tokenHash = await sha256Hex(token);
  const expiresAt = Math.min(input.licenseExpiresAt, now + SESSION_SECONDS);
  if (expiresAt <= now) throw new Error("Licence has expired");
  await input.db.prepare(`INSERT INTO customer_sessions (
    id, license_id, device_id, token_hash, issued_at, expires_at, last_used_at, revoked_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL)
  ON CONFLICT(license_id, device_id) DO UPDATE SET
    id = excluded.id, token_hash = excluded.token_hash, issued_at = excluded.issued_at,
    expires_at = excluded.expires_at, last_used_at = excluded.last_used_at, revoked_at = NULL`)
    .bind(crypto.randomUUID(), input.licenseId, input.deviceId, tokenHash, now, expiresAt, now)
    .run();
  return { token, expiresAt };
}

export async function authenticateCustomer(request: Request, db: D1Database): Promise<CustomerIdentity | null> {
  const authorization = request.headers.get("Authorization") || "";
  const deviceId = (request.headers.get("X-Nexus-Device-ID") || "").trim();
  if (!authorization.startsWith("Bearer ") || !deviceId || deviceId.length > 128) return null;
  const token = authorization.slice(7).trim();
  if (token.length < 32 || token.length > 200) return null;
  const tokenHash = await sha256Hex(token);
  const row = await db.prepare(`SELECT
    s.license_id, s.device_id, s.expires_at AS session_expires_at,
    s.revoked_at, l.device_id AS license_device_id, l.status,
    l.expires_at AS license_expires_at
  FROM customer_sessions s
  INNER JOIN licenses l ON l.id = s.license_id
  WHERE s.token_hash = ? LIMIT 1`)
    .bind(tokenHash)
    .first<{
      license_id: string;
      device_id: string;
      session_expires_at: number;
      revoked_at: number | null;
      license_device_id: string | null;
      status: string;
      license_expires_at: number;
    }>();
  const now = Math.floor(Date.now() / 1_000);
  if (!row || row.revoked_at || row.status !== "active" || row.session_expires_at <= now || row.license_expires_at <= now) return null;
  if (row.device_id !== deviceId || row.license_device_id !== deviceId) return null;
  const extendedExpiry = Math.min(row.license_expires_at, now + SESSION_SECONDS);
  await db.prepare("UPDATE customer_sessions SET last_used_at = ?, expires_at = ? WHERE token_hash = ?")
    .bind(now, extendedExpiry, tokenHash)
    .run();
  return {
    tenantId: row.license_id,
    deviceId,
    licenseExpiresAt: row.license_expires_at,
    sessionExpiresAt: extendedExpiry,
  };
}

async function importVaultKey(encodedKey: string): Promise<CryptoKey> {
  const raw = base64ToBytes(encodedKey.trim());
  if (raw.byteLength !== 32) throw new Error("Customer credential encryption key must be 32 bytes");
  return crypto.subtle.importKey("raw", asArrayBuffer(raw), { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

export async function encryptCustomerCredentials(input: {
  encodedKey: string;
  tenantId: string;
  credentials: CustomerCredentials;
}): Promise<{ ciphertext: string; iv: string; keyVersion: number }> {
  const key = await importVaultKey(input.encodedKey);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = encoder.encode(JSON.stringify(input.credentials));
  const ciphertext = await crypto.subtle.encrypt({
    name: "AES-GCM",
    iv,
    additionalData: encoder.encode(`nexus:binance:v1:${input.tenantId}`),
  }, key, plaintext);
  return {
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
    iv: bytesToBase64(iv),
    keyVersion: 1,
  };
}

export async function decryptCustomerCredentials(input: {
  encodedKey: string;
  tenantId: string;
  ciphertext: string;
  iv: string;
}): Promise<CustomerCredentials> {
  const key = await importVaultKey(input.encodedKey);
  const plaintext = await crypto.subtle.decrypt({
    name: "AES-GCM",
    iv: asArrayBuffer(base64ToBytes(input.iv)),
    additionalData: encoder.encode(`nexus:binance:v1:${input.tenantId}`),
  }, key, asArrayBuffer(base64ToBytes(input.ciphertext)));
  const parsed = JSON.parse(decoder.decode(plaintext)) as Partial<CustomerCredentials>;
  if (!parsed.apiKey || !parsed.apiSecret) throw new Error("Stored Binance credentials are invalid");
  return { apiKey: parsed.apiKey, apiSecret: parsed.apiSecret };
}
