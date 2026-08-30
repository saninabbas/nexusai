# Nexus live strategy validation

Generated on 2026-08-29 from Binance USD-M Futures `BTCUSDT` public candles.

## Current walk-forward result

The guarded v4 strategy was evaluated on 12 non-overlapping windows of 1,000 one-hour candles (12,000 candles total, roughly 500 days):

| Metric | Result |
| --- | ---: |
| Simulated trades | 61 |
| Winning trades | 26 |
| Win rate | 42.62% |
| Net result | +6.2138R |
| Profit factor | 1.1684 |
| Maximum window drawdown | 5.3896R |
| Passing windows | 9 / 12 |

The current four-window live preflight also passed: 20 simulated trades, +2.0662R net, 1.1690 profit factor, 4.3584R maximum drawdown, and 3 of 4 passing windows.

## Method

- Signal: 40-candle breakout aligned with the EMA50/EMA200 trend, with an RSI guard.
- Entry: next candle open, avoiding same-candle signal look-ahead.
- Stop: 2.5 ATR, with a minimum 0.4% distance.
- Target: 2R.
- Maximum holding time: 96 hours.
- Cooldown: 32 hours after exit.
- Estimated round-trip fees and slippage: 0.12%.
- If stop and target are both touched in one candle, the stop is counted first.

## Boundaries

This is a diagnostic, not proof of future profit. It does not model funding, liquidation, API latency, spread spikes, exchange outages, tax, or every possible intrabar path. The AI/news veto is also not included in the historical result. The measured edge is modest, so the production engine re-runs a recent four-window diagnostic every six hours and blocks new live entries whenever it fails.

Run `npm run backtest:live` to reproduce the current 12-window report from fresh Binance data.
