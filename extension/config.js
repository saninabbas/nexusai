export const PRODUCT_VERSION = "3.1.0";
export const OFFICIAL_SITE_URL = "https://nexus-ai-trading-bot.local-sass.workers.dev";
export const API_BASE_URL = `${OFFICIAL_SITE_URL}/api`;

export const DEFAULT_SETTINGS = Object.freeze({
  symbol: "BTCUSDT",
  interval: "1m",
  strategy: "Auto Switch",
  mode: "paper",
  useTestnet: true,
  takeProfit: 3,
  stopLoss: 1.5,
  leverage: 5,
  risk: 1,
  paperBalance: 10000,
});

export const STORAGE_KEYS = Object.freeze([
  "apiKey",
  "apiSecret",
  "useTestnet",
  "savedSettings",
  "selectedStrategy",
  "licenseKey",
  "licenseExpiresAt",
  "deviceId",
  "botRunning",
  "stats",
  "activeTrade",
  "tradeHistory",
  "actionLogs",
]);

