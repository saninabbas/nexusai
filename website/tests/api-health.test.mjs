import assert from "node:assert/strict";
import test from "node:test";

test("production worker exposes the extension health contract", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("health-test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  const response = await worker.fetch(
    new Request("https://nexus-ai-trading-bot.local-sass.workers.dev/api/health"),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
  assert.equal(response.status, 200);
  assert.match(response.headers.get("access-control-allow-methods") || "", /GET/);
  const payload = await response.json();
  assert.deepEqual(
    {
      ok: payload.ok,
      product: payload.product,
      version: payload.version,
      testnetOnly: payload.testnetOnly,
      officialSite: payload.officialSite,
      downloadRequiresPayment: payload.downloadRequiresPayment,
    },
    {
      ok: true,
      product: "Nexus Trader",
      version: "3.1.0",
      testnetOnly: true,
      officialSite: "https://nexus-ai-trading-bot.local-sass.workers.dev",
      downloadRequiresPayment: true,
    },
  );
});
