import Link from "next/link";
import PaymentCard from "./payment-card";
import InteractiveWorkflow from "../components/interactive-workflow";
import { getAllBlogPosts } from "../lib/blog-data";
import { GITHUB_URL, OFFICIAL_SITE_URL, PRODUCT_VERSION } from "../lib/product";

const ribbons = ["AUTOMATED LICENSING", "POLAR PAYMENTS", "ONE-DEVICE ACCESS", "CHROME + EDGE"];

export default function Home(){
  const blogPosts = getAllBlogPosts();

  return <main>
  <script type="application/ld+json" dangerouslySetInnerHTML={{__html:JSON.stringify({"@context":"https://schema.org","@type":"SoftwareApplication",name:"Nexus Trader",softwareVersion:PRODUCT_VERSION,applicationCategory:"FinanceApplication",operatingSystem:"Chrome, Edge",description:"Paper and Binance Futures Testnet browser extension with isolated 24/7 mainnet execution and Gemini Search-grounded risk research for paid customers.",offers:{"@type":"Offer",price:"30",priceCurrency:"USD",description:"30-day device-bound licence paid via Polar (Cards, Apple Pay, Google Pay) or USDT"},url:OFFICIAL_SITE_URL})}}/>
  <nav className="nav wrap"><a className="wordmark" href="#top"><span>N</span>NEXUS TRADER</a><div className="nav-center"><a href="#platform">Platform</a><a href="#system">System</a><a href="#workflow">Workflow</a><a href="#research">Research</a><a href="#pricing">Pricing</a><Link href="/blog">Blog</Link><a href="/admin">Admin Console</a><a href="#safety">Safety</a></div><a className="mini-cta" href="#pricing">Get licence ↗</a></nav>
  <header className="hero wrap" id="top">
    <div className="hero-copy"><div className="overline"><span/> TRADING OPERATIONS, IN ONE EXTENSION</div><h1>Command your<br/><i>whole system.</i></h1><p>A focused Chrome and Edge control layer for paper trading, Binance Futures Testnet and an isolated 24/7 live account for every paid customer—with Gemini Search-grounded news checks and no mainnet keys retained in the extension.</p><div className="hero-actions"><a className="solid" href="#pricing">Pay &amp; download</a><a className="text-link" href="#pricing">Already paid? ↓</a></div><div className="compat"><b>VERSION {PRODUCT_VERSION}</b><span>Chrome Manifest V3</span><span>Microsoft Edge</span><span>Per-customer live control</span></div></div>
    <div className="terminal" aria-label="Nexus Trader product interface preview"><div className="terminal-top"><div className="terminal-brand"><span>N</span><div><b>NEXUS / OPERATIONS</b><small>FUTURES CONTROL SYSTEM</small></div></div><div className="live"><i/> SYSTEM READY</div></div><div className="terminal-body"><aside><small>WORKSPACE</small><b>Command desk</b><span>Strategies</span><span>Risk controls</span><span>Trade log</span><span>Connections</span><small>ENVIRONMENT</small><em>TESTNET FIRST</em></aside><section className="desk"><div className="desk-head"><div><small>ENGINE STATUS</small><strong>STANDBY <i>READY</i></strong></div><button>START ENGINE</button></div><div className="metrics"><div><small>RESEARCH</small><b className="green">GEMINI</b><span>24-hour news gate</span></div><div><small>POSITION RISK</small><b>0.25%</b><span>Default equity risk</span></div><div><small>CONNECTION</small><b>SECURE</b><span>Restricted keys</span></div></div><div className="control-grid"><div><small>TAKE PROFIT</small><b>Exchange native</b><i>RULE 01</i></div><div><small>STOP LOSS</small><b>Exchange native</b><i>RULE 02</i></div><div><small>EXECUTION</small><b>Guarded live</b><i>DEFAULT OFF</i></div><div><small>LOSS BREAKER</small><b>1% / day</b><i>AUTO PAUSE</i></div></div></section></div><div className="terminal-foot"><span>PAYMENT <b>VERIFIED</b></span><span>LICENCE 30 DAYS</span><span>DEVICE <b>BOUND</b></span></div></div>
  </header>
  <section className="marquee"><div>{ribbons.map(x=><span key={x}>{x}<i>✦</i></span>)}</div></section>
  <section className="product wrap" id="platform"><div className="section-intro"><span className="index">01 / PLATFORM</span><h2>More than a dashboard.<br/>A complete product loop.</h2><p>From payment to activation, every important step is connected. Customers receive a clear path while operations remain controlled.</p></div><div className="bento"><article className="wide"><div className="card-num">01 / CONTROL</div><h3>One operations desk</h3><p>Strategy, engine state, risk limits and connection status stay inside one structured extension interface.</p><div className="micro-ui"><span>ENGINE</span><b><i/> READY</b><em>CHROME + EDGE</em></div></article><article className="lime"><div className="card-num">02 / LICENSING</div><h3>Payment to key. Automatically.</h3><p>Confirmed Polar payments issue a time-limited licence without a manual handoff.</p><strong>30<small>D</small></strong></article><article><div className="card-num">03 / ACCESS</div><h3>One key. One device.</h3><p>Each transaction works once and the issued licence binds on first activation.</p><div className="mode-switch"><span>SHARED</span><b>BOUND</b></div></article></div></section>
  <section className="system" id="system"><div className="wrap"><div className="section-intro light"><span className="index">02 / SYSTEM</span><h2>Four layers.<br/>One guarded live loop.</h2><p>The server scans every minute, but trades only when completed-candle technical rules, fresh Gemini news research and recent walk-forward diagnostics all pass.</p></div><div className="system-grid"><article><b>01</b><h3>Scan</h3><p>BTCUSDT hourly trend and breakout rules use completed candles to avoid intrabar look-ahead.</p><span>1-MINUTE SERVER CRON</span></article><article><b>02</b><h3>Research</h3><p>Gemini 3.7 Flash checks the last 24 hours of market-moving news with cited Google Search sources.</p><span>FRESH NEWS GATE</span></article><article><b>03</b><h3>Protect</h3><p>Risk-sized isolated entries receive exchange-native stop-loss and take-profit orders immediately after fill.</p><span>0.25% DEFAULT RISK</span></article><article><b>04</b><h3>Exit</h3><p>Extreme news, confirmed reversals, the daily loss breaker and maximum hold can close a managed trade.</p><span>AUTOMATIC RISK EXITS</span></article></div></div></section>
  <section className="workflow-section wrap" id="workflow"><div className="section-intro"><span className="index">02.5 / ARCHITECTURE</span><h2>Visual Execution Topology.<br/>Inspect Every Decision.</h2><p>Watch how market feeds are sanitized, validated against quantitative indicators, cross-referenced with Gemini AI, sized with strict leverage caps, and protected by exchange-native conditional brackets.</p></div><InteractiveWorkflow/></section>
  <section className="research-section wrap" id="research" style={{ paddingBlock: 100 }}>
    <div className="section-intro">
      <span className="index">03 / RESEARCH</span>
      <h2>Daily Quantitative Research.<br />Transparent Market Logic.</h2>
      <p>Practical guides on Binance Futures automation, 0.25% equity risk models, completed-candle strategy filters, and Gemini 3.7 search grounding.</p>
    </div>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 24, marginTop: 48 }}>
      {blogPosts.slice(0, 3).map((post) => (
        <article
          key={post.slug}
          style={{
            background: "#ffffff",
            border: "1px solid #111111",
            boxShadow: "8px 8px 0 #d9d7cf",
            padding: 28,
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
          }}
        >
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <span
                style={{
                  background: "var(--lime, #a8ff3e)",
                  color: "#0b0d0c",
                  border: "1px solid #111",
                  padding: "3px 8px",
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
            <h3 style={{ fontSize: 18, fontWeight: 800, margin: "12px 0 10px", lineHeight: 1.35, color: "#0b0d0c" }}>
              <Link href={`/blog/${post.slug}`} style={{ color: "inherit", textDecoration: "none" }}>
                {post.title}
              </Link>
            </h3>
            <p style={{ color: "#626762", fontSize: 13, lineHeight: 1.6, marginBottom: 20 }}>
              {post.description}
            </p>
          </div>
          <div
            style={{
              borderTop: "1px solid #d2d0c8",
              paddingTop: 14,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              fontSize: 11,
            }}
          >
            <span style={{ color: "#727771" }}>
              {new Date(post.publishedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
            </span>
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
    <div style={{ marginTop: 36, display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid #d2d0c8", paddingTop: 24, flexWrap: "wrap", gap: 14 }}>
      <p style={{ margin: 0, fontSize: 13, color: "#626762" }}>
        New technical research articles published daily covering algorithmic systems, risk sizing, and exchange security.
      </p>
      <Link href="/blog" className="solid" style={{ fontSize: 11, padding: "14px 22px" }}>
        Explore All Editorial Articles ↗
      </Link>
    </div>
  </section>
  <section className="pricing" id="pricing"><div className="wrap pricing-grid"><div className="price-copy"><span className="index">04 / NEXUS PRO</span><h2>One plan.<br/>Instant issuance.</h2><p>Pay $30 via Polar using Card, Apple Pay, or Google Pay. Once completed, your 30-day licence key is issued instantly to unlock the extension download.</p><div className="price-tags"><span>$30 / 30 days</span><span>Cards &amp; Wallets</span><span>1 device activation</span></div><div className="trust-list"><p><b>✓</b>Download locked until payment</p><p><b>✓</b>Instant key issuance via Polar</p><p><b>✓</b>Licence key stored securely</p></div></div><PaymentCard/></div><div className="license-flow wrap"><div><b>01</b><span>Pay with Polar</span></div><i>→</i><div><b>02</b><span>Instant licence key</span></div><i>→</i><div><b>03</b><span>Unlock download</span></div><i>→</i><div><b>04</b><span>Install &amp; activate</span></div></div></section>
  <section className="safety wrap" id="safety"><div><span className="index">05 / RESPONSIBLE USE</span><h2>Control starts with boundaries.</h2><p className="safety-lead">Nexus is an execution interface—not a promise of returns. Configure deliberately and validate the complete flow before risking funds.</p></div><div className="safety-list"><p><b>01</b><span><strong>Every live account is isolated</strong>Each licence controls only its own encrypted Binance connection, trading settings, state and event history.</span></p><p><b>02</b><span><strong>Mainnet keys stay encrypted server-side</strong>The extension submits them once over HTTPS and does not retain or return them. Use a restricted Binance key with withdrawals disabled.</span></p><p><b>03</b><span><strong>Gemini is a risk gate—not a promise</strong>Search-grounded research can veto setups or trigger an extreme-risk exit, while size, leverage and daily-loss limits remain deterministic. No strategy guarantees profit or a 90% win rate.</span></p></div></section>
  <section className="install wrap" id="install"><span className="stamp">CHROME<br/>&amp; EDGE</span><div><span className="index">INSTALL IN THREE STEPS</span><h2>Download.<br/>Load. Activate.</h2><div className="install-steps"><span><b>01</b>Pay &amp; unlock ZIP</span><span><b>02</b>Load unpacked in Extensions</span><span><b>03</b>Enter your Nexus key</span></div></div><div className="install-action"><p>The extension download is protected. Complete payment or enter an active Nexus licence key to unlock it.</p><a href="#pricing">Pay &amp; unlock extension v{PRODUCT_VERSION} <b>↓</b></a><a href="#pricing">Already have a licence? <b>↗</b></a></div></section>
  <footer className="wrap"><div className="wordmark"><span>N</span>NEXUS TRADER</div><p>Trading involves substantial risk. No strategy guarantees profit.</p><div className="footer-links"><a href={GITHUB_URL} target="_blank" rel="noreferrer" aria-label="Nexus Trader on GitHub">GitHub ↗</a><Link href="/blog">Blog</Link><a href="/admin">Admin Console</a><a href="#install">Extension</a><a href="#safety">Safety</a><small>© 2026 / NEXUS SYSTEMS</small></div></footer>
</main>}

