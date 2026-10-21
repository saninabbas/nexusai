import { evaluateTechnicalSignal } from "./strategy.ts";
import type { BacktestResult, Candle } from "./types";

const ROUND_TRIP_COST_RATE = 0.0012;
const MAX_HOLD_CANDLES = 96;
const COOLDOWN_CANDLES = 32;

export type ExitProfileName = "baseline" | "breakeven" | "profit_ladder" | "partial_profit_ladder";

interface ExitPolicy {
  name: ExitProfileName;
  lockSteps: Array<{ activationR: number; stopR: number }>;
  partial?: { activationR: number; fraction: number };
}

const EXIT_POLICIES: Record<ExitProfileName, ExitPolicy> = {
  baseline: { name: "baseline", lockSteps: [] },
  breakeven: {
    name: "breakeven",
    lockSteps: [{ activationR: 0.8, stopR: 0.05 }],
  },
  profit_ladder: {
    name: "profit_ladder",
    lockSteps: [
      { activationR: 0.8, stopR: 0.05 },
      { activationR: 1.25, stopR: 0.5 },
      { activationR: 1.6, stopR: 1 },
    ],
  },
  partial_profit_ladder: {
    name: "partial_profit_ladder",
    lockSteps: [
      { activationR: 0.8, stopR: 0.05 },
      { activationR: 1.25, stopR: 0.5 },
      { activationR: 1.6, stopR: 1 },
    ],
    partial: { activationR: 1, fraction: 0.5 },
  },
};

export const PROFIT_LOCK_EXIT_PROFILES = Object.freeze(Object.keys(EXIT_POLICIES) as ExitProfileName[]);

function fixed(value: number, digits = 4): number {
  return Number(value.toFixed(digits));
}

function directionalR(action: "LONG" | "SHORT", price: number, entry: number, stopDistance: number): number {
  const move = action === "LONG" ? price - entry : entry - price;
  return move / stopDistance;
}

function priceAtR(action: "LONG" | "SHORT", entry: number, stopDistance: number, valueR: number): number {
  return action === "LONG" ? entry + stopDistance * valueR : entry - stopDistance * valueR;
}

function simulateExit(input: {
  candles: Candle[];
  entryIndex: number;
  action: "LONG" | "SHORT";
  entry: number;
  stopDistance: number;
  policy: ExitPolicy;
}): { grossR: number; exitIndex: number } {
  const { candles, entryIndex, action, entry, stopDistance, policy } = input;
  const exitIndex = Math.min(candles.length - 1, entryIndex + MAX_HOLD_CANDLES);
  let activeStopR = -1;
  let remainingFraction = 1;
  let realizedR = 0;
  let partialTaken = false;

  for (let index = entryIndex; index <= exitIndex; index += 1) {
    const candle = candles[index];
    const stop = priceAtR(action, entry, stopDistance, activeStopR);
    const target = priceAtR(action, entry, stopDistance, 2);
    const stopHit = action === "LONG" ? candle.low <= stop : candle.high >= stop;
    const targetHit = action === "LONG" ? candle.high >= target : candle.low <= target;
    // If both prices occur in one candle, assume the stop happened first. This
    // deliberately avoids favorable intrabar look-ahead.
    if (stopHit) {
      return { grossR: realizedR + remainingFraction * activeStopR, exitIndex: index };
    }
    if (targetHit) {
      return { grossR: realizedR + remainingFraction * 2, exitIndex: index };
    }
    if (index === exitIndex) {
      const closeR = Math.max(activeStopR, Math.min(2, directionalR(action, candle.close, entry, stopDistance)));
      return { grossR: realizedR + remainingFraction * closeR, exitIndex: index };
    }

    // Lock changes use a completed candle and only protect from the following
    // candle. That makes the test conservative about unknown intrabar paths.
    const closeR = directionalR(action, candle.close, entry, stopDistance);
    if (policy.partial && !partialTaken && closeR >= policy.partial.activationR) {
      realizedR += policy.partial.fraction * closeR;
      remainingFraction -= policy.partial.fraction;
      partialTaken = true;
    }
    for (const step of policy.lockSteps) {
      if (closeR >= step.activationR) activeStopR = Math.max(activeStopR, step.stopR);
    }
  }

  return { grossR: realizedR, exitIndex };
}

export function simulateTradeExit(input: {
  candles: Candle[];
  entryIndex: number;
  action: "LONG" | "SHORT";
  entry: number;
  stopDistance: number;
}, exitProfile: ExitProfileName): { grossR: number; exitIndex: number } {
  return simulateExit({ ...input, policy: EXIT_POLICIES[exitProfile] });
}

export interface BacktestFeeModel {
  makerFeeRate?: number;
  takerFeeRate?: number;
  slippageRate?: number;
  fundingRatePer8h?: number;
}

export function runBacktestWithExitProfile(input: {
  symbol: string;
  interval: string;
  candles: Candle[];
  feeModel?: BacktestFeeModel;
}, exitProfile: ExitProfileName): BacktestResult {
  const candles = input.candles;
  const policy = EXIT_POLICIES[exitProfile];
  const returnsInR: number[] = [];
  let nextEligibleIndex = 220;
  let totalDurationCandles = 0;
  let totalFeeCostR = 0;
  let totalSlippageCostR = 0;
  let totalFundingCostR = 0;

  const takerFee = input.feeModel?.takerFeeRate ?? 0.0005;
  const slippage = input.feeModel?.slippageRate ?? 0.0001;
  const fundingPer8h = input.feeModel?.fundingRatePer8h ?? 0.0001;

  for (let signalIndex = 220; signalIndex < candles.length - MAX_HOLD_CANDLES - 1; signalIndex += 1) {
    if (signalIndex < nextEligibleIndex) continue;
    const signal = evaluateTechnicalSignal(candles.slice(0, signalIndex + 1));
    if (signal.action === "WAIT" || signal.atr <= 0) continue;

    const entryIndex = signalIndex + 1;
    const entry = candles[entryIndex].open;
    const stopDistance = Math.max(signal.atr * 2.5, entry * 0.004);
    const { grossR, exitIndex } = simulateTradeExit({
      candles,
      entryIndex,
      action: signal.action,
      entry,
      stopDistance,
    }, policy.name);

    const holdCandles = Math.max(1, exitIndex - entryIndex + 1);
    totalDurationCandles += holdCandles;

    const feeRate = takerFee * 2;
    const slipRate = slippage * 2;
    const candlesPer8h = input.interval.endsWith("h") ? Math.max(1, 8 / (parseInt(input.interval) || 1)) : 32;
    const fundingRate = (holdCandles / candlesPer8h) * fundingPer8h;

    const feeR = entry * feeRate / stopDistance;
    const slipR = entry * slipRate / stopDistance;
    const fundR = entry * fundingRate / stopDistance;

    totalFeeCostR += feeR;
    totalSlippageCostR += slipR;
    totalFundingCostR += fundR;

    const totalCostR = input.feeModel ? (feeR + slipR + fundR) : (entry * ROUND_TRIP_COST_RATE / stopDistance);
    returnsInR.push(grossR - totalCostR);
    nextEligibleIndex = exitIndex + COOLDOWN_CANDLES;
  }

  const wins = returnsInR.filter((value) => value > 0).length;
  const losses = returnsInR.length - wins;
  const gains = returnsInR.filter((value) => value > 0).reduce((sum, value) => sum + value, 0);
  const lossMagnitude = Math.abs(returnsInR.filter((value) => value <= 0).reduce((sum, value) => sum + value, 0));
  const netR = returnsInR.reduce((sum, value) => sum + value, 0);
  let equityR = 0;
  let peakR = 0;
  let maxDrawdownR = 0;
  for (const tradeReturn of returnsInR) {
    equityR += tradeReturn;
    peakR = Math.max(peakR, equityR);
    maxDrawdownR = Math.max(maxDrawdownR, peakR - equityR);
  }
  const profitFactor = lossMagnitude > 0 ? gains / lossMagnitude : (gains > 0 ? 99 : 0);
  const tradeCount = returnsInR.length;
  const passed = tradeCount >= 4 && netR > 0 && profitFactor >= 1.1 && maxDrawdownR <= 5.5;

  let sharpeRatio = 0;
  if (tradeCount >= 2) {
    const mean = netR / tradeCount;
    const variance = returnsInR.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / (tradeCount - 1);
    const stdDev = Math.sqrt(variance);
    sharpeRatio = stdDev > 0 ? fixed(mean / stdDev, 2) : 0;
  }

  const initialPrice = candles[220]?.close || candles[0]?.close || 1;
  const finalPrice = candles.at(-1)?.close || initialPrice;
  const benchmarkBuyAndHoldPct = initialPrice > 0 ? fixed(((finalPrice - initialPrice) / initialPrice) * 100, 2) : 0;

  const totalEvaluatedCandles = Math.max(1, candles.length - 220);
  const exposurePct = fixed(Math.min(100, (totalDurationCandles / totalEvaluatedCandles) * 100), 2);
  const avgTradeDurationCandles = tradeCount > 0 ? fixed(totalDurationCandles / tradeCount, 1) : 0;

  const isReliableSample = tradeCount >= 30;
  const reliabilityWarning = isReliableSample
    ? null
    : `Sample size too small (${tradeCount} trades < 30 minimum) to establish statistical validity. Results may be subject to variance or overfitting.`;

  return {
    symbol: input.symbol,
    interval: input.interval,
    candleCount: candles.length,
    tradeCount,
    wins,
    losses,
    winRate: tradeCount ? fixed(wins / tradeCount * 100, 2) : 0,
    netR: fixed(netR),
    maxDrawdownR: fixed(maxDrawdownR),
    profitFactor: fixed(profitFactor),
    grossGainR: fixed(gains),
    grossLossR: fixed(lossMagnitude),
    windowCount: 1,
    passedWindows: passed ? 1 : 0,
    passed,
    createdAt: Math.floor(Date.now() / 1_000),
    sharpeRatio,
    exposurePct,
    avgTradeDurationCandles,
    totalFeeCostR: fixed(totalFeeCostR),
    slippageCostR: fixed(totalSlippageCostR),
    fundingCostR: fixed(totalFundingCostR),
    benchmarkBuyAndHoldPct,
    isReliableSample,
    reliabilityWarning,
  };
}

export function runConservativeBacktest(input: {
  symbol: string;
  interval: string;
  candles: Candle[];
  feeModel?: BacktestFeeModel;
}): BacktestResult {
  return runBacktestWithExitProfile(input, "baseline");
}

function aggregateWalkForward(input: {
  symbol: string;
  interval: string;
  candleWindows: Candle[][];
  feeModel?: BacktestFeeModel;
}, exitProfile: ExitProfileName): BacktestResult {
  const reports = input.candleWindows.map((candles) => runBacktestWithExitProfile({
    symbol: input.symbol,
    interval: input.interval,
    candles,
    feeModel: input.feeModel,
  }, exitProfile));
  if (reports.length === 1) return reports[0];

  const tradeCount = reports.reduce((sum, report) => sum + report.tradeCount, 0);
  const wins = reports.reduce((sum, report) => sum + report.wins, 0);
  const losses = reports.reduce((sum, report) => sum + report.losses, 0);
  const grossGainR = reports.reduce((sum, report) => sum + report.grossGainR, 0);
  const grossLossR = reports.reduce((sum, report) => sum + report.grossLossR, 0);
  const netR = reports.reduce((sum, report) => sum + report.netR, 0);
  const maxDrawdownR = reports.reduce((maximum, report) => Math.max(maximum, report.maxDrawdownR), 0);
  const profitFactor = grossLossR > 0 ? grossGainR / grossLossR : (grossGainR > 0 ? 99 : 0);
  const passedWindows = reports.filter((report) => report.passed).length;
  const requiredPassedWindows = Math.ceil(reports.length * 0.75);
  const recentReports = reports.slice(0, Math.min(3, reports.length));
  const recentPassedWindows = recentReports.filter((report) => report.passed).length;
  const requiredRecentWindows = Math.ceil(recentReports.length * 2 / 3);
  const recentNetR = recentReports.reduce((sum, report) => sum + report.netR, 0);
  const recentGrossGainR = recentReports.reduce((sum, report) => sum + report.grossGainR, 0);
  const recentGrossLossR = recentReports.reduce((sum, report) => sum + report.grossLossR, 0);
  const recentProfitFactor = recentGrossLossR > 0
    ? recentGrossGainR / recentGrossLossR
    : (recentGrossGainR > 0 ? 99 : 0);
  const passed = reports.length >= 4
    && passedWindows >= requiredPassedWindows
    && recentPassedWindows >= requiredRecentWindows
    && recentNetR > 0
    && recentProfitFactor >= 1.1
    && tradeCount >= 16
    && netR > 0
    && profitFactor >= 1.1
    && maxDrawdownR <= 6;

  const validSharpeReports = reports.filter((r) => r.sharpeRatio !== undefined);
  const avgSharpe = validSharpeReports.length > 0
    ? fixed(validSharpeReports.reduce((sum, r) => sum + (r.sharpeRatio || 0), 0) / validSharpeReports.length, 2)
    : 0;

  const totalFeeCostR = fixed(reports.reduce((sum, r) => sum + (r.totalFeeCostR || 0), 0));
  const slippageCostR = fixed(reports.reduce((sum, r) => sum + (r.slippageCostR || 0), 0));
  const fundingCostR = fixed(reports.reduce((sum, r) => sum + (r.fundingCostR || 0), 0));
  const exposurePct = reports.length > 0
    ? fixed(reports.reduce((sum, r) => sum + (r.exposurePct || 0), 0) / reports.length, 2)
    : 0;
  const avgTradeDurationCandles = reports.length > 0
    ? fixed(reports.reduce((sum, r) => sum + (r.avgTradeDurationCandles || 0), 0) / reports.length, 1)
    : 0;
  const isReliableSample = tradeCount >= 30;
  const reliabilityWarning = isReliableSample
    ? null
    : `Sample size too small (${tradeCount} trades < 30 minimum) across walk-forward windows. Results may be subject to variance or overfitting.`;

  return {
    symbol: input.symbol,
    interval: input.interval,
    candleCount: reports.reduce((sum, report) => sum + report.candleCount, 0),
    tradeCount,
    wins,
    losses,
    winRate: tradeCount ? fixed(wins / tradeCount * 100, 2) : 0,
    netR: fixed(netR),
    maxDrawdownR: fixed(maxDrawdownR),
    profitFactor: fixed(profitFactor),
    grossGainR: fixed(grossGainR),
    grossLossR: fixed(grossLossR),
    windowCount: reports.length,
    passedWindows,
    passed,
    createdAt: Math.floor(Date.now() / 1_000),
    sharpeRatio: avgSharpe,
    exposurePct,
    avgTradeDurationCandles,
    totalFeeCostR,
    slippageCostR,
    fundingCostR,
    isReliableSample,
    reliabilityWarning,
  };
}

export function runWalkForwardDiagnostic(input: {
  symbol: string;
  interval: string;
  // Windows must be ordered newest first so recent-regime vetoes cannot be
  // hidden by stronger but older history.
  candleWindows: Candle[][];
}): BacktestResult {
  return aggregateWalkForward(input, "baseline");
}

export function runProfitLockWalkForwardDiagnostic(input: {
  symbol: string;
  interval: string;
  candleWindows: Candle[][];
}, exitProfile: Exclude<ExitProfileName, "baseline">): BacktestResult {
  return aggregateWalkForward(input, exitProfile);
}
