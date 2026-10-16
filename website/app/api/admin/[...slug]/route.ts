import { handleAdminRoute } from "../../../../worker/trading/admin";
import type { TradingEnv } from "../../../../worker/trading/types";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Admin-Token, X-Nexus-Device-ID",
  "Access-Control-Max-Age": "86400",
};

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

async function getWorkerEnv(): Promise<TradingEnv> {
  try {
    const { env } = await import("cloudflare:workers");
    return env as unknown as TradingEnv;
  } catch {
    return process.env as unknown as TradingEnv;
  }
}

export async function GET(request: Request) {
  const env = await getWorkerEnv();
  const res = await handleAdminRoute(request, env);
  return res || Response.json({ ok: false, error: "Admin route not found" }, { status: 404 });
}

export async function POST(request: Request) {
  const env = await getWorkerEnv();
  const res = await handleAdminRoute(request, env);
  return res || Response.json({ ok: false, error: "Admin route not found" }, { status: 404 });
}

export async function PUT(request: Request) {
  const env = await getWorkerEnv();
  const res = await handleAdminRoute(request, env);
  return res || Response.json({ ok: false, error: "Admin route not found" }, { status: 404 });
}

export async function DELETE(request: Request) {
  const env = await getWorkerEnv();
  const res = await handleAdminRoute(request, env);
  return res || Response.json({ ok: false, error: "Admin route not found" }, { status: 404 });
}
