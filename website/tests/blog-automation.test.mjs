import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = path.resolve(import.meta.dirname, "..");
const blogCalendarUrl = pathToFileURL(path.join(root, "lib/blog-calendar.ts")).href;
const blogDataUrl = pathToFileURL(path.join(root, "lib/blog-data.ts")).href;
const blogAutomationUrl = pathToFileURL(path.join(root, "worker/trading/blog-automation.ts")).href;
const adminUrl = pathToFileURL(path.join(root, "worker/trading/admin.ts")).href;

// Minimal in-memory D1 mock for blog engine testing
function createMockBlogD1() {
  const data = {
    blog_calendar: [],
    blog_articles: [],
    blog_automation_settings: [
      {
        id: 1,
        auto_publish_enabled: 0,
        publish_time_utc: "06:00",
        max_daily_posts: 1,
        model_name: "gemini-2.5-flash",
        last_run_date: null,
        last_run_status: "idle",
        last_error: null,
        updated_at: 1700000000,
      },
    ],
    blog_generation_logs: [],
    admin_audit_logs: [],
    trading_events: [],
  };

  const createStatement = (query, bound = []) => ({
    bind: (...args) => createStatement(query, args),
    first: async () => {
      const q = query.trim().toUpperCase();
      if (q.includes("SELECT COUNT(*) AS COUNT FROM BLOG_CALENDAR")) {
        return { count: data.blog_calendar.length };
      }
      if (q.includes("FROM BLOG_AUTOMATION_SETTINGS WHERE ID = 1")) {
        return data.blog_automation_settings[0] || null;
      }
      if (q.includes("FROM BLOG_CALENDAR WHERE SLUG = ?")) {
        const slug = bound[0];
        return data.blog_calendar.find((c) => c.slug === slug) || null;
      }
      if (q.includes("FROM BLOG_CALENDAR WHERE STATUS = 'SCHEDULED'")) {
        return data.blog_calendar.find((c) => c.status === "scheduled") || null;
      }
      if (q.includes("FROM BLOG_ARTICLES WHERE SLUG = ?")) {
        const slug = bound[0];
        return data.blog_articles.find((a) => a.slug === slug) || null;
      }
      if (q.includes("FROM BLOG_ARTICLES WHERE ID = ?")) {
        const id = bound[0];
        return data.blog_articles.find((a) => a.id === id) || null;
      }
      return null;
    },
    all: async () => {
      const q = query.trim().toUpperCase();
      if (q.includes("FROM BLOG_CALENDAR")) {
        return { results: [...data.blog_calendar] };
      }
      if (q.includes("FROM BLOG_ARTICLES")) {
        if (q.includes("WHERE STATUS = ?")) {
          const status = bound[0];
          return { results: data.blog_articles.filter((a) => a.status === status) };
        }
        return { results: [...data.blog_articles] };
      }
      if (q.includes("FROM BLOG_GENERATION_LOGS")) {
        return { results: [...data.blog_generation_logs] };
      }
      return { results: [] };
    },
    run: async () => {
      const q = query.trim().toUpperCase();
      if (q.includes("INSERT OR IGNORE INTO BLOG_CALENDAR") || q.includes("INSERT INTO BLOG_CALENDAR")) {
        data.blog_calendar.push({
          id: data.blog_calendar.length + 1,
          day_number: bound[0],
          scheduled_date: bound[1],
          category: bound[2],
          title: bound[3],
          slug: bound[4],
          target_keywords_json: bound[5],
          search_intent: bound[6],
          outline_json: bound[7],
          status: "scheduled",
          created_at: bound[8],
          updated_at: bound[9],
        });
      } else if (q.includes("INSERT INTO BLOG_ARTICLES")) {
        const newArt = {
          id: data.blog_articles.length + 1,
          calendar_id: bound[0],
          slug: bound[1],
          title: bound[2],
          description: bound[3],
          content: bound[4],
          category: bound[5],
          tags_json: bound[6],
          read_time_minutes: bound[7],
          status: bound[8],
          scheduled_date: bound[9],
          published_at: bound[10],
          updated_at: bound[11],
          created_at: bound[12],
        };
        data.blog_articles.push(newArt);
      } else if (q.includes("UPDATE BLOG_ARTICLES SET")) {
        if (q.includes("STATUS = 'PUBLISHED'")) {
          const id = bound[2]; // bind(nowIso, nowIso, articleId)
          const art = data.blog_articles.find((a) => a.id === id);
          if (art) {
            art.status = "published";
            art.published_at = bound[0];
            art.updated_at = bound[1];
          }
        }
      } else if (q.includes("UPDATE BLOG_CALENDAR SET STATUS = ?")) {
        const status = bound[0];
        const id = bound[2];
        const cal = data.blog_calendar.find((c) => c.id === id);
        if (cal) cal.status = status;
      } else if (q.includes("UPDATE BLOG_AUTOMATION_SETTINGS SET")) {
        if (q.includes("AUTO_PUBLISH_ENABLED = ?")) {
          data.blog_automation_settings[0].auto_publish_enabled = bound[0];
          data.blog_automation_settings[0].publish_time_utc = bound[1];
          data.blog_automation_settings[0].max_daily_posts = bound[2];
          data.blog_automation_settings[0].model_name = bound[3];
        } else if (q.includes("LAST_RUN_DATE = ?")) {
          data.blog_automation_settings[0].last_run_date = bound[0];
          data.blog_automation_settings[0].last_run_status = "success";
        }
      } else if (q.includes("INSERT INTO BLOG_GENERATION_LOGS")) {
        data.blog_generation_logs.push({
          id: data.blog_generation_logs.length + 1,
          run_date: bound[0],
          status: bound[1],
          slug: bound[2],
          details_json: bound[3],
          created_at: bound[4],
        });
      }
      return { meta: { changes: 1 } };
    },
  });

  return {
    prepare: (q) => createStatement(q),
    batch: async (statements) => {
      for (const stmt of statements) {
        await stmt.run();
      }
      return statements.map(() => ({ meta: { changes: 1 } }));
    },
    _data: data,
  };
}

test("30-day curriculum covers all 9 required editorial categories from 2026-10-18 to 2026-11-16", async () => {
  const { THIRTY_DAY_CALENDAR } = await import(blogCalendarUrl);

  assert.equal(THIRTY_DAY_CALENDAR.length, 30, "Must have exactly 30 scheduled daily topics");

  const requiredCategories = [
    "Crypto trading bots explained",
    "Automated trading workflows",
    "Binance Futures mechanics and risks",
    "Stop-loss and take-profit education",
    "Position sizing and risk management",
    "Trading bot security and API permissions",
    "Backtesting and strategy evaluation",
    "Manual vs automated trading",
    "Crypto market data and news analysis",
  ];

  const presentCategories = new Set(THIRTY_DAY_CALENDAR.map((t) => t.category));
  for (const cat of requiredCategories) {
    assert.ok(presentCategories.has(cat), `Curriculum must cover category: ${cat}`);
  }

  // Verify dates sequence
  assert.equal(THIRTY_DAY_CALENDAR[0].scheduledDate, "2026-10-18");
  assert.equal(THIRTY_DAY_CALENDAR[29].scheduledDate, "2026-11-16");

  // Verify schema of all entries
  for (const topic of THIRTY_DAY_CALENDAR) {
    assert.ok(topic.dayNumber >= 1 && topic.dayNumber <= 30);
    assert.ok(topic.title.length > 20);
    assert.ok(topic.slug.length > 10);
    assert.ok(["Informational", "Commercial", "Educational"].includes(topic.searchIntent));
    assert.ok(Array.isArray(topic.targetKeywords) && topic.targetKeywords.length >= 3);
    assert.ok(Array.isArray(topic.outline) && topic.outline.length >= 5);
    assert.ok(topic.focusSummary.length > 30);
  }
});

test("Day 1 article is statically published in lib/blog-data.ts with complete technical depth", async () => {
  const { BLOG_POSTS, getBlogPostBySlug } = await import(blogDataUrl);

  const day1Slug = "stop-loss-take-profit-placement-crypto-futures-bots-2026";
  const post = getBlogPostBySlug(day1Slug);

  assert.ok(post, "Day 1 article must be accessible via getBlogPostBySlug");
  assert.equal(post.slug, day1Slug);
  assert.equal(post.category, "Stop-loss and take-profit education");
  assert.ok(post.publishedAt.startsWith("2026-10-18"));

  // Word count check (typically 1,200 - 1,800 words)
  const words = post.content.split(/\s+/).filter(Boolean).length;
  assert.ok(words >= 1200, `Article word count must be >= 1200 words (actual: ${words})`);

  // Structural checks
  assert.ok(post.content.includes("# Stop-Loss and Take-Profit Placement"));
  assert.ok(post.content.includes("Quick-Answer Box (TL;DR for AI Search & Algorithmic Traders)"));
  assert.ok(post.content.includes("STOP_MARKET Order"));
  assert.ok(post.content.includes("STOP_LIMIT Order"));
  assert.ok(post.content.includes("Average True Range (ATR)"));
  assert.ok(post.content.includes("0.25% Equity Risk Rule"));
  assert.ok(post.content.includes("Frequently Asked Questions (FAQ)"));
  assert.ok(post.content.includes("Disclaimer:"));

  // Check sitemap contains the URL
  const sitemapContent = fs.readFileSync(path.join(root, "public/sitemap.xml"), "utf-8");
  assert.ok(
    sitemapContent.includes(`https://nexusbotai.pro/blog/${day1Slug}`),
    "Sitemap must include Day 1 article URL",
  );
});

test("blog automation engine initializes tables and seeds 30-day curriculum", async () => {
  const { ensureBlogTables, listBlogCalendar, getBlogAutomationSettings } = await import(blogAutomationUrl);
  const db = createMockBlogD1();

  await ensureBlogTables(db);

  const calendar = await listBlogCalendar(db);
  assert.equal(calendar.length, 30, "Mock DB must have 30 seeded calendar rows");
  assert.equal(calendar[0].slug, "stop-loss-take-profit-placement-crypto-futures-bots-2026");

  const settings = await getBlogAutomationSettings(db);
  assert.equal(settings.auto_publish_enabled, 0, "Default mode must be Draft Mode (auto_publish_enabled = 0)");
});

test("blog generation enqueues articles into Draft Mode (pending_approval) by default", async () => {
  const { ensureBlogTables, generateArticleForTopic, listBlogArticles, approveBlogArticle } = await import(blogAutomationUrl);
  const { THIRTY_DAY_CALENDAR } = await import(blogCalendarUrl);
  const db = createMockBlogD1();

  await ensureBlogTables(db);
  const topic = THIRTY_DAY_CALENDAR[0];

  const result = await generateArticleForTopic({ DB: db }, topic);
  assert.ok(result.ok, "Article generation must succeed");
  assert.ok(result.article);
  assert.equal(result.article.status, "pending_approval", "Default target status must be pending_approval");

  const articles = await listBlogArticles(db);
  assert.equal(articles.length, 1);
  assert.equal(articles[0].slug, topic.slug);
  assert.equal(articles[0].status, "pending_approval");

  // Admin approves article
  const approval = await approveBlogArticle(db, articles[0].id, "127.0.0.1");
  assert.ok(approval.ok);
  assert.equal(approval.article.status, "published");
  assert.ok(approval.article.published_at);
});

test("blog settings toggle allows enabling unattended auto-publishing", async () => {
  const { ensureBlogTables, updateBlogSettings, getBlogAutomationSettings } = await import(blogAutomationUrl);
  const db = createMockBlogD1();

  await ensureBlogTables(db);

  await updateBlogSettings(db, { autoPublishEnabled: true, publishTimeUtc: "08:00" });
  const updated = await getBlogAutomationSettings(db);

  assert.equal(updated.auto_publish_enabled, 1);
  assert.equal(updated.publish_time_utc, "08:00");
});

test("admin API endpoints expose blog calendar, articles, and approve routes with authentication", async () => {
  const { handleAdminRoute } = await import(adminUrl);
  const db = createMockBlogD1();
  const env = { DB: db, TRADING_ADMIN_TOKEN: "Pakistan@2026" };

  // 1. Unauthenticated request rejected
  const unauthReq = new Request("https://nexusbotai.pro/api/admin/blogs/calendar", {
    method: "GET",
  });
  const unauthRes = await handleAdminRoute(unauthReq, env);
  assert.equal(unauthRes.status, 401);

  // 2. Authenticated GET calendar
  const authCalReq = new Request("https://nexusbotai.pro/api/admin/blogs/calendar", {
    method: "GET",
    headers: { Authorization: "Bearer Pakistan@2026" },
  });
  const calRes = await handleAdminRoute(authCalReq, env);
  assert.equal(calRes.status, 200);
  const calJson = await calRes.json();
  assert.ok(calJson.ok);
  assert.ok(Array.isArray(calJson.calendar));

  // 3. Authenticated GET articles
  const authArtReq = new Request("https://nexusbotai.pro/api/admin/blogs/articles", {
    method: "GET",
    headers: { Authorization: "Bearer Pakistan@2026" },
  });
  const artRes = await handleAdminRoute(authArtReq, env);
  assert.equal(artRes.status, 200);
  const artJson = await artRes.json();
  assert.ok(artJson.ok);
  assert.ok(Array.isArray(artJson.articles));
});
