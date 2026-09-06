#!/usr/bin/env node
/**
 * Multi-tenant CP auth + /v1/metrics + /v1/sli smoke.
 *
 * Usage: node scripts/verify-cp-enterprise.mjs
 */
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const projectRoot = mkdtempSync(path.join(tmpdir(), "cp-ent-"));
mkdirSync(path.join(projectRoot, ".rn", "delivery"), { recursive: true });
writeFileSync(
  path.join(projectRoot, "package.json"),
  JSON.stringify({ name: "cp-enterprise-demo" }),
);
writeFileSync(
  path.join(projectRoot, ".rn", "delivery", "registry.json"),
  JSON.stringify({
    schemaVersion: 1,
    staging: [],
    production: [],
    gray: [],
    devices: {},
    blocked: [],
    kills: [],
    pauses: [],
    rollouts: [],
  }),
);

const port = 14050 + Math.floor(Math.random() * 100);
const tenants = JSON.stringify({ acme: "tok-acme", beta: "tok-beta" });

const child = spawn(
  process.execPath,
  [
    path.join(root, "packages/rn-delivery/bin/rn-delivery.mjs"),
    "cp-serve",
    "--port",
    String(port),
    "--host",
    "127.0.0.1",
  ],
  {
    cwd: projectRoot,
    env: {
      ...process.env,
      RN_CP_TENANTS: tenants,
      RN_CP_ROLE: "admin",
      RN_CP_PROJECT: projectRoot,
    },
    stdio: ["ignore", "pipe", "pipe"],
  },
);

let failed = false;
function ok(msg) {
  console.log(`OK ${msg}`);
}
function fail(msg) {
  console.error(`FAIL ${msg}`);
  failed = true;
}

async function req(method, p, { token, tenant, body } = {}) {
  const headers = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  if (tenant) headers["x-rn-tenant"] = tenant;
  const res = await fetch(`http://127.0.0.1:${port}${p}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return { status: res.status, json, text };
}

try {
  for (let i = 0; i < 40; i++) {
    try {
      const h = await fetch(`http://127.0.0.1:${port}/health`);
      if (h.ok) break;
    } catch {
      /* retry */
    }
    await sleep(100);
  }

  const svc = await req("GET", "/v1/service");
  if (svc.status === 200 && Array.isArray(svc.json?.auth?.tenants)) {
    ok(`service.auth.tenants=${svc.json.auth.tenants.join(",")}`);
  } else fail(`service auth tenants missing: ${JSON.stringify(svc.json?.auth)}`);

  const noTenant = await req("POST", "/v1/promote", {
    token: "tok-acme",
    body: { digest: "x" },
  });
  if (noTenant.status === 401) ok("multi-tenant: missing X-RN-Tenant → 401");
  else fail(`expected 401 missing tenant, got ${noTenant.status}`);

  const wrongTenant = await req("POST", "/v1/promote", {
    token: "tok-acme",
    tenant: "beta",
    body: { digest: "x" },
  });
  if (wrongTenant.status === 401) ok("multi-tenant: wrong token for tenant → 401");
  else fail(`expected 401 wrong tenant token, got ${wrongTenant.status}`);

  const okTenant = await req("POST", "/v1/promote", {
    token: "tok-acme",
    tenant: "acme",
    body: { digest: "deadbeef" },
  });
  // auth passes → handler 400 (digest missing)
  if (okTenant.status === 400) ok("multi-tenant: acme token → handler (400)");
  else fail(`expected 400 after auth, got ${okTenant.status}`);

  const metrics = await req("GET", "/v1/metrics");
  if (
    metrics.status === 200 &&
    typeof metrics.text === "string" &&
    metrics.text.includes("cp_http_denied_total")
  ) {
    ok("GET /v1/metrics prometheus text");
  } else fail("metrics endpoint missing counters");

  const sli = await req("POST", "/v1/sli", {
    token: "tok-acme",
    tenant: "acme",
    body: { digest: "deadbeef", sli: { crash_rate: 0.01 } },
  });
  if (sli.status === 200 && sli.json?.ok) ok("POST /v1/sli accepted");
  else fail(`sli post failed: ${sli.status} ${JSON.stringify(sli.json)}`);

  if (failed) {
    console.error("verify-cp-enterprise: FAIL");
    process.exit(1);
  }
  console.log("verify-cp-enterprise: PASS");
} finally {
  child.kill("SIGTERM");
  try {
    rmSync(projectRoot, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}
