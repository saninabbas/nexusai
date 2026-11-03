import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const blogDataPath = path.resolve(__dirname, '../lib/blog-data.ts');
const sitemapPath = path.resolve(__dirname, '../public/sitemap.xml');
const contentDir = path.resolve(__dirname, 'blog_content');

const day17Content = fs.readFileSync(path.join(contentDir, 'day17.md'), 'utf8');
const day16Content = fs.readFileSync(path.join(contentDir, 'day16.md'), 'utf8');
const day15Content = fs.readFileSync(path.join(contentDir, 'day15.md'), 'utf8');
const day14Content = fs.readFileSync(path.join(contentDir, 'day14.md'), 'utf8');

const posts = [
  {
    slug: "trailing-stop-loss-mechanics-crypto-futures-bots-2026",
    title: "Trailing Stop-Losses in Volatile Crypto Markets: Trailing Delta vs. Activation Price",
    description: "Master trailing stop-loss mechanics on crypto futures: activation prices, callback rates, trailing delta calculation, exchange-native vs synthetic trailing stops, and ATR volatility buffers.",
    category: "Stop-loss and take-profit education",
    tags: [
      "Trailing Stop Loss Crypto Futures",
      "Trailing Delta vs Callback Rate",
      "Activation Price Trailing Stop",
      "Locking Profits Crypto Bot",
      "Dynamic Trailing Stop Mechanics"
    ],
    author: {
      name: "Nexus Quantitative Research",
      role: "Lead Systems Architect",
      avatar: "/logo.png"
    },
    publishedAt: "2026-11-03T08:00:00Z",
    updatedAt: "2026-11-03T08:00:00Z",
    readTimeMinutes: 14,
    content: day17Content
  },
  {
    slug: "binance-api-rate-limits-weight-management-trading-bots-2026",
    title: "API Rate Limits and Weight Management on Binance Futures: How Bots Prevent 429 Bans",
    description: "In-depth engineering guide to managing Binance API request weights and order rate limits: preventing HTTP 429/418 bans, parsing X-MBX-USED-WEIGHT-1M headers, token bucket algorithms, and WebSocket migrations.",
    category: "Automated trading workflows",
    tags: [
      "Binance API Rate Limits",
      "IP Weight Management Crypto Bot",
      "HTTP 429 Too Many Requests Binance",
      "Exponential Backoff API Bot",
      "Optimizing API Call Frequency"
    ],
    author: {
      name: "Nexus Quantitative Research",
      role: "Lead Systems Architect",
      avatar: "/logo.png"
    },
    publishedAt: "2026-11-02T08:00:00Z",
    updatedAt: "2026-11-02T08:00:00Z",
    readTimeMinutes: 13,
    content: day16Content
  },
  {
    slug: "overcoming-emotional-burnout-crypto-trading-automation-2026",
    title: "Emotional Burnout in Crypto Trading: How Automation Enforces Systematic Discipline",
    description: "Discover the psychological science of crypto trading burnout, revenge trading, and loss aversion—and how deterministic algorithmic execution enforces systematic emotional discipline and protects capital.",
    category: "Manual vs automated trading",
    tags: [
      "Emotional Burnout Crypto Trading",
      "FOMO Revenge Trading Psychology",
      "Systematic Trading Discipline",
      "Psychological Benefits Trading Bot",
      "Crypto Trading Mental Health"
    ],
    author: {
      name: "Nexus Quantitative Research",
      role: "Lead Systems Architect",
      avatar: "/logo.png"
    },
    publishedAt: "2026-11-01T08:00:00Z",
    updatedAt: "2026-11-01T08:00:00Z",
    readTimeMinutes: 12,
    content: day15Content
  },
  {
    slug: "walk-forward-optimization-quantitative-crypto-strategies-2026",
    title: "Walk-Forward Optimization: How Quant Funds Test Robustness Before Deploying Capital",
    description: "Learn how quantitative crypto funds use Walk-Forward Optimization (WFO) to eliminate backtest curve-fitting, measure the Walk-Forward Efficiency (WFE) ratio, test parameter stability, and detect strategy decay.",
    category: "Backtesting and strategy evaluation",
    tags: [
      "Walk Forward Optimization Crypto",
      "Quantitative Trading Backtest Validation",
      "Rolling Window Analysis Bot",
      "Out of Sample Testing Crypto",
      "Strategy Robustness Testing"
    ],
    author: {
      name: "Nexus Quantitative Research",
      role: "Lead Systems Architect",
      avatar: "/logo.png"
    },
    publishedAt: "2026-10-31T08:00:00Z",
    updatedAt: "2026-10-31T08:00:00Z",
    readTimeMinutes: 15,
    content: day14Content
  }
];

// Check word counts
for (const p of posts) {
  const wordCount = p.content.split(/\s+/).filter(Boolean).length;
  console.log(`[WordCount] ${p.slug}: ${wordCount} words`);
  if (wordCount < 1400) {
    console.warn(`Warning: Word count for ${p.slug} is ${wordCount}`);
  }
}

// 1. Read existing blog-data.ts
const blogDataRaw = fs.readFileSync(blogDataPath, 'utf8');
const targetMarker = 'export const BLOG_POSTS: BlogPost[] = [\n';
const insertIndex = blogDataRaw.indexOf(targetMarker);

if (insertIndex === -1) {
  console.error("Could not find marker 'export const BLOG_POSTS: BlogPost[] = [\\n' in blog-data.ts");
  process.exit(1);
}

// Format each post cleanly with template string content
function formatPostCode(post) {
  // Properly escape backticks and ${ inside template literal
  const escapedContent = post.content
    .replace(/\\/g, '\\\\')
    .replace(/`/g, '\\`')
    .replace(/\${/g, '\\${');

  return `  {
    slug: ${JSON.stringify(post.slug)},
    title: ${JSON.stringify(post.title)},
    description: ${JSON.stringify(post.description)},
    category: ${JSON.stringify(post.category)},
    tags: ${JSON.stringify(post.tags, null, 6).replace(/\n/g, '\n    ')},
    author: {
      name: ${JSON.stringify(post.author.name)},
      role: ${JSON.stringify(post.author.role)},
      avatar: ${JSON.stringify(post.author.avatar)}
    },
    publishedAt: ${JSON.stringify(post.publishedAt)},
    updatedAt: ${JSON.stringify(post.updatedAt)},
    readTimeMinutes: ${post.readTimeMinutes},
    content: \`
${escapedContent}
\`
  },`;
}

const newPostsCode = posts.map(formatPostCode).join('\n') + '\n';
const updatedBlogData = blogDataRaw.slice(0, insertIndex + targetMarker.length) + newPostsCode + blogDataRaw.slice(insertIndex + targetMarker.length);

fs.writeFileSync(blogDataPath, updatedBlogData, 'utf8');
console.log('Successfully updated lib/blog-data.ts with Days 14, 15, 16, and 17!');

// 2. Update sitemap.xml
let sitemapRaw = fs.readFileSync(sitemapPath, 'utf8');

// Update lastmod for / and /blog to 2026-11-03
sitemapRaw = sitemapRaw.replace(
  /(<loc>https:\/\/nexusbotai\.pro\/<\/loc>\s*<lastmod>)[^<]+(<\/lastmod>)/,
  '$12026-11-03$2'
);
sitemapRaw = sitemapRaw.replace(
  /(<loc>https:\/\/nexusbotai\.pro\/blog<\/loc>\s*<lastmod>)[^<]+(<\/lastmod>)/,
  '$12026-11-03$2'
);

// New URL blocks to add after /blog URL block
const newSitemapUrls = `  <url>
    <loc>https://nexusbotai.pro/blog/trailing-stop-loss-mechanics-crypto-futures-bots-2026</loc>
    <lastmod>2026-11-03</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.95</priority>
  </url>
  <url>
    <loc>https://nexusbotai.pro/blog/binance-api-rate-limits-weight-management-trading-bots-2026</loc>
    <lastmod>2026-11-02</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.95</priority>
  </url>
  <url>
    <loc>https://nexusbotai.pro/blog/overcoming-emotional-burnout-crypto-trading-automation-2026</loc>
    <lastmod>2026-11-01</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.95</priority>
  </url>
  <url>
    <loc>https://nexusbotai.pro/blog/walk-forward-optimization-quantitative-crypto-strategies-2026</loc>
    <lastmod>2026-10-31</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.95</priority>
  </url>`;

const targetSitemapMarker = '<loc>https://nexusbotai.pro/blog/binance-futures-maintenance-margin-liquidation-calculation-2026</loc>';
if (sitemapRaw.includes(targetSitemapMarker)) {
  const urlIndex = sitemapRaw.indexOf('  <url>\n    <loc>https://nexusbotai.pro/blog/binance-futures-maintenance-margin');
  if (urlIndex !== -1) {
    sitemapRaw = sitemapRaw.slice(0, urlIndex) + newSitemapUrls + '\n' + sitemapRaw.slice(urlIndex);
    fs.writeFileSync(sitemapPath, sitemapRaw, 'utf8');
    console.log('Successfully updated public/sitemap.xml with 4 new blog post URLs and updated lastmod!');
  } else {
    console.warn('Could not locate exact url block in sitemap.xml');
  }
} else {
  console.warn('Target marker in sitemap.xml not found');
}
