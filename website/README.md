# Nexus Trader

Nexus Trader is the official website, payment-verification service, and licence API for the Nexus AI Binance Futures browser extension.

## What is included

- Responsive Nexus Trader product website
- Downloadable Chrome/Edge extension package
- On-chain USDT (BEP20) payment verification
- Automatic 30-day licence issuance
- One-device licence activation and validation
- Cloudflare D1-backed licence storage
- Guarded Binance Futures mainnet backend with exchange-native stop-loss and take-profit orders
- 24/7 Cloudflare Cron cycle with Gemini 3.7 Flash and Google Search-grounded market-risk research
- Recent-data walk-forward diagnostic that can veto live entries
- Automatic managed-position exits for the daily loss breaker, extreme fresh news risk, confirmed technical/news reversals, missing protection, and maximum holding time
- Reduce-only manual live close that preserves exchange protection until the close succeeds and cancels only Nexus-owned orders
- Binance permission verification that rejects API keys with withdrawals enabled or Futures disabled
- Entry-timeout reconciliation by Binance client order ID and persisted managed-position ownership
- Licence-authenticated customer status, connection and enable/disable controls
- AES-256-GCM encrypted Binance credentials isolated per customer
- Separate per-customer trading settings, runtime state and event history
- Automatic Cloudflare Workers deployment from GitHub

## Local development

Requirements:

- Node.js 22 or newer
- npm

Install and run:

```bash
npm ci
npm run dev
```

The local Cloudflare runtime uses a development D1 binding. Production data is never committed to this repository.

## Production deployment

The workflow in `.github/workflows/cloudflare.yml` deploys every push to `main` to Cloudflare Workers.

One-time Cloudflare setup:

1. Create a D1 database named `nexus-trader-licenses`.
2. In the GitHub repository settings, add these Actions secrets:
   - `CLOUDFLARE_ACCOUNT_ID`
   - `CLOUDFLARE_API_TOKEN`
   - `CLOUDFLARE_D1_DATABASE_ID`
3. Push to `main`, or start the workflow manually from the Actions tab.

The workflow builds the application, applies pending D1 migrations, and deploys the Worker. Cloudflare credentials must stay in GitHub Actions secrets and must never be committed to the repository.

The multi-client engine requires runtime secrets named `CUSTOMER_KEY_ENCRYPTION_KEY`, `GEMINI_API_KEY`, `TRADING_ADMIN_TOKEN`, `LIVE_TRADING_ALLOWED`, and `FORWARD_VALIDATION_APPROVED`. `CUSTOMER_KEY_ENCRYPTION_KEY` must be a base64-encoded 32-byte random value; `LIVE_TRADING_ALLOWED` must exactly equal `I_UNDERSTAND_REAL_MONEY_RISK`. `FORWARD_VALIDATION_APPROVED` must remain absent until paper-forward results are independently reviewed, then must exactly equal `PAPER_FORWARD_GATE_PASSED`. `GEMINI_MODEL` is optional and defaults to `gemini-3.7-flash`. Every customer's database setting is disabled by default and must be explicitly enabled through that customer's authenticated extension session after risk limits are reviewed.

## Useful commands

```bash
npm run build
npm test
npm run lint
npm run backtest:live
npm run research:strategy
npm run research:profit-lock
```

`research:strategy` compares a small, predeclared set of conservative candidates on older training and validation windows while withholding the three newest windows. It also estimates selection overfitting across combinatorial train/test partitions. A candidate is never promoted merely for a higher in-sample win rate; it must clear the overfitting ceiling, survive the untouched holdout and pass the production recent-regime veto.

`research:profit-lock` compares three predeclared exit-management policies against the unchanged 2R baseline. It selects on 15 older non-overlapping windows and reveals the three newest windows only after a candidate clears stricter win-rate, expectancy, profit-factor and drawdown requirements. Research output alone never changes production exits.

## Security

- Do not commit Binance, Gemini, GitHub, or Cloudflare credentials.
- Customer mainnet Binance credentials are encrypted per licence with AES-256-GCM before D1 storage.
- The extension submits mainnet credentials once over HTTPS, clears the fields, and never saves them in browser storage.
- Gemini and platform encryption credentials remain server-side runtime secrets.
- Use restricted Binance API keys with withdrawals disabled.
- Test on Binance Futures Testnet before enabling live trading.

## Risk notice

Futures trading can cause substantial losses. Nexus Trader is software, not financial advice, and does not guarantee profits or a 90% win rate. The default live profile risks 0.25% of equity per trade, uses up to 2x isolated leverage, and pauses at a 1% UTC-day equity drawdown; these controls reduce exposure but cannot eliminate loss.
