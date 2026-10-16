import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { access, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
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
  assert.equal(manifest.version, "5.1.0");
  assert.equal(manifest.background.type, "module");
  assert.equal(manifest.homepage_url, "https://nexus-ai-trading-bot.local-sass.workers.dev");
  assert.ok(manifest.host_permissions.includes("https://demo-fapi.binance.com/*"));
  assert.ok(manifest.host_permissions.includes("https://nexus-ai-trading-bot.local-sass.workers.dev/*"));
  assert.ok(!manifest.host_permissions.some((permission) => permission.includes("chatgpt.site")));
  assert.ok(!manifest.host_permissions.some((permission) => permission.includes("googleapis")));
});

test("multi-client extension uses licence sessions and never stores mainnet credentials", async () => {
  const [config, dashboard, background] = await Promise.all([
    readFile(path.join(extensionDirectory, "config.js"), "utf8"),
    readFile(path.join(extensionDirectory, "dashboard.js"), "utf8"),
    readFile(path.join(extensionDirectory, "background.js"), "utf8"),
  ]);
  assert.match(config, /customerSessionToken/);
  assert.doesNotMatch(config, /liveAdminToken|liveBackendUrl/);
  assert.match(dashboard, /\/customer\/\$\{path\}/);
  assert.match(dashboard, /"binance\/connect"/);
  assert.match(dashboard, /"position\/close"/);
  assert.match(dashboard, /CLOSE_MANAGED_POSITION/);
  assert.match(dashboard, /X-Nexus-Device-ID/);
  assert.match(dashboard, /setInput\("l-api-secret", ""\)/);
  assert.match(background, /customerSessionExpiresAt/);
  assert.match(background, /chrome\.storage\.local\.remove\(\["licenseKey", "liveBackendUrl", "liveAdminToken"\]\)/);
});

test("extension source has no localhost or direct Gemini API endpoints", async () => {
  const files = (await readdir(extensionDirectory)).filter((file) => /\.(?:js|json|html|css|md)$/.test(file));
  const source = (await Promise.all(files.map((file) => readFile(path.join(extensionDirectory, file), "utf8")))).join("\n");
  assert.match(source, /nexus-ai-trading-bot\.local-sass\.workers\.dev/i);
  assert.doesNotMatch(source, /localhost(?::\d+)?/i);
  assert.doesNotMatch(source, /generativelanguage\.googleapis/i);
  assert.doesNotMatch(source, /GEMINI_API_KEY/i);
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

  const zipPath = path.join(root, "work", "Nexus-Trader-Extension.zip");
  const archiveModule = await readFile(path.join(root, "lib", "extension-archive.ts"), "utf8");
  const encodedArchive = archiveModule.match(/EXTENSION_ARCHIVE_BASE64 = "([A-Za-z0-9+/=]+)"/)?.[1];
  const declaredSize = Number(archiveModule.match(/EXTENSION_ARCHIVE_SIZE = (\d+)/)?.[1]);
  assert.ok(encodedArchive, "Protected archive module is missing its encoded ZIP");
  const embeddedArchive = Buffer.from(encodedArchive, "base64");
  assert.equal(embeddedArchive.length, declaredSize);
  assert.deepEqual(Array.from(embeddedArchive.subarray(0, 2)), [0x50, 0x4b]);

  await mkdir(path.dirname(zipPath), { recursive: true });
  await writeFile(zipPath, embeddedArchive);

  let entries = [];
  try {
    const { stdout } = await run("unzip", ["-Z1", zipPath]);
    entries = stdout.trim().split("\n").map(s => s.trim()).filter(Boolean);
  } catch {
    // Cross-platform fallback: parse central directory records (0x02014b50)
    let offset = 0;
    while (offset < embeddedArchive.length - 4) {
      if (embeddedArchive.readUInt32LE(offset) === 0x02014b50) {
        const nameLen = embeddedArchive.readUInt16LE(offset + 28);
        const extraLen = embeddedArchive.readUInt16LE(offset + 30);
        const commentLen = embeddedArchive.readUInt16LE(offset + 32);
        const filename = embeddedArchive.toString("utf8", offset + 46, offset + 46 + nameLen);
        entries.push(filename);
        offset += 46 + nameLen + extraLen + commentLen;
      } else {
        offset++;
      }
    }
  }

  for (const required of ["manifest.json", "background.js", "dashboard.html", "popup.html", "README.md"]) {
    assert.ok(entries.includes(required), `ZIP is missing ${required}`);
  }
  assert.ok(!entries.some((entry) => entry.endsWith(".png")));
  await assert.rejects(access(path.join(root, "public", "Nexus-Trader-Extension.zip")));
  await assert.rejects(access(path.join(root, "dist", "client", "Nexus-Trader-Extension.zip")));
});
