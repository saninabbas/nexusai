"use client";

import React, { useState } from "react";

interface WorkflowNode {
  id: string;
  stepNumber: string;
  stageName: string;
  title: string;
  category: string;
  icon: string;
  status: "ACTIVE" | "VERIFIED" | "EVALUATING" | "GUARDED" | "SIZED" | "EXECUTING" | "ARMED" | "MONITORING";
  subtitle: string;
  payload: string;
  description: string;
  details: {
    label: string;
    value: string;
  }[];
  formula?: string;
  safetyCheck: string;
  outputPills: string[];
}

const WORKFLOW_NODES: WorkflowNode[] = [
  {
    id: "market-feed",
    stepNumber: "01",
    stageName: "STAGE 1 • INGESTION",
    title: "Market Data Stream",
    category: "Ingestion Layer",
    icon: "⚡",
    status: "ACTIVE",
    subtitle: "Binance Kline Stream & WebSocket Mark Ticker",
    payload: "120 Closed Candles (1m/5m/15m)",
    description:
      "Continuously streams real-time Kline OHLCV candles and live ticker prices directly from Binance Futures endpoints. Buffers completed historical periods for deterministic indicator computation.",
    details: [
      { label: "Target Symbol", value: "BTCUSDT Perpetual" },
      { label: "Candle Limits", value: "120 historical bars" },
      { label: "Timeframe Sync", value: "Every 60s / WebSocket tick" },
      { label: "Price Source", value: "Mark Price (prevents wicks)" },
    ],
    formula: "Price = MarkPrice(Binance Index + Funding Basis)",
    safetyCheck: "Automatic reconnection on WebSocket drops; REST fallback enabled.",
    outputPills: ["raw candles", "mark price"],
  },
  {
    id: "data-sanitizer",
    stepNumber: "02",
    stageName: "STAGE 1 • INTEGRITY",
    title: "Data Sanitizer & Guard",
    category: "Integrity Layer",
    icon: "🛡️",
    status: "VERIFIED",
    subtitle: "Deduplication & Zero Lookahead Filter",
    payload: "Clean OHLCV Series",
    description:
      "Sanitizes all market data before quantitative evaluation. Filters out forming/unclosed candles to prevent lookahead bias. Validates candle geometry and eliminates corrupt spikes.",
    details: [
      { label: "Lookahead Guard", value: "closeTime <= currentTime" },
      { label: "Geometry Check", value: "high >= max(open,close) & low <= min(open,close)" },
      { label: "Price Sanity", value: "open, high, low, close > 0" },
      { label: "Deduplication", value: "Chronological ascending timestamp sort" },
    ],
    formula: "Validate(c) : c.closeTime <= now ∧ c.high >= c.low ∧ c.price > 0",
    safetyCheck: "Prevents execution on malformed or incomplete candles.",
    outputPills: ["clean candles", "audited history"],
  },
  {
    id: "signal-engine",
    stepNumber: "03",
    stageName: "STAGE 1 • STRATEGY",
    title: "Quantitative Signal Engine",
    category: "Strategy Engine",
    icon: "🤖",
    status: "EVALUATING",
    subtitle: "RSI Guard, MACD Cross & 40-Bar Breakout",
    payload: "LONG Setup (Confidence: 82%)",
    description:
      "Evaluates multi-timeframe mathematical indicators. Validates EMA 50/200 trend alignment, 40-candle Donchian breakout thresholds, and filters out false moves with the 14-period RSI guard.",
    details: [
      { label: "Trend Filter", value: "Price > EMA50 > EMA200 (Bullish regime)" },
      { label: "Breakout Rule", value: "Price > 40-candle prior high" },
      { label: "RSI Filter", value: "RSI-14 <= 75 (Not overbought)" },
      { label: "MACD Crossover", value: "Histogram > 0 & Line > Signal (+2 score)" },
    ],
    formula: "Score = Breakout(3) + Trend(2) + RSI_Guard(2) + MACD(2) >= Threshold(2)",
    safetyCheck: "RSI edge-case guard prevents false triggers on flat/oscillating markets.",
    outputPills: ["setup: LONG", "confidence: 82%", "atr: $420"],
  },
  {
    id: "gemini-research",
    stepNumber: "04",
    stageName: "STAGE 1 • AI GATE",
    title: "Gemini AI News Guard",
    category: "Cloud Intelligence",
    icon: "🌐",
    status: "GUARDED",
    subtitle: "24h Macro Sentiment & Search Grounding",
    payload: "Risk Level: LOW (Score 88/100)",
    description:
      "Server-side Gemini 3.7 Flash agent performs search-grounded market intelligence. Scans the last 24 hours of breaking news, Federal Reserve catalysts, and exchange risks to veto risky trades.",
    details: [
      { label: "Model", value: "Gemini 3.7 Flash with Search Grounding" },
      { label: "Scan Frequency", value: "Hourly + On-demand before entries" },
      { label: "News Bias", value: "Neutral to Bullish" },
      { label: "Veto Condition", value: "High / Extreme risk vetoes technical setup" },
    ],
    formula: "VetoIf(newsRisk == 'extreme' || newsRisk == 'high')",
    safetyCheck: "Prevents entering right before catastrophic news spikes or regulatory bans.",
    outputPills: ["bias: bullish", "news gate: passed"],
  },
  {
    id: "risk-sizer",
    stepNumber: "05",
    stageName: "STAGE 2 • RISK CONTROL",
    title: "Dynamic Risk & Lot Sizing",
    category: "Risk Control",
    icon: "⚖️",
    status: "SIZED",
    subtitle: "1% Equity Budget & Max 10x Leverage",
    payload: "Qty: 0.045 BTC ($3,034 Notional)",
    description:
      "Computes position size mathematically based on stop-loss distance, available balance, and exchange lot step constraints. Hard clamps leverage to 10x maximum to prevent liquidation.",
    details: [
      { label: "Account Balance", value: "10,000.00 USDT" },
      { label: "Risk Budget", value: "1.00% ($100 max risk per trade)" },
      { label: "Stop Distance", value: "2.5 * ATR ($1,051 = 1.56%)" },
      { label: "Leverage Limit", value: "Max 10× clamp (Strictly enforced)" },
    ],
    formula: "Qty = floor((Balance * Risk%) / (Entry - StopPrice), StepSize)",
    safetyCheck: "Enforces Binance minNotional ($5) and minimum lot size (0.001 BTC).",
    outputPills: ["qty: 0.045 BTC", "margin: $303.40"],
  },
  {
    id: "order-exec",
    stepNumber: "06",
    stageName: "STAGE 2 • EXECUTION",
    title: "Binance Futures Entry",
    category: "Execution Layer",
    icon: "🚀",
    status: "EXECUTING",
    subtitle: "Signed HMAC Market IOC Order",
    payload: "Filled @ $67,420.50 (Order #883912)",
    description:
      "Submits authenticated signed POST order to Binance Futures API. Validates execution response, average fill price, and executed quantity with millisecond clock offset synchronization.",
    details: [
      { label: "Execution Side", value: "BUY (LONG Entry)" },
      { label: "Order Type", value: "MARKET IOC" },
      { label: "Fill Price", value: "$67,420.50" },
      { label: "Client Order ID", value: "nx_entry_l9p2a1_f4c" },
    ],
    formula: "Sign(HMAC_SHA256, QueryString, ApiSecret)",
    safetyCheck: "In-memory mutex and cycle lock prevent duplicate order submissions.",
    outputPills: ["fill confirmed", "in-position"],
  },
  {
    id: "native-protection",
    stepNumber: "07",
    stageName: "STAGE 2 • PROTECTION",
    title: "Exchange-Native Protection",
    category: "Capital Preservation",
    icon: "🎯",
    status: "ARMED",
    subtitle: "Hardware STOP_MARKET & TAKE_PROFIT",
    payload: "SL: $66,410 | TP: $69,440 (Verified)",
    description:
      "Instantly places hardware-level conditional bracket orders on Binance exchange servers. If protective orders fail or are rejected, the failsafe triggers an IMMEDIATE MARKET CLOSE for safety.",
    details: [
      { label: "Stop Loss", value: "$66,410.00 (Order #90214 • STOP_MARKET)" },
      { label: "Take Profit", value: "$69,440.00 (Order #90215 • TAKE_PROFIT_MARKET)" },
      { label: "Trigger Type", value: "MARK_PRICE (Immunized against manipulation)" },
      { label: "Working Flags", value: "reduceOnly: true, closePosition: true" },
    ],
    formula: "SL = Entry * (1 - StopLoss%) ; TP = Entry * (1 + TakeProfit%)",
    safetyCheck: "EMERGENCY SAFETY: If SL/TP fails, newly opened position is instantly liquidated.",
    outputPills: ["SL active", "TP active", "failsafe armed"],
  },
  {
    id: "pnl-monitor",
    stepNumber: "08",
    stageName: "STAGE 2 • MONITORING",
    title: "Real-Time PnL & Breaker",
    category: "Monitoring & Exit",
    icon: "📊",
    status: "MONITORING",
    subtitle: "Fee Accounting & -5% Loss Breaker",
    payload: "Unrealized: +2.85% (+$192.40 Net)",
    description:
      "Tracks mark price live, updates unrealized P&L, accounts for 0.1% round-trip taker fees, and monitors daily loss limits. If daily drawdown reaches -5%, trading pauses for capital safety.",
    details: [
      { label: "Unrealized PnL", value: "+$192.40 (+2.85%)" },
      { label: "Estimated Fees", value: "$14.80 (0.05% taker * 2)" },
      { label: "Daily Circuit Breaker", value: "Max 5% daily drawdown (Halts bot)" },
      { label: "Cleanup Routine", value: "Cancels orphan orders upon position exit" },
    ],
    formula: "PnL = (MarkPrice - Entry) * Qty - TotalFees ; Breaker: DailyPnL <= -0.05 * Balance",
    safetyCheck: "Clean-up hook cancels all orphan conditional orders when position closes.",
    outputPills: ["target tracking", "circuit breaker 100%"],
  },
];

export default function InteractiveWorkflow() {
  const [activeTab, setActiveTab] = useState<"flow" | "steps">("flow");
  const [selectedNode, setSelectedNode] = useState<WorkflowNode>(WORKFLOW_NODES[2]);

  const row1Nodes = WORKFLOW_NODES.slice(0, 4);
  const row2Nodes = WORKFLOW_NODES.slice(4, 8);

  return (
    <div className="wf-terminal">
      {/* Terminal Top Bar */}
      <div className="wf-terminal-top">
        <div className="wf-brand-group">
          <span className="wf-brand-mark">N</span>
          <div>
            <div className="wf-title-row">
              <h3>LIVE TOPOLOGY: AUTONOMOUS QUANTITATIVE PIPELINE</h3>
              <span className="wf-live-pill">LIVE PRODUCTION</span>
            </div>
            <p className="wf-subtitle">
              Click any node to inspect real runtime parameters, quantitative formulas, and protection guards
            </p>
          </div>
        </div>

        <div className="wf-controls">
          <div className="wf-view-toggle">
            <button
              type="button"
              className={`wf-toggle-btn ${activeTab === "flow" ? "active" : ""}`}
              onClick={() => setActiveTab("flow")}
            >
              + Pipeline Topology
            </button>
            <button
              type="button"
              className={`wf-toggle-btn ${activeTab === "steps" ? "active" : ""}`}
              onClick={() => setActiveTab("steps")}
            >
              ☰ Detailed Steps
            </button>
          </div>
          <div className="wf-sync-pill">
            <span className="wf-pulse-dot" /> SYSTEM SYNCD
          </div>
        </div>
      </div>

      {activeTab === "flow" ? (
        /* Fully Responsive 2-Tier Topology Pipeline */
        <div className="wf-flow-body">
          {/* STAGE 1: Market Signal & Intelligence Gate */}
          <div className="wf-stage-block">
            <div className="wf-stage-header">
              <span className="wf-stage-index">STAGE 01</span>
              <h4>SIGNAL GENERATION &amp; MACRO INTELLIGENCE GATE</h4>
              <span className="wf-stage-tag">CONTINUOUS STREAM</span>
            </div>

            <div className="wf-nodes-grid">
              {row1Nodes.map((node, index) => {
                const isSelected = selectedNode.id === node.id;
                return (
                  <div key={node.id} className="wf-node-wrapper">
                    <div
                      className={`wf-node-box ${isSelected ? "selected" : ""}`}
                      onClick={() => setSelectedNode(node)}
                    >
                      <div className="wf-node-header">
                        <span className="wf-node-num">{node.stepNumber}</span>
                        <span className="wf-node-icon">{node.icon}</span>
                        <span className={`wf-status-badge ${node.status.toLowerCase()}`}>
                          {node.status}
                        </span>
                      </div>
                      <h5 className="wf-node-title">{node.title}</h5>
                      <p className="wf-node-sub">{node.subtitle}</p>
                      <div className="wf-node-payload">
                        <small>PAYLOAD:</small>
                        <span>{node.payload}</span>
                      </div>
                    </div>
                    {index < 3 && <div className="wf-arrow-next">➔</div>}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Inter-Stage Transition Banner */}
          <div className="wf-inter-stage-banner">
            <div className="wf-connector-line" />
            <div className="wf-connector-pill">
              <span>🛡️ AI RESEARCH GATE PASSED</span>
              <strong>➔ DEPLOYING CAPITAL &amp; RISK SIZING MODEL</strong>
            </div>
            <div className="wf-connector-line" />
          </div>

          {/* STAGE 2: Execution & Capital Preservation */}
          <div className="wf-stage-block">
            <div className="wf-stage-header">
              <span className="wf-stage-index">STAGE 02</span>
              <h4>AUTHENTICATED EXECUTION &amp; HARDWARE PROTECTION</h4>
              <span className="wf-stage-tag">FAILSAFE ARMED</span>
            </div>

            <div className="wf-nodes-grid">
              {row2Nodes.map((node, index) => {
                const isSelected = selectedNode.id === node.id;
                return (
                  <div key={node.id} className="wf-node-wrapper">
                    <div
                      className={`wf-node-box ${isSelected ? "selected" : ""}`}
                      onClick={() => setSelectedNode(node)}
                    >
                      <div className="wf-node-header">
                        <span className="wf-node-num">{node.stepNumber}</span>
                        <span className="wf-node-icon">{node.icon}</span>
                        <span className={`wf-status-badge ${node.status.toLowerCase()}`}>
                          {node.status}
                        </span>
                      </div>
                      <h5 className="wf-node-title">{node.title}</h5>
                      <p className="wf-node-sub">{node.subtitle}</p>
                      <div className="wf-node-payload">
                        <small>PAYLOAD:</small>
                        <span className="lime-text">{node.payload}</span>
                      </div>
                    </div>
                    {index < 3 && <div className="wf-arrow-next">➔</div>}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        /* Sequential Linear Pipeline Steps View */
        <div className="wf-steps-body">
          <div className="wf-steps-list">
            {WORKFLOW_NODES.map((node) => {
              const isSelected = selectedNode.id === node.id;
              return (
                <div
                  key={node.id}
                  className={`wf-step-item ${isSelected ? "selected" : ""}`}
                  onClick={() => setSelectedNode(node)}
                >
                  <div className="wf-step-top">
                    <div className="wf-step-title-wrap">
                      <span className="wf-step-badge">{node.stepNumber}</span>
                      <span className="wf-step-icon">{node.icon}</span>
                      <div>
                        <h5>{node.title}</h5>
                        <small>{node.category}</small>
                      </div>
                    </div>
                    <span className={`wf-status-badge ${node.status.toLowerCase()}`}>
                      {node.status}
                    </span>
                  </div>
                  <p className="wf-step-desc">{node.description}</p>
                  <div className="wf-step-foot">
                    <span className="wf-payload-label">PAYLOAD:</span>
                    <code>{node.payload}</code>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Selected Node Inspector Drawer */}
      <div className="wf-inspector-box">
        <div className="wf-inspector-header">
          <div className="wf-inspector-title">
            <span className="wf-inspector-icon">{selectedNode.icon}</span>
            <div>
              <h4>{selectedNode.title}</h4>
              <small>
                {selectedNode.stageName} • STEP {selectedNode.stepNumber}
              </small>
            </div>
          </div>
          <div className="wf-inspector-badge">
            STATUS: <strong>{selectedNode.status}</strong>
          </div>
        </div>

        <p className="wf-inspector-desc">{selectedNode.description}</p>

        <div className="wf-inspector-grid">
          <div className="wf-inspector-card">
            <div className="wf-card-title">RUNTIME PARAMETERS</div>
            <div className="wf-params-list">
              {selectedNode.details.map((detail) => (
                <div key={detail.label} className="wf-param-row">
                  <span className="wf-param-label">{detail.label}</span>
                  <span className="wf-param-value">{detail.value}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="wf-inspector-card">
            <div className="wf-card-title">QUANTITATIVE FORMULA &amp; LOGIC</div>
            <div className="wf-formula-box">
              <code>{selectedNode.formula || "Deterministic event loop execution"}</code>
            </div>
            <div className="wf-safety-box">
              <strong>🛡️ SECURITY &amp; CAPITAL PROTECTION GUARD:</strong>
              <p>{selectedNode.safetyCheck}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
