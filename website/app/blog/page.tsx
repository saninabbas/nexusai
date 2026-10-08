import type { Metadata } from "next";
import Link from "next/link";
import { getAllBlogPosts } from "../../lib/blog-data";
import { OFFICIAL_SITE_URL } from "../../lib/product";

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
    <div style={{ background: "#05070a", color: "#f3f4f6", minHeight: "100vh", fontFamily: "system-ui, -apple-system, sans-serif" }}>
      {/* Header Nav */}
      <nav style={{ borderBottom: "1px solid rgba(255,255,255,0.08)", padding: "16px 24px", backdropFilter: "blur(12px)", position: "sticky", top: 0, zIndex: 50, background: "rgba(5,7,10,0.85)" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Link href="/" style={{ color: "#fff", textDecoration: "none", fontWeight: 800, fontSize: "1.25rem", letterSpacing: "0.05em", display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ width: 28, height: 28, background: "#10b981", color: "#000", borderRadius: 6, display: "grid", placeItems: "center", fontWeight: 900, fontSize: "0.9rem" }}>N</span>
            NEXUS TRADER <span style={{ fontSize: "0.75rem", color: "#10b981", background: "rgba(16,185,129,0.15)", padding: "2px 8px", borderRadius: 4, border: "1px solid rgba(16,185,129,0.3)" }}>BLOG</span>
          </Link>
          <div style={{ display: "flex", gap: 20, alignItems: "center", fontSize: "0.9rem" }}>
            <Link href="/" style={{ color: "#9ca3af", textDecoration: "none" }}>Platform</Link>
            <Link href="/blog" style={{ color: "#10b981", textDecoration: "none", fontWeight: 600 }}>Blog</Link>
            <Link href="/#pricing" style={{ background: "#10b981", color: "#000", padding: "8px 16px", borderRadius: 6, fontWeight: 700, textDecoration: "none" }}>Get Licence ↗</Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <header style={{ padding: "60px 24px 40px", textAlign: "center", borderBottom: "1px solid rgba(255,255,255,0.05)", background: "radial-gradient(circle at 50% 0%, rgba(16,185,129,0.08), transparent 70%)" }}>
        <div style={{ maxWidth: 800, margin: "0 auto" }}>
          <span style={{ color: "#10b981", fontSize: "0.85rem", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase" }}>QUANTITATIVE RESEARCH & TUTORIALS</span>
          <h1 style={{ fontSize: "2.75rem", fontWeight: 900, margin: "16px 0", letterSpacing: "-0.02em", lineHeight: 1.2 }}>
            Master Automated Futures Trading & <span style={{ color: "#10b981" }}>AI Risk Gates</span>
          </h1>
          <p style={{ color: "#9ca3af", fontSize: "1.1rem", lineHeight: 1.6 }}>
            In-depth guides on Binance Futures automation, Freqtrade confluence indicators, Gemini 3.7 news research, and 0.25% equity risk sizing.
          </p>
        </div>
      </header>

      {/* Main Grid */}
      <main style={{ maxWidth: 1200, margin: "0 auto", padding: "48px 24px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 28 }}>
          {posts.map((post) => (
            <article
              key={post.slug}
              style={{
                background: "rgba(255,255,255,0.02)",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 12,
                padding: 24,
                display: "flex",
                flexDirection: "column",
                justify: "space-between",
                transition: "all 0.2s ease",
              }}
            >
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <span style={{ background: "rgba(16,185,129,0.12)", color: "#10b981", padding: "4px 10px", borderRadius: 4, fontSize: "0.75rem", fontWeight: 700 }}>
                    {post.category}
                  </span>
                  <span style={{ color: "#6b7280", fontSize: "0.8rem" }}>{post.readTimeMinutes} min read</span>
                </div>
                <h2 style={{ fontSize: "1.35rem", fontWeight: 800, margin: "10px 0 12px", lineHeight: 1.35 }}>
                  <Link href={`/blog/${post.slug}`} style={{ color: "#fff", textDecoration: "none" }}>
                    {post.title}
                  </Link>
                </h2>
                <p style={{ color: "#9ca3af", fontSize: "0.95rem", lineHeight: 1.55, marginBottom: 20 }}>
                  {post.description}
                </p>
              </div>

              <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontSize: "0.8rem", color: "#6b7280" }}>
                  By <strong style={{ color: "#d1d5db" }}>{post.author.name}</strong> • {new Date(post.publishedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                </div>
                <Link
                  href={`/blog/${post.slug}`}
                  style={{ color: "#10b981", fontWeight: 700, fontSize: "0.85rem", textDecoration: "none", display: "flex", alignItems: "center", gap: 4 }}
                >
                  Read Article ↗
                </Link>
              </div>
            </article>
          ))}
        </div>

        {/* CTA Banner */}
        <section style={{ marginTop: 64, padding: 40, borderRadius: 16, background: "linear-gradient(135deg, rgba(16,185,129,0.15), rgba(5,7,10,0.95))", border: "1px solid rgba(16,185,129,0.3)", textAlign: "center" }}>
          <h2 style={{ fontSize: "2rem", fontWeight: 900, marginBottom: 12 }}>Ready to Command Your Trading Operations?</h2>
          <p style={{ color: "#9ca3af", maxWidth: 600, margin: "0 auto 24px", fontSize: "1.05rem" }}>
            Experience 100% browser-native Binance Futures controls with automated multi-pair scanning and 0.25% equity risk guardrails.
          </p>
          <Link href="/#pricing" style={{ display: "inline-block", background: "#10b981", color: "#000", padding: "14px 28px", borderRadius: 8, fontWeight: 800, textDecoration: "none", fontSize: "1rem", letterSpacing: "0.02em" }}>
            💳 Get PRO Licence Key ($30) ↗
          </Link>
        </section>
      </main>

      {/* Footer */}
      <footer style={{ borderTop: "1px solid rgba(255,255,255,0.08)", padding: "32px 24px", textAlign: "center", color: "#6b7280", fontSize: "0.85rem" }}>
        <p>© 2026 NEXUS TRADER. Trading involves risk. No strategy guarantees profit.</p>
      </footer>
    </div>
  );
}
