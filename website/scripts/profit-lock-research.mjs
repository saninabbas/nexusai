const symbol = "BTCUSDT";
const interval = "1h";
const hourMs = 60 * 60 * 1_000;
const windowCount = 18;
const holdoutWindowCount = 3;

const {
  PROFIT_LOCK_EXIT_PROFILES,
  runBacktestWithExitProfile,
  runWalkForwardDiagnostic,
  runProfitLockWalkForwardDiagnostic,
} = await import("../worker/trading/backtest.ts");

async function fetchWindows() {
  const latestCompletedHour = Math.floor(Date.now() / hourMs) * hourMs - 1;
  return Promise.all(Array.from({ length: windowCount }, async (_, index) => {
    const endTime = latestCompletedHour - index * 1_000 * hourMs;
    const query = new URLSearchParams({ symbol, interval, limit: "1000", endTime: String(endTime) });
    const response = await fetch(`https://fapi.binance.com/fapi/v1/klines?${query}`, {
      signal: AbortSignal.timeout(45_000),
    });
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
}

function walkForward(windows, profile) {
  const input = { symbol, interval, candleWindows: windows };
  return profile === "baseline"
    ? runWalkForwardDiagnostic(input)
    : runProfitLockWalkForwardDiagnostic(input, profile);
}

function positiveWindows(windows, profile) {
  return windows.filter((candles) => runBacktestWithExitProfile({ symbol, interval, candles }, profile).netR > 0).length;
}

function qualifies(candidate, baseline, windows) {
  return candidate.passed
    && candidate.tradeCount >= Math.floor(baseline.tradeCount * 0.85)
    && candidate.winRate >= baseline.winRate + 3
    && candidate.netR >= baseline.netR
    && candidate.profitFactor >= baseline.profitFactor
    && candidate.maxDrawdownR <= baseline.maxDrawdownR
    && positiveWindows(windows, candidate.profile) >= Math.ceil(windows.length * 0.75);
}

const windows = await fetchWindows();
const untouchedHoldout = windows.slice(0, holdoutWindowCount);
const selectionWindows = windows.slice(holdoutWindowCount);
const baselineSelection = { profile: "baseline", ...walkForward(selectionWindows, "baseline") };
const selection = PROFIT_LOCK_EXIT_PROFILES
  .filter((profile) => profile !== "baseline")
  .map((profile) => {
    const report = { profile, ...walkForward(selectionWindows, profile) };
    return {
      ...report,
      positiveWindows: positiveWindows(selectionWindows, profile),
      qualifies: qualifies(report, baselineSelection, selectionWindows),
    };
  })
  .sort((left, right) => {
    if (left.qualifies !== right.qualifies) return Number(right.qualifies) - Number(left.qualifies);
    return (right.netR - right.maxDrawdownR * 0.5) - (left.netR - left.maxDrawdownR * 0.5);
  });

const candidate = selection.find((item) => item.qualifies) || null;
const holdout = candidate ? {
  profile: candidate.profile,
  report: walkForward(untouchedHoldout, candidate.profile),
  positiveWindows: positiveWindows(untouchedHoldout, candidate.profile),
} : null;
const holdoutPassed = Boolean(holdout
  && holdout.report.tradeCount >= 6
  && holdout.report.netR > 0
  && holdout.report.profitFactor >= 1.1
  && holdout.report.maxDrawdownR <= 4
  && holdout.positiveWindows >= 2);

console.log(JSON.stringify({
  generatedAt: new Date().toISOString(),
  assumptions: {
    selection: "15 older non-overlapping 1000-candle windows",
    untouchedHoldout: "3 newest non-overlapping 1000-candle windows",
    activation: "completed-candle close; tightened stop applies from next candle",
    cost: "0.12% estimated round trip",
    sameCandleStopAndTarget: "stop counted first",
    promotion: "must improve win rate, net R, profit factor and drawdown, then pass untouched holdout",
  },
  baselineSelection,
  selection,
  candidate: candidate?.profile || null,
  holdout,
  selectedForProduction: holdoutPassed ? candidate.profile : null,
}, null, 2));
