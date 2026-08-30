import type { Candle, TechnicalSignal } from "./types";

function ema(values: number[], period: number): number[] {
  if (!values.length) return [];
  const multiplier = 2 / (period + 1);
  const output = [values[0]];
  for (let index = 1; index < values.length; index += 1) {
    output.push((values[index] - output[index - 1]) * multiplier + output[index - 1]);
  }
  return output;
}

function rsi(values: number[], period = 14): number {
  if (values.length <= period) return 50;
  let gains = 0;
  let losses = 0;
  for (let index = values.length - period; index < values.length; index += 1) {
    const change = values[index] - values[index - 1];
    gains += Math.max(0, change);
    losses += Math.max(0, -change);
  }
  if (losses === 0) return 100;
  const relativeStrength = (gains / period) / (losses / period);
  return 100 - (100 / (1 + relativeStrength));
}

function atr(candles: Candle[], period = 14): number {
  if (candles.length <= period) return 0;
  const ranges: number[] = [];
  for (let index = candles.length - period; index < candles.length; index += 1) {
    const candle = candles[index];
    const previousClose = candles[index - 1].close;
    ranges.push(Math.max(
      candle.high - candle.low,
      Math.abs(candle.high - previousClose),
      Math.abs(candle.low - previousClose),
    ));
  }
  return ranges.reduce((sum, value) => sum + value, 0) / ranges.length;
}

function macdHistogram(values: number[]): number[] {
  const fast = ema(values, 12);
  const slow = ema(values, 26);
  const line = values.map((_, index) => fast[index] - slow[index]);
  const signal = ema(line, 9);
  return line.map((value, index) => value - signal[index]);
}

function fixed(value: number, digits = 6): number {
  return Number(value.toFixed(digits));
}

export function evaluateTechnicalSignal(candles: Candle[]): TechnicalSignal {
  const completed = candles.filter((candle) => candle.closeTime <= Date.now());
  if (completed.length < 80) {
    return {
      action: "WAIT",
      confidence: 0,
      reason: "At least 80 completed candles are required",
      price: completed.at(-1)?.close || 0,
      atr: 0,
      closeTime: completed.at(-1)?.closeTime || 0,
      indicators: { ema50: 0, ema200: 0, rsi14: 50, macdHistogram: 0, previousMacdHistogram: 0 },
    };
  }

  const closes = completed.map((candle) => candle.close);
  const latestPrice = closes.at(-1) || 0;
  if (completed.length < 220) {
    return {
      action: "WAIT",
      confidence: 0,
      reason: "At least 220 completed candles are required for the long-term trend filter",
      price: completed.at(-1)?.close || 0,
      atr: 0,
      closeTime: completed.at(-1)?.closeTime || 0,
      indicators: { ema50: 0, ema200: 0, rsi14: 50, macdHistogram: 0, previousMacdHistogram: 0 },
    };
  }

  const ema50Series = ema(closes, 50);
  const ema200Series = ema(closes, 200);
  const ema50 = ema50Series.at(-1) || 0;
  const ema200 = ema200Series.at(-1) || 0;
  const rsi14 = rsi(closes, 14);
  const histograms = macdHistogram(closes);
  const histogram = histograms.at(-1) || 0;
  const previousHistogram = histograms.at(-2) || 0;
  const currentAtr = atr(completed, 14);
  const priorRange = completed.slice(-41, -1);
  const rangeHigh = Math.max(...priorRange.map((candle) => candle.high));
  const rangeLow = Math.min(...priorRange.map((candle) => candle.low));
  const longTrend = latestPrice > ema50 && ema50 > ema200 * 1.0005;
  const shortTrend = latestPrice < ema50 && ema50 < ema200 * 0.9995;
  const longTrigger = latestPrice > rangeHigh && rsi14 <= 75;
  const shortTrigger = latestPrice < rangeLow && rsi14 >= 25;

  let action: TechnicalSignal["action"] = "WAIT";
  if (longTrend && longTrigger) action = "LONG";
  if (shortTrend && shortTrigger) action = "SHORT";

  const trendDistance = latestPrice > 0 ? Math.abs(ema50 - ema200) / latestPrice : 0;
  const breakoutDistance = action === "LONG" ? latestPrice - rangeHigh : action === "SHORT" ? rangeLow - latestPrice : 0;
  const confidence = action === "WAIT"
    ? 0
    : Math.min(90, Math.round(62 + Math.min(14, trendDistance * 5_000) + Math.min(14, breakoutDistance / Math.max(currentAtr, 1) * 20)));

  return {
    action,
    confidence,
    reason: action === "WAIT"
      ? "No 40-candle breakout aligned with the EMA50/200 trend"
      : `${action} confirmed by a 40-candle breakout, EMA50/200 trend and RSI guard`,
    price: latestPrice,
    atr: fixed(currentAtr),
    closeTime: completed.at(-1)?.closeTime || 0,
    indicators: {
      ema50: fixed(ema50),
      ema200: fixed(ema200),
      rsi14: fixed(rsi14, 2),
      macdHistogram: fixed(histogram),
      previousMacdHistogram: fixed(previousHistogram),
    },
  };
}

export function calculateRiskSizedQuantity(input: {
  equity: number;
  riskBps: number;
  leverage: number;
  maxNotionalUsdt: number;
  entryPrice: number;
  stopPrice: number;
  quantityStep: number;
  minQuantity: number;
  minNotional: number;
}): number {
  const stopDistance = Math.abs(input.entryPrice - input.stopPrice);
  if (!Number.isFinite(stopDistance) || stopDistance <= 0) return 0;

  const riskBudget = input.equity * (input.riskBps / 10_000);
  const rawRiskQuantity = riskBudget / stopDistance;
  const notionalCap = Math.min(input.maxNotionalUsdt, input.equity * input.leverage);
  const cappedQuantity = Math.min(rawRiskQuantity, notionalCap / input.entryPrice);
  const stepped = Math.floor((cappedQuantity + Number.EPSILON) / input.quantityStep) * input.quantityStep;
  const quantity = Number(stepped.toFixed(12));

  if (!Number.isFinite(quantity) || quantity < input.minQuantity) return 0;
  if (quantity * input.entryPrice < input.minNotional) return 0;
  return quantity;
}
