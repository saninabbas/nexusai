import assert from "node:assert/strict";
import test from "node:test";

test("renders finalized production landing metadata and links", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  const response = await worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );

  assert.equal(response.status, 200);
  assert.match(
    response.headers.get("content-type") ?? "",
    /^text\/html\b/i,
  );
  const html = await response.text();
  assert.match(
    html,
    /<meta(?=[^>]*\bname=["']fameswap-verification["'])(?=[^>]*\bcontent=["'](GbR2vbGrJsBoqINWTLnPaRQRkiZgFi9a|vALAWyFrXJXoPLRKPaiAF7pI9L6JyuKA)["'])[^>]*>/i,
  );
  assert.match(html, /VERSION <!-- -->5\.1\.0|VERSION 5\.1\.0/);
  assert.match(html, /Pay (?:&amp;|&) download/);
  assert.doesNotMatch(html, /Nexus-Trader-Extension\.zip/);
  assert.match(html, /github\.com\/saninabbas\/nexusai/);
  assert.match(html, /nexus-ai-trading-bot\.local-sass\.workers\.dev/);
  assert.doesNotMatch(html, /saninabbas\/trading-bot/);
});
