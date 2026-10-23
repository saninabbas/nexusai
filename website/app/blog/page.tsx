import type { Metadata } from "next";
import Link from "next/link";
import { getAllBlogPosts } from "../../lib/blog-data";
import { GITHUB_URL, OFFICIAL_SITE_URL } from "../../lib/product";

export const metadata: Metadata = {
  title: "Blog — AI Trading Insights & Binance Futures Strategies | Nexus Trader",
  description: "Read technical analysis guides, Gemini AI risk management tutorials, 0.25% equity risk sizing, and automated Binance Futures trading strategies.",
  alternates: { canonical: `${OFFICIAL_SITE_URL}/blog` },
  openGraph: {
    title: "Nexus Trader Blog — Algorithmic Trading & AI Risk Control",
    description: "Guides, strategies, and quantitative insights for automated Binance Futures trading.",
    url: `${OFFICIAL_SITE_URL}/blog`,
    type: "website",
  },
};

export default function BlogIndexPage() {
  const posts = getAllBlogPosts();

  return (
    <div style={{ background: "var(--paper, #f2f0e9)", color: "var(--black, #0b0d0c)", minHeight: "100vh" }}>
      {/* Master Brand Nav */}
      <nav className="nav wrap">
        <Link className="wordmark" href="/">
          <span>N</span>NEXUS TRADER
        </Link>
        <div className="nav-center">
          <Link href="/#platform">Platform</Link>
          <Link href="/#system">System</Link>
          <Link href="/#workflow">Workflow</Link>
          <Link href="/#research">Research</Link>
          <Link href="/#pricing">Pricing</Link>
          <Link href="/blog" style={{ color: "#000", fontWeight: 800 }}>Blog</Link>
          <Link href="/admin">Admin Console</Link>
          <Link href="/#safety">Safety</Link>
        </div>
        <Link className="mini-cta" href="/#pricing">Get licence ↗</Link>
      </nav>

      {/* Header Banner */}
      <header className="wrap" style={{ paddingTop: 64, paddingBottom: 48 }}>
        <div className="overline">
          <span /> QUANTITATIVE RESEARCH &amp; EDITORIAL
        </div>
        <h1 style={{ margin: "20px 0 24px", fontSize: "clamp(48px, 6vw, 84px)", lineHeight: 0.9, letterSpacing: "-0.06em" }}>
          Engineering &amp;<br />
          <i>Market Research.</i>
        </h1>
        <p style={{ maxWidth: 640, fontSize: 16, lineHeight: 1.7, color: "#626762", margin: 0 }}>
          Practical technical guides on Binance Futures automation, 0.25% equity risk models, completed-candle strategy filters, and Gemini 3.7 Flash search grounding.
        </p>
      </header>

      {/* Main Articles Grid */}
      <main className="wrap" style={{ paddingBottom: 96 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(350px, 1fr))", gap: 24 }}>
          {posts.map((post) => (
            <article
              key={post.slug}
              style={{
                background: "#ffffff",
                border: "1px solid #111111",
                boxShadow: "10px 10px 0 #d9d7cf",
                padding: 32,
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
              }}
            >
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                  <span
                    style={{
                      background: "var(--lime, #a8ff3e)",
                      color: "#0b0d0c",
                      border: "1px solid #111",
                      padding: "4px 8px",
                      fontSize: 9,
                      fontWeight: 900,
                      letterSpacing: "0.1em",
                      textTransform: "uppercase",
                    }}
                  >
                    {post.category}
                  </span>
                  <span style={{ color: "#727771", fontSize: 11, fontWeight: 700 }}>
                    {post.readTimeMinutes} min read
                  </span>
                </div>

                <h2 style={{ fontSize: 20, fontWeight: 800, margin: "14px 0 10px", lineHeight: 1.35, color: "#0b0d0c" }}>
                  <Link href={`/blog/${post.slug}`} style={{ color: "inherit", textDecoration: "none" }}>
                    {post.title}
                  </Link>
                </h2>

                <p style={{ color: "#626762", fontSize: 13, lineHeight: 1.65, marginBottom: 24 }}>
                  {post.description}
                </p>
              </div>

              <div
                style={{
                  borderTop: "1px solid #d2d0c8",
                  paddingTop: 16,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  fontSize: 11,
                }}
              >
                <div style={{ color: "#727771" }}>
                  By <strong style={{ color: "#111" }}>{post.author.name}</strong> •{" "}
                  {new Date(post.publishedAt).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </div>
                <Link
                  href={`/blog/${post.slug}`}
                  style={{
                    color: "#0b0d0c",
                    fontWeight: 900,
                    textDecoration: "none",
                    borderBottom: "1px solid #0b0d0c",
                  }}
                >
                  Read Article ↗
                </Link>
              </div>
            </article>
          ))}
        </div>

        {/* Bottom CTA Box matching Landing Page .install style */}
        <section
          style={{
            marginTop: 72,
            background: "var(--lime, #a8ff3e)",
            border: "1px solid #111",
            boxShadow: "14px 14px 0 #0b0d0c",
            padding: "48px 40px",
            display: "grid",
            gridTemplateColumns: "1fr 280px",
            gap: 32,
            alignItems: "center",
          }}
        >
          <div>
            <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: "0.15em", textTransform: "uppercase" }}>
              NEXUS PRO LICENSING
            </span>
            <h3 style={{ fontSize: "clamp(28px, 4vw, 42px)", fontWeight: 900, margin: "8px 0 12px", lineHeight: 1.05 }}>
              Command Your Trading Operations.
            </h3>
            <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: "#222" }}>
              Automate multi-pair scanning with hard 0.25% equity risk controls, exchange-native brackets, and Gemini 3.7 search grounding.
            </p>
          </div>
          <div style={{ textAlign: "right" }}>
            <Link
              href="/#pricing"
              className="solid"
              style={{
                display: "inline-block",
                background: "#0b0d0c",
                color: "#fff",
                padding: "16px 28px",
                fontWeight: 900,
                fontSize: 12,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              Get Licence ($30) ↗
            </Link>
          </div>
        </section>
      </main>

      {/* Master Footer */}
      <footer className="wrap">
        <div className="wordmark">
          <span>N</span>NEXUS TRADER
        </div>
        <p>Trading involves substantial risk. No strategy guarantees profit.</p>
        <div className="footer-links">
          <a href={GITHUB_URL} target="_blank" rel="noreferrer" aria-label="Nexus Trader on GitHub">
            GitHub ↗
          </a>
          <Link href="/blog">Blog</Link>
          <Link href="/admin">Admin Console</Link>
          <Link href="/#install">Extension</Link>
          <Link href="/#safety">Safety</Link>
          <small>© 2026 / NEXUS SYSTEMS</small>
        </div>
      </footer>
    </div>
  );
}
