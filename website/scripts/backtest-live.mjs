const requestedWindows = Number(process.argv[2] || 12);
const windowCount = Math.max(4, Math.min(12, Math.floor(requestedWindows)));
const symbol = "BTCUSDT";
const interval = "1h";
const hourMs = 60 * 60 * 1_000;
const latestCompletedHour = Math.floor(Date.now() / hourMs) * hourMs - 1;

const { runWalkForwardDiagnostic } = await import("../worker/trading/backtest.ts");
const candleWindows = await Promise.all(Array.from({ length: windowCount }, async (_, index) => {
  const endTime = latestCompletedHour - index * 1_000 * hourMs;
  const query = new URLSearchParams({ symbol, interval, limit: "1000", endTime: String(endTime) });
  const response = await fetch(`https://fapi.binance.com/fapi/v1/klines?${query}`);
  if (!response.ok) throw new Error(`Binance market data failed (${response.status})`);
  const rows = await response.json();
  return rows.map((row) => ({
    openTime: Number(row[0]),
    open: Number(row[1]),
    high: Number(row[2]),
    low: Number(row[3]),
    close: Number(row[4]),
    volume: Number(row[5]),
    closeTime: Number(row[6]),
  }));
}));

console.log(JSON.stringify({
  generatedAt: new Date().toISOString(),
  assumptions: {
    signal: "40-candle breakout with EMA50/200 trend and RSI guard",
    stop: "2.5 ATR (minimum 0.4%)",
    target: "2R",
    maxHold: "96 hours",
    cooldown: "32 hours after exit",
    estimatedRoundTripCost: "0.12%",
    sameCandleStopAndTarget: "stop counted first",
  },
  result: runWalkForwardDiagnostic({ symbol, interval, candleWindows }),
}, null, 2));
