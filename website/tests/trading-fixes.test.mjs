import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

test("MACD strategy scoring triggers LONG and SHORT on valid crossover signals", async () => {
  const strategiesUrl = pathToFileURL(path.join(root, "extension/strategies.js"));
  strategiesUrl.searchParams.set("t", `${process.pid}-${Date.now()}`);
  const { evaluateStrategy } = await import(strategiesUrl.href);

  // Bullish surge with valid candlestick geometry to produce positive MACD histogram
  const baseTime = 1700000000000;
  const bullishCandles = [];
  let bullPrice = 100;
  for (let i = 0; i < 60; i++) {
    if (i >= 40) bullPrice += 3;
    bullishCandles.push({
      openTime: baseTime + i * 60000,
      open: bullPrice - 1,
      high: bullPrice + 2,
      low: bullPrice - 2,
      close: bullPrice,
      volume: 10,
      closeTime: baseTime + (i + 1) * 60000 - 1,
    });
  }

  const bullishResult = evaluateStrategy(bullishCandles, "MACD");
  assert.equal(bullishResult.action, "LONG");
  assert.ok(bullishResult.confidence >= 60);

  // Bearish drop with valid candlestick geometry to produce negative MACD histogram
  const bearishCandles = [];
  let bearPrice = 160;
  for (let i = 0; i < 60; i++) {
    if (i >= 40) bearPrice -= 3;
    bearishCandles.push({
      openTime: baseTime + i * 60000,
      open: bearPrice + 1,
      high: bearPrice + 2,
      low: bearPrice - 2,
      close: bearPrice,
      volume: 10,
      closeTime: baseTime + (i + 1) * 60000 - 1,
    });
  }

  const bearishResult = evaluateStrategy(bearishCandles, "MACD");
  assert.equal(bearishResult.action, "SHORT");
  assert.ok(bearishResult.confidence >= 60);
});

test("RSI calculation handles flat, rising, falling, and oscillating series correctly", async () => {
  const extUrl = pathToFileURL(path.join(root, "extension/strategies.js"));
  extUrl.searchParams.set("t", `${process.pid}-${Date.now()}`);
  const { rsi: extRsi } = await import(extUrl.href);

  const workerUrl = pathToFileURL(path.join(root, "worker/trading/strategy.ts"));
  workerUrl.searchParams.set("t", `${process.pid}-${Date.now()}`);
  const { rsi: workerRsi } = await import(workerUrl.href);

  for (const rsiFn of [extRsi, workerRsi]) {
    // 1. Flat price series must return neutral 50, not 100
    const flatSeries = Array(30).fill(50000);
    assert.equal(rsiFn(flatSeries, 14), 50);

    // 2. Strictly rising price series must return 100
    const risingSeries = Array.from({ length: 30 }, (_, i) => 100 + i * 2);
    assert.equal(rsiFn(risingSeries, 14), 100);

    // 3. Strictly falling price series must return 0
    const fallingSeries = Array.from({ length: 30 }, (_, i) => 100 - i * 2);
    assert.equal(rsiFn(fallingSeries, 14), 0);

    // 4. Oscillating series must return a valid finite number between 0 and 100
    const oscillating = Array.from({ length: 30 }, (_, i) => 100 + (i % 2 === 0 ? 5 : -5));
    const rsiVal = rsiFn(oscillating, 14);
    assert.ok(Number.isFinite(rsiVal));
    assert.ok(rsiVal >= 0 && rsiVal <= 100);
  }
});

test("Candle input sanitization rejects invalid prices, sorts, deduplicates, and filters forming candles", async () => {
  const extUrl = pathToFileURL(path.join(root, "extension/strategies.js"));
  extUrl.searchParams.set("t", `${process.pid}-${Date.now()}`);
  const { sanitizeCandles } = await import(extUrl.href);

  const workerUrl = pathToFileURL(path.join(root, "worker/trading/strategy.ts"));
  workerUrl.searchParams.set("t", `${process.pid}-${Date.now()}`);
  const { sanitizeAndValidateCandles } = await import(workerUrl.href);

  const now = 1700000100000;
  const rawCandles = [
    // Duplicate timestamp
    { openTime: 1000, open: 100, high: 105, low: 95, close: 102, volume: 1, closeTime: 1060 },
    { openTime: 1000, open: 100, high: 106, low: 95, close: 104, volume: 2, closeTime: 1060 },
    // Out of chronological order
    { openTime: 500, open: 98, high: 100, low: 96, close: 99, volume: 1, closeTime: 560 },
    // Corrupt prices
    { openTime: 1200, open: -10, high: 100, low: 50, close: 80, volume: 1, closeTime: 1260 },
    { openTime: 1300, open: 100, high: 80, low: 90, close: 85, volume: 1, closeTime: 1360 }, // high < low
    { openTime: 1400, open: 100, high: 105, low: 102, close: 95, volume: 1, closeTime: 1460 }, // low > close
    // Uncompleted / forming candle (closeTime in the future)
    { openTime: now - 30000, open: 104, high: 108, low: 103, close: 107, volume: 5, closeTime: now + 30000 },
  ];

  for (const sanitizeFn of [sanitizeCandles, sanitizeAndValidateCandles]) {
    const clean = sanitizeFn(rawCandles, { requireClosed: true, currentTime: now });
    // Should keep 500 and 1000, filtering out corrupt, duplicate, and future candles
    assert.equal(clean.length, 2);
    assert.equal(clean[0].openTime, 500);
    assert.equal(clean[1].openTime, 1000);
    assert.equal(clean[1].close, 104); // Kept deduplicated latest
  }
});

test("Precision formatting, tick size rounding, and step sizing conform to exchange filters", async () => {
  const binanceUrl = pathToFileURL(path.join(root, "extension/binance.js"));
  binanceUrl.searchParams.set("t", `${process.pid}-${Date.now()}`);
  const { floorToStep, roundPrice } = await import(binanceUrl.href);

  // Tick rounding
  assert.equal(roundPrice(67891.234, 0.1), 67891.2);
  assert.equal(roundPrice(67891.27, 0.1), 67891.3);
  assert.equal(roundPrice(0.0054321, 0.0001), 0.0054);
  assert.equal(roundPrice(123.456, 0.05), 123.45);

  // Step size floor
  assert.equal(floorToStep(0.1299, 0.01), 0.12);
  assert.equal(floorToStep(1.9999, 0.5), 1.5);
  assert.equal(floorToStep(0.0039, 0.001), 0.003);
});

test("Hard-coded risk limits cap maximum leverage to 10x", async () => {
  const bgUrl = pathToFileURL(path.join(root, "extension/background.js"));
  bgUrl.searchParams.set("t", `${process.pid}-${Date.now()}`);

  // Test calculateOrderQuantity caps leverage at 10x
  const binanceUrl = pathToFileURL(path.join(root, "extension/binance.js"));
  binanceUrl.searchParams.set("t", `${process.pid}-${Date.now()}`);
  const { calculateOrderQuantity } = await import(binanceUrl.href);

  // Mock public exchange info for test
  globalThis.fetch = async (url) => {
    if (String(url).includes("exchangeInfo")) {
      return {
        ok: true,
        json: async () => ({
          symbols: [{
            symbol: "BTCUSDT",
            filters: [
              { filterType: "LOT_SIZE", stepSize: "0.001", minQty: "0.001" },
              { filterType: "PRICE_FILTER", tickSize: "0.1" },
              { filterType: "MIN_NOTIONAL", notional: "5" },
            ],
          }],
        }),
      };
    }
    return { ok: true, json: async () => ({}) };
  };

  const qtyWith10x = await calculateOrderQuantity({
    symbol: "BTCUSDT",
    price: 50000,
    balance: 1000,
    risk: 1,
    stopLoss: 1.5,
    leverage: 10,
    useTestnet: true,
  });

  const qtyWith50xAttempt = await calculateOrderQuantity({
    symbol: "BTCUSDT",
    price: 50000,
    balance: 1000,
    risk: 1,
    stopLoss: 1.5,
    leverage: 50, // attempted 50x must be clamped to 10x
    useTestnet: true,
  });

  assert.equal(qtyWith10x, qtyWith50xAttempt);
});

test("Backtesting engine correctly applies configurable maker/taker fees, slippage, and funding drag", async () => {
  const backtestUrl = pathToFileURL(path.join(root, "worker/trading/backtest.ts"));
  backtestUrl.searchParams.set("t", `${process.pid}-${Date.now()}`);
  const { runBacktestWithExitProfile } = await import(backtestUrl.href);

  // Generate 350 trending candles to trigger backtest trades
  const baseTime = 1700000000000;
  const candles = [];
  let price = 50000;
  for (let i = 0; i < 350; i++) {
    // Generate an oscillating upward breakout pattern
    const drift = (i > 220 && i % 40 < 20) ? 150 : -80;
    price += drift;
    candles.push({
      openTime: baseTime + i * 3600000,
      open: price,
      high: price + 200,
      low: price - 200,
      close: price + 50,
      volume: 100,
      closeTime: baseTime + (i + 1) * 3600000 - 1,
    });
  }

  // 1. Run with standard fee model
  const lowFeeReport = runBacktestWithExitProfile({
    symbol: "BTCUSDT",
    interval: "1h",
    candles,
    feeModel: {
      takerFeeRate: 0.0002,
      makerFeeRate: 0.0001,
      slippageRate: 0.00005,
      fundingRatePer8h: 0.00005,
    },
  }, "baseline");

  // 2. Run with high fee model
  const highFeeReport = runBacktestWithExitProfile({
    symbol: "BTCUSDT",
    interval: "1h",
    candles,
    feeModel: {
      takerFeeRate: 0.001,
      makerFeeRate: 0.0005,
      slippageRate: 0.0005,
      fundingRatePer8h: 0.0005,
    },
  }, "baseline");

  if (lowFeeReport.tradeCount > 0) {
    // Net R with high fees must be strictly less than with low fees
    assert.ok(highFeeReport.netR < lowFeeReport.netR);
    assert.ok(highFeeReport.totalFeeCostR > lowFeeReport.totalFeeCostR);
    assert.ok(highFeeReport.slippageCostR > lowFeeReport.slippageCostR);
    assert.ok(typeof lowFeeReport.sharpeRatio === "number");
    assert.ok(typeof lowFeeReport.exposurePct === "number");
    assert.ok(typeof lowFeeReport.avgTradeDurationCandles === "number");
    assert.ok(typeof lowFeeReport.benchmarkBuyAndHoldPct === "number");
  }

  // Small sample flag check
  assert.equal(lowFeeReport.isReliableSample, lowFeeReport.tradeCount >= 30);
  if (lowFeeReport.tradeCount < 30) {
    assert.match(lowFeeReport.reliabilityWarning, /sample size too small/i);
  }
});
