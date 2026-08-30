import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

test("production trading API is closed without the owner bearer token", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("trading-auth-test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  const response = await worker.fetch(
    new Request("https://nexus-ai-trading-bot.local-sass.workers.dev/api/trading/status"),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) }, TRADING_ADMIN_TOKEN: "test-owner-token" },
    { waitUntil() {}, passThroughOnException() {} },
  );
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { ok: false, error: "Unauthorized" });
});

test("live engine is disabled by default and requires customer, platform and forward-validation approval", async () => {
  const migration = await readFile(path.join(root, "drizzle/0001_pretty_thor_girl.sql"), "utf8");
  const routes = await readFile(path.join(root, "worker/trading/routes.ts"), "utf8");
  const types = await readFile(path.join(root, "worker/trading/types.ts"), "utf8");
  assert.match(migration, /`enabled` integer DEFAULT false NOT NULL/);
  assert.match(types, /I_UNDERSTAND_REAL_MONEY_RISK/);
  assert.match(types, /PAPER_FORWARD_GATE_PASSED/);
  assert.match(types, /REAL_MONEY_ENTRY_BUILD_ENABLED = false/);
  assert.match(routes, /FORWARD_VALIDATION_APPROVED/);
  assert.match(routes, /real-money entry is disabled in this public build/);
  assert.match(routes, /paper-forward validation approval/);
  assert.match(routes, /Authorization/);
  assert.match(routes, /Live execution configuration is incomplete/);
});

test("risk sizing respects risk budget, notional cap, lot step and minimums", async () => {
  const strategyUrl = pathToFileURL(path.join(root, "worker/trading/strategy.ts"));
  strategyUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { calculateRiskSizedQuantity } = await import(strategyUrl.href);

  assert.equal(calculateRiskSizedQuantity({
    equity: 1_000,
    riskBps: 25,
    leverage: 2,
    maxNotionalUsdt: 250,
    entryPrice: 100,
    stopPrice: 99,
    quantityStep: 0.001,
    minQuantity: 0.001,
    minNotional: 5,
  }), 2.5);

  assert.equal(calculateRiskSizedQuantity({
    equity: 10,
    riskBps: 5,
    leverage: 1,
    maxNotionalUsdt: 10,
    entryPrice: 100_000,
    stopPrice: 99_000,
    quantityStep: 0.001,
    minQuantity: 0.001,
    minNotional: 5,
  }), 0);
});

test("walk-forward diagnostic blocks insufficient history", async () => {
  const backtestUrl = pathToFileURL(path.join(root, "worker/trading/backtest.ts"));
  backtestUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { runConservativeBacktest } = await import(backtestUrl.href);
  const report = runConservativeBacktest({ symbol: "BTCUSDT", interval: "15m", candles: [] });
  assert.equal(report.passed, false);
  assert.equal(report.tradeCount, 0);
  assert.equal(report.netR, 0);
});

test("profit-lock research uses conservative completed-candle activation and partial accounting", async () => {
  const backtestUrl = pathToFileURL(path.join(root, "worker/trading/backtest.ts"));
  backtestUrl.searchParams.set("profit-lock-test", `${process.pid}-${Date.now()}`);
  const { simulateTradeExit } = await import(backtestUrl.href);
  const candle = (high, low, close) => ({ openTime: 0, open: 100, high, low, close, volume: 1, closeTime: 0 });

  const stopFirst = simulateTradeExit({
    candles: [candle(120, 90, 110)], entryIndex: 0, action: "LONG", entry: 100, stopDistance: 10,
  }, "profit_ladder");
  assert.equal(stopFirst.grossR, -1);

  const breakEven = simulateTradeExit({
    candles: [candle(109, 100, 109), candle(110, 100.4, 101)],
    entryIndex: 0, action: "LONG", entry: 100, stopDistance: 10,
  }, "breakeven");
  assert.equal(breakEven.grossR, 0.05);

  const partial = simulateTradeExit({
    candles: [candle(111, 100, 111), candle(112, 100.4, 101)],
    entryIndex: 0, action: "LONG", entry: 100, stopDistance: 10,
  }, "partial_profit_ladder");
  assert.ok(Math.abs(partial.grossR - 0.575) < 1e-12);
});

test("production engine uses exchange-native protection, emergency close and cron", async () => {
  const [engine, binance, customer, repository, research, backtest, worker, vite] = await Promise.all([
    readFile(path.join(root, "worker/trading/engine.ts"), "utf8"),
    readFile(path.join(root, "worker/trading/binance.ts"), "utf8"),
    readFile(path.join(root, "worker/trading/customer.ts"), "utf8"),
    readFile(path.join(root, "worker/trading/repository.ts"), "utf8"),
    readFile(path.join(root, "worker/trading/research.ts"), "utf8"),
    readFile(path.join(root, "worker/trading/backtest.ts"), "utf8"),
    readFile(path.join(root, "worker/index.ts"), "utf8"),
    readFile(path.join(root, "vite.config.ts"), "utf8"),
  ]);
  assert.match(binance, /\/fapi\/v1\/algoOrder/);
  assert.match(binance, /getOrderByClientId/);
  assert.match(binance, /getApiRestrictions/);
  assert.doesNotMatch(binance, /cancelAllAlgoOrders/);
  assert.match(engine, /STOP_MARKET/);
  assert.match(engine, /TAKE_PROFIT_MARKET/);
  assert.match(engine, /emergencyCloseAndPause/);
  assert.match(engine, /daily_loss_bps/);
  assert.match(engine, /daily_loss_exit/);
  assert.match(engine, /news_risk_exit/);
  assert.match(engine, /confirmed_reversal_exit/);
  assert.match(engine, /backtest_veto/);
  assert.match(engine, /paper-forward validation has not been approved/);
  assert.match(engine, /passedWindows/);
  assert.match(engine, /Array\.from\(\{ length: 12 \}/);
  assert.match(engine, /active_position_amount/);
  assert.match(engine, /Entry acknowledgement is ambiguous/);
  assert.match(customer, /\/api\/customer\/position\/close/);
  assert.match(customer, /wait 30 seconds/);
  assert.match(customer, /restrictions\.enableWithdrawals/);
  assert.match(customer, /paper-forward validation approval/);
  assert.match(repository, /OR st\.active_entry_client_id IS NOT NULL/);
  assert.match(backtest, /intrabar look-ahead/);
  assert.match(backtest, /requiredPassedWindows/);
  assert.match(backtest, /requiredRecentWindows/);
  assert.match(backtest, /recentProfitFactor >= 1\.1/);
  assert.match(backtest, /partial_profit_ladder/);
  assert.match(backtest, /completed candle/);
  const profitLockResearch = await readFile(path.join(root, "scripts/profit-lock-research.mjs"), "utf8");
  assert.match(profitLockResearch, /untouchedHoldout/);
  assert.match(profitLockResearch, /selectedForProduction/);
  const strategyResearch = await readFile(path.join(root, "scripts/strategy-research.mjs"), "utf8");
  assert.match(strategyResearch, /probabilityOfBacktestOverfitting/);
  assert.match(strategyResearch, /overfitting\.probability <= 0\.2/);
  assert.match(research, /gemini-3\.7-flash/);
  assert.match(research, /generativelanguage\.googleapis\.com/);
  assert.match(research, /"x-goog-api-key"/);
  assert.match(research, /googleSearch: \{\}/);
  assert.match(research, /responseFormat/);
  assert.match(research, /AbortSignal\.timeout\(12_000\)/);
  assert.match(worker, /async scheduled/);
  assert.match(vite, /crons: \["\* \* \* \* \*"\]/);
});

test("risk-reducing close keeps protection when close fails and cancels only owned orders after success", async () => {
  const moduleUrl = pathToFileURL(path.join(root, "worker/trading/risk-close.ts"));
  moduleUrl.searchParams.set("risk-close-test", `${process.pid}-${Date.now()}`);
  const { executeRiskReducingClose } = await import(moduleUrl.href);
  const state = {
    active_stop_client_id: "nx_sl_owned",
    active_take_profit_client_id: "nx_tp_owned",
  };

  const failedCancellations = [];
  await assert.rejects(executeRiskReducingClose({
    client: {
      async emergencyClose() { throw new Error("close rejected"); },
      async cancelAlgoOrder(_symbol, id) { failedCancellations.push(id); },
    },
    state,
    symbol: "BTCUSDT",
    side: "SELL",
    quantity: "0.001",
    clientOrderId: "nx_panic_test",
  }), /close rejected/);
  assert.deepEqual(failedCancellations, []);

  const canceled = [];
  const result = await executeRiskReducingClose({
    client: {
      async emergencyClose() {
        return { orderId: 7, clientOrderId: "nx_exit_test", avgPrice: "100", executedQty: "0.001", status: "FILLED" };
      },
      async cancelAlgoOrder(_symbol, id) { canceled.push(id); },
    },
    state,
    symbol: "BTCUSDT",
    side: "SELL",
    quantity: "0.001",
    clientOrderId: "nx_exit_test",
  });
  assert.equal(result.closeOrder.orderId, 7);
  assert.deepEqual(canceled.sort(), ["nx_sl_owned", "nx_tp_owned"]);
});

test("multi-client credentials are tenant-bound and encrypted before storage", async () => {
  const [migration, security, customer, repository] = await Promise.all([
    readFile(path.join(root, "drizzle/0005_military_the_order.sql"), "utf8"),
    readFile(path.join(root, "lib/customer-security.ts"), "utf8"),
    readFile(path.join(root, "worker/trading/customer.ts"), "utf8"),
    readFile(path.join(root, "worker/trading/repository.ts"), "utf8"),
  ]);
  assert.match(migration, /customer_binance_connections/);
  assert.match(migration, /tenant_trading_settings/);
  assert.match(migration, /tenant_trading_state/);
  assert.match(migration, /tenant_trading_events/);
  assert.match(security, /AES-GCM/);
  assert.match(security, /nexus:binance:v1:\$\{input\.tenantId\}/);
  assert.match(customer, /authenticateCustomer/);
  assert.match(customer, /credentialsStoredInExtension: false/);
  assert.match(repository, /WHERE tenant_id = \?/);
});

test("credential vault rejects cross-tenant ciphertext reuse", async () => {
  const moduleUrl = pathToFileURL(path.join(root, "lib/customer-security.ts"));
  moduleUrl.searchParams.set("vault-test", `${process.pid}-${Date.now()}`);
  const { decryptCustomerCredentials, encryptCustomerCredentials } = await import(moduleUrl.href);
  const encodedKey = Buffer.alloc(32, 7).toString("base64");
  const credentials = { apiKey: "A".repeat(64), apiSecret: "B".repeat(64) };
  const encrypted = await encryptCustomerCredentials({ encodedKey, tenantId: "tenant-a", credentials });
  assert.deepEqual(await decryptCustomerCredentials({
    encodedKey,
    tenantId: "tenant-a",
    ciphertext: encrypted.ciphertext,
    iv: encrypted.iv,
  }), credentials);
  await assert.rejects(decryptCustomerCredentials({
    encodedKey,
    tenantId: "tenant-b",
    ciphertext: encrypted.ciphertext,
    iv: encrypted.iv,
  }));
});
