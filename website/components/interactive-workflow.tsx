"use client";

import React, { useState } from "react";

interface WorkflowNode {
  id: string;
  stepNumber: string;
  title: string;
  category: string;
  icon: string;
  status: "COMPLETED" | "RUNNING" | "ACTIVE" | "VERIFIED" | "GUARDED";
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
    title: "Market Data Stream",
    category: "Ingestion Layer",
    icon: "⚡",
    status: "ACTIVE",
    subtitle: "Binance Kline Stream • REST & WebSocket Ticker",
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
    title: "Data Sanitizer & Guard",
    category: "Integrity Layer",
    icon: "🛡️",
    status: "VERIFIED",
    subtitle: "Deduplication • Geometry Audit • Closed Filter",
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
    title: "Quantitative Signal Engine",
    category: "Strategy Engine",
    icon: "🤖",
    status: "COMPLETED",
    subtitle: "RSI Guard • MACD Crossover • 40-Bar Breakout",
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
    title: "Gemini AI News Guard",
    category: "Cloud Intelligence",
    icon: "🌐",
    status: "GUARDED",
    subtitle: "24h Macro Sentiment • Google Search Grounding",
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
    title: "Dynamic Risk & Lot Sizing",
    category: "Risk Control",
    icon: "⚖️",
    status: "COMPLETED",
    subtitle: "1% Equity Budget • Max 10x Leverage • Min Notional",
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
    title: "Binance Futures Entry",
    category: "Execution Layer",
    icon: "🚀",
    status: "RUNNING",
    subtitle: "Market IOC Order • Testnet & Guarded Live",
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
    title: "Exchange-Native Protection",
    category: "Capital Preservation",
    icon: "🎯",
    status: "ACTIVE",
    subtitle: "STOP_MARKET & TAKE_PROFIT_MARKET on Binance",
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
    title: "Real-Time PnL & Circuit Breaker",
    category: "Monitoring & Exit",
    icon: "📊",
    status: "ACTIVE",
    subtitle: "Live PnL • Fee Accounting • -5% Drawdown Breaker",
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

  return (
    <div className="workflow-container">
      {/* Topology Header */}
      <div className="workflow-header">
        <div className="workflow-title-group">
          <div className="workflow-badge-icon">⚡</div>
          <div>
            <div className="workflow-title-row">
              <h3>Live Topology: Autonomous Quantitative Pipeline</h3>
              <span className="live-production-pill">LIVE PRODUCTION</span>
            </div>
            <p className="workflow-subtitle">
              Click any node to inspect real parameters, payloads, indicators, and risk guards
            </p>
          </div>
        </div>

        <div className="workflow-controls">
          <div className="view-toggle">
            <button
              type="button"
              className={`toggle-btn ${activeTab === "flow" ? "active" : ""}`}
              onClick={() => setActiveTab("flow")}
            >
              + Flow Graph
            </button>
            <button
              type="button"
              className={`toggle-btn ${activeTab === "steps" ? "active" : ""}`}
              onClick={() => setActiveTab("steps")}
            >
              ☰ Pipeline Steps
            </button>
          </div>

          <div className="sync-indicator">
            <span className="pulse-dot" /> Live Synced
          </div>
        </div>
      </div>

      {activeTab === "flow" ? (
        /* 2D Interactive Flow Topology Graph */
        <div className="flow-canvas-wrapper">
          <div className="flow-canvas">
            {/* Background SVG Grid and Glowing Connectors */}
            <svg className="flow-svg-overlay" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <linearGradient id="glow-cyan" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#00e5ff" stopOpacity="0.8" />
                  <stop offset="50%" stopColor="#00e676" stopOpacity="0.9" />
                  <stop offset="100%" stopColor="#a8ff3e" stopOpacity="0.9" />
                </linearGradient>
                <linearGradient id="glow-purple" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#6366f1" stopOpacity="0.8" />
                  <stop offset="100%" stopColor="#00e5ff" stopOpacity="0.8" />
                </linearGradient>
              </defs>

              {/* Connector: 01 Market Feed -> 02 Sanitizer */}
              <path
                d="M 240 100 C 275 100, 285 100, 320 100"
                fill="none"
                stroke="url(#glow-cyan)"
                strokeWidth="2.5"
                strokeDasharray="5,4"
                className="animated-pulse-line"
              />

              {/* Connector: 02 Sanitizer -> 03 Signal Engine */}
              <path
                d="M 560 100 C 600 100, 610 100, 650 100"
                fill="none"
                stroke="url(#glow-cyan)"
                strokeWidth="2.5"
                strokeDasharray="5,4"
                className="animated-pulse-line"
              />

              {/* Connector: 03 Signal Engine -> 04 Gemini Research (downward branch) */}
              <path
                d="M 770 180 C 770 230, 480 230, 480 280"
                fill="none"
                stroke="url(#glow-purple)"
                strokeWidth="2"
                strokeDasharray="4,4"
              />

              {/* Connector: 03 Signal Engine -> 05 Risk Sizer (downward branch) */}
              <path
                d="M 810 180 C 810 230, 780 230, 780 280"
                fill="none"
                stroke="url(#glow-cyan)"
                strokeWidth="2"
                strokeDasharray="4,4"
              />

              {/* Connector: 05 Risk Sizer -> 06 Order Execution */}
              <path
                d="M 910 280 C 940 280, 950 130, 980 100"
                fill="none"
                stroke="url(#glow-cyan)"
                strokeWidth="2.5"
                strokeDasharray="5,4"
                className="animated-pulse-line"
              />

              {/* Connector: 06 Order Exec -> 07 Native Protection */}
              <path
                d="M 1220 100 C 1255 100, 1265 100, 1300 100"
                fill="none"
                stroke="url(#glow-cyan)"
                strokeWidth="2.5"
                strokeDasharray="5,4"
                className="animated-pulse-line"
              />

              {/* Connector: 07 Native Protection -> 08 PnL Monitor */}
              <path
                d="M 1540 100 C 1575 100, 1585 100, 1620 100"
                fill="none"
                stroke="url(#glow-cyan)"
                strokeWidth="2.5"
                strokeDasharray="5,4"
                className="animated-pulse-line"
              />
            </svg>

            {/* Nodes Layout Grid */}
            <div className="flow-nodes-layout">
              {/* Top Row: Primary Flow */}
              <div className="flow-row main-flow-row">
                {/* Node 1: Market Feed */}
                <div
                  className={`workflow-node-card ${selectedNode.id === "market-feed" ? "selected" : ""}`}
                  style={{ width: "240px" }}
                  onClick={() => setSelectedNode(WORKFLOW_NODES[0])}
                >
                  <div className="node-port port-right" />
                  <div className="node-top">
                    <span className="node-icon">{WORKFLOW_NODES[0].icon}</span>
                    <span className="node-title">{WORKFLOW_NODES[0].title}</span>
                    <span className="node-status-pill green">ACTIVE</span>
                  </div>
                  <div className="node-sub">{WORKFLOW_NODES[0].subtitle}</div>
                  <div className="node-footer">
                    <span className="payload-tag">PAYLOAD:</span>
                    <span className="payload-val">{WORKFLOW_NODES[0].payload}</span>
                  </div>
                  <div className="connector-pill pill-right">raw data</div>
                </div>

                {/* Node 2: Sanitizer */}
                <div
                  className={`workflow-node-card ${selectedNode.id === "data-sanitizer" ? "selected" : ""}`}
                  style={{ width: "240px" }}
                  onClick={() => setSelectedNode(WORKFLOW_NODES[1])}
                >
                  <div className="node-port port-left" />
                  <div className="node-port port-right" />
                  <div className="node-top">
                    <span className="node-icon">{WORKFLOW_NODES[1].icon}</span>
                    <span className="node-title">{WORKFLOW_NODES[1].title}</span>
                    <span className="node-status-pill cyan">VERIFIED</span>
                  </div>
                  <div className="node-sub">{WORKFLOW_NODES[1].subtitle}</div>
                  <div className="node-footer">
                    <span className="payload-tag">PAYLOAD:</span>
                    <span className="payload-val">{WORKFLOW_NODES[1].payload}</span>
                  </div>
                  <div className="connector-pill pill-right">clean ohlcv</div>
                </div>

                {/* Node 3: Signal Engine */}
                <div
                  className={`workflow-node-card ${selectedNode.id === "signal-engine" ? "selected" : ""}`}
                  style={{ width: "260px" }}
                  onClick={() => setSelectedNode(WORKFLOW_NODES[2])}
                >
                  <div className="node-port port-left" />
                  <div className="node-port port-bottom" />
                  <div className="node-port port-right" />
                  <div className="node-top">
                    <span className="node-icon">{WORKFLOW_NODES[2].icon}</span>
                    <span className="node-title">{WORKFLOW_NODES[2].title}</span>
                    <span className="node-status-pill cyan">EVALUATING</span>
                  </div>
                  <div className="node-sub">{WORKFLOW_NODES[2].subtitle}</div>
                  <div className="node-footer">
                    <span className="payload-tag">PAYLOAD:</span>
                    <span className="payload-val green-text">{WORKFLOW_NODES[2].payload}</span>
                  </div>
                  <div className="connector-pill pill-right">signal: LONG</div>
                </div>

                {/* Node 6: Order Exec */}
                <div
                  className={`workflow-node-card ${selectedNode.id === "order-exec" ? "selected" : ""}`}
                  style={{ width: "240px" }}
                  onClick={() => setSelectedNode(WORKFLOW_NODES[5])}
                >
                  <div className="node-port port-left" />
                  <div className="node-port port-right" />
                  <div className="node-top">
                    <span className="node-icon">{WORKFLOW_NODES[5].icon}</span>
                    <span className="node-title">{WORKFLOW_NODES[5].title}</span>
                    <span className="node-status-pill amber">EXECUTING</span>
                  </div>
                  <div className="node-sub">{WORKFLOW_NODES[5].subtitle}</div>
                  <div className="node-footer">
                    <span className="payload-tag">PAYLOAD:</span>
                    <span className="payload-val">{WORKFLOW_NODES[5].payload}</span>
                  </div>
                  <div className="connector-pill pill-right">fill @ $67,420</div>
                </div>

                {/* Node 7: Native Protection Bracket */}
                <div
                  className={`workflow-node-card ${selectedNode.id === "native-protection" ? "selected" : ""}`}
                  style={{ width: "240px" }}
                  onClick={() => setSelectedNode(WORKFLOW_NODES[6])}
                >
                  <div className="node-port port-left" />
                  <div className="node-port port-right" />
                  <div className="node-top">
                    <span className="node-icon">{WORKFLOW_NODES[6].icon}</span>
                    <span className="node-title">{WORKFLOW_NODES[6].title}</span>
                    <span className="node-status-pill green">ARMED</span>
                  </div>
                  <div className="node-sub">{WORKFLOW_NODES[6].subtitle}</div>
                  <div className="node-footer">
                    <span className="payload-tag">PAYLOAD:</span>
                    <span className="payload-val green-text">{WORKFLOW_NODES[6].payload}</span>
                  </div>
                  <div className="connector-pill pill-right">dual SL/TP</div>
                </div>

                {/* Node 8: Real-Time PnL & Monitor */}
                <div
                  className={`workflow-node-card ${selectedNode.id === "pnl-monitor" ? "selected" : ""}`}
                  style={{ width: "240px" }}
                  onClick={() => setSelectedNode(WORKFLOW_NODES[7])}
                >
                  <div className="node-port port-left" />
                  <div className="node-top">
                    <span className="node-icon">{WORKFLOW_NODES[7].icon}</span>
                    <span className="node-title">{WORKFLOW_NODES[7].title}</span>
                    <span className="node-status-pill green">MONITORING</span>
                  </div>
                  <div className="node-sub">{WORKFLOW_NODES[7].subtitle}</div>
                  <div className="node-footer">
                    <span className="payload-tag">PAYLOAD:</span>
                    <span className="payload-val green-text">{WORKFLOW_NODES[7].payload}</span>
                  </div>
                </div>
              </div>

              {/* Bottom Row: AI Intelligence & Sizing Branch */}
              <div className="flow-row sub-flow-row" style={{ marginTop: "32px", paddingLeft: "360px" }}>
                {/* Node 4: Gemini AI */}
                <div
                  className={`workflow-node-card sub-card ${selectedNode.id === "gemini-research" ? "selected" : ""}`}
                  style={{ width: "250px" }}
                  onClick={() => setSelectedNode(WORKFLOW_NODES[3])}
                >
                  <div className="node-port port-top" />
                  <div className="node-top">
                    <span className="node-icon">{WORKFLOW_NODES[3].icon}</span>
                    <span className="node-title">{WORKFLOW_NODES[3].title}</span>
                    <span className="node-status-pill purple">GROUNDED</span>
                  </div>
                  <div className="node-sub">{WORKFLOW_NODES[3].subtitle}</div>
                  <div className="node-footer">
                    <span className="payload-tag">PAYLOAD:</span>
                    <span className="payload-val">{WORKFLOW_NODES[3].payload}</span>
                  </div>
                </div>

                {/* Node 5: Risk Sizer */}
                <div
                  className={`workflow-node-card sub-card ${selectedNode.id === "risk-sizer" ? "selected" : ""}`}
                  style={{ width: "250px", marginLeft: "40px" }}
                  onClick={() => setSelectedNode(WORKFLOW_NODES[4])}
                >
                  <div className="node-port port-top" />
                  <div className="node-port port-right" />
                  <div className="node-top">
                    <span className="node-icon">{WORKFLOW_NODES[4].icon}</span>
                    <span className="node-title">{WORKFLOW_NODES[4].title}</span>
                    <span className="node-status-pill cyan">SIZED</span>
                  </div>
                  <div className="node-sub">{WORKFLOW_NODES[4].subtitle}</div>
                  <div className="node-footer">
                    <span className="payload-tag">PAYLOAD:</span>
                    <span className="payload-val">{WORKFLOW_NODES[4].payload}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Sequential Linear Pipeline Steps View */
        <div className="steps-container">
          <div className="steps-grid">
            {WORKFLOW_NODES.map((node) => (
              <div
                key={node.id}
                className={`step-card ${selectedNode.id === node.id ? "active-step" : ""}`}
                onClick={() => setSelectedNode(node)}
              >
                <div className="step-header">
                  <span className="step-num">{node.stepNumber}</span>
                  <span className="step-icon">{node.icon}</span>
                  <div className="step-title-wrap">
                    <h4>{node.title}</h4>
                    <span className="step-cat">{node.category}</span>
                  </div>
                  <span className={`node-status-pill ${node.status.toLowerCase()}`}>
                    {node.status}
                  </span>
                </div>
                <p className="step-desc">{node.description}</p>
                <div className="step-footer">
                  <small className="step-payload-label">PAYLOAD:</small>
                  <code>{node.payload}</code>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Node Inspector Drawer */}
      <div className="inspector-panel">
        <div className="inspector-head">
          <div className="inspector-title">
            <span>{selectedNode.icon}</span>
            <div>
              <h4>{selectedNode.title}</h4>
              <small>{selectedNode.category} • Step {selectedNode.stepNumber}</small>
            </div>
          </div>
          <span className="inspector-status-badge">
            STATUS: <strong>{selectedNode.status}</strong>
          </span>
        </div>

        <p className="inspector-desc">{selectedNode.description}</p>

        <div className="inspector-grid">
          <div className="inspector-card">
            <h5>Runtime Parameters</h5>
            <div className="params-list">
              {selectedNode.details.map((detail) => (
                <div key={detail.label} className="param-row">
                  <span className="param-name">{detail.label}</span>
                  <span className="param-val">{detail.value}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="inspector-card">
            <h5>Algorithm & Formula</h5>
            <div className="formula-box">
              <code>{selectedNode.formula || "Deterministic event loop execution"}</code>
            </div>
            <div className="safety-alert">
              <strong>🛡️ Security & Protection Guard:</strong>
              <p>{selectedNode.safetyCheck}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
