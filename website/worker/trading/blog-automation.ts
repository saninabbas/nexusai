import { THIRTY_DAY_CALENDAR, type CalendarTopic } from "../../lib/blog-calendar";
import type { TradingEnv } from "./types";
import { recordAuditLog, recordEvent } from "./repository";

export interface BlogCalendarRow {
  id: number;
  day_number: number;
  scheduled_date: string;
  category: string;
  title: string;
  slug: string;
  target_keywords_json: string;
  search_intent: string;
  outline_json: string;
  status: "scheduled" | "pending_approval" | "published" | "failed";
  created_at: number;
  updated_at: number;
}

export interface BlogArticleRow {
  id: number;
  calendar_id: number | null;
  slug: string;
  title: string;
  description: string;
  content: string;
  category: string;
  tags_json: string;
  author_name: string;
  author_role: string;
  author_avatar: string;
  read_time_minutes: number;
  status: "draft" | "pending_approval" | "published" | "archived";
  scheduled_date: string | null;
  published_at: string | null;
  updated_at: string | null;
  admin_notes: string | null;
  created_at: number;
}

export interface BlogAutomationSettingsRow {
  id: number;
  auto_publish_enabled: number; // 0 = false (draft mode), 1 = true (unattended)
  publish_time_utc: string;
  max_daily_posts: number;
  model_name: string;
  last_run_date: string | null;
  last_run_status: string;
  last_error: string | null;
  updated_at: number;
}

export interface BlogGenerationLogRow {
  id: number;
  run_date: string;
  status: string;
  slug: string | null;
  details_json: string | null;
  created_at: number;
}

/**
 * Ensures blog tables are created in D1 and seeds the 30-day curriculum if empty.
 */
export async function ensureBlogTables(db: D1Database): Promise<void> {
  const now = Math.floor(Date.now() / 1_000);

  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS blog_calendar (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      day_number INTEGER NOT NULL,
      scheduled_date TEXT NOT NULL,
      category TEXT NOT NULL,
      title TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      target_keywords_json TEXT NOT NULL,
      search_intent TEXT NOT NULL,
      outline_json TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'scheduled',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS blog_calendar_date_idx ON blog_calendar(scheduled_date)"),
    db.prepare("CREATE INDEX IF NOT EXISTS blog_calendar_status_idx ON blog_calendar(status)"),

    db.prepare(`CREATE TABLE IF NOT EXISTS blog_articles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      calendar_id INTEGER,
      slug TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      content TEXT NOT NULL,
      category TEXT NOT NULL,
      tags_json TEXT NOT NULL,
      author_name TEXT NOT NULL DEFAULT 'Nexus Quantitative Research',
      author_role TEXT NOT NULL DEFAULT 'Lead Systems Architect',
      author_avatar TEXT NOT NULL DEFAULT '/logo.png',
      read_time_minutes INTEGER NOT NULL DEFAULT 8,
      status TEXT NOT NULL DEFAULT 'draft',
      scheduled_date TEXT,
      published_at TEXT,
      updated_at TEXT,
      admin_notes TEXT,
      created_at INTEGER NOT NULL
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS blog_articles_status_idx ON blog_articles(status)"),
    db.prepare("CREATE INDEX IF NOT EXISTS blog_articles_published_idx ON blog_articles(published_at)"),

    db.prepare(`CREATE TABLE IF NOT EXISTS blog_automation_settings (
      id INTEGER PRIMARY KEY,
      auto_publish_enabled INTEGER NOT NULL DEFAULT 0,
      publish_time_utc TEXT NOT NULL DEFAULT '06:00',
      max_daily_posts INTEGER NOT NULL DEFAULT 1,
      model_name TEXT NOT NULL DEFAULT 'gemini-2.5-flash',
      last_run_date TEXT,
      last_run_status TEXT NOT NULL DEFAULT 'idle',
      last_error TEXT,
      updated_at INTEGER NOT NULL
    )`),

    db.prepare(`CREATE TABLE IF NOT EXISTS blog_generation_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_date TEXT NOT NULL,
      status TEXT NOT NULL,
      slug TEXT,
      details_json TEXT,
      created_at INTEGER NOT NULL
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS blog_gen_logs_date_idx ON blog_generation_logs(run_date)"),
    db.prepare("CREATE INDEX IF NOT EXISTS blog_gen_logs_created_idx ON blog_generation_logs(created_at)"),

    db.prepare(`INSERT OR IGNORE INTO blog_automation_settings (
      id, auto_publish_enabled, publish_time_utc, max_daily_posts, model_name, last_run_status, updated_at
    ) VALUES (1, 0, '06:00', 1, 'gemini-2.5-flash', 'idle', ?)`).bind(now),
  ]);

  // Check if calendar already has rows
  const countRow = await db.prepare("SELECT count(*) as count FROM blog_calendar").first<{ count: number }>();
  if (!countRow || countRow.count === 0) {
    const seedStatements = THIRTY_DAY_CALENDAR.map((item) =>
      db.prepare(`INSERT OR IGNORE INTO blog_calendar (
        day_number, scheduled_date, category, title, slug, target_keywords_json,
        search_intent, outline_json, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'scheduled', ?, ?)`).bind(
        item.dayNumber,
        item.scheduledDate,
        item.category,
        item.title,
        item.slug,
        JSON.stringify(item.targetKeywords),
        item.searchIntent,
        JSON.stringify(item.outline),
        now,
        now,
      ),
    );

    // Insert in batches of 10 for D1 efficiency
    for (let i = 0; i < seedStatements.length; i += 10) {
      await db.batch(seedStatements.slice(i, i + 10));
    }
  }
}

/**
 * Returns the current automation configuration.
 */
export async function getBlogAutomationSettings(db: D1Database): Promise<BlogAutomationSettingsRow> {
  await ensureBlogTables(db);
  const row = await db.prepare("SELECT * FROM blog_automation_settings WHERE id = 1").first<BlogAutomationSettingsRow>();
  return row || {
    id: 1,
    auto_publish_enabled: 0,
    publish_time_utc: "06:00",
    max_daily_posts: 1,
    model_name: "gemini-2.5-flash",
    last_run_date: null,
    last_run_status: "idle",
    last_error: null,
    updated_at: Math.floor(Date.now() / 1_000),
  };
}

/**
 * Updates automation configuration (e.g. toggle auto_publish_enabled).
 */
export async function updateBlogSettings(
  db: D1Database,
  patch: {
    autoPublishEnabled?: boolean;
    publishTimeUtc?: string;
    maxDailyPosts?: number;
    modelName?: string;
  },
): Promise<BlogAutomationSettingsRow> {
  await ensureBlogTables(db);
  const current = await getBlogAutomationSettings(db);
  const now = Math.floor(Date.now() / 1_000);

  const updatedAutoPublish = patch.autoPublishEnabled !== undefined
    ? (patch.autoPublishEnabled ? 1 : 0)
    : current.auto_publish_enabled;
  const updatedTime = patch.publishTimeUtc ? patch.publishTimeUtc.slice(0, 10) : current.publish_time_utc;
  const updatedMaxPosts = patch.maxDailyPosts ? Math.max(1, Math.min(5, patch.maxDailyPosts)) : current.max_daily_posts;
  const updatedModel = patch.modelName ? patch.modelName.slice(0, 50) : current.model_name;

  await db.prepare(`UPDATE blog_automation_settings SET
    auto_publish_enabled = ?,
    publish_time_utc = ?,
    max_daily_posts = ?,
    model_name = ?,
    updated_at = ?
    WHERE id = 1
  `).bind(updatedAutoPublish, updatedTime, updatedMaxPosts, updatedModel, now).run();

  return getBlogAutomationSettings(db);
}

/**
 * Lists the 30-day curriculum with current progress.
 */
export async function listBlogCalendar(db: D1Database): Promise<BlogCalendarRow[]> {
  await ensureBlogTables(db);
  const rows = await db.prepare("SELECT * FROM blog_calendar ORDER BY day_number ASC").all<BlogCalendarRow>();
  return rows.results || [];
}

/**
 * Lists all generated articles, optionally filtering by status.
 */
export async function listBlogArticles(db: D1Database, status?: string): Promise<BlogArticleRow[]> {
  await ensureBlogTables(db);
  const query = status
    ? db.prepare("SELECT * FROM blog_articles WHERE status = ? ORDER BY created_at DESC").bind(status)
    : db.prepare("SELECT * FROM blog_articles ORDER BY created_at DESC");
  const rows = await query.all<BlogArticleRow>();
  return rows.results || [];
}

/**
 * Approves a draft/pending article and marks it published.
 */
export async function approveBlogArticle(
  db: D1Database,
  articleId: number,
  adminIp = "internal",
): Promise<{ ok: boolean; article?: BlogArticleRow; error?: string }> {
  await ensureBlogTables(db);
  const article = await db.prepare("SELECT * FROM blog_articles WHERE id = ?").bind(articleId).first<BlogArticleRow>();
  if (!article) return { ok: false, error: "Article not found" };

  const nowIso = new Date().toISOString();
  await db.prepare(`UPDATE blog_articles SET
    status = 'published',
    published_at = COALESCE(published_at, ?),
    updated_at = ?
    WHERE id = ?
  `).bind(nowIso, nowIso, articleId).run();

  if (article.calendar_id) {
    await db.prepare("UPDATE blog_calendar SET status = 'published', updated_at = ? WHERE id = ?")
      .bind(Math.floor(Date.now() / 1_000), article.calendar_id).run();
  }

  await recordAuditLog(db, {
    action: "BLOG_ARTICLE_APPROVED",
    category: "content_engine",
    details: { articleId, slug: article.slug, title: article.title },
    ip: adminIp,
  });

  const updated = await db.prepare("SELECT * FROM blog_articles WHERE id = ?").bind(articleId).first<BlogArticleRow>();
  return { ok: true, article: updated || undefined };
}

/**
 * Calls Gemini to generate a high quality, comprehensive, educational trading article.
 */
async function generateWithGemini(
  env: TradingEnv,
  topic: CalendarTopic,
): Promise<{ title: string; description: string; content: string; tags: string[]; readTimeMinutes: number } | null> {
  const apiKey = env.GEMINI_API_KEY?.trim();
  if (!apiKey) return null;

  const model = env.GEMINI_MODEL?.trim() || "gemini-2.5-flash";
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const prompt = `You are a world-class cryptocurrency market researcher, algorithmic systems architect, and responsible trading educator writing for NexusBotAI (https://nexusbotai.pro/).

Topic Details:
- Category: ${topic.category}
- Title: ${topic.title}
- Suggested Slug: ${topic.slug}
- Search Intent: ${topic.searchIntent}
- Target Primary & Secondary Keywords: ${topic.targetKeywords.join(", ")}
- Focus Summary: ${topic.focusSummary}
- Outline:
${topic.outline.map((o, idx) => `  ${idx + 1}. ${o}`).join("\n")}

Strict Requirements:
1. Write 1,400 to 1,800 words in clear, engaging, professional English.
2. Structured with:
   - Engaging introduction addressing the reader's real trading pain points.
   - Quick-Answer Box (TL;DR for AI Search & Algorithmic Traders).
   - Clear H2 and H3 headings covering each outline point in depth.
   - Comparison table or ASCII architecture flowchart.
   - Step-by-step technical instructions or setup checklists.
   - Mathematical formulas formatted in standard Markdown or LaTeX ($$...$$).
   - 4-5 Comprehensive FAQs with direct, actionable answers.
   - Risk Warning and Invalidation disclaimer.
3. Natural positioning for NexusBotAI / Nexus Trader ($30 lifetime license, local browser execution, exchange-native conditional bracket orders via HMAC-SHA256, 0.25% equity risk rule, zero monthly fees).
4. STRICT COMPLIANCE:
   - NEVER fabricate historical win rates (e.g. do not say "94% win rate guaranteed").
   - NEVER fabricate live crypto prices or promise guaranteed returns.
   - Always stress risk management, downside protection, and market invalidation.

Return a valid JSON object matching this schema:
{
  "title": "${topic.title}",
  "description": "Engaging 140-160 char meta description containing the primary keyword",
  "content": "Full markdown content starting with '# ${topic.title}'",
  "tags": ["Tag1", "Tag2", "Tag3", "Tag4", "Tag5"],
  "readTimeMinutes": 10
}`;

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 8192,
          responseMimeType: "application/json",
        },
      }),
    });

    if (!res.ok) return null;
    const data = await res.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) return null;

    const parsed = JSON.parse(rawText) as {
      title?: string;
      description?: string;
      content?: string;
      tags?: string[];
      readTimeMinutes?: number;
    };

    if (parsed.content && parsed.content.length > 1500) {
      return {
        title: parsed.title || topic.title,
        description: parsed.description || topic.focusSummary,
        content: parsed.content,
        tags: Array.isArray(parsed.tags) && parsed.tags.length > 0 ? parsed.tags : topic.targetKeywords,
        readTimeMinutes: parsed.readTimeMinutes || 9,
      };
    }
  } catch {
    // Falls back gracefully
  }

  return null;
}

/**
 * Deterministic educational article builder used when Gemini API is unavailable or in offline/test environments.
 * Follows all strict educational and risk parameters.
 */
function buildDeterministicArticle(topic: CalendarTopic): {
  title: string;
  description: string;
  content: string;
  tags: string[];
  readTimeMinutes: number;
} {
  const content = `# ${topic.title}

> **Quick-Answer Box (TL;DR for AI Search & Algorithmic Traders):**
> - **Core Educational Thesis:** ${topic.focusSummary}
> - **Primary Search Objective:** Mastering ${topic.targetKeywords[0]} allows cryptocurrency traders to deploy automated systems while preserving capital against sudden market liquidity shocks.
> - **Risk Management Standard:** Never risk more than **0.25% to 1.0%** of total account equity on any single automated cycle. Fixed percentage lot sizing must be calculated backward from your structural invalidation level.
> - **Execution Architecture:** Nexus Trader deploys exchange-native conditional bracket orders directly to Binance Futures using signed HMAC-SHA256 APIs with sub-150ms latency and zero middleman server risks.

---

Every serious cryptocurrency futures trader eventually confronts the mathematical reality of leveraged derivatives: having a profitable directional edge means nothing if your execution mechanics, risk management, and order architectures are vulnerable to slippage, liquidation cascades, or emotional overrides.

In this comprehensive guide, we dissect **${topic.title}**, walking through structural market mechanics, quantitative calculations, and production-tested checklists for automated systems in 2026.

---

## 1. ${topic.outline[0]}

Automating trading workflows requires understanding the quantitative boundaries of the market regime. Most retail trading failures stem from treating all market conditions identically:

1. **Consolidation & Mean Reversion:** During low-volatility compression regimes, prices oscillate between structural swing highs and lows. Entering without confirmed momentum expansion leads to repetitive false breakouts.
2. **Expansion & Trend Continuation:** When tick volume surges and moving average baselines (such as EMA50 and EMA200) diverge, the market shifts into an impulse state where counter-trend trades face severe adverse drift.
3. **Liquidation Cascades:** In leveraged crypto derivatives, sharp price moves are amplified by margin calls and forced liquidations in the order book. An algorithmic bot must identify these events and avoid entering into the teeth of an unhedged liquidation wick.

### Quantitative Discipline Over Emotional Discretion
Unlike human traders who frequently fall prey to fear of missing out (FOMO) or revenge trading after an invalidation, an automated execution engine enforces strictly deterministic rules. If the structural parameters are not met, the engine simply waits for the next high-confluence cycle.

---

## 2. ${topic.outline[1]}

| Parameter / Dimension | Traditional Retail Approach | Nexus Trader AI Architecture |
| :--- | :--- | :--- |
| **Strategy Formulation** | Intuitive / Emotional Discretion | Quantitative Multi-Indicator Confluence |
| **Risk Allocation** | Arbitrary Dollar or Fixed Lot Sizing | Strict 0.25% Equity Invalidation Model |
| **Execution Path** | Cloud Relay / Webhook Middleware | Direct Local Browser API (Zero Relay Latency) |
| **Circuit Breakers** | Manual Intervention Required | Automatic 5% Daily Loss Kill Switch |
| **News Filtering** | Lagging Twitter / Manual Feeds | Real-Time Gemini AI News Grounding |

### The Mechanics of Market Invalidation
When placing orders in crypto futures, invalidation is the price level at which your trading premise is statistically void. If you buy a breakout above resistance, your invalidation is not an arbitrary 2% drop—it is the exact level where price re-enters the prior consolidation range.

$$\\text{Position Size} = \\frac{\\text{Account Equity} \\times \\text{Risk Budget (0.25\\%)}}{\\Big| \\text{Entry Price} - \\text{Invalidation Price} \\Big|}$$

By calculating lot size backward from the invalidation distance, you ensure that every trade risks the exact same fraction of your portfolio regardless of volatility.

---

## 3. ${topic.outline[2]}

To structure a resilient automated setup, traders must calibrate volatility filters. One of the most effective tools is the **Average True Range (ATR)**:

- **True Range Calculation:**
  $$TR = \\max(High - Low, |High - Close_{prev}|, |Low - Close_{prev}|)$$
- **Volatility-Adjusted Brackets:**
  $$\\text{Dynamic Bracket} = k \\times \\text{ATR}_{14}$$
  *(where $k$ typically ranges between 1.5 and 2.5 depending on asset beta).*

During low-volatility regimes, the ATR narrows, allowing tighter invalidation brackets and larger precision lot sizes. During high-volatility events (such as macroeconomic rate announcements or network upgrades), the ATR expands, naturally widening your invalidation boundaries and reducing position size to keep dollar risk constant.

---

## 4. ${topic.outline[3]}

### Multi-Tier Profit Harvesting
Rather than attempting to close 100% of an open position at a single price target, production algorithms utilize staggered ladders:

1. **Target 1 (1.5R):** Realizes 50% of the position and automatically shifts the remaining stop to breakeven ($Entry + \\text{Fee Allowance}$).
2. **Target 2 (3.0R):** Realizes an additional 25% to lock in the bulk of the directional move.
3. **Runner (Trend Trailing):** The remaining 25% is managed with a dynamic ATR trailing stop to capture multi-day impulse expansions without prematurely capping profit potential.

---

## 5. ${topic.outline[4]}

### Exchange-Native Execution vs. Client-Side Monitoring
A common point of failure in amateur bots is relying on client-side code to "watch" the market price and dispatch a market order when a stop level is crossed.

If your local internet connection drops, the browser crashes, or the cloud host restarts, **your position is left unhedged on the exchange**.

**The Gold Standard:** Always submit exchange-native conditional bracket orders (\`STOP_MARKET\` with \`reduceOnly: true\`) immediately upon fill of the initial entry order. This guarantees that the exchange matching engine holds your protection order even if your client software goes completely offline.

---

## 6. ${topic.outline[5] || "Step-by-Step Implementation and Verification"}

Follow this operational checklist before deploying automated trading workflows:

1. [ ] **Verify API Permissions:** Ensure the API key has "Enable Futures" active, but **strictly disable withdrawal permissions**.
2. [ ] **Bind Working Type to Mark Price:** Prevent liquidations caused by temporary order book wicks.
3. [ ] **Calibrate Risk Budget:** Set the maximum risk per trade to 0.25%–0.50% of account equity.
4. [ ] **Enforce Daily Loss Limit:** Implement an automatic shutdown if daily drawdown hits 3%–5%.
5. [ ] **Paper-Trade Forward Validation:** Run the strategy in paper/testnet mode for at least 30 cycles before committing real funds.

---

## Frequently Asked Questions (FAQ)

### What is the most critical risk rule when running crypto trading bots?
The most critical rule is the 0.25% equity risk cap combined with an exchange-native stop-loss. No matter how confident you are in a technical signal, crypto markets can deliver 30%+ liquidation cascades within minutes. Never risk more than 0.25% to 1.0% of your total account balance on a single trade.

### Why do Webhook bots often fail during high volatility?
Webhook bots rely on multi-hop network chains: Charting Platform $\\rightarrow$ Webhook Dispatcher $\\rightarrow$ Relay Server $\\rightarrow$ Exchange API. During extreme volatility, alert queues experience backlogs of 2 to 8 seconds, and dropped HTTP packets can leave orders completely unhedged. Local, client-side bots like Nexus Trader eliminate relay middlemen and execute direct HMAC-SHA256 orders with sub-second latency.

### How does Nexus Trader differ from subscription-based cloud bots?
Nexus Trader is a one-time $30 lifetime software license that runs directly in your Chrome browser. It does not charge monthly subscription fees, does not store your private API keys on third-party cloud servers, and connects directly to your Binance Futures account.

### Can automated trading guarantee consistent daily profits?
No. Anyone promising guaranteed daily profits or "risk-free" crypto returns is promoting an unsustainable scheme. Automated trading provides disciplined execution, emotional neutrality, and strict risk containment; it cannot eliminate market risk.

---

*Disclaimer: Cryptocurrency futures trading involves substantial risk of loss and is not suitable for every investor. The educational strategies and formulas discussed here are for informational purposes only and do not constitute financial advice. Past backtests do not guarantee future live performance.*
`;

  return {
    title: topic.title,
    description: topic.focusSummary.slice(0, 160),
    content,
    tags: topic.targetKeywords,
    readTimeMinutes: 8,
  };
}

/**
 * Generates an article for a specific calendar topic, storing it in D1.
 */
export async function generateArticleForTopic(
  env: TradingEnv,
  topic: CalendarTopic,
  force = false,
  adminIp = "internal",
): Promise<{ ok: boolean; article?: BlogArticleRow; skipped?: boolean; error?: string }> {
  await ensureBlogTables(env.DB);
  const now = Math.floor(Date.now() / 1_000);
  const nowIso = new Date().toISOString();

  // Check if article already exists for this slug
  const existing = await env.DB.prepare("SELECT * FROM blog_articles WHERE slug = ?")
    .bind(topic.slug).first<BlogArticleRow>();
  if (existing && !force) {
    return { ok: true, article: existing, skipped: true };
  }

  // Get calendar row ID
  const calendarRow = await env.DB.prepare("SELECT id FROM blog_calendar WHERE slug = ?")
    .bind(topic.slug).first<{ id: number }>();
  const calendarId = calendarRow ? calendarRow.id : null;

  // Retrieve automation settings
  const settings = await getBlogAutomationSettings(env.DB);
  const shouldAutoPublish = Boolean(settings.auto_publish_enabled);
  const targetStatus = shouldAutoPublish ? "published" : "pending_approval";
  const publishedAt = shouldAutoPublish ? nowIso : null;

  try {
    // 1. Try Gemini first
    let articleData = await generateWithGemini(env, topic);

    // 2. Fall back to deterministic educational builder
    if (!articleData) {
      articleData = buildDeterministicArticle(topic);
    }

    if (existing) {
      // Update existing
      await env.DB.prepare(`UPDATE blog_articles SET
        title = ?,
        description = ?,
        content = ?,
        category = ?,
        tags_json = ?,
        read_time_minutes = ?,
        status = ?,
        published_at = COALESCE(published_at, ?),
        updated_at = ?
        WHERE id = ?
      `).bind(
        articleData.title,
        articleData.description,
        articleData.content,
        topic.category,
        JSON.stringify(articleData.tags),
        articleData.readTimeMinutes,
        targetStatus,
        publishedAt,
        nowIso,
        existing.id,
      ).run();
    } else {
      // Insert new
      await env.DB.prepare(`INSERT INTO blog_articles (
        calendar_id, slug, title, description, content, category, tags_json,
        author_name, author_role, author_avatar, read_time_minutes,
        status, scheduled_date, published_at, updated_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'Nexus Quantitative Research', 'Lead Systems Architect', '/logo.png', ?, ?, ?, ?, ?, ?)`).bind(
        calendarId,
        topic.slug,
        articleData.title,
        articleData.description,
        articleData.content,
        topic.category,
        JSON.stringify(articleData.tags),
        articleData.readTimeMinutes,
        targetStatus,
        topic.scheduledDate,
        publishedAt,
        nowIso,
        now,
      ).run();
    }

    // Update calendar status
    if (calendarId) {
      await env.DB.prepare("UPDATE blog_calendar SET status = ?, updated_at = ? WHERE id = ?")
        .bind(targetStatus, now, calendarId).run();
    }

    // Record generation log
    await env.DB.prepare(`INSERT INTO blog_generation_logs (
      run_date, status, slug, details_json, created_at
    ) VALUES (?, 'success', ?, ?, ?)`).bind(
      topic.scheduledDate,
      topic.slug,
      JSON.stringify({ autoPublished: shouldAutoPublish, words: articleData.content.split(/\s+/).length }),
      now,
    ).run();

    await recordEvent(env.DB, "info", "blog_article_generated", `Generated blog post: ${topic.title} (${targetStatus})`, undefined);

    const createdArticle = await env.DB.prepare("SELECT * FROM blog_articles WHERE slug = ?")
      .bind(topic.slug).first<BlogArticleRow>();

    return { ok: true, article: createdArticle || undefined };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Article generation failed";
    await env.DB.prepare(`INSERT INTO blog_generation_logs (
      run_date, status, slug, details_json, created_at
    ) VALUES (?, 'failed', ?, ?, ?)`).bind(
      topic.scheduledDate,
      topic.slug,
      JSON.stringify({ error: message }),
      now,
    ).run();

    await env.DB.prepare("UPDATE blog_automation_settings SET last_run_status = 'error', last_error = ?, updated_at = ? WHERE id = 1")
      .bind(message.slice(0, 300), now).run();

    return { ok: false, error: message };
  }
}

/**
 * Executes the daily scheduled blog automation cycle.
 * Invoked once per day via Cloudflare Workers cron.
 */
export async function runDailyBlogAutomation(
  env: TradingEnv,
  forceRun = false,
): Promise<{ ok: boolean; message: string; slug?: string }> {
  try {
    await ensureBlogTables(env.DB);
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const settings = await getBlogAutomationSettings(env.DB);

    // Duplicate check: if already ran today and not forced
    if (!forceRun && settings.last_run_date === today && settings.last_run_status === "success") {
      return { ok: true, message: `Daily blog automation already completed for ${today}` };
    }

    // Find topic for today, or next scheduled topic
    let topic = THIRTY_DAY_CALENDAR.find((t) => t.scheduledDate === today);
    if (!topic) {
      // Find earliest scheduled calendar row in D1
      const pendingRow = await env.DB.prepare("SELECT * FROM blog_calendar WHERE status = 'scheduled' ORDER BY day_number ASC LIMIT 1")
        .first<BlogCalendarRow>();
      if (pendingRow) {
        topic = THIRTY_DAY_CALENDAR.find((t) => t.slug === pendingRow.slug);
      }
    }

    if (!topic) {
      return { ok: true, message: "All 30 calendar topics have already been generated!" };
    }

    const result = await generateArticleForTopic(env, topic, forceRun);
    const now = Math.floor(Date.now() / 1_000);

    if (result.ok) {
      await env.DB.prepare(`UPDATE blog_automation_settings SET
        last_run_date = ?,
        last_run_status = 'success',
        last_error = NULL,
        updated_at = ?
        WHERE id = 1
      `).bind(today, now).run();

      return {
        ok: true,
        message: `Successfully generated article for ${topic.scheduledDate}: ${topic.title} (Status: ${result.article?.status})`,
        slug: topic.slug,
      };
    } else {
      return {
        ok: false,
        message: result.error || "Blog generation encountered an error",
      };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Scheduled blog automation crashed";
    return { ok: false, message };
  }
}

/**
 * On-demand generation triggered from admin dashboard.
 */
export async function generateArticleNow(
  env: TradingEnv,
  dayNumber?: number,
  adminIp = "internal",
): Promise<{ ok: boolean; message: string; article?: BlogArticleRow; error?: string }> {
  await ensureBlogTables(env.DB);

  let topic: CalendarTopic | undefined;
  if (dayNumber !== undefined) {
    topic = THIRTY_DAY_CALENDAR.find((t) => t.dayNumber === dayNumber);
  } else {
    const today = new Date().toISOString().slice(0, 10);
    topic = THIRTY_DAY_CALENDAR.find((t) => t.scheduledDate === today);
    if (!topic) {
      const nextPending = await env.DB.prepare("SELECT * FROM blog_calendar WHERE status = 'scheduled' ORDER BY day_number ASC LIMIT 1")
        .first<BlogCalendarRow>();
      if (nextPending) {
        topic = THIRTY_DAY_CALENDAR.find((t) => t.slug === nextPending.slug);
      }
    }
  }

  if (!topic) {
    return { ok: false, error: "Topic not found for specified day or date", message: "Failed" };
  }

  const result = await generateArticleForTopic(env, topic, true, adminIp);
  if (result.ok && result.article) {
    await recordAuditLog(env.DB, {
      action: "BLOG_ARTICLE_GENERATED_MANUALLY",
      category: "content_engine",
      details: { dayNumber: topic.dayNumber, slug: topic.slug, title: topic.title },
      ip: adminIp,
    });
    return {
      ok: true,
      message: `Generated: ${topic.title}`,
      article: result.article,
    };
  }

  return {
    ok: false,
    message: result.error || "Generation failed",
    error: result.error,
  };
}
