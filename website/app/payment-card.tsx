"use client";

import { useState } from "react";

const address = "0x9d35215728112c055c8d2472560d7e3ec58df135";

export default function PaymentCard() {
  const [copied, setCopied] = useState(false);
  const [txHash, setTxHash] = useState("");
  const [status, setStatus] = useState("");
  const [licenseKey, setLicenseKey] = useState("");
  const [checking, setChecking] = useState(false);
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
      const response = await fetch("/api/payments/verify", {
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
    </div>
    <small className="checkout-note">A confirmed payment can issue one 30-day licence. Each transaction hash works once.</small>
  </article>;
}
