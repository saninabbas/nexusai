import assert from "node:assert/strict";
import test from "node:test";
import { pathToFileURL } from "node:url";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const adminUrl = pathToFileURL(path.join(root, "worker/trading/admin.ts")).href;

// Minimal in-memory D1 database mock for testing admin handlers
function createMockD1() {
  const data = {
    trading_settings: [
      {
        id: 1,
        enabled: 0,
        symbol: "BTCUSDT",
        interval: "1h",
        risk_bps: 25,
        daily_loss_bps: 100,
        leverage: 2,
        max_notional_usdt: 250,
        min_research_confidence: 60,
        cooldown_minutes: 1920,
        research_minutes: 30,
        updated_at: 1700000000,
      },
    ],
    trading_state: [
      {
        id: 1,
        day_key: "2026-10-16",
        daily_baseline_equity: "1000",
        paused_reason: null,
        last_error: null,
        last_cycle_at: 1700000000,
        last_research_at: 1700000000,
        last_trade_at: null,
        cycle_lock_until: 0,
        active_entry_client_id: "entry_order_xyz",
        active_entry_at: 1700000000,
        active_position_amount: "0.015",
        active_stop_client_id: "stop_order_xyz",
        active_take_profit_client_id: "tp_order_xyz",
        updated_at: 1700000000,
      },
    ],
    admin_audit_logs: [],
    trade_history: [],
    general_settings: [
      {
        id: 1,
        platform_name: "Nexus Trader AI",
        maintenance_mode: 0,
        webhook_alert_url: null,
        email_alerts_enabled: 0,
        default_environment: "mainnet",
        auto_restart_workers: 1,
        updated_at: 1700000000,
      },
    ],
    licenses: [
      {
        id: "lic_user_1",
        license_hash: "hash_user_1",
        transaction_hash: "polar_tx_123",
        payment_amount: "3000",
        device_id: "device_mac_1",
        status: "active",
        issued_at: 1700000000,
        expires_at: 1750000000,
        activated_at: 1700000000,
        last_validated_at: 1700000000,
      },
    ],
    customer_binance_connections: [],
    tenant_trading_settings: [],
    tenant_trading_state: [],
    trading_events: [],
    polar_orders: [],
  };

  const createStatement = (query, bound = []) => ({
    bind: (...args) => createStatement(query, args),
    first: async () => {
      const q = query.trim().toUpperCase();
      if (q.includes("FROM TRADING_SETTINGS")) return data.trading_settings[0] || null;
      if (q.includes("FROM TRADING_STATE")) return data.trading_state[0] || null;
      if (q.includes("FROM GENERAL_SETTINGS")) return data.general_settings[0] || null;
      if (q.includes("FROM LICENSES")) {
        const id = bound[0];
        return data.licenses.find((l) => l.id === id) || null;
      }
      return null;
    },
    all: async () => {
      const q = query.trim().toUpperCase();
      if (q.includes("FROM ADMIN_AUDIT_LOGS")) return { results: data.admin_audit_logs };
      if (q.includes("FROM TRADE_HISTORY")) return { results: data.trade_history };
      if (q.includes("FROM TRADING_EVENTS")) return { results: data.trading_events };
      if (q.includes("FROM POLAR_ORDERS")) return { results: data.polar_orders };
      if (q.includes("FROM LICENSES")) return { results: data.licenses };
      if (q.includes("FROM TENANT_TRADING_SETTINGS")) return { results: data.tenant_trading_settings };
      return { results: [] };
    },
    run: async () => {
      const q = query.trim().toUpperCase();
      if (q.includes("INSERT INTO ADMIN_AUDIT_LOGS")) {
        data.admin_audit_logs.unshift({
          id: data.admin_audit_logs.length + 1,
          actor: bound[0],
          action: bound[1],
          category: bound[2],
          details_json: bound[3],
          ip: bound[4],
          status: bound[5],
          created_at: bound[6],
        });
      } else if (q.includes("UPDATE TRADING_SETTINGS SET ENABLED")) {
        data.trading_settings[0].enabled = bound[0] ?? 0;
      } else if (q.includes("UPDATE LICENSES SET STATUS = 'REVOKED'")) {
        const id = bound[0];
        const lic = data.licenses.find((l) => l.id === id);
        if (lic) lic.status = "revoked";
      } else if (q.includes("UPDATE LICENSES SET DEVICE_ID = NULL")) {
        const id = bound[0];
        const lic = data.licenses.find((l) => l.id === id);
        if (lic) lic.device_id = null;
      }
      return { meta: { changes: 1 } };
    },
  });

  return {
    _data: data,
    prepare: (query) => createStatement(query),
    batch: async (statements) => {
      for (const st of statements) {
        await st.run();
      }
      return [];
    },
  };
}

test("admin API rejects unauthenticated requests with 401", async () => {
  const { handleAdminRoute } = await import(adminUrl);
  const db = createMockD1();
  const env = {
    DB: db,
    TRADING_ADMIN_TOKEN: "valid-secret-token-xyz",
  };

  const req = new Request("https://nexusbotai.pro/api/admin/overview", {
    method: "GET",
  });

  const res = await handleAdminRoute(req, env);
  assert.equal(res.status, 401);
  const body = await res.json();
  assert.equal(body.ok, false);
  assert.match(body.error, /Unauthorized/i);
});

test("admin auth login endpoint verifies valid token and rejects invalid token", async () => {
  const { handleAdminRoute } = await import(adminUrl);
  const db = createMockD1();
  const env = {
    DB: db,
    TRADING_ADMIN_TOKEN: "super-secure-admin-token-12345",
  };

  // 1. Wrong token -> 401
  const wrongReq = new Request("https://nexusbotai.pro/api/admin/auth/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: "wrong-token" }),
  });
  const wrongRes = await handleAdminRoute(wrongReq, env);
  assert.equal(wrongRes.status, 401);

  // 2. Correct token -> 200
  const validReq = new Request("https://nexusbotai.pro/api/admin/auth/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: "super-secure-admin-token-12345" }),
  });
  const validRes = await handleAdminRoute(validReq, env);
  assert.equal(validRes.status, 200);
  const validBody = await validRes.json();
  assert.equal(validBody.ok, true);
  assert.equal(validBody.authenticated, true);
});

test("admin overview returns non-fabricated real operational status", async () => {
  const { handleAdminRoute } = await import(adminUrl);
  const db = createMockD1();
  const env = {
    DB: db,
    TRADING_ADMIN_TOKEN: "admin-token-test",
  };

  const req = new Request("https://nexusbotai.pro/api/admin/overview", {
    method: "GET",
    headers: { Authorization: "Bearer admin-token-test" },
  });

  const res = await handleAdminRoute(req, env);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.ok(body.engine);
  assert.ok(body.metrics);
  assert.ok(body.exchange);
  assert.ok(body.systemHealth);

  // When API keys are not configured, margin balance must be "Unavailable", NOT fabricated
  assert.equal(body.metrics.marginBalance, "Unavailable");
  assert.equal(body.exchange.status, "not_configured");
});

test("stopping engine does NOT liquidate managed positions", async () => {
  const { handleAdminRoute } = await import(adminUrl);
  const db = createMockD1();
  const env = {
    DB: db,
    TRADING_ADMIN_TOKEN: "admin-token-test",
  };

  // Initially position exists
  assert.equal(db._data.trading_state[0].active_entry_client_id, "entry_order_xyz");

  const stopReq = new Request("https://nexusbotai.pro/api/admin/engine", {
    method: "POST",
    headers: {
      Authorization: "Bearer admin-token-test",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ action: "STOP" }),
  });

  const res = await handleAdminRoute(stopReq, env);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.match(body.message, /positions remain open/i);

  // Position is preserved in state
  assert.equal(db._data.trading_state[0].active_entry_client_id, "entry_order_xyz");
});

test("risk limit updates strictly enforce parameter boundaries", async () => {
  const { handleAdminRoute } = await import(adminUrl);
  const db = createMockD1();
  const env = {
    DB: db,
    TRADING_ADMIN_TOKEN: "admin-token-test",
  };

  // Out of bound leverage (5x > 3x limit) must be rejected
  const invalidLeverageReq = new Request("https://nexusbotai.pro/api/admin/risk", {
    method: "POST",
    headers: {
      Authorization: "Bearer admin-token-test",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ action: "UPDATE_LIMITS", leverage: 5 }),
  });

  const res = await handleAdminRoute(invalidLeverageReq, env);
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.match(body.error, /leverage must be 1 to 3/i);
});

test("emergency kill switch requires EMERGENCY_STOP confirmation string", async () => {
  const { handleAdminRoute } = await import(adminUrl);
  const db = createMockD1();
  const env = {
    DB: db,
    TRADING_ADMIN_TOKEN: "admin-token-test",
  };

  // Missing confirmation -> rejected
  const missingConfirmReq = new Request("https://nexusbotai.pro/api/admin/risk", {
    method: "POST",
    headers: {
      Authorization: "Bearer admin-token-test",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ action: "EMERGENCY_STOP" }),
  });
  const rejectRes = await handleAdminRoute(missingConfirmReq, env);
  assert.equal(rejectRes.status, 400);

  // Valid confirmation -> engaged
  const validKillReq = new Request("https://nexusbotai.pro/api/admin/risk", {
    method: "POST",
    headers: {
      Authorization: "Bearer admin-token-test",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ action: "EMERGENCY_STOP", confirmation: "EMERGENCY_STOP" }),
  });
  const acceptRes = await handleAdminRoute(validKillReq, env);
  assert.equal(acceptRes.status, 200);
  const acceptBody = await acceptRes.json();
  assert.equal(acceptBody.ok, true);
  assert.match(acceptBody.message, /Emergency Stop activated/i);

  // Engaged cycle lock for 24h
  assert.ok(db._data.trading_state[0].cycle_lock_until > Math.floor(Date.now() / 1000));
});

test("administrative actions are logged to tamper-resistant audit logs", async () => {
  const { handleAdminRoute } = await import(adminUrl);
  const db = createMockD1();
  const env = {
    DB: db,
    TRADING_ADMIN_TOKEN: "admin-token-test",
  };

  const pauseReq = new Request("https://nexusbotai.pro/api/admin/engine", {
    method: "POST",
    headers: {
      Authorization: "Bearer admin-token-test",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ action: "PAUSE", reason: "Maintenance check" }),
  });

  await handleAdminRoute(pauseReq, env);

  // Verify audit log has the record
  assert.ok(db._data.admin_audit_logs.length > 0);
  const log = db._data.admin_audit_logs[0];
  assert.equal(log.action, "ENGINE_PAUSE");
  assert.equal(log.category, "trading_engine");
  assert.equal(log.status, "success");
});

test("user license management supports revocation and device reset", async () => {
  const { handleAdminRoute } = await import(adminUrl);
  const db = createMockD1();
  const env = {
    DB: db,
    TRADING_ADMIN_TOKEN: "admin-token-test",
  };

  // Reset device
  const resetReq = new Request("https://nexusbotai.pro/api/admin/users", {
    method: "POST",
    headers: {
      Authorization: "Bearer admin-token-test",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ action: "RESET_DEVICE", licenseId: "lic_user_1" }),
  });
  const resetRes = await handleAdminRoute(resetReq, env);
  assert.equal(resetRes.status, 200);
  assert.equal(db._data.licenses[0].device_id, null);

  // Revoke license
  const revokeReq = new Request("https://nexusbotai.pro/api/admin/users", {
    method: "POST",
    headers: {
      Authorization: "Bearer admin-token-test",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      action: "REVOKE_LICENSE",
      licenseId: "lic_user_1",
      confirmation: "REVOKE_LICENSE",
    }),
  });
  const revokeRes = await handleAdminRoute(revokeReq, env);
  assert.equal(revokeRes.status, 200);
  assert.equal(db._data.licenses[0].status, "revoked");
});
