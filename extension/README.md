# Nexus Trader Extension 5.1.0

The local browser engine supports paper trading and Binance Futures Testnet. Each paid customer can connect one Binance Futures account in **My Live Account**. Mainnet credentials are encrypted per customer on the 24/7 backend and are never retained in extension storage.

## Install

1. Extract `Nexus-Trader-Extension.zip` to a folder.
2. Open `chrome://extensions` in Chrome or `edge://extensions` in Edge.
3. Enable Developer mode.
4. Choose **Load unpacked** and select the extracted folder.
5. Open the Nexus Trader dashboard, activate a licence, and start with Paper Trading.

## Connections and privacy

- Licence activation: `https://nexus-ai-trading-bot.local-sass.workers.dev/api`
- Customer live API: `https://nexus-ai-trading-bot.local-sass.workers.dev/api/customer`
- Market data: Binance Futures
- Test orders: Binance Futures Testnet only
- Testnet API keys: stored in local extension storage and sent only to Binance Testnet
- Mainnet API keys: submitted once over HTTPS, encrypted per customer on the backend, and never returned to the extension
- Withdrawals: the backend verifies that withdrawal permission is disabled before accepting a key
- Emergency control: CLOSE LIVE POSITION submits a reduce-only market exit only for the Nexus-tracked position

Only enter a mainnet Binance key in the dedicated **My Live Account** connection form. Never enable withdrawals. Real-money trading can lose funds and no result is guaranteed.
