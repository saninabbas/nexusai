import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";

const run = promisify(execFile);
const root = fileURLToPath(new URL("..", import.meta.url));
const localExtensionDirectory = path.join(root, "extension");
const monorepoExtensionDirectory = path.join(root, "..", "extension");
const extensionDirectory = await readdir(localExtensionDirectory)
  .then(() => localExtensionDirectory)
  .catch(() => monorepoExtensionDirectory);

test("extension manifest and production links are finalized", async () => {
  const manifest = JSON.parse(await readFile(path.join(extensionDirectory, "manifest.json"), "utf8"));
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.version, "3.1.0");
  assert.equal(manifest.background.type, "module");
  assert.equal(manifest.homepage_url, "https://nexus-ai-trading-bot.local-sass.workers.dev");
  assert.ok(manifest.host_permissions.includes("https://demo-fapi.binance.com/*"));
  assert.ok(manifest.host_permissions.includes("https://nexus-ai-trading-bot.local-sass.workers.dev/*"));
  assert.ok(!manifest.host_permissions.some((permission) => permission.includes("googleapis")));
});

test("extension source has no stale localhost, Sites, or Gemini endpoints", async () => {
  const files = (await readdir(extensionDirectory)).filter((file) => /\.(?:js|json|html|css|md)$/.test(file));
  const source = (await Promise.all(files.map((file) => readFile(path.join(extensionDirectory, file), "utf8")))).join("\n");
  assert.doesNotMatch(source, /xoxi-me\.chatgpt\.site/i);
  assert.doesNotMatch(source, /localhost(?::\d+)?/i);
  assert.doesNotMatch(source, /gemini|generativelanguage\.googleapis/i);
  assert.doesNotMatch(source, /<script[^>]+https?:|<link[^>]+https?:/i);
});

test("strategy engine detects confirmed breakouts", async () => {
  const moduleUrl = pathToFileURL(path.join(extensionDirectory, "strategies.js"));
  moduleUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { evaluateStrategy } = await import(moduleUrl.href);
  const candles = Array.from({ length: 39 }, (_, index) => ({
    open: 100,
    high: 101,
    low: 99,
    close: 100 + index * 0.001,
    closeTime: index,
  }));
  candles.push({ open: 100, high: 106, low: 100, close: 105, closeTime: 40 });
  const result = evaluateStrategy(candles, "Breakout");
  assert.equal(result.action, "LONG");
  assert.equal(result.strategy, "Breakout");
  assert.ok(result.confidence >= 70);
});

test("all extension scripts parse and the ZIP contains the loadable package", async () => {
  const files = (await readdir(extensionDirectory)).filter((file) => file.endsWith(".js"));
  await Promise.all(files.map((file) => run(process.execPath, ["--check", path.join(extensionDirectory, file)])));
  const { stdout } = await run("unzip", ["-Z1", path.join(root, "work", "Nexus-Trader-Extension.zip")]);
  const entries = stdout.trim().split("\n").sort();
  for (const required of ["manifest.json", "background.js", "dashboard.html", "popup.html", "README.md"]) {
    assert.ok(entries.includes(required), `ZIP is missing ${required}`);
  }
  assert.ok(!entries.some((entry) => entry.endsWith(".png")));
  const archiveModule = await readFile(path.join(root, "lib", "extension-archive.ts"), "utf8");
  const encodedArchive = archiveModule.match(/EXTENSION_ARCHIVE_BASE64 = "([A-Za-z0-9+/=]+)"/)?.[1];
  const declaredSize = Number(archiveModule.match(/EXTENSION_ARCHIVE_SIZE = (\d+)/)?.[1]);
  assert.ok(encodedArchive, "Protected archive module is missing its encoded ZIP");
  const embeddedArchive = Buffer.from(encodedArchive, "base64");
  assert.equal(embeddedArchive.length, declaredSize);
  assert.deepEqual(Array.from(embeddedArchive.subarray(0, 2)), [0x50, 0x4b]);
  await assert.rejects(access(path.join(root, "public", "Nexus-Trader-Extension.zip")));
  await assert.rejects(access(path.join(root, "dist", "client", "Nexus-Trader-Extension.zip")));
});
