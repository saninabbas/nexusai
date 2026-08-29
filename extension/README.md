# Nexus Trader Extension 3.1.0

This test build supports paper trading and Binance Futures Testnet. Mainnet order execution is disabled.

## Install

1. Extract `Nexus-Trader-Extension.zip` to a folder.
2. Open `chrome://extensions` in Chrome or `edge://extensions` in Edge.
3. Enable Developer mode.
4. Choose **Load unpacked** and select the extracted folder.
5. Open the Nexus Trader dashboard, activate a licence, and start with Paper Trading.

## Connections and privacy

- Licence activation: `https://nexus-ai-trading-bot.local-sass.workers.dev/api`
- Market data: Binance Futures
- Test orders: Binance Futures Testnet only
- Binance API keys: stored in local extension storage and sent only to Binance Testnet
- Withdrawals: never enable withdrawal permissions on an API key

Trading is risky. The included strategies are deterministic technical rules and do not guarantee profit.
