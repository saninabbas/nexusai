"use client";

import { useState } from "react";
import { EXTENSION_DOWNLOAD_PATH, OFFICIAL_SITE_URL, PRODUCT_VERSION } from "../lib/product";

const address = "0x9d35215728112c055c8d2472560d7e3ec58df135";

export default function PaymentCard() {
  const [copied, setCopied] = useState(false);
  const [txHash, setTxHash] = useState("");
  const [status, setStatus] = useState("");
  const [licenseKey, setLicenseKey] = useState("");
  const [existingKey, setExistingKey] = useState("");
  const [checking, setChecking] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadStatus, setDownloadStatus] = useState("");
  const [downloadOk, setDownloadOk] = useState(false);
  async function copyAddress() {
    await navigator.clipboard.writeText(address);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }
  async function verifyPayment() {
    setChecking(true);
    setStatus("Checking payment on BNB Smart Chain…");
    setLicenseKey("");
    try {
      const response = await fetch(`${OFFICIAL_SITE_URL}/api/payments/verify`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ txHash: txHash.trim() }),
      });
      const data = await response.json() as { error?: string; licenseKey?: string; expiresAt?: number };
      if (!response.ok) throw new Error(data.error || "Payment could not be verified.");
      setLicenseKey(data.licenseKey || "");
      setStatus(`Verified. License valid until ${new Date((data.expiresAt || 0) * 1000).toLocaleDateString()}.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Verification failed. Try again.");
    } finally { setChecking(false); }
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
      setDownloadStatus("Download started. Keep your licence key safe for activation.");
    } catch (error) {
      setDownloadStatus(error instanceof Error ? error.message : "Download failed. Try again.");
    } finally {
      setDownloading(false);
    }
  }
  return <article className="price-card payment-card">
    <div className="price-top"><span>PRO MONTHLY</span><b>BINANCE / USDT</b></div>
    <div className="amount"><sup>$</sup>30<small>/ month</small></div>
    <div className="payment-body">
      <img src={`https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=${address}&bgcolor=ffffff&color=000000`} alt="USDT BEP20 payment address QR code"/>
      <div><strong>USDT · BNB SMART CHAIN</strong><small>BEP20 NETWORK ONLY</small></div>
    </div>
    <div className="wallet-row"><code>{address}</code><button onClick={copyAddress}>{copied ? "COPIED ✓" : "COPY"}</button></div>
    <div className="network-warning"><b>Important</b><span>Send exactly 30 USDT using BEP20 only. Funds sent on a different network may be lost.</span></div>
    <div className="claim-box">
      <label htmlFor="tx-hash">PASTE TRANSACTION HASH</label>
      <div><input id="tx-hash" value={txHash} onChange={(event) => setTxHash(event.target.value)} placeholder="0x…" spellCheck={false}/><button onClick={verifyPayment} disabled={checking || !txHash.trim()}>{checking ? "CHECKING…" : "GET KEY"}</button></div>
      {status && <p className={licenseKey ? "success" : ""}>{status}</p>}
      {licenseKey && <code className="issued-key">{licenseKey}</code>}
      {licenseKey && <button className="download-button" onClick={() => downloadExtension(licenseKey)} disabled={downloading}>{downloading ? "PREPARING…" : "DOWNLOAD EXTENSION"}</button>}
    </div>
    <div className="claim-box redownload-box">
      <label htmlFor="licence-key">ALREADY PAID? ENTER LICENCE KEY</label>
      <div><input id="licence-key" value={existingKey} onChange={(event) => setExistingKey(event.target.value)} placeholder="NEXUS-XXXXX-XXXXX-XXXXX-XXXXX" spellCheck={false}/><button onClick={() => downloadExtension(existingKey)} disabled={downloading || !existingKey.trim()}>{downloading ? "CHECKING…" : "DOWNLOAD"}</button></div>
      {downloadStatus && <p className={downloadOk ? "success" : ""}>{downloadStatus}</p>}
    </div>
    <small className="checkout-note">The ZIP is not public. A confirmed payment issues the active licence required to download it.</small>
  </article>;
}
