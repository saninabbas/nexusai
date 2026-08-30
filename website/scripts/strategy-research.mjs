const symbol = "BTCUSDT";
const interval = "1h";
const hourMs = 60 * 60 * 1_000;
const roundTripCostRate = 0.0012;
const windowCount = 18;
const phase = process.argv[2] || "select";
const requestedCandidate = process.argv[3] || "";

const candidates = [
  { name: "baseline", range: 40, trendGap: 0.0005, rsiLong: 75, rsiShort: 25, volumeRatio: 0, closeLocation: 0, macdSlope: false, fourHour: false, atrStop: 2.5, targetR: 2, maxHold: 96, cooldown: 32 },
  { name: "quality_breakout", range: 40, trendGap: 0.0005, rsiLong: 72, rsiShort: 28, volumeRatio: 1.15, closeLocation: 0.68, macdSlope: false, fourHour: false, atrStop: 2.5, targetR: 2, maxHold: 96, cooldown: 32 },
  { name: "quality_1_5r", range: 40, trendGap: 0.0005, rsiLong: 72, rsiShort: 28, volumeRatio: 1.15, closeLocation: 0.68, macdSlope: false, fourHour: false, atrStop: 2.5, targetR: 1.5, maxHold: 72, cooldown: 32 },
  { name: "strong_trend", range: 40, trendGap: 0.002, rsiLong: 72, rsiShort: 28, volumeRatio: 0, closeLocation: 0, macdSlope: true, fourHour: false, atrStop: 2.5, targetR: 2, maxHold: 96, cooldown: 32 },
  { name: "strong_quality", range: 40, trendGap: 0.0015, rsiLong: 72, rsiShort: 28, volumeRatio: 1.1, closeLocation: 0.65, macdSlope: true, fourHour: false, atrStop: 2.5, targetR: 1.75, maxHold: 72, cooldown: 32 },
  { name: "four_hour", range: 40, trendGap: 0.001, rsiLong: 72, rsiShort: 28, volumeRatio: 0, closeLocation: 0, macdSlope: false, fourHour: true, atrStop: 2.5, targetR: 2, maxHold: 96, cooldown: 32 },
  { name: "four_hour_quality", range: 40, trendGap: 0.001, rsiLong: 72, rsiShort: 28, volumeRatio: 1.1, closeLocation: 0.65, macdSlope: false, fourHour: true, atrStop: 2.5, targetR: 1.75, maxHold: 72, cooldown: 32 },
  { name: "wide_breakout", range: 55, trendGap: 0.001, rsiLong: 74, rsiShort: 26, volumeRatio: 0, closeLocation: 0, macdSlope: false, fourHour: false, atrStop: 2.75, targetR: 2, maxHold: 96, cooldown: 32 },
  { name: "fast_breakout", range: 24, trendGap: 0.0015, rsiLong: 70, rsiShort: 30, volumeRatio: 1.2, closeLocation: 0.7, macdSlope: true, fourHour: false, atrStop: 2.25, targetR: 1.5, maxHold: 48, cooldown: 24 },
  { name: "conservative", range: 55, trendGap: 0.002, rsiLong: 70, rsiShort: 30, volumeRatio: 1.1, closeLocation: 0.65, macdSlope: true, fourHour: true, atrStop: 2.75, targetR: 1.75, maxHold: 72, cooldown: 32 },
];

function ema(values, period) {
  if (!values.length) return [];
  const multiplier = 2 / (period + 1);
  const output = [values[0]];
  for (let index = 1; index < values.length; index += 1) {
    output.push((values[index] - output[index - 1]) * multiplier + output[index - 1]);
  }
  return output;
}

function rsi(values, period = 14) {
  if (values.length <= period) return 50;
  let gains = 0;
  let losses = 0;
  for (let index = values.length - period; index < values.length; index += 1) {
    const change = values[index] - values[index - 1];
    gains += Math.max(0, change);
    losses += Math.max(0, -change);
  }
  if (losses === 0) return 100;
  const relativeStrength = gains / Math.max(losses, Number.EPSILON);
  return 100 - 100 / (1 + relativeStrength);
}

function atr(candles, period = 14) {
  if (candles.length <= period) return 0;
  const ranges = [];
  for (let index = candles.length - period; index < candles.length; index += 1) {
    const candle = candles[index];
    const previousClose = candles[index - 1].close;
    ranges.push(Math.max(candle.high - candle.low, Math.abs(candle.high - previousClose), Math.abs(candle.low - previousClose)));
  }
  return ranges.reduce((sum, value) => sum + value, 0) / ranges.length;
}

function macdHistogram(values) {
  const fast = ema(values, 12);
  const slow = ema(values, 26);
  const line = values.map((_, index) => fast[index] - slow[index]);
  const signal = ema(line, 9);
  return line.map((value, index) => value - signal[index]);
}

function aggregateFourHour(candles) {
  const output = [];
  for (let index = 0; index + 3 < candles.length; index += 4) {
    const group = candles.slice(index, index + 4);
    output.push({
      open: group[0].open,
      high: Math.max(...group.map((item) => item.high)),
      low: Math.min(...group.map((item) => item.low)),
      close: group[3].close,
      volume: group.reduce((sum, item) => sum + item.volume, 0),
    });
  }
  return output;
}

function signal(candles, profile) {
  if (candles.length < 420) return null;
  const closes = candles.map((item) => item.close);
  const latest = candles.at(-1);
  const ema50 = ema(closes, 50).at(-1);
  const ema200 = ema(closes, 200).at(-1);
  const currentRsi = rsi(closes);
  const histogram = macdHistogram(closes);
  const currentAtr = atr(candles);
  const prior = candles.slice(-(profile.range + 1), -1);
  const rangeHigh = Math.max(...prior.map((item) => item.high));
  const rangeLow = Math.min(...prior.map((item) => item.low));
  const averageVolume = candles.slice(-21, -1).reduce((sum, item) => sum + item.volume, 0) / 20;
  const volumePass = !profile.volumeRatio || latest.volume >= averageVolume * profile.volumeRatio;
  const candleRange = Math.max(latest.high - latest.low, Number.EPSILON);
  const closeLocation = (latest.close - latest.low) / candleRange;
  const longQuality = !profile.closeLocation || closeLocation >= profile.closeLocation;
  const shortQuality = !profile.closeLocation || closeLocation <= 1 - profile.closeLocation;
  const longMomentum = !profile.macdSlope || (histogram.at(-1) > 0 && histogram.at(-1) > histogram.at(-2));
  const shortMomentum = !profile.macdSlope || (histogram.at(-1) < 0 && histogram.at(-1) < histogram.at(-2));
  let longFourHour = true;
  let shortFourHour = true;
  if (profile.fourHour) {
    const higher = aggregateFourHour(candles);
    const higherCloses = higher.map((item) => item.close);
    const fast = ema(higherCloses, 50).at(-1);
    const slow = ema(higherCloses, 100).at(-1);
    const previousFast = ema(higherCloses, 50).at(-7);
    longFourHour = latest.close > fast && fast > slow && fast > previousFast;
    shortFourHour = latest.close < fast && fast < slow && fast < previousFast;
  }
  const long = latest.close > rangeHigh
    && latest.close > ema50 && ema50 > ema200 * (1 + profile.trendGap)
    && currentRsi <= profile.rsiLong && volumePass && longQuality && longMomentum && longFourHour;
  const short = latest.close < rangeLow
    && latest.close < ema50 && ema50 < ema200 * (1 - profile.trendGap)
    && currentRsi >= profile.rsiShort && volumePass && shortQuality && shortMomentum && shortFourHour;
  if (!long && !short) return null;
  return { action: long ? "LONG" : "SHORT", atr: currentAtr };
}

function metrics(returns) {
  const wins = returns.filter((value) => value > 0).length;
  const gains = returns.filter((value) => value > 0).reduce((sum, value) => sum + value, 0);
  const loss = Math.abs(returns.filter((value) => value <= 0).reduce((sum, value) => sum + value, 0));
  let equity = 0;
  let peak = 0;
  let maxDrawdown = 0;
  for (const value of returns) {
    equity += value;
    peak = Math.max(peak, equity);
    maxDrawdown = Math.max(maxDrawdown, peak - equity);
  }
  return {
    trades: returns.length,
    winRate: returns.length ? Number((wins / returns.length * 100).toFixed(2)) : 0,
    netR: Number(returns.reduce((sum, value) => sum + value, 0).toFixed(4)),
    profitFactor: Number((loss ? gains / loss : gains ? 99 : 0).toFixed(4)),
    maxDrawdownR: Number(maxDrawdown.toFixed(4)),
  };
}

function backtest(candles, profile) {
  const returns = [];
  let nextEligible = 420;
  for (let signalIndex = 420; signalIndex < candles.length - profile.maxHold - 1; signalIndex += 1) {
    if (signalIndex < nextEligible) continue;
    const setup = signal(candles.slice(0, signalIndex + 1), profile);
    if (!setup || setup.atr <= 0) continue;
    const entryIndex = signalIndex + 1;
    const entry = candles[entryIndex].open;
    const stopDistance = Math.max(setup.atr * profile.atrStop, entry * 0.004);
    const stop = setup.action === "LONG" ? entry - stopDistance : entry + stopDistance;
    const target = setup.action === "LONG" ? entry + stopDistance * profile.targetR : entry - stopDistance * profile.targetR;
    let grossR = 0;
    let exitIndex = Math.min(candles.length - 1, entryIndex + profile.maxHold);
    for (let index = entryIndex; index <= exitIndex; index += 1) {
      const candle = candles[index];
      const stopHit = setup.action === "LONG" ? candle.low <= stop : candle.high >= stop;
      const targetHit = setup.action === "LONG" ? candle.high >= target : candle.low <= target;
      if (stopHit) {
        grossR = -1;
        exitIndex = index;
        break;
      }
      if (targetHit) {
        grossR = profile.targetR;
        exitIndex = index;
        break;
      }
      if (index === exitIndex) {
        const directionalMove = setup.action === "LONG" ? candle.close - entry : entry - candle.close;
        grossR = Math.max(-1, Math.min(profile.targetR, directionalMove / stopDistance));
      }
    }
    returns.push(grossR - entry * roundTripCostRate / stopDistance);
    nextEligible = exitIndex + profile.cooldown;
  }
  return returns;
}

function evaluate(windows, profile) {
  const windowReturns = windows.map((candles) => backtest(candles, profile));
  return {
    ...metrics(windowReturns.flat()),
    positiveWindows: windowReturns.filter((values) => metrics(values).netR > 0).length,
    windows: windowReturns.length,
  };
}

function combinations(size, choose) {
  const output = [];
  function visit(start, selected) {
    if (selected.length === choose) {
      output.push([...selected]);
      return;
    }
    for (let index = start; index <= size - (choose - selected.length); index += 1) {
      selected.push(index);
      visit(index + 1, selected);
      selected.pop();
    }
  }
  visit(0, []);
  return output;
}

function probabilityOfBacktestOverfitting(windows) {
  const matrix = candidates.map((candidate) => windows.map((candles) => metrics(backtest(candles, candidate)).netR));
  const splits = combinations(windows.length, Math.floor(windows.length / 2));
  let belowMedian = 0;
  for (const inSampleIndexes of splits) {
    const inSample = new Set(inSampleIndexes);
    const inSampleScores = matrix.map((scores) => scores.reduce(
      (sum, score, index) => sum + (inSample.has(index) ? score : 0), 0,
    ));
    const selectedIndex = inSampleScores.indexOf(Math.max(...inSampleScores));
    const outOfSampleScores = matrix.map((scores) => scores.reduce(
      (sum, score, index) => sum + (!inSample.has(index) ? score : 0), 0,
    ));
    const selectedScore = outOfSampleScores[selectedIndex];
    const percentile = (outOfSampleScores.filter((score) => score < selectedScore).length + 0.5)
      / outOfSampleScores.length;
    if (percentile <= 0.5) belowMedian += 1;
  }
  return {
    splits: splits.length,
    probability: Number((belowMedian / Math.max(1, splits.length)).toFixed(4)),
  };
}

async function fetchWindows() {
  const latestCompletedHour = Math.floor(Date.now() / hourMs) * hourMs - 1;
  const newestFirst = await Promise.all(Array.from({ length: windowCount }, async (_, index) => {
    const endTime = latestCompletedHour - index * 1_000 * hourMs;
    const query = new URLSearchParams({ symbol, interval, limit: "1000", endTime: String(endTime) });
    const response = await fetch(`https://fapi.binance.com/fapi/v1/klines?${query}`, { signal: AbortSignal.timeout(45_000) });
    if (!response.ok) throw new Error(`Binance market data failed (${response.status})`);
    const rows = await response.json();
    return rows.map((row) => ({
      openTime: Number(row[0]), open: Number(row[1]), high: Number(row[2]), low: Number(row[3]),
      close: Number(row[4]), volume: Number(row[5]), closeTime: Number(row[6]),
    }));
  }));
  return newestFirst.reverse();
}

const windows = await fetchWindows();
if (phase === "select") {
  const training = windows.slice(0, 10);
  const validation = windows.slice(10, 15);
  const overfitting = probabilityOfBacktestOverfitting(windows.slice(0, 15));
  const rows = candidates.map((candidate) => {
    const train = evaluate(training, candidate);
    const validate = evaluate(validation, candidate);
    const robust = train.trades >= 20 && validate.trades >= 8
      && train.netR > 0 && validate.netR > 0
      && train.profitFactor >= 1.1 && validate.profitFactor >= 1.1
      && train.maxDrawdownR <= 6 && validate.maxDrawdownR <= 4
      && train.positiveWindows >= 6 && validate.positiveWindows >= 3;
    const score = robust ? validate.netR - validate.maxDrawdownR * 0.5 + Math.min(validate.profitFactor, 2) : -999;
    return { candidate: candidate.name, robust, score: Number(score.toFixed(4)), training: train, validation: validate };
  }).sort((left, right) => right.score - left.score);
  const robustWinner = rows.find((row) => row.robust)?.candidate || null;
  console.log(JSON.stringify({
    phase,
    overfitting,
    selected: overfitting.probability <= 0.2 ? robustWinner : null,
    rejectedWinner: overfitting.probability > 0.2 ? robustWinner : null,
    results: rows,
  }, null, 2));
} else if (phase === "holdout") {
  const candidate = candidates.find((item) => item.name === requestedCandidate);
  if (!candidate) throw new Error("Provide one exact candidate name for holdout evaluation");
  console.log(JSON.stringify({ phase, candidate: candidate.name, holdout: evaluate(windows.slice(15), candidate) }, null, 2));
} else {
  throw new Error("Phase must be select or holdout");
}
