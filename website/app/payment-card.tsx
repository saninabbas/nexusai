"use client";

import { useState } from "react";
import { EXTENSION_DOWNLOAD_PATH, OFFICIAL_SITE_URL, PRODUCT_VERSION } from "../lib/product";

const address = "0x9d35215728112c055c8d2472560d7e3ec58df135";
const POLAR_CHECKOUT_URL = "https://buy.polar.sh/products/55865f2f-b573-449f-9919-695be4e9f73a";

export default function PaymentCard() {
  const [copied, setCopied] = useState(false);
  const [emailQuery, setEmailQuery] = useState("");
  const [status, setStatus] = useState("");
  const [licenseKey, setLicenseKey] = useState("");
  const [existingKey, setExistingKey] = useState("");
  const [checking, setChecking] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadStatus, setDownloadStatus] = useState("");
  const [downloadOk, setDownloadOk] = useState(false);
  const [showBsc, setShowBsc] = useState(false);
  const [txHash, setTxHash] = useState("");
  const [bscStatus, setBscStatus] = useState("");
  const [bscChecking, setBscChecking] = useState(false);

  async function copyAddress() {
    await navigator.clipboard.writeText(address);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  async function retrievePolarKey() {
    const q = emailQuery.trim();
    if (!q) {
      setStatus("Please enter your Polar email address or Order ID.");
      return;
    }
    setChecking(true);
    setStatus("Looking up your Polar purchase…");
    setLicenseKey("");
    try {
      const response = await fetch(`${OFFICIAL_SITE_URL}/api/polar-key`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q }),
      });
      const data = await response.json() as { error?: string; licenseKey?: string; expiresAt?: number };
      if (!response.ok) throw new Error(data.error || "Purchase could not be found.");
      setLicenseKey(data.licenseKey || "");
      setStatus(`Verified! License valid until ${new Date((data.expiresAt || 0) * 1000).toLocaleDateString()}.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Lookup failed. Please check your email or order ID.");
    } finally {
      setChecking(false);
    }
  }

  async function verifyBscPayment() {
    setBscChecking(true);
    setBscStatus("Checking payment on BNB Smart Chain…");
    try {
      const response = await fetch(`${OFFICIAL_SITE_URL}/api/payments/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ txHash: txHash.trim() }),
      });
      const data = await response.json() as { error?: string; licenseKey?: string; expiresAt?: number };
      if (!response.ok) throw new Error(data.error || "Payment could not be verified.");
      setLicenseKey(data.licenseKey || "");
      setBscStatus(`Verified! License valid until ${new Date((data.expiresAt || 0) * 1000).toLocaleDateString()}.`);
    } catch (error) {
      setBscStatus(error instanceof Error ? error.message : "Verification failed. Try again.");
    } finally {
      setBscChecking(false);
    }
  }

  async function downloadExtension(key: string) {
    const normalizedKey = key.trim().toUpperCase();
    if (!normalizedKey) {
      setDownloadOk(false);
      setDownloadStatus("Enter the licence key issued after payment.");
      return;
    }
    setDownloading(true);
    setDownloadOk(false);
    setDownloadStatus("Checking licence and preparing download…");
    try {
      const response = await fetch(`${OFFICIAL_SITE_URL}${EXTENSION_DOWNLOAD_PATH}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ licenseKey: normalizedKey }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(data.error || "Download is locked. Complete payment first.");
      }
      const objectUrl = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = `Nexus-Trader-Extension-${PRODUCT_VERSION}.zip`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      setDownloadOk(true);
      setDownloadStatus("Download started! Keep your licence key safe for activation.");
    } catch (error) {
      setDownloadStatus(error instanceof Error ? error.message : "Download failed. Try again.");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <article className="price-card payment-card">
      <div className="price-top">
        <span>PRO MONTHLY</span>
        <b>POLAR · CARDS &amp; WALLETS</b>
      </div>
      <div className="amount">
        <sup>$</sup>30<small>/ month</small>
      </div>

      <div style={{ margin: "18px 0 12px" }}>
        <a
          href={POLAR_CHECKOUT_URL}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "var(--lime)",
            color: "#0b0d0c",
            padding: "16px 20px",
            fontSize: "12px",
            fontWeight: 900,
            letterSpacing: "0.06em",
            textDecoration: "none",
            boxShadow: "0 4px 14px rgba(0,0,0,0.25)",
            cursor: "pointer",
          }}
        >
          <span>💳 PAY WITH POLAR ($30)</span>
          <span style={{ fontSize: "16px" }}>↗</span>
        </a>
        <div style={{ display: "flex", gap: "10px", justifyContent: "center", fontSize: "10px", color: "#8c938d", marginTop: "10px" }}>
          <span>✓ Credit / Debit Card</span>
          <span>✓ Apple Pay</span>
          <span>✓ Google Pay</span>
        </div>
      </div>

      <div className="claim-box">
        <label htmlFor="customer-email">ALREADY PAID ON POLAR? GET YOUR KEY</label>
        <div>
          <input
            id="customer-email"
            value={emailQuery}
            onChange={(event) => setEmailQuery(event.target.value)}
            placeholder="Enter your Polar checkout email"
            spellCheck={false}
          />
          <button onClick={retrievePolarKey} disabled={checking || !emailQuery.trim()}>
            {checking ? "CHECKING…" : "GET KEY"}
          </button>
        </div>
        {status && <p className={licenseKey ? "success" : ""}>{status}</p>}
        {licenseKey && <code className="issued-key">{licenseKey}</code>}
        {licenseKey && (
          <button
            className="download-button"
            onClick={() => downloadExtension(licenseKey)}
            disabled={downloading}
          >
            {downloading ? "PREPARING…" : "DOWNLOAD EXTENSION"}
          </button>
        )}
      </div>

      <div className="claim-box redownload-box">
        <label htmlFor="licence-key">ALREADY HAVE A LICENCE KEY?</label>
        <div>
          <input
            id="licence-key"
            value={existingKey}
            onChange={(event) => setExistingKey(event.target.value)}
            placeholder="NEXUS-XXXXX-XXXXX-XXXXX-XXXXX"
            spellCheck={false}
          />
          <button
            onClick={() => downloadExtension(existingKey)}
            disabled={downloading || !existingKey.trim()}
          >
            {downloading ? "CHECKING…" : "DOWNLOAD"}
          </button>
        </div>
        {downloadStatus && <p className={downloadOk ? "success" : ""}>{downloadStatus}</p>}
      </div>

      <div style={{ marginTop: "18px", borderTop: "1px dashed #353a36", paddingTop: "12px", textAlign: "center" }}>
        <button
          type="button"
          onClick={() => setShowBsc(!showBsc)}
          style={{ background: "transparent", border: "0", color: "#8c938d", fontSize: "10px", cursor: "pointer", textDecoration: "underline" }}
        >
          {showBsc ? "Hide Binance USDT option ▲" : "Alternative: Pay with Binance USDT (BEP20) ▼"}
        </button>
      </div>

      {showBsc && (
        <div style={{ marginTop: "14px", borderTop: "1px solid #353a36", paddingTop: "14px" }}>
          <div className="payment-body">
            <img src={`https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=${address}&bgcolor=ffffff&color=000000`} alt="USDT BEP20 QR code"/>
            <div><strong>USDT · BNB SMART CHAIN</strong><small>BEP20 NETWORK ONLY</small></div>
          </div>
          <div className="wallet-row"><code>{address}</code><button onClick={copyAddress}>{copied ? "COPIED ✓" : "COPY"}</button></div>
          <div className="network-warning"><b>Important</b><span>Send exactly 30 USDT using BEP20 only. Funds sent on a different network may be lost.</span></div>
          <div className="claim-box">
            <label htmlFor="tx-hash">PASTE BSC TRANSACTION HASH</label>
            <div><input id="tx-hash" value={txHash} onChange={(event) => setTxHash(event.target.value)} placeholder="0x…" spellCheck={false}/><button onClick={verifyBscPayment} disabled={bscChecking || !txHash.trim()}>{bscChecking ? "CHECKING…" : "VERIFY"}</button></div>
            {bscStatus && <p className={licenseKey ? "success" : ""}>{bscStatus}</p>}
          </div>
        </div>
      )}

      <small className="checkout-note">The ZIP is not public. A confirmed payment issues the active licence required to download and activate the extension.</small>
    </article>
  );
}
