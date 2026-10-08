import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getBlogPostBySlug } from "../../../lib/blog-data";
import { OFFICIAL_SITE_URL } from "../../../lib/product";

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
    <div style={{ background: "#05070a", color: "#f3f4f6", minHeight: "100vh", fontFamily: "system-ui, -apple-system, sans-serif" }}>
      {/* Schema.org Structured Data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />

      {/* Header Nav */}
      <nav style={{ borderBottom: "1px solid rgba(255,255,255,0.08)", padding: "16px 24px", backdropFilter: "blur(12px)", position: "sticky", top: 0, zIndex: 50, background: "rgba(5,7,10,0.85)" }}>
        <div style={{ maxWidth: 1000, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Link href="/" style={{ color: "#fff", textDecoration: "none", fontWeight: 800, fontSize: "1.25rem", letterSpacing: "0.05em", display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ width: 28, height: 28, background: "#10b981", color: "#000", borderRadius: 6, display: "grid", placeItems: "center", fontWeight: 900, fontSize: "0.9rem" }}>N</span>
            NEXUS TRADER
          </Link>
          <div style={{ display: "flex", gap: 16, alignItems: "center", fontSize: "0.9rem" }}>
            <Link href="/blog" style={{ color: "#10b981", textDecoration: "none", fontWeight: 600 }}>← All Posts</Link>
            <Link href="/#pricing" style={{ background: "#10b981", color: "#000", padding: "8px 16px", borderRadius: 6, fontWeight: 700, textDecoration: "none" }}>Get Licence ↗</Link>
          </div>
        </div>
      </nav>

      {/* Article Header */}
      <header style={{ padding: "48px 24px 32px", borderBottom: "1px solid rgba(255,255,255,0.05)", background: "radial-gradient(circle at 50% 0%, rgba(16,185,129,0.06), transparent 70%)" }}>
        <div style={{ maxWidth: 800, margin: "0 auto" }}>
          <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 16 }}>
            <span style={{ background: "rgba(16,185,129,0.15)", color: "#10b981", padding: "4px 10px", borderRadius: 4, fontSize: "0.8rem", fontWeight: 700 }}>
              {post.category}
            </span>
            <span style={{ color: "#6b7280", fontSize: "0.85rem" }}>{post.readTimeMinutes} min read</span>
            <span style={{ color: "#6b7280", fontSize: "0.85rem" }}>• Published {new Date(post.publishedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
          </div>

          <h1 style={{ fontSize: "2.5rem", fontWeight: 900, lineHeight: 1.25, letterSpacing: "-0.02em", color: "#fff", marginBottom: 20 }}>
            {post.title}
          </h1>

          <p style={{ color: "#9ca3af", fontSize: "1.15rem", lineHeight: 1.6, marginBottom: 28 }}>
            {post.description}
          </p>

          <div style={{ display: "flex", alignItems: "center", gap: 12, borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: 20 }}>
            <div style={{ width: 40, height: 40, borderRadius: "50%", background: "#10b981", display: "grid", placeItems: "center", fontWeight: 900, color: "#000" }}>N</div>
            <div>
              <div style={{ color: "#fff", fontWeight: 700, fontSize: "0.95rem" }}>{post.author.name}</div>
              <div style={{ color: "#6b7280", fontSize: "0.8rem" }}>{post.author.role}</div>
            </div>
          </div>
        </div>
      </header>

      {/* Article Content */}
      <main style={{ maxWidth: 800, margin: "0 auto", padding: "40px 24px 64px" }}>
        <div
          style={{
            lineHeight: 1.8,
            fontSize: "1.05rem",
            color: "#d1d5db",
          }}
        >
          {post.content.split("\n\n").map((paragraph, idx) => {
            if (paragraph.startsWith("# ")) {
              return null; // Skip main title as rendered in header
            }
            if (paragraph.startsWith("## ")) {
              return <h2 key={idx} style={{ fontSize: "1.75rem", fontWeight: 800, color: "#fff", margin: "40px 0 16px", borderBottom: "1px solid rgba(255,255,255,0.08)", paddingBottom: 8 }}>{paragraph.replace("## ", "")}</h2>;
            }
            if (paragraph.startsWith("### ")) {
              return <h3 key={idx} style={{ fontSize: "1.35rem", fontWeight: 700, color: "#10b981", margin: "28px 0 12px" }}>{paragraph.replace("### ", "")}</h3>;
            }
            if (paragraph.startsWith("---")) {
              return <hr key={idx} style={{ border: "none", borderTop: "1px solid rgba(255,255,255,0.08)", margin: "32px 0" }} />;
            }
            return <p key={idx} style={{ marginBottom: 20 }}>{paragraph}</p>;
          })}
        </div>

        {/* Tags */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "40px 0", paddingTop: 24, borderTop: "1px solid rgba(255,255,255,0.08)" }}>
          {post.tags.map((tag) => (
            <span key={tag} style={{ background: "rgba(255,255,255,0.04)", color: "#9ca3af", border: "1px solid rgba(255,255,255,0.08)", padding: "4px 12px", borderRadius: 20, fontSize: "0.8rem" }}>
              #{tag}
            </span>
          ))}
        </div>

        {/* Bottom CTA Box */}
        <section style={{ padding: 32, borderRadius: 12, background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.25)", textAlign: "center" }}>
          <h3 style={{ fontSize: "1.5rem", fontWeight: 800, color: "#fff", marginBottom: 10 }}>Automate Your Futures Trading Today</h3>
          <p style={{ color: "#9ca3af", fontSize: "0.95rem", marginBottom: 20 }}>
            Get 30-day instant access to Nexus Trader Browser Extension with 0.25% equity risk controls and Gemini 3.7 news research.
          </p>
          <Link href="/#pricing" style={{ display: "inline-block", background: "#10b981", color: "#000", padding: "12px 24px", borderRadius: 6, fontWeight: 800, textDecoration: "none", fontSize: "0.95rem" }}>
            Get Licence Key ($30) ↗
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
