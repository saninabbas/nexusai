function average(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function ema(values, period) {
  if (!values.length) return [];
  const multiplier = 2 / (period + 1);
  const output = [values[0]];
  for (let index = 1; index < values.length; index += 1) {
    output.push((values[index] - output[index - 1]) * multiplier + output[index - 1]);
  }
  return output;
}

export function rsi(values, period = 14) {
  if (values.length <= period) return 50;
  const changes = values.slice(-period - 1).slice(1).map((value, index) => value - values.slice(-period - 1)[index]);
  const gains = changes.map((change) => Math.max(0, change));
  const losses = changes.map((change) => Math.max(0, -change));
  const averageGain = average(gains);
  const averageLoss = average(losses);
  if (averageGain === 0 && averageLoss === 0) return 50;
  if (averageLoss === 0) return 100;
  if (averageGain === 0) return 0;
  const relativeStrength = averageGain / averageLoss;
  return 100 - (100 / (1 + relativeStrength));
}

export function macd(values) {
  const fast = ema(values, 12);
  const slow = ema(values, 26);
  const line = values.map((_, index) => fast[index] - slow[index]);
  const signal = ema(line, 9);
  const last = line.length - 1;
  return { line: line[last] || 0, signal: signal[last] || 0, histogram: (line[last] || 0) - (signal[last] || 0) };
}

export function sanitizeCandles(candlesInput, options = {}) {
  if (!Array.isArray(candlesInput)) return [];
  const now = options.currentTime ?? Date.now();
  const normalized = [];

  for (const candle of candlesInput) {
    if (!candle) continue;
    const open = Number(candle.open ?? candle[1]);
    const high = Number(candle.high ?? candle[2]);
    const low = Number(candle.low ?? candle[3]);
    const close = Number(candle.close ?? candle[4]);
    const openTime = Number(candle.openTime ?? candle[0] ?? 0);
    const closeTime = Number(candle.closeTime ?? candle[6] ?? now);
    const volume = Number(candle.volume ?? candle[5] ?? 0);

    if (
      !Number.isFinite(open) || open <= 0 ||
      !Number.isFinite(high) || high <= 0 ||
      !Number.isFinite(low) || low <= 0 ||
      !Number.isFinite(close) || close <= 0 ||
      high < low || high < open || high < close || low > open || low > close
    ) {
      continue;
    }

    // Filter uncompleted / forming candles if requireClosed is enabled
    if (options.requireClosed && closeTime > now) {
      continue;
    }

    normalized.push({ open, high, low, close, openTime, closeTime, volume });
  }

  // Sort chronologically ascending
  normalized.sort((a, b) => (a.openTime || a.closeTime) - (b.openTime || b.closeTime));

  // Deduplicate timestamps
  const deduplicated = [];
  for (const candle of normalized) {
    const last = deduplicated.at(-1);
    if (last && (
      (candle.openTime && last.openTime === candle.openTime) ||
      (candle.closeTime && last.closeTime === candle.closeTime)
    )) {
      deduplicated[deduplicated.length - 1] = candle;
    } else {
      deduplicated.push(candle);
    }
  }

  return deduplicated;
}

export function evaluateStrategy(candlesInput, requestedStrategy = "Auto Switch", options = {}) {
  const candles = sanitizeCandles(candlesInput, options);
  if (candles.length < 35) return { action: "WAIT", confidence: 0, reason: "Not enough market data" };

  const closes = candles.map((candle) => candle.close);
  const latest = candles.at(-1);
  const previous = candles.at(-2) || latest;
  const ema9 = ema(closes, 9).at(-1);
  const ema21 = ema(closes, 21).at(-1);
  const previousEma9 = ema(closes.slice(0, -1), 9).at(-1);
  const previousEma21 = ema(closes.slice(0, -1), 21).at(-1);
  const rsi14 = rsi(closes, 14);
  const macdValue = macd(closes);
  const range = candles.slice(-21, -1);
  const rangeHigh = range.length ? Math.max(...range.map((candle) => candle.high)) : latest.high;
  const rangeLow = range.length ? Math.min(...range.map((candle) => candle.low)) : latest.low;

  const macdBullish = macdValue.histogram > 0 && macdValue.line > macdValue.signal;
  const macdBearish = macdValue.histogram < 0 && macdValue.line < macdValue.signal;

  const signals = {
    "RSI + EMA": rsi14 <= 38 && latest.close > ema21 ? 2 : rsi14 >= 62 && latest.close < ema21 ? -2 : 0,
    MACD: macdBullish ? 2 : macdBearish ? -2 : 0,
    Breakout: latest.close > rangeHigh ? 3 : latest.close < rangeLow ? -3 : 0,
    Scalping: previousEma9 <= previousEma21 && ema9 > ema21 ? 2 : previousEma9 >= previousEma21 && ema9 < ema21 ? -2 : 0,
  };

  let strategy = requestedStrategy;
  let score = signals[requestedStrategy] ?? 0;
  if (requestedStrategy === "Deep AI" || requestedStrategy === "Auto Switch") {
    // Composite multi-indicator score
    score = (
      (rsi14 <= 38 && latest.close > ema21 ? 2 : rsi14 >= 62 && latest.close < ema21 ? -2 : 0) +
      (macdBullish ? 1 : macdBearish ? -1 : 0) +
      (latest.close > rangeHigh ? 3 : latest.close < rangeLow ? -3 : 0) +
      (previousEma9 <= previousEma21 && ema9 > ema21 ? 2 : previousEma9 >= previousEma21 && ema9 < ema21 ? -2 : 0)
    );
    strategy = "Auto Switch";
  }

  const action = score >= 2 ? "LONG" : score <= -2 ? "SHORT" : "WAIT";
  const confidence = Math.min(95, Math.round(50 + Math.abs(score) * 8));
  return {
    action,
    confidence: action === "WAIT" ? Math.min(49, confidence) : confidence,
    strategy,
    price: latest.close,
    closeTime: latest.closeTime,
    indicators: {
      rsi: Number(rsi14.toFixed(2)),
      ema9: Number(ema9.toFixed(4)),
      ema21: Number(ema21.toFixed(4)),
      macdHistogram: Number(macdValue.histogram.toFixed(6)),
      previousClose: previous.close,
    },
    reason: action === "WAIT" ? "No confirmed setup" : `${strategy} produced a ${action.toLowerCase()} setup`,
  };
}
