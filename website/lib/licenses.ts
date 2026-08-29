export { corsHeaders, json } from "./http";

export async function db() {
  const { env } = await import("cloudflare:workers");
  return env.DB as D1Database;
}
export async function hashLicense(value: string) {
  const bytes = new TextEncoder().encode(value.trim().toUpperCase());
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}
export function createLicenseKey() {
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  const token = Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("").toUpperCase();
  return `NEXUS-${token.slice(0,5)}-${token.slice(5,10)}-${token.slice(10,15)}-${token.slice(15,20)}`;
}
