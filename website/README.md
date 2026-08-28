# Nexus Trader

Nexus Trader is the official website, payment-verification service, and licence API for the Nexus AI Binance Futures browser extension.

## What is included

- Responsive Nexus Trader product website
- Downloadable Chrome/Edge extension package
- On-chain USDT (BEP20) payment verification
- Automatic 30-day licence issuance
- One-device licence activation and validation
- Cloudflare D1-backed licence storage
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

## Useful commands

```bash
npm run build
npm test
npm run lint
```

## Security

- Do not commit Binance, Gemini, GitHub, or Cloudflare credentials.
- Keep trading API credentials inside the extension's secure local settings.
- Use restricted Binance API keys with withdrawals disabled.
- Test on Binance Futures Testnet before enabling live trading.

## Risk notice

Futures trading can cause substantial losses. Nexus Trader is software, not financial advice, and does not guarantee profits.
