import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getBlogPostBySlug } from "../../../lib/blog-data";
import { GITHUB_URL, OFFICIAL_SITE_URL } from "../../../lib/product";

interface PageProps {
  params: {
    slug: string;
  };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const post = getBlogPostBySlug(params.slug);
  if (!post) {
    return { title: "Post Not Found | Nexus Trader" };
  }

  const postUrl = `${OFFICIAL_SITE_URL}/blog/${post.slug}`;

  return {
    title: `${post.title} | Nexus Trader Blog`,
    description: post.description,
    alternates: { canonical: postUrl },
    openGraph: {
      title: post.title,
      description: post.description,
      url: postUrl,
      type: "article",
      publishedTime: post.publishedAt,
      modifiedTime: post.updatedAt,
      authors: [post.author.name],
      tags: post.tags,
    },
    twitter: {
      card: "summary_large_image",
      title: post.title,
      description: post.description,
    },
  };
}

export default function BlogPostDetailPage({ params }: PageProps) {
  const post = getBlogPostBySlug(params.slug);
  if (!post) {
    notFound();
  }

  const postUrl = `${OFFICIAL_SITE_URL}/blog/${post.slug}`;

  // Structured Data for Google Rich Snippets (Article & Breadcrumbs)
  const articleJsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    "headline": post.title,
    "description": post.description,
    "url": postUrl,
    "datePublished": post.publishedAt,
    "dateModified": post.updatedAt,
    "author": {
      "@type": "Person",
      "name": post.author.name,
      "jobTitle": post.author.role,
    },
    "publisher": {
      "@type": "Organization",
      "name": "Nexus Trader",
      "logo": {
        "@type": "ImageObject",
        "url": `${OFFICIAL_SITE_URL}/logo.png`,
      },
    },
    "mainEntityOfPage": {
      "@type": "WebPage",
      "@id": postUrl,
    },
  };

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      { "@type": "ListItem", "position": 1, "name": "Home", "item": OFFICIAL_SITE_URL },
      { "@type": "ListItem", "position": 2, "name": "Blog", "item": `${OFFICIAL_SITE_URL}/blog` },
      { "@type": "ListItem", "position": 3, "name": post.title, "item": postUrl },
    ],
  };

  return (
    <div style={{ background: "var(--paper, #f2f0e9)", color: "var(--black, #0b0d0c)", minHeight: "100vh" }}>
      {/* Schema.org Structured Data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />

      {/* Master Nav */}
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

      {/* Breadcrumbs & Header */}
      <header className="wrap" style={{ paddingTop: 48, paddingBottom: 32, maxWidth: 920 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 11, color: "#727771", marginBottom: 20 }}>
          <Link href="/" style={{ color: "#111", fontWeight: 700 }}>Home</Link>
          <span>/</span>
          <Link href="/blog" style={{ color: "#111", fontWeight: 700 }}>Blog</Link>
          <span>/</span>
          <span style={{ color: "#727771", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{post.title}</span>
        </div>

        <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 18, flexWrap: "wrap" }}>
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
          <span style={{ color: "#727771", fontSize: 11 }}>
            • Published {new Date(post.publishedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
          </span>
        </div>

        <h1 style={{ fontSize: "clamp(36px, 5vw, 56px)", fontWeight: 900, lineHeight: 1.05, letterSpacing: "-0.04em", margin: "0 0 20px" }}>
          {post.title}
        </h1>

        <p style={{ color: "#626762", fontSize: 16, lineHeight: 1.65, margin: "0 0 24px" }}>
          {post.description}
        </p>

        <div style={{ display: "flex", alignItems: "center", gap: 12, borderTop: "1px solid #d2d0c8", paddingTop: 16 }}>
          <div style={{ width: 34, height: 34, background: "#0b0d0c", color: "var(--lime)", display: "grid", placeItems: "center", fontWeight: 900, fontSize: 13 }}>N</div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 12, color: "#111" }}>{post.author.name}</div>
            <div style={{ color: "#727771", fontSize: 10 }}>{post.author.role}</div>
          </div>
        </div>
      </header>

      {/* Main Article Container */}
      <main className="wrap" style={{ paddingBottom: 80, maxWidth: 920 }}>
        <article
          style={{
            background: "#ffffff",
            border: "1px solid #111111",
            boxShadow: "14px 14px 0 #d9d7cf",
            padding: "clamp(24px, 5vw, 56px)",
            lineHeight: 1.8,
            fontSize: "1.05rem",
            color: "#222222",
          }}
        >
          {post.content.split("\n\n").map((paragraph, idx) => {
            const trimmed = paragraph.trim();
            if (!trimmed || trimmed.startsWith("# ")) {
              return null; // Skip main title
            }
            if (trimmed.startsWith("## ")) {
              return (
                <h2
                  key={idx}
                  style={{
                    fontSize: "1.65rem",
                    fontWeight: 900,
                    margin: "44px 0 16px",
                    lineHeight: 1.25,
                    letterSpacing: "-0.02em",
                    borderBottom: "1px solid #111",
                    paddingBottom: 8,
                    color: "#0b0d0c",
                  }}
                >
                  {trimmed.replace("## ", "")}
                </h2>
              );
            }
            if (trimmed.startsWith("### ")) {
              return (
                <h3
                  key={idx}
                  style={{
                    fontSize: "1.25rem",
                    fontWeight: 800,
                    margin: "28px 0 12px",
                    color: "#0b0d0c",
                  }}
                >
                  {trimmed.replace("### ", "")}
                </h3>
              );
            }
            if (trimmed.startsWith("> ")) {
              return (
                <blockquote
                  key={idx}
                  style={{
                    margin: "24px 0",
                    padding: "16px 20px",
                    background: "#f4f3ec",
                    borderLeft: "4px solid var(--lime)",
                    fontSize: "0.95rem",
                    lineHeight: 1.65,
                    color: "#333",
                  }}
                >
                  {trimmed.replace(/^>\s*/gm, "")}
                </blockquote>
              );
            }
            if (trimmed.startsWith("---")) {
              return <hr key={idx} style={{ border: "none", borderTop: "1px solid #d2d0c8", margin: "36px 0" }} />;
            }
            if (trimmed.startsWith("```")) {
              return (
                <pre
                  key={idx}
                  style={{
                    background: "#121513",
                    color: "var(--lime)",
                    border: "1px solid #111",
                    padding: "18px 20px",
                    fontFamily: "monospace",
                    fontSize: "0.85rem",
                    overflowX: "auto",
                    margin: "24px 0",
                  }}
                >
                  <code>{trimmed.replace(/```[a-z]*\n?/g, "")}</code>
                </pre>
              );
            }
            return (
              <p key={idx} style={{ marginBottom: 20 }}>
                {trimmed}
              </p>
            );
          })}

          {/* Tags */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "40px 0 0", paddingTop: 24, borderTop: "1px solid #d2d0c8" }}>
            {post.tags.map((tag) => (
              <span
                key={tag}
                style={{
                  background: "#f2f0e9",
                  color: "#0b0d0c",
                  border: "1px solid #111",
                  padding: "4px 10px",
                  fontSize: 10,
                  fontWeight: 800,
                }}
              >
                #{tag}
              </span>
            ))}
          </div>
        </article>

        {/* Bottom CTA Box matching Landing Page .install style */}
        <section
          style={{
            background: "var(--lime, #a8ff3e)",
            border: "1px solid #111",
            boxShadow: "14px 14px 0 #0b0d0c",
            padding: "40px 36px",
            display: "grid",
            gridTemplateColumns: "1fr 240px",
            gap: 28,
            alignItems: "center",
          }}
        >
          <div>
            <span style={{ fontSize: 9, fontWeight: 900, letterSpacing: "0.15em", textTransform: "uppercase" }}>
              AUTOMATED FUTURES EXECUTION
            </span>
            <h3 style={{ fontSize: "clamp(24px, 3.5vw, 36px)", fontWeight: 900, margin: "6px 0 10px", lineHeight: 1.1 }}>
              Start With 0.25% Equity Risk Controls.
            </h3>
            <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: "#222" }}>
              Nexus Trader browser extension combines deterministic mathematical indicators with search-grounded Gemini 3.7 news research.
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
                padding: "14px 24px",
                fontWeight: 900,
                fontSize: 11,
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
