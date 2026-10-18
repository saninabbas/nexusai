"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Activity,
  AlertOctagon,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Bot,
  CheckCircle2,
  ChevronRight,
  Clock,
  Cpu,
  CreditCard,
  Database,
  Download,
  Eye,
  EyeOff,
  FileText,
  Filter,
  Globe,
  HelpCircle,
  Key,
  Layers,
  Lock,
  LogOut,
  Pause,
  Play,
  Power,
  RefreshCw,
  RotateCcw,
  Search,
  Server,
  Settings,
  Shield,
  ShieldAlert,
  Sparkles,
  Terminal,
  TrendingDown,
  TrendingUp,
  UserCheck,
  Users,
  Wallet,
  X,
  XCircle,
  Zap,
} from "lucide-react";

// -------------------------------------------------------------
// Types
// -------------------------------------------------------------

interface OverviewData {
  engine: {
    status: "running" | "paused" | "stopped";
    symbol: string;
    interval: string;
    leverage: number;
    pausedReason: string | null;
    lastCycleAt: number | null;
    hasManagedPosition: boolean;
    activePositionAmount: string | null;
  };
  metrics: {
    totalBots: number;
    activeBots: number;
    pausedBots: number;
    totalVolumeUsdt: string;
    totalRealizedPnl: string;
    winRatePct: string;
    totalTradesCount: number;
    marginBalance: string;
    availableBalance: string;
    unrealizedPnl: string;
    dailyBaselineEquity: string | null;
  };
  exchange: {
    name: string;
    status: string;
    environment: string;
    latencyMs: number | null;
    apiKeyHint: string;
  };
  systemHealth: {
    database: string;
    geminiAi: string;
    workerCron: string;
    polarGateway: string;
    maintenanceMode: boolean;
  };
  recentEvents: Array<{
    id: number;
    level: string;
    event_type: string;
    message: string;
    created_at: number;
  }>;
}

interface BotInstance {
  id: string;
  type: "master" | "tenant";
  name: string;
  symbol: string;
  interval: string;
  enabled: boolean;
  status: "running" | "paused" | "idle" | "disconnected";
  pausedReason: string | null;
  lastError: string | null;
  lastCycleAt: number | null;
  hasManagedPosition: boolean;
  activePositionAmount: string | null;
  leverage: number;
  riskBps: number;
  dailyLossBps: number;
  maxNotionalUsdt: number;
  apiKeyHint?: string;
  accountEquity?: string | null;
  licenseStatus?: string;
}

interface Position {
  symbol: string;
  side: "LONG" | "SHORT";
  amount: number;
  entryPrice: string;
  markPrice: string;
  unrealizedProfit: string;
  liquidationPrice: string;
  leverage: string;
  marginType: string;
  isolatedMargin: string;
}

interface OpenOrder {
  orderId?: number;
  algoId?: string;
  clientOrderId?: string;
  clientAlgoId?: string;
  symbol: string;
  type: string;
  side: string;
  price: string;
  stopPrice?: string;
  status: string;
  time?: number;
}

interface TradeRecord {
  id: number;
  tenant_id: string | null;
  symbol: string;
  direction: "LONG" | "SHORT";
  entry_price: string;
  exit_price: string;
  quantity: string;
  realized_pnl: string;
  pnl_percent: string;
  fee: string;
  strategy: string;
  close_reason: string;
  mode: string;
  entry_time: number;
  exit_time: number;
  created_at: number;
}

// -------------------------------------------------------------
// Component
// -------------------------------------------------------------

export default function AdminDashboardPage() {
  // Auth state
  const [token, setToken] = useState<string>("");
  const [tokenInput, setTokenInput] = useState<string>("");
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [authChecking, setAuthChecking] = useState<boolean>(true);
  const [authError, setAuthError] = useState<string>("");
  const [showTokenInput, setShowTokenInput] = useState<boolean>(false);

  // Active section (15 sections)
  const [activeTab, setActiveTab] = useState<string>("overview");

  // Live data states
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [bots, setBots] = useState<BotInstance[]>([]);
  const [exchange, setExchange] = useState<any>(null);
  const [strategies, setStrategies] = useState<any>(null);
  const [riskData, setRiskData] = useState<any>(null);
  const [positionsData, setPositionsData] = useState<{ positions: Position[]; openOrders: OpenOrder[]; statePosition: any } | null>(null);
  const [trades, setTrades] = useState<TradeRecord[]>([]);
  const [analytics, setAnalytics] = useState<any>(null);
  const [integrations, setIntegrations] = useState<any[]>([]);
  const [payments, setPayments] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [generalSettings, setGeneralSettings] = useState<any>(null);

  // Blog Automation states
  const [blogCalendar, setBlogCalendar] = useState<any[]>([]);
  const [blogArticles, setBlogArticles] = useState<any[]>([]);
  const [blogSettings, setBlogSettings] = useState<any>(null);
  const [generatingBlog, setGeneratingBlog] = useState<boolean>(false);
  const [selectedArticlePreview, setSelectedArticlePreview] = useState<any | null>(null);
  const [selectedCalendarFilter, setSelectedCalendarFilter] = useState<string>("all");

  // UI helpers
  const [loading, setLoading] = useState<boolean>(false);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [autoRefresh, setAutoRefresh] = useState<boolean>(true);
  const [actionMessage, setActionMessage] = useState<{ text: string; type: "success" | "error" | "info" } | null>(null);

  // Modal confirmation states
  const [emergencyModalOpen, setEmergencyModalOpen] = useState<boolean>(false);
  const [emergencyConfirmationText, setEmergencyConfirmationText] = useState<string>("");

  const [closePositionModalOpen, setClosePositionModalOpen] = useState<boolean>(false);
  const [closeConfirmationText, setCloseConfirmationText] = useState<string>("");

  const [startEngineModalOpen, setStartEngineModalOpen] = useState<boolean>(false);
  const [startAckText, setStartAckText] = useState<string>("");

  // Filters
  const [logFilterLevel, setLogFilterLevel] = useState<string>("all");
  const [userSearchQuery, setUserSearchQuery] = useState<string>("");
  const [tradeSearchQuery, setTradeSearchQuery] = useState<string>("");

  // -----------------------------------------------------------
  // API Fetch helper with Auth
  // -----------------------------------------------------------
  const apiFetch = useCallback(
    async (path: string, options: RequestInit = {}) => {
      const headers = new Headers(options.headers || {});
      if (token) {
        headers.set("Authorization", `Bearer ${token}`);
      }
      headers.set("Content-Type", "application/json");

      const response = await fetch(path, {
        ...options,
        headers,
      });

      if (response.status === 401) {
        setIsAuthenticated(false);
        sessionStorage.removeItem("nexus_admin_token");
        throw new Error("Unauthorized: Invalid admin token");
      }

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || `Request failed with status ${response.status}`);
      }
      return data;
    },
    [token]
  );

  // -----------------------------------------------------------
  // Auth Verification
  // -----------------------------------------------------------
  const verifyToken = useCallback(async (tokenToVerify: string) => {
    setLoading(true);
    setAuthError("");
    try {
      const res = await fetch("/api/admin/auth/verify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokenToVerify.trim()}`,
        },
        body: JSON.stringify({ token: tokenToVerify.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        setToken(tokenToVerify.trim());
        setIsAuthenticated(true);
        sessionStorage.setItem("nexus_admin_token", tokenToVerify.trim());
        setAuthError("");
      } else {
        setAuthError(data.error || "Invalid admin token");
        setIsAuthenticated(false);
      }
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : "Verification connection failed");
      setIsAuthenticated(false);
    } finally {
      setLoading(false);
      setAuthChecking(false);
    }
  }, []);

  // Check saved token on mount
  useEffect(() => {
    const saved = sessionStorage.getItem("nexus_admin_token");
    if (saved) {
      verifyToken(saved);
    } else {
      setAuthChecking(false);
    }
  }, [verifyToken]);

  const handleLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!tokenInput.trim()) return;
    verifyToken(tokenInput.trim());
  };

  const handleLogout = () => {
    sessionStorage.removeItem("nexus_admin_token");
    setToken("");
    setIsAuthenticated(false);
    setTokenInput("");
  };

  // -----------------------------------------------------------
  // Data Loaders for each section
  // -----------------------------------------------------------
  const loadTabContent = useCallback(async () => {
    if (!isAuthenticated) return;
    setRefreshing(true);
    try {
      if (activeTab === "overview") {
        const data = await apiFetch("/api/admin/overview");
        if (data.ok) setOverview(data);
      } else if (activeTab === "engine") {
        const data = await apiFetch("/api/admin/engine");
        if (data.ok) setOverview((prev: any) => ({ ...prev, engine: data.settings, state: data.state }));
      } else if (activeTab === "bots") {
        const data = await apiFetch("/api/admin/bots");
        if (data.ok) setBots(data.bots || []);
      } else if (activeTab === "exchanges") {
        const data = await apiFetch("/api/admin/exchanges");
        if (data.ok) setExchange(data);
      } else if (activeTab === "strategies") {
        const data = await apiFetch("/api/admin/strategies");
        if (data.ok) setStrategies(data);
      } else if (activeTab === "risk") {
        const data = await apiFetch("/api/admin/risk");
        if (data.ok) setRiskData(data);
      } else if (activeTab === "positions") {
        const data = await apiFetch("/api/admin/positions");
        if (data.ok) setPositionsData(data);
      } else if (activeTab === "trades") {
        const data = await apiFetch("/api/admin/trades");
        if (data.ok) setTrades(data.trades || []);
      } else if (activeTab === "analytics") {
        const data = await apiFetch("/api/admin/analytics");
        if (data.ok) setAnalytics(data);
      } else if (activeTab === "integrations") {
        const data = await apiFetch("/api/admin/integrations");
        if (data.ok) setIntegrations(data.integrations || []);
      } else if (activeTab === "payments") {
        const data = await apiFetch("/api/admin/payments");
        if (data.ok) setPayments(data);
      } else if (activeTab === "users") {
        const data = await apiFetch("/api/admin/users");
        if (data.ok) setUsers(data.users || []);
      } else if (activeTab === "logs") {
        const data = await apiFetch("/api/admin/logs?limit=100");
        if (data.ok) setLogs(data.logs || []);
      } else if (activeTab === "audit") {
        const data = await apiFetch("/api/admin/audit-logs?limit=100");
        if (data.ok) setAuditLogs(data.auditLogs || []);
      } else if (activeTab === "settings") {
        const data = await apiFetch("/api/admin/settings");
        if (data.ok) setGeneralSettings(data.settings);
      } else if (activeTab === "blogs") {
        const [calData, artData, setData] = await Promise.all([
          apiFetch("/api/admin/blogs/calendar").catch(() => ({ ok: false })),
          apiFetch("/api/admin/blogs/articles").catch(() => ({ ok: false })),
          apiFetch("/api/admin/blogs/settings").catch(() => ({ ok: false })),
        ]);
        if (calData.ok) setBlogCalendar(calData.calendar || []);
        if (artData.ok) setBlogArticles(artData.articles || []);
        if (setData.ok) setBlogSettings(setData.settings);
      }
    } catch (err) {
      console.error("Tab data fetch error:", err);
    } finally {
      setRefreshing(false);
    }
  }, [isAuthenticated, activeTab, apiFetch]);

  useEffect(() => {
    loadTabContent();
  }, [loadTabContent]);

  // Auto refresh interval (15s)
  useEffect(() => {
    if (!isAuthenticated || !autoRefresh) return;
    const interval = setInterval(() => {
      loadTabContent();
    }, 15000);
    return () => clearInterval(interval);
  }, [isAuthenticated, autoRefresh, loadTabContent]);

  const notify = (text: string, type: "success" | "error" | "info" = "info") => {
    setActionMessage({ text, type });
    setTimeout(() => setActionMessage(null), 5000);
  };

  // -----------------------------------------------------------
  // Action Handlers
  // -----------------------------------------------------------
  const handleEngineAction = async (action: string, extra: Record<string, unknown> = {}) => {
    setLoading(true);
    try {
      const res = await apiFetch("/api/admin/engine", {
        method: "POST",
        body: JSON.stringify({ action, ...extra }),
      });
      notify(res.message || `Action ${action} completed successfully`, "success");
      loadTabContent();
    } catch (err) {
      notify(err instanceof Error ? err.message : "Engine action failed", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleStartEngineConfirm = async () => {
    if (startAckText !== "I_UNDERSTAND_REAL_MONEY_RISK") {
      notify("Acknowledgement must match exactly: I_UNDERSTAND_REAL_MONEY_RISK", "error");
      return;
    }
    await handleEngineAction("START", { acknowledgement: startAckText });
    setStartEngineModalOpen(false);
    setStartAckText("");
  };

  const handleEmergencyStopConfirm = async () => {
    if (emergencyConfirmationText !== "EMERGENCY_STOP") {
      notify("Confirmation must match exactly: EMERGENCY_STOP", "error");
      return;
    }
    setLoading(true);
    try {
      const res = await apiFetch("/api/admin/risk", {
        method: "POST",
        body: JSON.stringify({ action: "EMERGENCY_STOP", confirmation: "EMERGENCY_STOP" }),
      });
      notify(res.message || "EMERGENCY KILL SWITCH ENGAGED", "success");
      setEmergencyModalOpen(false);
      setEmergencyConfirmationText("");
      loadTabContent();
    } catch (err) {
      notify(err instanceof Error ? err.message : "Emergency Stop failed", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleClosePositionConfirm = async () => {
    if (closeConfirmationText !== "CLOSE_MANAGED_POSITION") {
      notify("Confirmation must match exactly: CLOSE_MANAGED_POSITION", "error");
      return;
    }
    setLoading(true);
    try {
      const res = await apiFetch("/api/admin/positions/close", {
        method: "POST",
        body: JSON.stringify({ confirmation: "CLOSE_MANAGED_POSITION" }),
      });
      notify(res.message || `Position closed: ${res.outcome}`, res.ok ? "success" : "error");
      setClosePositionModalOpen(false);
      setCloseConfirmationText("");
      loadTabContent();
    } catch (err) {
      notify(err instanceof Error ? err.message : "Close position failed", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleTriggerCycleNow = async (forceResearch = false) => {
    await handleEngineAction("TRIGGER_CYCLE", { forceResearch });
  };

  const handleUserAction = async (licenseId: string, action: string, extra: Record<string, unknown> = {}) => {
    setLoading(true);
    try {
      const res = await apiFetch("/api/admin/users", {
        method: "POST",
        body: JSON.stringify({ licenseId, action, ...extra }),
      });
      notify(res.message || "User action completed", "success");
      loadTabContent();
    } catch (err) {
      notify(err instanceof Error ? err.message : "Action failed", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateBlogNow = async (dayNumber?: number) => {
    setGeneratingBlog(true);
    try {
      const res = await apiFetch("/api/admin/blogs/generate", {
        method: "POST",
        body: JSON.stringify(dayNumber !== undefined ? { dayNumber } : {}),
      });
      notify(res.message || "Article generated successfully", "success");
      loadTabContent();
    } catch (err) {
      notify(err instanceof Error ? err.message : "Blog generation failed", "error");
    } finally {
      setGeneratingBlog(false);
    }
  };

  const handleApproveBlog = async (articleId: number) => {
    setLoading(true);
    try {
      const res = await apiFetch("/api/admin/blogs/approve", {
        method: "POST",
        body: JSON.stringify({ articleId }),
      });
      notify(res.message || "Article approved and published", "success");
      loadTabContent();
    } catch (err) {
      notify(err instanceof Error ? err.message : "Approval failed", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleToggleAutoPublish = async (enabled: boolean) => {
    setLoading(true);
    try {
      const res = await apiFetch("/api/admin/blogs/settings", {
        method: "POST",
        body: JSON.stringify({ autoPublishEnabled: enabled }),
      });
      notify("Auto-publish setting updated", "success");
      setBlogSettings(res.settings);
    } catch (err) {
      notify(err instanceof Error ? err.message : "Failed to update settings", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadCsv = () => {
    const exportUrl = `/api/admin/trades?export=csv`;
    window.open(exportUrl, "_blank");
  };

  // -----------------------------------------------------------
  // Tab definitions
  // -----------------------------------------------------------
  const pendingCount = blogArticles.filter((a) => a.status === "pending_approval").length;

  const navTabs = [
    { id: "overview", label: "Overview", icon: Activity, badge: null },
    { id: "engine", label: "Trading Engine", icon: Cpu, badge: overview?.engine?.status === "running" ? "LIVE" : null },
    { id: "bots", label: "Bot Instances", icon: Bot, badge: overview?.metrics?.totalBots || null },
    { id: "exchanges", label: "Exchange Connect", icon: Wallet, badge: overview?.exchange?.status === "connected" ? "OK" : "CHECK" },
    { id: "strategies", label: "Strategy Management", icon: Sparkles, badge: null },
    { id: "risk", label: "Risk Management", icon: ShieldAlert, badge: null },
    { id: "positions", label: "Positions & Orders", icon: Layers, badge: overview?.engine?.hasManagedPosition ? "1 OPEN" : null },
    { id: "trades", label: "Trade History", icon: Clock, badge: null },
    { id: "analytics", label: "Performance Analytics", icon: BarChart3, badge: null },
    { id: "blogs", label: "Daily Blog & SEO Engine", icon: FileText, badge: pendingCount > 0 ? `${pendingCount} REVIEW` : null },
    { id: "integrations", label: "API Integrations", icon: Globe, badge: "4" },
    { id: "payments", label: "Payment Gateways", icon: CreditCard, badge: null },
    { id: "users", label: "Users & Accounts", icon: Users, badge: null },
    { id: "logs", label: "System Logs", icon: Terminal, badge: null },
    { id: "audit", label: "Security & Audit", icon: Shield, badge: null },
    { id: "settings", label: "General Settings", icon: Settings, badge: null },
  ];

  // -----------------------------------------------------------
  // Render: Auth Screen if not logged in
  // -----------------------------------------------------------
  if (authChecking) {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center text-zinc-300">
        <RefreshCw className="w-8 h-8 animate-spin text-lime-400 mb-4" />
        <p className="text-sm tracking-wider uppercase font-mono">Authenticating Nexus Admin...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center px-4 font-sans antialiased text-zinc-100">
        <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl p-8 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-lime-500 via-cyan-500 to-amber-500" />

          <div className="flex items-center gap-3 mb-6">
            <div className="p-3 bg-lime-400/10 border border-lime-400/20 rounded-xl text-lime-400">
              <Shield className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white tracking-tight">Nexus Trader AI</h1>
              <p className="text-xs text-zinc-400 font-mono">Administration & Control Center</p>
            </div>
          </div>

          <form onSubmit={handleLoginSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-2">
                Trading Admin Bearer Token
              </label>
              <div className="relative">
                <input
                  type={showTokenInput ? "text" : "password"}
                  value={tokenInput}
                  onChange={(e) => setTokenInput(e.target.value)}
                  placeholder="Paste TRADING_ADMIN_TOKEN..."
                  className="w-full px-4 py-3 bg-zinc-950 border border-zinc-700 rounded-xl text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-lime-400 pr-10 font-mono"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowTokenInput(!showTokenInput)}
                  className="absolute right-3 top-3 text-zinc-400 hover:text-zinc-200"
                >
                  {showTokenInput ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {authError && (
              <div className="p-3 rounded-lg bg-red-950/50 border border-red-800 text-red-300 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{authError}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !tokenInput.trim()}
              className="w-full py-3 bg-lime-400 hover:bg-lime-300 text-zinc-950 font-semibold rounded-xl text-sm transition-all duration-150 flex items-center justify-center gap-2 disabled:opacity-50 shadow-lg shadow-lime-400/10 cursor-pointer"
            >
              {loading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" /> Verifying Credentials...
                </>
              ) : (
                <>
                  <Lock className="w-4 h-4" /> Authenticate Admin Console
                </>
              )}
            </button>
          </form>

          <div className="mt-6 pt-4 border-t border-zinc-800 text-center">
            <p className="text-[11px] text-zinc-500">
              Authorized personnel only. All access attempts and commands are cryptographically audited.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // -----------------------------------------------------------
  // Render: Main Admin Dashboard
  // -----------------------------------------------------------
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col font-sans selection:bg-lime-400 selection:text-zinc-950">
      {/* Top Banner Notifications */}
      {actionMessage && (
        <div
          className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl border shadow-2xl text-sm flex items-center gap-3 animate-in fade-in slide-in-from-top-4 duration-200 ${
            actionMessage.type === "success"
              ? "bg-zinc-900 border-lime-500/50 text-lime-300"
              : actionMessage.type === "error"
              ? "bg-zinc-900 border-red-500/50 text-red-300"
              : "bg-zinc-900 border-cyan-500/50 text-cyan-300"
          }`}
        >
          {actionMessage.type === "success" && <CheckCircle2 className="w-5 h-5 text-lime-400" />}
          {actionMessage.type === "error" && <AlertTriangle className="w-5 h-5 text-red-400" />}
          {actionMessage.type === "info" && <HelpCircle className="w-5 h-5 text-cyan-400" />}
          <span>{actionMessage.text}</span>
          <button onClick={() => setActionMessage(null)} className="ml-2 text-zinc-500 hover:text-zinc-300">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Header Bar */}
      <header className="h-16 border-b border-zinc-800/80 bg-zinc-900/90 backdrop-blur-md px-6 flex items-center justify-between sticky top-0 z-40">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-lime-400/10 border border-lime-400/30 rounded-lg text-lime-400">
              <Bot className="w-5 h-5" />
            </div>
            <div>
              <span className="font-bold text-white text-base tracking-tight">Nexus Admin Center</span>
              <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 font-mono border border-zinc-700">
                v5.1.0-PROD
              </span>
            </div>
          </div>

          <div className="hidden md:flex items-center gap-2 pl-4 border-l border-zinc-800 text-xs">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                overview?.engine?.status === "running"
                  ? "bg-lime-400 animate-pulse"
                  : overview?.engine?.status === "paused"
                  ? "bg-amber-400"
                  : "bg-zinc-600"
              }`}
            />
            <span className="text-zinc-400 capitalize">
              Engine: <strong className="text-white">{overview?.engine?.status || "Idle"}</strong>
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => loadTabContent()}
            disabled={refreshing}
            className="p-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors text-xs flex items-center gap-1.5 cursor-pointer"
            title="Refresh current tab"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin text-lime-400" : ""}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>

          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-mono border flex items-center gap-1.5 cursor-pointer transition-colors ${
              autoRefresh
                ? "bg-lime-400/10 border-lime-400/30 text-lime-400"
                : "bg-zinc-800 border-zinc-700 text-zinc-400"
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Auto (15s)</span>
          </button>

          {/* Emergency Kill Switch Button in Header */}
          <button
            onClick={() => setEmergencyModalOpen(true)}
            className="px-3 py-1.5 rounded-lg bg-red-600/20 hover:bg-red-600/30 border border-red-500/40 text-red-300 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer shadow-sm hover:shadow-red-600/20"
          >
            <AlertOctagon className="w-3.5 h-3.5 text-red-400" />
            <span className="hidden sm:inline">Emergency Stop</span>
          </button>

          <button
            onClick={handleLogout}
            className="p-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-red-300 transition-colors cursor-pointer"
            title="Sign out of admin"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Layout Body: Sidebar + Main Workspace */}
      <div className="flex-1 flex overflow-hidden">
        {/* Navigation Sidebar */}
        <aside className="w-64 border-r border-zinc-800/80 bg-zinc-900/40 p-3 flex flex-col justify-between shrink-0 overflow-y-auto">
          <div className="space-y-1">
            <div className="px-3 py-2 text-[10px] font-mono uppercase tracking-wider text-zinc-500">
              System Control
            </div>
            {navTabs.slice(0, 6).map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-all cursor-pointer ${
                    isActive
                      ? "bg-lime-400/10 text-lime-400 border border-lime-400/20 font-semibold"
                      : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Icon className={`w-4 h-4 ${isActive ? "text-lime-400" : "text-zinc-500"}`} />
                    <span>{tab.label}</span>
                  </div>
                  {tab.badge && (
                    <span
                      className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                        isActive
                          ? "bg-lime-400/20 text-lime-300"
                          : "bg-zinc-800 text-zinc-400"
                      }`}
                    >
                      {tab.badge}
                    </span>
                  )}
                </button>
              );
            })}

            <div className="px-3 pt-4 pb-2 text-[10px] font-mono uppercase tracking-wider text-zinc-500">
              Trading & Analytics
            </div>
            {navTabs.slice(6, 9).map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-all cursor-pointer ${
                    isActive
                      ? "bg-lime-400/10 text-lime-400 border border-lime-400/20 font-semibold"
                      : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Icon className={`w-4 h-4 ${isActive ? "text-lime-400" : "text-zinc-500"}`} />
                    <span>{tab.label}</span>
                  </div>
                  {tab.badge && (
                    <span
                      className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                        isActive
                          ? "bg-lime-400/20 text-lime-300"
                          : "bg-zinc-800 text-zinc-400"
                      }`}
                    >
                      {tab.badge}
                    </span>
                  )}
                </button>
              );
            })}

            <div className="px-3 pt-4 pb-2 text-[10px] font-mono uppercase tracking-wider text-zinc-500">
              Platform & Security
            </div>
            {navTabs.slice(9).map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-all cursor-pointer ${
                    isActive
                      ? "bg-lime-400/10 text-lime-400 border border-lime-400/20 font-semibold"
                      : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Icon className={`w-4 h-4 ${isActive ? "text-lime-400" : "text-zinc-500"}`} />
                    <span>{tab.label}</span>
                  </div>
                  {tab.badge && (
                    <span
                      className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                        isActive
                          ? "bg-lime-400/20 text-lime-300"
                          : "bg-zinc-800 text-zinc-400"
                      }`}
                    >
                      {tab.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Sidebar Footer info */}
          <div className="p-3 bg-zinc-950/60 rounded-xl border border-zinc-800/80 text-[11px] text-zinc-400 space-y-1">
            <div className="flex justify-between items-center">
              <span>Environment:</span>
              <span className="font-mono text-lime-400 uppercase">Mainnet</span>
            </div>
            <div className="flex justify-between items-center">
              <span>Binance Ping:</span>
              <span className="font-mono text-zinc-300">
                {overview?.exchange?.latencyMs ? `${overview.exchange.latencyMs} ms` : "N/A"}
              </span>
            </div>
          </div>
        </aside>

        {/* Main Content Workspace */}
        <main className="flex-1 p-6 overflow-y-auto bg-zinc-950">
          {/* Section 1: OVERVIEW */}
          {activeTab === "overview" && (
            <div className="space-y-6 max-w-7xl mx-auto">
              {/* Header with Title and Quick Controls */}
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-4 border-b border-zinc-800">
                <div>
                  <h2 className="text-xl font-bold text-white tracking-tight">System Overview</h2>
                  <p className="text-xs text-zinc-400">
                    Real-time operational metrics across Binance Futures execution and customer tenant instances.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                  {overview?.engine?.status !== "running" ? (
                    <button
                      onClick={() => setStartEngineModalOpen(true)}
                      className="px-3.5 py-2 rounded-xl bg-lime-400 hover:bg-lime-300 text-zinc-950 font-semibold text-xs flex items-center gap-1.5 transition cursor-pointer shadow-lg shadow-lime-400/10"
                    >
                      <Play className="w-3.5 h-3.5 fill-current" /> Start Engine
                    </button>
                  ) : (
                    <button
                      onClick={() => handleEngineAction("STOP")}
                      className="px-3.5 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-semibold text-xs flex items-center gap-1.5 transition cursor-pointer border border-zinc-700"
                    >
                      <Pause className="w-3.5 h-3.5" /> Stop Engine
                    </button>
                  )}

                  <button
                    onClick={() => handleTriggerCycleNow(false)}
                    disabled={loading}
                    className="px-3.5 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer border border-zinc-700"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
                    <span>Run Cycle Now</span>
                  </button>

                  <button
                    onClick={() => setEmergencyModalOpen(true)}
                    className="px-3.5 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white font-semibold text-xs flex items-center gap-1.5 transition cursor-pointer shadow-lg shadow-red-600/20"
                  >
                    <AlertOctagon className="w-3.5 h-3.5" /> Emergency Kill Switch
                  </button>
                </div>
              </div>

              {/* Status Banner */}
              {overview?.engine?.pausedReason && (
                <div className="p-4 rounded-xl bg-amber-950/40 border border-amber-800/80 text-amber-300 text-xs flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
                    <span>
                      <strong>Engine Currently Paused:</strong> {overview.engine.pausedReason}
                    </span>
                  </div>
                  <button
                    onClick={() => handleEngineAction("RESUME")}
                    className="px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-500/30 text-xs font-semibold cursor-pointer"
                  >
                    Clear Pause & Resume
                  </button>
                </div>
              )}

              {/* Metrics Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="p-5 rounded-2xl bg-zinc-900 border border-zinc-800/80 space-y-2">
                  <div className="flex items-center justify-between text-xs text-zinc-400">
                    <span>Engine Status</span>
                    <Cpu className="w-4 h-4 text-zinc-500" />
                  </div>
                  <div className="text-2xl font-bold text-white capitalize flex items-center gap-2">
                    <span
                      className={`w-3 h-3 rounded-full ${
                        overview?.engine?.status === "running"
                          ? "bg-lime-400 shadow-md shadow-lime-400/50"
                          : overview?.engine?.status === "paused"
                          ? "bg-amber-400"
                          : "bg-zinc-600"
                      }`}
                    />
                    {overview?.engine?.status || "Idle"}
                  </div>
                  <div className="text-xs text-zinc-500">
                    Pair: <strong className="text-zinc-300">{overview?.engine?.symbol || "BTCUSDT"}</strong> (
                    {overview?.engine?.interval || "1h"})
                  </div>
                </div>

                <div className="p-5 rounded-2xl bg-zinc-900 border border-zinc-800/80 space-y-2">
                  <div className="flex items-center justify-between text-xs text-zinc-400">
                    <span>Futures Margin Balance</span>
                    <Wallet className="w-4 h-4 text-zinc-500" />
                  </div>
                  <div className="text-2xl font-bold font-mono text-white">
                    {overview?.metrics?.marginBalance !== "Unavailable"
                      ? `$${overview?.metrics?.marginBalance}`
                      : "Unavailable"}
                  </div>
                  <div className="text-xs text-zinc-500">
                    Available:{" "}
                    <span className="font-mono text-zinc-300">
                      {overview?.metrics?.availableBalance !== "Unavailable"
                        ? `$${overview?.metrics?.availableBalance}`
                        : "N/A"}
                    </span>
                  </div>
                </div>

                <div className="p-5 rounded-2xl bg-zinc-900 border border-zinc-800/80 space-y-2">
                  <div className="flex items-center justify-between text-xs text-zinc-400">
                    <span>Realized P&L / Win Rate</span>
                    <TrendingUp className="w-4 h-4 text-lime-400" />
                  </div>
                  <div className="text-2xl font-bold font-mono text-lime-400">
                    ${overview?.metrics?.totalRealizedPnl || "0.00"}
                  </div>
                  <div className="text-xs text-zinc-500 flex items-center gap-2">
                    <span>
                      Win Rate: <strong className="text-zinc-300">{overview?.metrics?.winRatePct || "0.0"}%</strong>
                    </span>
                    <span>•</span>
                    <span>{overview?.metrics?.totalTradesCount || 0} Trades</span>
                  </div>
                </div>

                <div className="p-5 rounded-2xl bg-zinc-900 border border-zinc-800/80 space-y-2">
                  <div className="flex items-center justify-between text-xs text-zinc-400">
                    <span>Active Bot Instances</span>
                    <Bot className="w-4 h-4 text-cyan-400" />
                  </div>
                  <div className="text-2xl font-bold font-mono text-cyan-400">
                    {overview?.metrics?.activeBots || 0}{" "}
                    <span className="text-xs font-normal text-zinc-500 font-sans">
                      / {overview?.metrics?.totalBots || 0} total
                    </span>
                  </div>
                  <div className="text-xs text-zinc-500">
                    Paused: <strong className="text-amber-400">{overview?.metrics?.pausedBots || 0}</strong>
                  </div>
                </div>
              </div>

              {/* Engine State & Live Event Feed */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Engine Card */}
                <div className="p-5 rounded-2xl bg-zinc-900 border border-zinc-800/80 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                      <Cpu className="w-4 h-4 text-lime-400" /> Execution Status
                    </h3>
                    <span className="text-xs px-2 py-0.5 rounded bg-zinc-800 font-mono text-zinc-400">
                      Isolated {overview?.engine?.leverage || 2}x
                    </span>
                  </div>

                  <div className="space-y-2.5 text-xs">
                    <div className="flex justify-between py-1.5 border-b border-zinc-800/60">
                      <span className="text-zinc-400">Managed Position:</span>
                      <span className="font-mono">
                        {overview?.engine?.hasManagedPosition ? (
                          <strong className="text-lime-400">
                            OPEN ({overview?.engine?.activePositionAmount || "0"} BTC)
                          </strong>
                        ) : (
                          <span className="text-zinc-500">Flat (No Position)</span>
                        )}
                      </span>
                    </div>

                    <div className="flex justify-between py-1.5 border-b border-zinc-800/60">
                      <span className="text-zinc-400">Exchange API:</span>
                      <span className="font-mono">
                        {overview?.exchange?.status === "connected" ? (
                          <strong className="text-lime-400">Connected ({overview.exchange.latencyMs} ms)</strong>
                        ) : (
                          <span className="text-zinc-500">{overview?.exchange?.status || "Unavailable"}</span>
                        )}
                      </span>
                    </div>

                    <div className="flex justify-between py-1.5 border-b border-zinc-800/60">
                      <span className="text-zinc-400">Google Gemini AI:</span>
                      <span className="font-mono text-zinc-300">
                        {overview?.systemHealth?.geminiAi === "configured" ? (
                          <strong className="text-cyan-400">Active (gemini-2.5-flash)</strong>
                        ) : (
                          <span className="text-amber-400">Not Configured</span>
                        )}
                      </span>
                    </div>

                    <div className="flex justify-between py-1.5 border-b border-zinc-800/60">
                      <span className="text-zinc-400">Cloudflare D1 DB:</span>
                      <span className="font-mono text-lime-400">Online (Edge)</span>
                    </div>

                    <div className="flex justify-between py-1.5">
                      <span className="text-zinc-400">Worker Cron Scheduler:</span>
                      <span className="font-mono text-zinc-300">Every 1 min (* * * * *)</span>
                    </div>
                  </div>

                  <div className="pt-2 flex gap-2">
                    <button
                      onClick={() => handleEngineAction("RESTART")}
                      className="w-full py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-xl text-xs font-semibold transition cursor-pointer flex items-center justify-center gap-1.5"
                    >
                      <RotateCcw className="w-3.5 h-3.5" /> Restart Workers
                    </button>
                    {overview?.engine?.hasManagedPosition && (
                      <button
                        onClick={() => setClosePositionModalOpen(true)}
                        className="w-full py-2 bg-red-600/20 hover:bg-red-600/30 text-red-300 border border-red-500/30 rounded-xl text-xs font-semibold transition cursor-pointer flex items-center justify-center gap-1.5"
                      >
                        <XCircle className="w-3.5 h-3.5" /> Close Position
                      </button>
                    )}
                  </div>
                </div>

                {/* Event Feed */}
                <div className="lg:col-span-2 p-5 rounded-2xl bg-zinc-900 border border-zinc-800/80 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                      <Terminal className="w-4 h-4 text-cyan-400" /> Live Engine Event Stream
                    </h3>
                    <span className="text-xs text-zinc-500 font-mono">Last 15 events</span>
                  </div>

                  <div className="space-y-2 max-h-72 overflow-y-auto pr-2">
                    {overview?.recentEvents && overview.recentEvents.length > 0 ? (
                      overview.recentEvents.map((ev) => (
                        <div
                          key={ev.id}
                          className="p-2.5 rounded-xl bg-zinc-950/80 border border-zinc-800/60 text-xs flex items-start gap-3"
                        >
                          <span
                            className={`mt-0.5 text-[10px] font-mono uppercase px-1.5 py-0.5 rounded font-bold ${
                              ev.level === "critical"
                                ? "bg-red-950 border border-red-800 text-red-400"
                                : ev.level === "warning"
                                ? "bg-amber-950 border border-amber-800 text-amber-400"
                                : "bg-zinc-800 text-zinc-400"
                            }`}
                          >
                            {ev.level}
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                              <span className="font-semibold text-zinc-200 truncate">{ev.event_type}</span>
                              <span className="text-[10px] font-mono text-zinc-500">
                                {new Date(ev.created_at * 1000).toLocaleTimeString()}
                              </span>
                            </div>
                            <p className="text-zinc-400 text-[11px] truncate mt-0.5">{ev.message}</p>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="p-8 text-center text-xs text-zinc-500">
                        No recent engine events recorded yet.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Section 2: TRADING ENGINE */}
          {activeTab === "engine" && (
            <div className="space-y-6 max-w-6xl mx-auto">
              <div className="flex items-center justify-between pb-4 border-b border-zinc-800">
                <div>
                  <h2 className="text-xl font-bold text-white tracking-tight">Trading Engine Administration</h2>
                  <p className="text-xs text-zinc-400">
                    Direct controls over the worker cycle runner, state machine, and risk guardrails.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="p-5 rounded-2xl bg-zinc-900 border border-zinc-800/80 space-y-4">
                  <h3 className="text-sm font-semibold text-white">Engine Lifecycle State</h3>

                  <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800 space-y-2">
                    <div className="flex justify-between text-xs">
                      <span className="text-zinc-400">Current Status:</span>
                      <span className="font-mono font-bold capitalize text-lime-400">
                        {overview?.engine?.status || "Idle"}
                      </span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-zinc-400">Execution Symbol:</span>
                      <span className="font-mono text-zinc-200">{overview?.engine?.symbol || "BTCUSDT"}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-zinc-400">Candle Interval:</span>
                      <span className="font-mono text-zinc-200">{overview?.engine?.interval || "1h"}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-zinc-400">Leverage:</span>
                      <span className="font-mono text-zinc-200">{overview?.engine?.leverage || 2}x Isolated</span>
                    </div>
                  </div>

                  <div className="space-y-2 pt-2">
                    <h4 className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">Engine Controls</h4>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => setStartEngineModalOpen(true)}
                        className="p-3 rounded-xl bg-lime-400/10 hover:bg-lime-400/20 border border-lime-400/30 text-lime-300 text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <Play className="w-3.5 h-3.5" /> Start Engine
                      </button>
                      <button
                        onClick={() => handleEngineAction("STOP")}
                        className="p-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <Pause className="w-3.5 h-3.5" /> Stop Engine
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <button
                        onClick={() => handleEngineAction("PAUSE", { reason: "Admin manual pause" })}
                        className="p-3 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-300 text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <Pause className="w-3.5 h-3.5" /> Pause Entries
                      </button>
                      <button
                        onClick={() => handleEngineAction("RESUME")}
                        className="p-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <Play className="w-3.5 h-3.5" /> Resume Entries
                      </button>
                    </div>

                    <button
                      onClick={() => handleEngineAction("RESTART")}
                      className="w-full py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer mt-2"
                    >
                      <RotateCcw className="w-3.5 h-3.5" /> Reset Cycle Locks & Restart Worker
                    </button>
                  </div>
                </div>

                <div className="p-5 rounded-2xl bg-zinc-900 border border-zinc-800/80 space-y-4">
                  <h3 className="text-sm font-semibold text-white">Manual Cycle Execution</h3>
                  <p className="text-xs text-zinc-400">
                    Trigger an immediate, on-demand evaluation cycle. Evaluates completed 1-hour candles, Gemini macro
                    sentiment, risk rules, and places orders if conditions align.
                  </p>

                  <div className="space-y-3 pt-2">
                    <button
                      onClick={() => handleTriggerCycleNow(false)}
                      disabled={loading}
                      className="w-full py-3 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer transition shadow-sm"
                    >
                      <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin text-lime-400" : ""}`} />
                      <span>Run Standard Cycle (Cache-Aware)</span>
                    </button>

                    <button
                      onClick={() => handleTriggerCycleNow(true)}
                      disabled={loading}
                      className="w-full py-3 bg-cyan-950/40 hover:bg-cyan-950/60 border border-cyan-800 text-cyan-300 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer transition"
                    >
                      <Sparkles className="w-4 h-4 text-cyan-400" />
                      <span>Run Cycle with Forced Gemini Research</span>
                    </button>
                  </div>

                  <div className="p-4 rounded-xl bg-zinc-950/60 border border-zinc-800/80 text-[11px] text-zinc-400 space-y-2 mt-4">
                    <div className="font-semibold text-zinc-300 flex items-center gap-1.5">
                      <Shield className="w-3.5 h-3.5 text-lime-400" /> Real-Money Protection Principles:
                    </div>
                    <ul className="list-disc list-inside space-y-1 text-zinc-400 pl-1">
                      <li>Stopping the engine NEVER automatically liquidates active positions.</li>
                      <li>Only completed candle closes trigger signal evaluations.</li>
                      <li>Exchange-native algo orders protect against network failure.</li>
                      <li>Isolated margin limits loss to the allocated position only.</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Section 3: BOT INSTANCES */}
          {activeTab === "bots" && (
            <div className="space-y-6 max-w-7xl mx-auto">
              <div className="flex items-center justify-between pb-4 border-b border-zinc-800">
                <div>
                  <h2 className="text-xl font-bold text-white tracking-tight">Bot Instances</h2>
                  <p className="text-xs text-zinc-400">
                    Master engine and customer tenant trading instances operating across isolated environments.
                  </p>
                </div>
              </div>

              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden shadow-xl">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-zinc-300">
                    <thead className="bg-zinc-950/80 text-zinc-400 uppercase tracking-wider font-mono text-[11px] border-b border-zinc-800">
                      <tr>
                        <th className="py-3.5 px-4">Instance / ID</th>
                        <th className="py-3.5 px-4">Type</th>
                        <th className="py-3.5 px-4">Pair</th>
                        <th className="py-3.5 px-4">Status</th>
                        <th className="py-3.5 px-4">Leverage / Max USDT</th>
                        <th className="py-3.5 px-4">Managed Position</th>
                        <th className="py-3.5 px-4">API Key Hint</th>
                        <th className="py-3.5 px-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/60 font-sans">
                      {bots.length > 0 ? (
                        bots.map((bot) => (
                          <tr key={bot.id} className="hover:bg-zinc-800/30 transition-colors">
                            <td className="py-3.5 px-4">
                              <div className="font-semibold text-white">{bot.name}</div>
                              <div className="font-mono text-[10px] text-zinc-500 truncate max-w-xs">{bot.id}</div>
                            </td>
                            <td className="py-3.5 px-4">
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-mono uppercase ${
                                  bot.type === "master"
                                    ? "bg-lime-400/10 text-lime-300 border border-lime-400/30 font-bold"
                                    : "bg-cyan-400/10 text-cyan-300 border border-cyan-400/30"
                                }`}
                              >
                                {bot.type}
                              </span>
                            </td>
                            <td className="py-3.5 px-4 font-mono font-bold text-white">
                              {bot.symbol} <span className="text-zinc-500 font-normal">({bot.interval})</span>
                            </td>
                            <td className="py-3.5 px-4">
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-mono uppercase inline-flex items-center gap-1.5 ${
                                  bot.status === "running"
                                    ? "bg-lime-950 text-lime-400 border border-lime-800 font-bold"
                                    : bot.status === "paused"
                                    ? "bg-amber-950 text-amber-400 border border-amber-800"
                                    : "bg-zinc-800 text-zinc-400"
                                }`}
                              >
                                <span
                                  className={`w-1.5 h-1.5 rounded-full ${
                                    bot.status === "running"
                                      ? "bg-lime-400 animate-pulse"
                                      : bot.status === "paused"
                                      ? "bg-amber-400"
                                      : "bg-zinc-500"
                                  }`}
                                />
                                {bot.status}
                              </span>
                            </td>
                            <td className="py-3.5 px-4 font-mono">
                              {bot.leverage}x / ${bot.maxNotionalUsdt}
                            </td>
                            <td className="py-3.5 px-4">
                              {bot.hasManagedPosition ? (
                                <span className="text-lime-400 font-mono font-bold">
                                  OPEN ({bot.activePositionAmount})
                                </span>
                              ) : (
                                <span className="text-zinc-500">None</span>
                              )}
                            </td>
                            <td className="py-3.5 px-4 font-mono text-zinc-400">
                              {bot.apiKeyHint || "••••••••"}
                            </td>
                            <td className="py-3.5 px-4 text-right">
                              {bot.type === "master" ? (
                                <button
                                  onClick={() => handleTriggerCycleNow(false)}
                                  className="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-xs cursor-pointer font-medium"
                                >
                                  Run Cycle
                                </button>
                              ) : (
                                <span className="text-zinc-500 text-[11px]">Tenant Managed</span>
                              )}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={8} className="py-8 text-center text-zinc-500">
                            No bot instances loaded.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Section 4: EXCHANGE CONNECTIONS */}
          {activeTab === "exchanges" && (
            <div className="space-y-6 max-w-5xl mx-auto">
              <div className="flex items-center justify-between pb-4 border-b border-zinc-800">
                <div>
                  <h2 className="text-xl font-bold text-white tracking-tight">Exchange Connections</h2>
                  <p className="text-xs text-zinc-400">
                    Live connection status, permissions validation, and balances from Binance Futures USDT-M.
                  </p>
                </div>
                <button
                  onClick={() => loadTabContent()}
                  className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-xl text-xs flex items-center gap-1.5 cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> Test Ping Latency
                </button>
              </div>

              {exchange && exchange.configured ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="p-5 rounded-2xl bg-zinc-900 border border-zinc-800/80 space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                        <Wallet className="w-4 h-4 text-lime-400" /> Account Balances
                      </h3>
                      <span className="text-xs font-mono px-2 py-0.5 rounded bg-lime-400/10 text-lime-400 border border-lime-400/20">
                        {exchange.environment.toUpperCase()}
                      </span>
                    </div>

                    <div className="space-y-2 text-xs">
                      <div className="flex justify-between py-2 border-b border-zinc-800/60">
                        <span className="text-zinc-400">Total Margin Balance:</span>
                        <span className="font-mono font-bold text-white text-sm">
                          ${exchange.account?.totalMarginBalance || "0.00"}
                        </span>
                      </div>
                      <div className="flex justify-between py-2 border-b border-zinc-800/60">
                        <span className="text-zinc-400">Available Balance:</span>
                        <span className="font-mono text-zinc-200">
                          ${exchange.account?.availableBalance || "0.00"}
                        </span>
                      </div>
                      <div className="flex justify-between py-2 border-b border-zinc-800/60">
                        <span className="text-zinc-400">Unrealized P&L:</span>
                        <span
                          className={`font-mono font-bold ${
                            Number(exchange.account?.totalUnrealizedProfit || 0) >= 0
                              ? "text-lime-400"
                              : "text-red-400"
                          }`}
                        >
                          ${exchange.account?.totalUnrealizedProfit || "0.00"}
                        </span>
                      </div>
                      <div className="flex justify-between py-2">
                        <span className="text-zinc-400">Initial Margin Committed:</span>
                        <span className="font-mono text-zinc-400">
                          ${exchange.account?.totalInitialMargin || "0.00"}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="p-5 rounded-2xl bg-zinc-900 border border-zinc-800/80 space-y-4">
                    <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                      <Shield className="w-4 h-4 text-cyan-400" /> API Permissions & Security
                    </h3>

                    <div className="space-y-2 text-xs">
                      <div className="flex justify-between py-2 border-b border-zinc-800/60">
                        <span className="text-zinc-400">API Key Mask:</span>
                        <span className="font-mono text-zinc-300">{exchange.apiKeyHint}</span>
                      </div>
                      <div className="flex justify-between py-2 border-b border-zinc-800/60">
                        <span className="text-zinc-400">REST Latency:</span>
                        <span className="font-mono text-lime-400 font-bold">{exchange.latencyMs} ms</span>
                      </div>
                      <div className="flex justify-between py-2 border-b border-zinc-800/60">
                        <span className="text-zinc-400">Futures Trading Permission:</span>
                        <span className="font-mono">
                          {exchange.permissions?.futuresEnabled ? (
                            <strong className="text-lime-400">ENABLED</strong>
                          ) : (
                            <strong className="text-red-400">DISABLED</strong>
                          )}
                        </span>
                      </div>
                      <div className="flex justify-between py-2">
                        <span className="text-zinc-400">Withdrawals Permission:</span>
                        <span className="font-mono">
                          {exchange.permissions?.withdrawalsEnabled ? (
                            <strong className="text-red-400">ENABLED (SECURITY RISK)</strong>
                          ) : (
                            <strong className="text-lime-400">DISABLED (SAFE)</strong>
                          )}
                        </span>
                      </div>
                    </div>

                    <div className="p-3 bg-zinc-950 rounded-xl border border-zinc-800 text-[11px] text-zinc-400">
                      API restrictions adhere strictly to least-privilege standards: Futures execution only, zero
                      withdrawal permissions permitted.
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-8 rounded-2xl bg-zinc-900 border border-zinc-800 text-center space-y-3">
                  <AlertTriangle className="w-8 h-8 text-amber-400 mx-auto" />
                  <h3 className="text-base font-semibold text-white">Binance Credentials Not Configured</h3>
                  <p className="text-xs text-zinc-400 max-w-md mx-auto">
                    The master server environment does not have BINANCE_API_KEY or BINANCE_API_SECRET set. Tenant bots
                    operate via encrypted customer credentials.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Section 5: STRATEGY MANAGEMENT */}
          {activeTab === "strategies" && (
            <div className="space-y-6 max-w-6xl mx-auto">
              <div className="flex items-center justify-between pb-4 border-b border-zinc-800">
                <div>
                  <h2 className="text-xl font-bold text-white tracking-tight">Strategy Management</h2>
                  <p className="text-xs text-zinc-400">
                    Active algorithmic models: Multi-indicator confluence and Google Gemini macro sentiment.
                  </p>
                </div>
                <button
                  onClick={async () => {
                    setLoading(true);
                    try {
                      const res = await apiFetch("/api/admin/strategies", {
                        method: "POST",
                        body: JSON.stringify({ action: "TRIGGER_RESEARCH" }),
                      });
                      notify("Gemini macro research completed successfully", "success");
                      loadTabContent();
                    } catch (err) {
                      notify(err instanceof Error ? err.message : "Research trigger failed", "error");
                    } finally {
                      setLoading(false);
                    }
                  }}
                  disabled={loading}
                  className="px-3.5 py-2 bg-cyan-950/60 hover:bg-cyan-900/60 border border-cyan-800 text-cyan-300 rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                >
                  <Sparkles className="w-4 h-4 text-cyan-400" />
                  <span>Run AI Research Now</span>
                </button>
              </div>

              {/* Strategy Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="p-5 rounded-2xl bg-zinc-900 border border-zinc-800/80 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                      <Zap className="w-4 h-4 text-lime-400" /> Trend Momentum Confluence (Primary)
                    </h3>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-lime-400/10 text-lime-400 border border-lime-400/20 uppercase font-bold">
                      ACTIVE
                    </span>
                  </div>

                  <p className="text-xs text-zinc-400">
                    Evaluates 1-hour completed candles across EMA 50/200 trend alignment, RSI 14 momentum, MACD histogram,
                    and ATR volatility envelope. Requires 1.2x volume surge for entry.
                  </p>

                  <div className="space-y-1.5 text-xs font-mono">
                    <div className="p-2 rounded-lg bg-zinc-950 border border-zinc-800/80 flex justify-between">
                      <span className="text-zinc-500">Trend Filter:</span>
                      <span className="text-zinc-300">EMA 50 &gt; EMA 200 (Golden/Death Cross)</span>
                    </div>
                    <div className="p-2 rounded-lg bg-zinc-950 border border-zinc-800/80 flex justify-between">
                      <span className="text-zinc-500">Momentum:</span>
                      <span className="text-zinc-300">RSI (45-65 Entry Window)</span>
                    </div>
                    <div className="p-2 rounded-lg bg-zinc-950 border border-zinc-800/80 flex justify-between">
                      <span className="text-zinc-500">Stop Distance:</span>
                      <span className="text-zinc-300">1.8x ATR (Exchange-native Algo Order)</span>
                    </div>
                    <div className="p-2 rounded-lg bg-zinc-950 border border-zinc-800/80 flex justify-between">
                      <span className="text-zinc-500">Take Profit:</span>
                      <span className="text-zinc-300">2.5x ATR Risk-to-Reward</span>
                    </div>
                  </div>
                </div>

                {/* Gemini AI Card */}
                <div className="p-5 rounded-2xl bg-zinc-900 border border-zinc-800/80 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-cyan-400" /> Google Gemini AI Macro Filter
                    </h3>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-400/10 text-cyan-300 border border-cyan-400/20 font-bold">
                      {strategies?.latestResearch?.bias || "NEUTRAL"}
                    </span>
                  </div>

                  {strategies?.latestResearch ? (
                    <div className="space-y-3">
                      <div className="grid grid-cols-3 gap-2 text-center text-xs">
                        <div className="p-2 rounded-lg bg-zinc-950 border border-zinc-800">
                          <div className="text-[10px] text-zinc-500">Confidence</div>
                          <div className="font-bold text-cyan-400 font-mono text-sm">
                            {strategies.latestResearch.confidence}%
                          </div>
                        </div>
                        <div className="p-2 rounded-lg bg-zinc-950 border border-zinc-800">
                          <div className="text-[10px] text-zinc-500">Risk Level</div>
                          <div className="font-bold text-zinc-200 capitalize text-sm">
                            {strategies.latestResearch.riskLevel}
                          </div>
                        </div>
                        <div className="p-2 rounded-lg bg-zinc-950 border border-zinc-800">
                          <div className="text-[10px] text-zinc-500">Sentiment</div>
                          <div className="font-bold text-zinc-200 capitalize text-sm">
                            {strategies.latestResearch.sentiment}
                          </div>
                        </div>
                      </div>

                      <div className="p-3 bg-zinc-950 rounded-xl border border-zinc-800 text-xs text-zinc-300">
                        <div className="font-semibold text-zinc-400 text-[11px] mb-1">Institutional Summary:</div>
                        <p className="line-clamp-3 text-zinc-300">{strategies.latestResearch.summary}</p>
                      </div>

                      <div className="text-[10px] text-zinc-500 font-mono flex justify-between">
                        <span>Model: {strategies.latestResearch.model}</span>
                        <span>
                          Updated: {new Date(strategies.latestResearch.createdAt * 1000).toLocaleTimeString()}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="p-8 text-center text-xs text-zinc-500">
                      No research report generated yet. Click &apos;Run AI Research Now&apos;.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Section 6: RISK MANAGEMENT */}
          {activeTab === "risk" && (
            <div className="space-y-6 max-w-5xl mx-auto">
              <div className="flex items-center justify-between pb-4 border-b border-zinc-800">
                <div>
                  <h2 className="text-xl font-bold text-white tracking-tight">Risk Management & Safety Gates</h2>
                  <p className="text-xs text-zinc-400">
                    Mandatory server-side thresholds protecting real money capital against catastrophic drawdown.
                  </p>
                </div>
                <button
                  onClick={() => setEmergencyModalOpen(true)}
                  className="px-3.5 py-2 bg-red-600 hover:bg-red-500 text-white font-semibold text-xs rounded-xl flex items-center gap-1.5 cursor-pointer shadow-lg shadow-red-600/20"
                >
                  <AlertOctagon className="w-4 h-4" /> Global Kill Switch
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="p-5 rounded-2xl bg-zinc-900 border border-zinc-800/80 space-y-4">
                  <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                    <Shield className="w-4 h-4 text-lime-400" /> Active Risk Limits
                  </h3>

                  <div className="space-y-2.5 text-xs font-mono">
                    <div className="flex justify-between py-2 border-b border-zinc-800/60">
                      <span className="text-zinc-400">Max Risk per Trade:</span>
                      <span className="font-bold text-white">{riskData?.risk?.riskBps || 25} bps (0.25%)</span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-zinc-800/60">
                      <span className="text-zinc-400">Max Daily Loss:</span>
                      <span className="font-bold text-white">{riskData?.risk?.dailyLossBps || 100} bps (1.00%)</span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-zinc-800/60">
                      <span className="text-zinc-400">Max Leverage:</span>
                      <span className="font-bold text-white">{riskData?.risk?.leverage || 2}x Isolated</span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-zinc-800/60">
                      <span className="text-zinc-400">Max Position Notional:</span>
                      <span className="font-bold text-white">${riskData?.risk?.maxNotionalUsdt || 250} USDT</span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-zinc-800/60">
                      <span className="text-zinc-400">Loss Cooldown Window:</span>
                      <span className="font-bold text-white">{riskData?.risk?.cooldownMinutes || 1920} mins (32h)</span>
                    </div>
                    <div className="flex justify-between py-2">
                      <span className="text-zinc-400">Min AI Confidence:</span>
                      <span className="font-bold text-cyan-400">{riskData?.risk?.minResearchConfidence || 60}%</span>
                    </div>
                  </div>
                </div>

                <div className="p-5 rounded-2xl bg-zinc-900 border border-zinc-800/80 space-y-4">
                  <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-400" /> Risk Rejection Audit Feed
                  </h3>
                  <p className="text-xs text-zinc-400">
                    Automated blocks executed when market conditions breached safety parameters.
                  </p>

                  <div className="space-y-2 max-h-60 overflow-y-auto pr-2">
                    {riskData?.rejections && riskData.rejections.length > 0 ? (
                      riskData.rejections.map((rej: any) => (
                        <div key={rej.id} className="p-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-xs">
                          <div className="flex justify-between text-zinc-400 text-[10px] font-mono">
                            <span className="text-amber-400 font-bold">{rej.event_type}</span>
                            <span>{new Date(rej.created_at * 1000).toLocaleTimeString()}</span>
                          </div>
                          <p className="text-zinc-300 text-[11px] mt-1">{rej.message}</p>
                        </div>
                      ))
                    ) : (
                      <div className="p-6 text-center text-xs text-zinc-500">
                        Zero risk rejections recorded. All guardrails nominal.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Section 7: POSITIONS & ORDERS */}
          {activeTab === "positions" && (
            <div className="space-y-6 max-w-6xl mx-auto">
              <div className="flex items-center justify-between pb-4 border-b border-zinc-800">
                <div>
                  <h2 className="text-xl font-bold text-white tracking-tight">Active Positions & Open Orders</h2>
                  <p className="text-xs text-zinc-400">
                    Live positions monitored on Binance Futures with attached stop-loss and take-profit protection.
                  </p>
                </div>
                {positionsData?.positions && positionsData.positions.length > 0 && (
                  <button
                    onClick={() => setClosePositionModalOpen(true)}
                    className="px-3.5 py-2 bg-red-600/20 hover:bg-red-600/30 text-red-300 border border-red-500/30 font-semibold text-xs rounded-xl flex items-center gap-1.5 cursor-pointer"
                  >
                    <XCircle className="w-4 h-4" /> Close Managed Position
                  </button>
                )}
              </div>

              {/* Positions Table */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden shadow-xl">
                <div className="px-5 py-3 border-b border-zinc-800 bg-zinc-950/60 flex justify-between items-center">
                  <span className="text-xs font-semibold text-white">Live Open Positions</span>
                  <span className="text-xs text-zinc-500 font-mono">
                    {positionsData?.positions?.length || 0} active
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-zinc-300">
                    <thead className="bg-zinc-950 text-zinc-400 font-mono text-[11px] border-b border-zinc-800">
                      <tr>
                        <th className="py-3 px-4">Symbol</th>
                        <th className="py-3 px-4">Side</th>
                        <th className="py-3 px-4">Size (BTC)</th>
                        <th className="py-3 px-4">Entry Price</th>
                        <th className="py-3 px-4">Mark Price</th>
                        <th className="py-3 px-4">Unrealized P&L</th>
                        <th className="py-3 px-4">Liq Price</th>
                        <th className="py-3 px-4">Margin</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/60 font-mono">
                      {positionsData?.positions && positionsData.positions.length > 0 ? (
                        positionsData.positions.map((pos) => (
                          <tr key={pos.symbol} className="hover:bg-zinc-800/30">
                            <td className="py-3 px-4 font-bold text-white">{pos.symbol}</td>
                            <td className="py-3 px-4">
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                  pos.side === "LONG"
                                    ? "bg-lime-950 text-lime-400 border border-lime-800"
                                    : "bg-red-950 text-red-400 border border-red-800"
                                }`}
                              >
                                {pos.side}
                              </span>
                            </td>
                            <td className="py-3 px-4">{pos.amount}</td>
                            <td className="py-3 px-4">${Number(pos.entryPrice).toFixed(2)}</td>
                            <td className="py-3 px-4">${Number(pos.markPrice).toFixed(2)}</td>
                            <td
                              className={`py-3 px-4 font-bold ${
                                Number(pos.unrealizedProfit) >= 0 ? "text-lime-400" : "text-red-400"
                              }`}
                            >
                              ${Number(pos.unrealizedProfit).toFixed(2)}
                            </td>
                            <td className="py-3 px-4 text-amber-400">
                              ${Number(pos.liquidationPrice || 0).toFixed(2)}
                            </td>
                            <td className="py-3 px-4 text-zinc-400">
                              ${Number(pos.isolatedMargin || 0).toFixed(2)} (Isolated)
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={8} className="py-8 text-center text-zinc-500 font-sans">
                            No open positions on Binance Futures. Account is flat.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Open Orders Table */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden shadow-xl">
                <div className="px-5 py-3 border-b border-zinc-800 bg-zinc-950/60 flex justify-between items-center">
                  <span className="text-xs font-semibold text-white">Open Algo Protection Orders</span>
                  <span className="text-xs text-zinc-500 font-mono">
                    {positionsData?.openOrders?.length || 0} orders
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-zinc-300">
                    <thead className="bg-zinc-950 text-zinc-400 font-mono text-[11px] border-b border-zinc-800">
                      <tr>
                        <th className="py-3 px-4">Client ID / Algo ID</th>
                        <th className="py-3 px-4">Symbol</th>
                        <th className="py-3 px-4">Order Type</th>
                        <th className="py-3 px-4">Side</th>
                        <th className="py-3 px-4">Trigger / Price</th>
                        <th className="py-3 px-4">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/60 font-mono">
                      {positionsData?.openOrders && positionsData.openOrders.length > 0 ? (
                        positionsData.openOrders.map((ord, idx) => (
                          <tr key={ord.clientOrderId || ord.clientAlgoId || idx} className="hover:bg-zinc-800/30">
                            <td className="py-3 px-4 text-zinc-400 text-[10px]">
                              {ord.clientOrderId || ord.clientAlgoId || "N/A"}
                            </td>
                            <td className="py-3 px-4 font-bold text-white">{ord.symbol}</td>
                            <td className="py-3 px-4 text-cyan-300">{ord.type}</td>
                            <td className="py-3 px-4 font-semibold">{ord.side}</td>
                            <td className="py-3 px-4 text-white">
                              ${ord.stopPrice ? Number(ord.stopPrice).toFixed(2) : Number(ord.price).toFixed(2)}
                            </td>
                            <td className="py-3 px-4">
                              <span className="px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 text-[10px]">
                                {ord.status}
                              </span>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={6} className="py-8 text-center text-zinc-500 font-sans">
                            No open working orders.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Section 8: TRADE HISTORY */}
          {activeTab === "trades" && (
            <div className="space-y-6 max-w-7xl mx-auto">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-800">
                <div>
                  <h2 className="text-xl font-bold text-white tracking-tight">Trade History</h2>
                  <p className="text-xs text-zinc-400">
                    Realized trades across all closed positions with full fee and P&L audit trail.
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      value={tradeSearchQuery}
                      onChange={(e) => setTradeSearchQuery(e.target.value)}
                      placeholder="Filter trades..."
                      className="pl-8 pr-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-xl text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-lime-400"
                    />
                  </div>
                  <button
                    onClick={handleDownloadCsv}
                    className="px-3.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" /> Export CSV
                  </button>
                </div>
              </div>

              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden shadow-xl">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-zinc-300 font-mono">
                    <thead className="bg-zinc-950 text-zinc-400 uppercase tracking-wider text-[11px] border-b border-zinc-800">
                      <tr>
                        <th className="py-3.5 px-4 font-sans">Date / Time</th>
                        <th className="py-3.5 px-4">Symbol</th>
                        <th className="py-3.5 px-4">Side</th>
                        <th className="py-3.5 px-4">Entry</th>
                        <th className="py-3.5 px-4">Exit</th>
                        <th className="py-3.5 px-4">Qty</th>
                        <th className="py-3.5 px-4">Realized P&L</th>
                        <th className="py-3.5 px-4">Close Reason</th>
                        <th className="py-3.5 px-4">Mode</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/60">
                      {trades.length > 0 ? (
                        trades
                          .filter((t) =>
                            tradeSearchQuery
                              ? t.symbol.toLowerCase().includes(tradeSearchQuery.toLowerCase()) ||
                                t.close_reason.toLowerCase().includes(tradeSearchQuery.toLowerCase())
                              : true
                          )
                          .map((t) => (
                            <tr key={t.id} className="hover:bg-zinc-800/30">
                              <td className="py-3 px-4 text-zinc-400 font-sans text-[11px]">
                                {new Date(t.created_at * 1000).toLocaleString()}
                              </td>
                              <td className="py-3 px-4 font-bold text-white">{t.symbol}</td>
                              <td className="py-3 px-4">
                                <span
                                  className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                    t.direction === "LONG"
                                      ? "bg-lime-950 text-lime-400 border border-lime-800"
                                      : "bg-red-950 text-red-400 border border-red-800"
                                  }`}
                                >
                                  {t.direction}
                                </span>
                              </td>
                              <td className="py-3 px-4">${Number(t.entry_price).toFixed(2)}</td>
                              <td className="py-3 px-4">${Number(t.exit_price).toFixed(2)}</td>
                              <td className="py-3 px-4">{t.quantity}</td>
                              <td
                                className={`py-3 px-4 font-bold ${
                                  Number(t.realized_pnl) >= 0 ? "text-lime-400" : "text-red-400"
                                }`}
                              >
                                ${Number(t.realized_pnl).toFixed(2)}
                              </td>
                              <td className="py-3 px-4 text-zinc-400 text-[11px] font-sans">{t.close_reason}</td>
                              <td className="py-3 px-4">
                                <span className="text-[10px] uppercase px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">
                                  {t.mode}
                                </span>
                              </td>
                            </tr>
                          ))
                      ) : (
                        <tr>
                          <td colSpan={9} className="py-8 text-center text-zinc-500 font-sans">
                            No trade history recorded yet.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Section 9: PERFORMANCE ANALYTICS */}
          {activeTab === "analytics" && (
            <div className="space-y-6 max-w-6xl mx-auto">
              <div className="flex items-center justify-between pb-4 border-b border-zinc-800">
                <div>
                  <h2 className="text-xl font-bold text-white tracking-tight">Performance Analytics</h2>
                  <p className="text-xs text-zinc-400">
                    Calculated metrics from real trade executions and conservative walk-forward backtests.
                  </p>
                </div>
              </div>

              {/* Analytics Metric Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="p-5 rounded-2xl bg-zinc-900 border border-zinc-800/80 space-y-1">
                  <div className="text-xs text-zinc-400">Realized Cumulative P&L</div>
                  <div className="text-2xl font-bold font-mono text-lime-400">
                    ${analytics?.analytics?.realizedPnl || "0.00"}
                  </div>
                  <div className="text-xs text-zinc-500">Gross Gain: ${analytics?.analytics?.grossProfit || "0.00"}</div>
                </div>

                <div className="p-5 rounded-2xl bg-zinc-900 border border-zinc-800/80 space-y-1">
                  <div className="text-xs text-zinc-400">Win Rate %</div>
                  <div className="text-2xl font-bold font-mono text-white">
                    {analytics?.analytics?.winRatePct || "0.0"}%
                  </div>
                  <div className="text-xs text-zinc-500">
                    {analytics?.analytics?.wins || 0} Wins / {analytics?.analytics?.losses || 0} Losses
                  </div>
                </div>

                <div className="p-5 rounded-2xl bg-zinc-900 border border-zinc-800/80 space-y-1">
                  <div className="text-xs text-zinc-400">Profit Factor</div>
                  <div className="text-2xl font-bold font-mono text-cyan-400">
                    {analytics?.analytics?.profitFactor || "0.00"}
                  </div>
                  <div className="text-xs text-zinc-500">Gross Loss: ${analytics?.analytics?.grossLoss || "0.00"}</div>
                </div>

                <div className="p-5 rounded-2xl bg-zinc-900 border border-zinc-800/80 space-y-1">
                  <div className="text-xs text-zinc-400">Avg Win / Avg Loss</div>
                  <div className="text-2xl font-bold font-mono text-zinc-200">
                    ${analytics?.analytics?.averageWin || "0"} / ${analytics?.analytics?.averageLoss || "0"}
                  </div>
                  <div className="text-xs text-zinc-500">Per trade expectancy</div>
                </div>
              </div>

              {/* Walk Forward Backtest Diagnostic Card */}
              {analytics?.backtestDiagnostic && (
                <div className="p-5 rounded-2xl bg-zinc-900 border border-zinc-800/80 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                      <BarChart3 className="w-4 h-4 text-lime-400" /> Walk-Forward Diagnostic Results
                    </h3>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase ${
                        analytics.backtestDiagnostic.passed
                          ? "bg-lime-950 text-lime-400 border border-lime-800"
                          : "bg-red-950 text-red-400 border border-red-800"
                      }`}
                    >
                      {analytics.backtestDiagnostic.passed ? "DIAGNOSTIC PASSED" : "FAILED GATE"}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs font-mono">
                    <div className="p-3 bg-zinc-950 rounded-xl border border-zinc-800">
                      <span className="text-zinc-500 block text-[10px]">Candles Tested:</span>
                      <span className="text-white font-bold text-sm">{analytics.backtestDiagnostic.candleCount}</span>
                    </div>
                    <div className="p-3 bg-zinc-950 rounded-xl border border-zinc-800">
                      <span className="text-zinc-500 block text-[10px]">Simulated Trades:</span>
                      <span className="text-white font-bold text-sm">{analytics.backtestDiagnostic.tradeCount}</span>
                    </div>
                    <div className="p-3 bg-zinc-950 rounded-xl border border-zinc-800">
                      <span className="text-zinc-500 block text-[10px]">Backtest Win Rate:</span>
                      <span className="text-lime-400 font-bold text-sm">
                        {(Number(analytics.backtestDiagnostic.winRate) * 100).toFixed(1)}%
                      </span>
                    </div>
                    <div className="p-3 bg-zinc-950 rounded-xl border border-zinc-800">
                      <span className="text-zinc-500 block text-[10px]">Max Drawdown R:</span>
                      <span className="text-amber-400 font-bold text-sm">
                        {Number(analytics.backtestDiagnostic.maxDrawdownR).toFixed(2)} R
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Section 10: API INTEGRATIONS */}
          {activeTab === "integrations" && (
            <div className="space-y-6 max-w-5xl mx-auto">
              <div className="pb-4 border-b border-zinc-800">
                <h2 className="text-xl font-bold text-white tracking-tight">External API Integrations</h2>
                <p className="text-xs text-zinc-400">
                  Status, latency, and key health for critical exchanges, payment systems, and language models.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {integrations.map((item) => (
                  <div key={item.id} className="p-5 rounded-2xl bg-zinc-900 border border-zinc-800/80 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-white text-sm">{item.name}</span>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-mono uppercase font-bold ${
                          item.status === "connected" || item.status === "active" || item.status === "online"
                            ? "bg-lime-950 text-lime-400 border border-lime-800"
                            : item.status === "error"
                            ? "bg-red-950 text-red-400 border border-red-800"
                            : "bg-zinc-800 text-zinc-400"
                        }`}
                      >
                        {item.status}
                      </span>
                    </div>

                    <p className="text-xs text-zinc-400">{item.description}</p>

                    <div className="pt-2 border-t border-zinc-800/60 text-xs font-mono space-y-1">
                      {item.apiKeyHint && (
                        <div className="flex justify-between text-zinc-400">
                          <span>Key Hint:</span>
                          <span className="text-zinc-200">{item.apiKeyHint}</span>
                        </div>
                      )}
                      {item.latencyMs !== undefined && item.latencyMs !== null && (
                        <div className="flex justify-between text-zinc-400">
                          <span>Latency:</span>
                          <span className="text-lime-400">{item.latencyMs} ms</span>
                        </div>
                      )}
                      {item.model && (
                        <div className="flex justify-between text-zinc-400">
                          <span>Engine:</span>
                          <span className="text-cyan-400">{item.model}</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Section 11: PAYMENT GATEWAYS */}
          {activeTab === "payments" && (
            <div className="space-y-6 max-w-6xl mx-auto">
              <div className="flex items-center justify-between pb-4 border-b border-zinc-800">
                <div>
                  <h2 className="text-xl font-bold text-white tracking-tight">Payment Gateways & Polar.sh</h2>
                  <p className="text-xs text-zinc-400">
                    License order fulfillment, revenue metrics, and automated merchant webhook activity.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="p-5 rounded-2xl bg-zinc-900 border border-zinc-800/80 space-y-1">
                  <div className="text-xs text-zinc-400">Total Polar Revenue</div>
                  <div className="text-2xl font-bold font-mono text-lime-400">
                    ${payments?.totalRevenueUsd || "0.00"}
                  </div>
                  <div className="text-xs text-zinc-500">Gross paid volume</div>
                </div>

                <div className="p-5 rounded-2xl bg-zinc-900 border border-zinc-800/80 space-y-1">
                  <div className="text-xs text-zinc-400">Total Fulfilled Orders</div>
                  <div className="text-2xl font-bold font-mono text-white">
                    {payments?.totalOrdersCount || 0}
                  </div>
                  <div className="text-xs text-zinc-500">Instant licence provisions</div>
                </div>

                <div className="p-5 rounded-2xl bg-zinc-900 border border-zinc-800/80 space-y-1">
                  <div className="text-xs text-zinc-400">Polar Webhook Status</div>
                  <div className="text-2xl font-bold font-mono text-cyan-400">ACTIVE</div>
                  <div className="text-xs text-zinc-500">HMAC-SHA256 signature verified</div>
                </div>
              </div>

              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden shadow-xl">
                <div className="px-5 py-3 border-b border-zinc-800 bg-zinc-950/60 font-semibold text-xs text-white">
                  Recent Polar.sh Orders
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-zinc-300 font-mono">
                    <thead className="bg-zinc-950 text-zinc-400 text-[11px] border-b border-zinc-800">
                      <tr>
                        <th className="py-3 px-4 font-sans">Date</th>
                        <th className="py-3 px-4">Order ID</th>
                        <th className="py-3 px-4 font-sans">Customer Email</th>
                        <th className="py-3 px-4">License Key</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/60">
                      {payments?.recentOrders && payments.recentOrders.length > 0 ? (
                        payments.recentOrders.map((ord: any) => (
                          <tr key={ord.id} className="hover:bg-zinc-800/30">
                            <td className="py-3 px-4 text-zinc-400 font-sans text-[11px]">
                              {new Date(ord.created_at * 1000).toLocaleString()}
                            </td>
                            <td className="py-3 px-4 text-cyan-300 font-bold">{ord.order_id}</td>
                            <td className="py-3 px-4 text-zinc-300 font-sans">{ord.email || "—"}</td>
                            <td className="py-3 px-4 text-lime-400 font-bold">{ord.license_key}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={4} className="py-8 text-center text-zinc-500 font-sans">
                            No Polar orders recorded yet.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Section 12: USERS & ACCOUNTS */}
          {activeTab === "users" && (
            <div className="space-y-6 max-w-7xl mx-auto">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-800">
                <div>
                  <h2 className="text-xl font-bold text-white tracking-tight">Users & License Accounts</h2>
                  <p className="text-xs text-zinc-400">
                    License keys, hardware device locks, customer Binance credentials, and subscription validity.
                  </p>
                </div>
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={userSearchQuery}
                    onChange={(e) => setUserSearchQuery(e.target.value)}
                    placeholder="Search by ID or device..."
                    className="pl-8 pr-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-xl text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-lime-400 font-sans"
                  />
                </div>
              </div>

              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden shadow-xl">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-zinc-300">
                    <thead className="bg-zinc-950 text-zinc-400 font-mono text-[11px] border-b border-zinc-800">
                      <tr>
                        <th className="py-3 px-4">License ID</th>
                        <th className="py-3 px-4">Status</th>
                        <th className="py-3 px-4">Device Lock</th>
                        <th className="py-3 px-4">Binance Connected</th>
                        <th className="py-3 px-4">Expires At</th>
                        <th className="py-3 px-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/60 font-mono">
                      {users.length > 0 ? (
                        users
                          .filter((u) =>
                            userSearchQuery
                              ? u.id.toLowerCase().includes(userSearchQuery.toLowerCase()) ||
                                (u.device_id && u.device_id.toLowerCase().includes(userSearchQuery.toLowerCase()))
                              : true
                          )
                          .map((user) => (
                            <tr key={user.id} className="hover:bg-zinc-800/30">
                              <td className="py-3 px-4">
                                <div className="font-bold text-white">{user.id.slice(0, 12)}...</div>
                                <div className="text-[10px] text-zinc-500">tx: {user.transaction_hash?.slice(0, 14)}...</div>
                              </td>
                              <td className="py-3 px-4">
                                <span
                                  className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                    user.status === "active"
                                      ? "bg-lime-950 text-lime-400 border border-lime-800"
                                      : "bg-red-950 text-red-400 border border-red-800"
                                  }`}
                                >
                                  {user.status}
                                </span>
                              </td>
                              <td className="py-3 px-4 text-zinc-400">
                                {user.device_id ? user.device_id.slice(0, 10) + "..." : <span className="text-zinc-600">Unlocked</span>}
                              </td>
                              <td className="py-3 px-4">
                                {user.binance_status === "active" ? (
                                  <span className="text-lime-400 font-bold">YES ({user.api_key_hint})</span>
                                ) : (
                                  <span className="text-zinc-500">NO</span>
                                )}
                              </td>
                              <td className="py-3 px-4 text-zinc-300 font-sans text-[11px]">
                                {new Date(user.expires_at * 1000).toLocaleDateString()}
                              </td>
                              <td className="py-3 px-4 text-right font-sans">
                                <div className="flex items-center justify-end gap-1.5">
                                  {user.device_id && (
                                    <button
                                      onClick={() => handleUserAction(user.id, "RESET_DEVICE")}
                                      className="px-2 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded text-[11px] cursor-pointer"
                                      title="Reset Device Lock"
                                    >
                                      Reset Lock
                                    </button>
                                  )}
                                  <button
                                    onClick={() => handleUserAction(user.id, "EXTEND_EXPIRY", { days: 30 })}
                                    className="px-2 py-1 bg-zinc-800 hover:bg-zinc-700 text-cyan-300 rounded text-[11px] cursor-pointer"
                                    title="Extend +30 Days"
                                  >
                                    +30d
                                  </button>
                                  {user.status === "active" ? (
                                    <button
                                      onClick={() => {
                                        if (confirm(`Are you sure you want to revoke license ${user.id}?`)) {
                                          handleUserAction(user.id, "REVOKE_LICENSE", { confirmation: "REVOKE_LICENSE" });
                                        }
                                      }}
                                      className="px-2 py-1 bg-red-950 hover:bg-red-900 border border-red-800 text-red-300 rounded text-[11px] cursor-pointer"
                                    >
                                      Revoke
                                    </button>
                                  ) : (
                                    <button
                                      onClick={() => handleUserAction(user.id, "ACTIVATE_LICENSE")}
                                      className="px-2 py-1 bg-lime-950 hover:bg-lime-900 border border-lime-800 text-lime-300 rounded text-[11px] cursor-pointer"
                                    >
                                      Activate
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))
                      ) : (
                        <tr>
                          <td colSpan={6} className="py-8 text-center text-zinc-500 font-sans">
                            No user accounts loaded.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Section 13: SYSTEM LOGS */}
          {activeTab === "logs" && (
            <div className="space-y-6 max-w-6xl mx-auto">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-800">
                <div>
                  <h2 className="text-xl font-bold text-white tracking-tight">System Logs Stream</h2>
                  <p className="text-xs text-zinc-400">
                    High-resolution log events from the real-time trading engine and scheduled cycle execution.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {["all", "info", "warning", "critical"].map((lvl) => (
                    <button
                      key={lvl}
                      onClick={() => setLogFilterLevel(lvl)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-mono uppercase cursor-pointer transition ${
                        logFilterLevel === lvl
                          ? "bg-lime-400/20 text-lime-300 border border-lime-400/30 font-bold"
                          : "bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-200"
                      }`}
                    >
                      {lvl}
                    </button>
                  ))}
                </div>
              </div>

              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 font-mono text-xs max-h-[600px] overflow-y-auto space-y-2">
                {logs
                  .filter((l) => (logFilterLevel === "all" ? true : l.level === logFilterLevel))
                  .map((log) => (
                    <div
                      key={log.id}
                      className="p-2.5 rounded-xl bg-zinc-950 border border-zinc-800/80 flex items-start gap-3"
                    >
                      <span className="text-[10px] text-zinc-500 shrink-0 mt-0.5">
                        {new Date(log.created_at * 1000).toLocaleTimeString()}
                      </span>
                      <span
                        className={`text-[10px] font-bold uppercase px-1.5 py-0.2 rounded shrink-0 ${
                          log.level === "critical"
                            ? "bg-red-950 text-red-400 border border-red-800"
                            : log.level === "warning"
                            ? "bg-amber-950 text-amber-400 border border-amber-800"
                            : "bg-zinc-800 text-zinc-400"
                        }`}
                      >
                        {log.level}
                      </span>
                      <div className="flex-1 min-w-0">
                        <span className="font-bold text-zinc-200">{log.event_type}</span>:{" "}
                        <span className="text-zinc-400">{log.message}</span>
                        {log.details_json && (
                          <pre className="mt-1 p-2 bg-zinc-900/60 rounded text-[10px] text-zinc-500 overflow-x-auto">
                            {log.details_json}
                          </pre>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Section 14: SECURITY & AUDIT LOGS */}
          {activeTab === "audit" && (
            <div className="space-y-6 max-w-6xl mx-auto">
              <div className="pb-4 border-b border-zinc-800">
                <h2 className="text-xl font-bold text-white tracking-tight">Security & Administrative Audit Logs</h2>
                <p className="text-xs text-zinc-400">
                  Tamper-resistant audit trail recording all administrative actions, config edits, and access events.
                </p>
              </div>

              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden shadow-xl">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-zinc-300 font-mono">
                    <thead className="bg-zinc-950 text-zinc-400 text-[11px] border-b border-zinc-800">
                      <tr>
                        <th className="py-3 px-4 font-sans">Timestamp</th>
                        <th className="py-3 px-4">Actor</th>
                        <th className="py-3 px-4">Action</th>
                        <th className="py-3 px-4">Category</th>
                        <th className="py-3 px-4">IP Address</th>
                        <th className="py-3 px-4">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/60">
                      {auditLogs.length > 0 ? (
                        auditLogs.map((item) => (
                          <tr key={item.id} className="hover:bg-zinc-800/30">
                            <td className="py-3 px-4 text-zinc-400 font-sans text-[11px]">
                              {new Date(item.created_at * 1000).toLocaleString()}
                            </td>
                            <td className="py-3 px-4 font-bold text-white">{item.actor}</td>
                            <td className="py-3 px-4 text-cyan-300 font-bold">{item.action}</td>
                            <td className="py-3 px-4 text-zinc-400">{item.category}</td>
                            <td className="py-3 px-4 text-zinc-500">{item.ip || "internal"}</td>
                            <td className="py-3 px-4">
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                  item.status === "success"
                                    ? "bg-lime-950 text-lime-400 border border-lime-800"
                                    : "bg-red-950 text-red-400 border border-red-800"
                                }`}
                              >
                                {item.status}
                              </span>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={6} className="py-8 text-center text-zinc-500 font-sans">
                            No administrative audit records logged yet.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Section 15: GENERAL SETTINGS */}
          {activeTab === "settings" && (
            <div className="space-y-6 max-w-4xl mx-auto">
              <div className="pb-4 border-b border-zinc-800">
                <h2 className="text-xl font-bold text-white tracking-tight">General System Settings</h2>
                <p className="text-xs text-zinc-400">
                  Global platform controls, maintenance mode, and external incident notification webhooks.
                </p>
              </div>

              {generalSettings && (
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    setLoading(true);
                    try {
                      const res = await apiFetch("/api/admin/settings", {
                        method: "POST",
                        body: JSON.stringify(generalSettings),
                      });
                      notify("Settings saved successfully", "success");
                    } catch (err) {
                      notify(err instanceof Error ? err.message : "Failed to update settings", "error");
                    } finally {
                      setLoading(false);
                    }
                  }}
                  className="p-6 rounded-2xl bg-zinc-900 border border-zinc-800 space-y-5"
                >
                  <div>
                    <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-2">
                      Platform Name
                    </label>
                    <input
                      type="text"
                      value={generalSettings.platform_name || ""}
                      onChange={(e) =>
                        setGeneralSettings({ ...generalSettings, platform_name: e.target.value })
                      }
                      className="w-full px-4 py-2.5 bg-zinc-950 border border-zinc-800 rounded-xl text-sm text-white focus:outline-none focus:border-lime-400"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-2">
                      Incident Alert Webhook URL (Discord / Slack / Telegram)
                    </label>
                    <input
                      type="url"
                      value={generalSettings.webhook_alert_url || ""}
                      onChange={(e) =>
                        setGeneralSettings({ ...generalSettings, webhook_alert_url: e.target.value })
                      }
                      placeholder="https://discord.com/api/webhooks/..."
                      className="w-full px-4 py-2.5 bg-zinc-950 border border-zinc-800 rounded-xl text-sm text-white focus:outline-none focus:border-lime-400 font-mono text-xs"
                    />
                  </div>

                  <div className="flex items-center justify-between p-4 bg-zinc-950 rounded-xl border border-zinc-800">
                    <div>
                      <div className="font-semibold text-sm text-white">Maintenance Mode</div>
                      <div className="text-xs text-zinc-400">
                        When active, rejects client orders and halts auto scheduled cycles.
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={Boolean(generalSettings.maintenance_mode)}
                      onChange={(e) =>
                        setGeneralSettings({
                          ...generalSettings,
                          maintenance_mode: e.target.checked,
                        })
                      }
                      className="w-5 h-5 accent-lime-400 cursor-pointer"
                    />
                  </div>

                  <div className="flex items-center justify-between p-4 bg-zinc-950 rounded-xl border border-zinc-800">
                    <div>
                      <div className="font-semibold text-sm text-white">Auto Restart Failed Workers</div>
                      <div className="text-xs text-zinc-400">
                        Automatically clears stale locks if worker timeout occurs.
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={Boolean(generalSettings.auto_restart_workers)}
                      onChange={(e) =>
                        setGeneralSettings({
                          ...generalSettings,
                          auto_restart_workers: e.target.checked,
                        })
                      }
                      className="w-5 h-5 accent-lime-400 cursor-pointer"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-3 bg-lime-400 hover:bg-lime-300 text-zinc-950 font-semibold rounded-xl text-sm transition cursor-pointer"
                  >
                    Save Platform Settings
                  </button>
                </form>
              )}
            </div>
          )}

          {/* --------------------------------------------------------- */}
          {/* TAB 16: DAILY BLOG & SEO ENGINE */}
          {/* --------------------------------------------------------- */}
          {activeTab === "blogs" && (
            <div className="space-y-6">
              {/* Header Card */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 relative overflow-hidden">
                <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-lime-500 via-emerald-400 to-cyan-500" />
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                  <div>
                    <div className="flex items-center gap-3 mb-2">
                      <div className="p-2.5 bg-lime-400/10 border border-lime-400/20 rounded-xl text-lime-400">
                        <FileText className="w-5 h-5" />
                      </div>
                      <div>
                        <h2 className="text-xl font-bold text-white tracking-tight">Daily Crypto Trading Blog & SEO Engine</h2>
                        <p className="text-xs text-zinc-400 font-mono">Automated 30-Day Curriculum · 9 Editorial Categories · Draft Approval Gate</p>
                      </div>
                    </div>
                    <p className="text-xs text-zinc-300 max-w-2xl leading-relaxed mt-2">
                      Publishes one original educational crypto trading article per day. Articles are created in{" "}
                      <strong className="text-amber-400">Draft Mode</strong> by default and require administrator approval before appearing live on{" "}
                      <a href="https://nexusbotai.pro/blog" target="_blank" rel="noreferrer" className="text-lime-400 underline">
                        nexusbotai.pro/blog ↗
                      </a>.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={() => handleGenerateBlogNow()}
                      disabled={generatingBlog}
                      className="px-4 py-2.5 bg-lime-400 hover:bg-lime-300 text-zinc-950 font-semibold rounded-xl text-xs flex items-center gap-2 cursor-pointer transition shadow-lg shadow-lime-400/10 disabled:opacity-50"
                    >
                      {generatingBlog ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Generating Article...
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-3.5 h-3.5" /> Generate Today&apos;s Article Now
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => loadTabContent()}
                      className="p-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl text-xs flex items-center gap-1.5 cursor-pointer transition"
                      title="Refresh"
                    >
                      <RefreshCw className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Metrics Bar */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 pt-6 border-t border-zinc-800">
                  <div className="bg-zinc-950/60 border border-zinc-850 rounded-xl p-3.5">
                    <div className="text-[11px] text-zinc-400 font-mono uppercase mb-1">30-Day Curriculum</div>
                    <div className="text-xl font-bold text-white flex items-baseline gap-2">
                      <span>{blogArticles.filter((a) => a.status === "published").length}</span>
                      <span className="text-xs text-zinc-500 font-normal">/ 30 Published</span>
                    </div>
                  </div>

                  <div className="bg-zinc-950/60 border border-zinc-850 rounded-xl p-3.5">
                    <div className="text-[11px] text-zinc-400 font-mono uppercase mb-1">Pending Approval</div>
                    <div className="text-xl font-bold text-amber-400 flex items-baseline gap-2">
                      <span>{blogArticles.filter((a) => a.status === "pending_approval").length}</span>
                      <span className="text-xs text-zinc-500 font-normal">Requires Review</span>
                    </div>
                  </div>

                  <div className="bg-zinc-950/60 border border-zinc-850 rounded-xl p-3.5">
                    <div className="text-[11px] text-zinc-400 font-mono uppercase mb-1">Publishing Mode</div>
                    <div className="text-sm font-semibold flex items-center gap-2">
                      {blogSettings?.auto_publish_enabled ? (
                        <span className="text-emerald-400 flex items-center gap-1.5">
                          <CheckCircle2 className="w-4 h-4" /> Auto-Publish Active
                        </span>
                      ) : (
                        <span className="text-amber-400 flex items-center gap-1.5">
                          <Shield className="w-4 h-4" /> Draft Mode (Gate On)
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="bg-zinc-950/60 border border-zinc-850 rounded-xl p-3.5 flex items-center justify-between">
                    <div>
                      <div className="text-[11px] text-zinc-400 font-mono uppercase mb-0.5">Approval Gate</div>
                      <div className="text-xs text-zinc-300">
                        {blogSettings?.auto_publish_enabled ? "Unattended" : "Manual Review"}
                      </div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={Boolean(blogSettings?.auto_publish_enabled)}
                        onChange={(e) => handleToggleAutoPublish(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-zinc-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-350 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-lime-400"></div>
                    </label>
                  </div>
                </div>
              </div>

              {/* Pending Approvals Callout Banner */}
              {blogArticles.filter((a) => a.status === "pending_approval").length > 0 && (
                <div className="bg-amber-950/30 border border-amber-800/60 rounded-2xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className="p-2 bg-amber-500/10 text-amber-400 rounded-lg shrink-0 mt-0.5">
                      <AlertTriangle className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-amber-200">
                        {blogArticles.filter((a) => a.status === "pending_approval").length} New Article(s) Pending Administrator Review
                      </h4>
                      <p className="text-xs text-amber-300/80 mt-1">
                        Draft Mode has safely quarantined newly generated posts. Review the content, citations, and risk warnings before approving for live release.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Section 1: Generated Articles List */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-base font-bold text-white">Generated Blog Articles</h3>
                    <p className="text-xs text-zinc-400">All automated and reviewed articles stored in database.</p>
                  </div>
                  <span className="text-xs text-zinc-500 font-mono">{blogArticles.length} Total</span>
                </div>

                {blogArticles.length === 0 ? (
                  <div className="p-8 text-center bg-zinc-950/40 rounded-xl border border-zinc-800/80">
                    <FileText className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
                    <p className="text-xs text-zinc-400 mb-3">No dynamic articles generated yet.</p>
                    <button
                      type="button"
                      onClick={() => handleGenerateBlogNow()}
                      disabled={generatingBlog}
                      className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-xl text-xs font-semibold cursor-pointer"
                    >
                      Generate Today&apos;s Scheduled Article
                    </button>
                  </div>
                ) : (
                  <div className="divide-y divide-zinc-800">
                    {blogArticles.map((article) => {
                      const isPending = article.status === "pending_approval";
                      const isPublished = article.status === "published";
                      return (
                        <div key={article.id} className="py-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold uppercase ${
                                  isPending
                                    ? "bg-amber-400/10 text-amber-400 border border-amber-400/20"
                                    : isPublished
                                    ? "bg-emerald-400/10 text-emerald-400 border border-emerald-400/20"
                                    : "bg-zinc-800 text-zinc-400"
                                }`}
                              >
                                {article.status.replace("_", " ")}
                              </span>
                              <span className="px-2 py-0.5 rounded-full text-[10px] bg-zinc-800 text-zinc-300 font-mono">
                                {article.category}
                              </span>
                              {article.scheduled_date && (
                                <span className="text-[11px] text-zinc-500 font-mono">
                                  📅 {article.scheduled_date}
                                </span>
                              )}
                              <span className="text-[11px] text-zinc-500 font-mono">
                                ⏱ {article.read_time_minutes} min read
                              </span>
                            </div>

                            <h4 className="text-sm font-bold text-white hover:text-lime-400 transition truncate">
                              {article.title}
                            </h4>
                            <p className="text-xs text-zinc-400 line-clamp-1 mt-0.5">
                              {article.description}
                            </p>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            {isPending && (
                              <button
                                type="button"
                                onClick={() => handleApproveBlog(article.id)}
                                className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold rounded-lg text-xs flex items-center gap-1.5 cursor-pointer transition shadow-md shadow-emerald-500/10"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" /> Approve & Publish
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => setSelectedArticlePreview(article)}
                              className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg text-xs font-semibold flex items-center gap-1 cursor-pointer transition"
                            >
                              <Eye className="w-3.5 h-3.5" /> Preview
                            </button>

                            {isPublished && (
                              <a
                                href={`https://nexusbotai.pro/blog/${article.slug}`}
                                target="_blank"
                                rel="noreferrer"
                                className="px-3 py-1.5 bg-lime-400/10 hover:bg-lime-400/20 text-lime-400 border border-lime-400/20 rounded-lg text-xs font-semibold flex items-center gap-1"
                              >
                                Live URL ↗
                              </a>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Section 2: 30-Day Content Calendar */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                  <div>
                    <h3 className="text-base font-bold text-white">30-Day Editorial Curriculum</h3>
                    <p className="text-xs text-zinc-400">
                      Pre-researched educational schedule (Oct 18, 2026 – Nov 16, 2026).
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-xs text-zinc-500">Filter:</span>
                    <select
                      value={selectedCalendarFilter}
                      onChange={(e) => setSelectedCalendarFilter(e.target.value)}
                      className="px-3 py-1.5 bg-zinc-950 border border-zinc-800 rounded-xl text-xs text-zinc-300 focus:outline-none focus:border-lime-400"
                    >
                      <option value="all">All 30 Topics</option>
                      <option value="scheduled">Scheduled Only</option>
                      <option value="published">Published Only</option>
                      <option value="pending_approval">Pending Review Only</option>
                    </select>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-zinc-800 text-[11px] font-mono text-zinc-400 uppercase">
                        <th className="py-3 px-3">Day / Date</th>
                        <th className="py-3 px-3">Category</th>
                        <th className="py-3 px-3">Topic Title & Intent</th>
                        <th className="py-3 px-3">Primary Keywords</th>
                        <th className="py-3 px-3">Status</th>
                        <th className="py-3 px-3 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/60 font-sans">
                      {blogCalendar
                        .filter((item) => {
                          if (selectedCalendarFilter === "all") return true;
                          return item.status === selectedCalendarFilter;
                        })
                        .map((item) => {
                          const keywords = (() => {
                            try {
                              return JSON.parse(item.target_keywords_json || "[]") as string[];
                            } catch {
                              return [];
                            }
                          })();

                          return (
                            <tr key={item.id} className="hover:bg-zinc-850/50 transition">
                              <td className="py-3 px-3 font-mono text-zinc-300 whitespace-nowrap">
                                <span className="font-bold text-white">Day {item.day_number}</span>
                                <div className="text-[11px] text-zinc-500">{item.scheduled_date}</div>
                              </td>

                              <td className="py-3 px-3">
                                <span className="inline-block px-2 py-0.5 rounded-full text-[10px] bg-zinc-800 text-zinc-300 font-mono">
                                  {item.category}
                                </span>
                              </td>

                              <td className="py-3 px-3 max-w-sm">
                                <div className="font-semibold text-white line-clamp-1">{item.title}</div>
                                <div className="text-[11px] text-zinc-500 font-mono mt-0.5">
                                  Intent: <span className="text-zinc-400">{item.search_intent}</span>
                                </div>
                              </td>

                              <td className="py-3 px-3 max-w-xs">
                                <div className="flex flex-wrap gap-1">
                                  {keywords.slice(0, 2).map((kw, i) => (
                                    <span key={i} className="text-[10px] px-1.5 py-0.5 bg-zinc-950 border border-zinc-800 text-zinc-400 rounded">
                                      {kw}
                                    </span>
                                  ))}
                                  {keywords.length > 2 && (
                                    <span className="text-[10px] text-zinc-500">+{keywords.length - 2}</span>
                                  )}
                                </div>
                              </td>

                              <td className="py-3 px-3 whitespace-nowrap">
                                <span
                                  className={`px-2 py-0.5 rounded-full text-[10px] font-mono uppercase font-semibold ${
                                    item.status === "published"
                                      ? "bg-emerald-400/10 text-emerald-400 border border-emerald-400/20"
                                      : item.status === "pending_approval"
                                      ? "bg-amber-400/10 text-amber-400 border border-amber-400/20"
                                      : "bg-zinc-800 text-zinc-400"
                                  }`}
                                >
                                  {item.status.replace("_", " ")}
                                </span>
                              </td>

                              <td className="py-3 px-3 text-right whitespace-nowrap">
                                {item.status === "scheduled" ? (
                                  <button
                                    type="button"
                                    onClick={() => handleGenerateBlogNow(item.day_number)}
                                    disabled={generatingBlog}
                                    className="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 text-lime-400 font-semibold rounded text-[11px] cursor-pointer transition disabled:opacity-50"
                                  >
                                    Generate
                                  </button>
                                ) : (
                                  <span className="text-[11px] text-zinc-500 font-mono">Ready</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* ----------------------------------------------------------- */}
      {/* MODALS */}
      {/* ----------------------------------------------------------- */}

      {/* 1. Start Engine Modal */}
      {startEngineModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3 text-lime-400">
              <Play className="w-6 h-6" />
              <h3 className="text-lg font-bold text-white">Enable Real-Money Trading Engine</h3>
            </div>
            <p className="text-xs text-zinc-300 leading-relaxed">
              Enabling live execution places algorithmic real-money orders on Binance Futures. You must explicitly
              acknowledge this risk.
            </p>
            <div>
              <label className="block text-[11px] font-mono text-zinc-400 mb-1">
                Type <strong className="text-lime-400">I_UNDERSTAND_REAL_MONEY_RISK</strong> to confirm:
              </label>
              <input
                type="text"
                value={startAckText}
                onChange={(e) => setStartAckText(e.target.value)}
                placeholder="I_UNDERSTAND_REAL_MONEY_RISK"
                className="w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded-xl text-xs font-mono text-white focus:outline-none focus:border-lime-400"
              />
            </div>
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setStartEngineModalOpen(false);
                  setStartAckText("");
                }}
                className="w-full py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleStartEngineConfirm}
                disabled={startAckText !== "I_UNDERSTAND_REAL_MONEY_RISK"}
                className="w-full py-2.5 bg-lime-400 hover:bg-lime-300 text-zinc-950 font-semibold rounded-xl text-xs cursor-pointer disabled:opacity-50"
              >
                Confirm & Start
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. Emergency Stop Modal */}
      {emergencyModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-zinc-900 border border-red-800/80 rounded-2xl p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3 text-red-400">
              <AlertOctagon className="w-6 h-6" />
              <h3 className="text-lg font-bold text-white">Activate Global Kill Switch</h3>
            </div>
            <p className="text-xs text-zinc-300 leading-relaxed">
              This will immediately halt all trading engine activity, engage a 24-hour cycle lock, and halt new trade
              entries across all instances.
            </p>
            <div>
              <label className="block text-[11px] font-mono text-zinc-400 mb-1">
                Type <strong className="text-red-400">EMERGENCY_STOP</strong> to confirm:
              </label>
              <input
                type="text"
                value={emergencyConfirmationText}
                onChange={(e) => setEmergencyConfirmationText(e.target.value)}
                placeholder="EMERGENCY_STOP"
                className="w-full px-3 py-2 bg-zinc-950 border border-red-800/60 rounded-xl text-xs font-mono text-white focus:outline-none focus:border-red-400"
              />
            </div>
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setEmergencyModalOpen(false);
                  setEmergencyConfirmationText("");
                }}
                className="w-full py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleEmergencyStopConfirm}
                disabled={emergencyConfirmationText !== "EMERGENCY_STOP"}
                className="w-full py-2.5 bg-red-600 hover:bg-red-500 text-white font-semibold rounded-xl text-xs cursor-pointer disabled:opacity-50"
              >
                Confirm Emergency Kill Switch
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. Close Managed Position Modal */}
      {closePositionModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3 text-amber-400">
              <XCircle className="w-6 h-6" />
              <h3 className="text-lg font-bold text-white">Close Live Managed Position</h3>
            </div>
            <p className="text-xs text-zinc-300 leading-relaxed">
              This will place an immediate MARKET reduce-only order to close the active managed position and cancel any
              owned stop-loss algo orders.
            </p>
            <div>
              <label className="block text-[11px] font-mono text-zinc-400 mb-1">
                Type <strong className="text-amber-400">CLOSE_MANAGED_POSITION</strong> to confirm:
              </label>
              <input
                type="text"
                value={closeConfirmationText}
                onChange={(e) => setCloseConfirmationText(e.target.value)}
                placeholder="CLOSE_MANAGED_POSITION"
                className="w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded-xl text-xs font-mono text-white focus:outline-none focus:border-amber-400"
              />
            </div>
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setClosePositionModalOpen(false);
                  setCloseConfirmationText("");
                }}
                className="w-full py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleClosePositionConfirm}
                disabled={closeConfirmationText !== "CLOSE_MANAGED_POSITION"}
                className="w-full py-2.5 bg-red-600 hover:bg-red-500 text-white font-semibold rounded-xl text-xs cursor-pointer disabled:opacity-50"
              >
                Close Position Now
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4. Blog Article Preview Modal */}
      {selectedArticlePreview && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-3xl max-h-[90vh] bg-zinc-900 border border-zinc-800 rounded-2xl flex flex-col shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="p-5 border-b border-zinc-800 flex items-center justify-between bg-zinc-950/60">
              <div className="flex items-center gap-3 min-w-0">
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold uppercase ${
                    selectedArticlePreview.status === "pending_approval"
                      ? "bg-amber-400/10 text-amber-400 border border-amber-400/20"
                      : "bg-emerald-400/10 text-emerald-400 border border-emerald-400/20"
                  }`}
                >
                  {selectedArticlePreview.status.replace("_", " ")}
                </span>
                <span className="text-xs text-zinc-400 font-mono truncate">
                  {selectedArticlePreview.category} · {selectedArticlePreview.scheduled_date || "Today"}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedArticlePreview(null)}
                className="p-1.5 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Content Scroll */}
            <div className="p-6 overflow-y-auto space-y-4 font-sans text-xs text-zinc-300 leading-relaxed">
              <div>
                <h2 className="text-lg font-bold text-white mb-1">{selectedArticlePreview.title}</h2>
                <p className="text-zinc-400 italic text-xs mb-3">{selectedArticlePreview.description}</p>
                <div className="flex items-center gap-2 text-[11px] font-mono text-zinc-500 pb-3 border-b border-zinc-800">
                  <span>Slug: /blog/{selectedArticlePreview.slug}</span>
                  <span>·</span>
                  <span>Read time: {selectedArticlePreview.read_time_minutes} min</span>
                </div>
              </div>

              <div className="prose prose-invert prose-xs max-w-none font-mono whitespace-pre-wrap bg-zinc-950 p-4 rounded-xl border border-zinc-850">
                {selectedArticlePreview.content}
              </div>
            </div>

            {/* Modal Actions */}
            <div className="p-4 border-t border-zinc-800 bg-zinc-950/60 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setSelectedArticlePreview(null)}
                className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl text-xs font-semibold cursor-pointer"
              >
                Close Preview
              </button>

              <div className="flex items-center gap-2">
                {selectedArticlePreview.status === "pending_approval" && (
                  <button
                    type="button"
                    onClick={async () => {
                      await handleApproveBlog(selectedArticlePreview.id);
                      setSelectedArticlePreview(null);
                    }}
                    className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold rounded-xl text-xs flex items-center gap-1.5 cursor-pointer shadow-lg shadow-emerald-500/10"
                  >
                    <CheckCircle2 className="w-4 h-4" /> Approve &amp; Publish Live
                  </button>
                )}
                {selectedArticlePreview.status === "published" && (
                  <a
                    href={`https://nexusbotai.pro/blog/${selectedArticlePreview.slug}`}
                    target="_blank"
                    rel="noreferrer"
                    className="px-4 py-2 bg-lime-400 hover:bg-lime-300 text-zinc-950 font-bold rounded-xl text-xs flex items-center gap-1.5"
                  >
                    View Live Article ↗
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
