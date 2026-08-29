import assert from "node:assert/strict";
import test from "node:test";

async function worker() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("download-gate-test", `${process.pid}-${Date.now()}-${Math.random()}`);
  return (await import(workerUrl.href)).default;
}

const environment = { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } };
const context = { waitUntil() {}, passThroughOnException() {} };

test("direct extension download is blocked before payment", async () => {
  const app = await worker();
  const response = await app.fetch(new Request("https://nexus-ai-trading-bot.local-sass.workers.dev/api/extensions/download"), environment, context);
  assert.equal(response.status, 402);
  assert.match((await response.json()).error, /Payment required/i);
});

test("download POST rejects a key that was not issued after payment", async () => {
  const app = await worker();
  const response = await app.fetch(new Request("https://nexus-ai-trading-bot.local-sass.workers.dev/api/extensions/download", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ licenseKey: "not-a-paid-key" }),
  }), environment, context);
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /issued after payment/i);
});
