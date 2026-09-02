#!/usr/bin/env node
/**
 * 本机双域名全链路验证（cp-serve + 可选 Caddy）。
 *
 * Usage:
 *   ./scripts/setup-local-distribution-server.sh
 *   node scripts/verify-local-distribution-chain.mjs
 */
import { homedir } from "node:os";
import path from "node:path";

const prod =
  process.env.DIST_PROD_URL || "http://dist.tiangong.local";
const staging =
  process.env.DIST_STAGING_URL || "http://dist-staging.tiangong.local";
const direct = process.env.DIST_DIRECT_URL || "http://127.0.0.1:4040";
const token = process.env.RN_CP_TOKEN || "dev";

function step(name, ok, detail = "") {
  console.log(`[${ok ? "OK" : "FAIL"}] ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) process.exit(1);
}

async function tryFetch(url, opts = {}) {
  try {
    const res = await fetch(url, opts);
    return { res, err: null };
  } catch (err) {
    return { res: null, err };
  }
}

async function baseChecks(base, label) {
  const health = await tryFetch(`${base}/health`);
  if (!health.res?.ok) {
    return { ok: false, reason: `${label} unreachable (${health.err?.message || health.res?.status})` };
  }
  const hosts = await (await fetch(`${base}/v1/candidates?lane=all`)).json();
  const js = await (
    await fetch(`${base}/v1/js-updates?lane=all&module=desk`)
  ).json();
  const portal = await (await fetch(`${base}/portal/host`)).text();
  return {
    ok: true,
    hosts: hosts.candidates?.length ?? 0,
    js: js.candidates?.length ?? 0,
    portal: portal.includes("portal-live.js"),
  };
}

async function checkManifest(base, lane) {
  const res = await fetch(
    `${base}/v1/js-updates/check?module=desk&lane=${lane}`,
  );
  if (lane === "staging" && res.status === 204) {
    return { ok: true, skip: true };
  }
  if (!res.ok && res.status !== 204) {
    return { ok: false, reason: `check ${lane} ${res.status}` };
  }
  if (res.status === 204) return { ok: true, empty: true };
  const m = await res.json();
  const artUrl = m.url.startsWith("http") ? m.url : `${base}${m.url}`;
  const art = await fetch(artUrl);
  if (!art.ok) return { ok: false, reason: `artifact ${art.status}` };
  const buf = await art.arrayBuffer();
  return { ok: true, updateId: m.update_id, bytes: buf.byteLength };
}

async function promoteSmoke(base) {
  const reg = await (await fetch(`${base}/v1/registry`)).json();
  const row = reg.staging?.find((c) => c.artifact_kind === "js-update");
  if (!row) return { ok: true, skip: "no js staging" };
  const res = await fetch(`${base}/v1/promote`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ digest: row.digest }),
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    const msg = j.error || res.statusText;
    if (/dependency|peer|resolve deps/i.test(String(msg))) {
      return { ok: true, skip: msg.slice(0, 80) };
    }
    return { ok: false, reason: msg };
  }
  return { ok: true, digest: row.digest.slice(0, 12) };
}

// 1) 直连端口（必须）
const directR = await baseChecks(direct, "direct :4040");
step("cp-serve :4040 /health", directR.ok, directR.reason);
step(
  "registry 有宿主 + desk",
  directR.hosts > 0 && directR.js > 0,
  `hosts=${directR.hosts} js=${directR.js}`,
);
step("portal/host HTML", directR.portal);

// 2) 生产域名（Caddy / hosts）
const prodR = await baseChecks(prod, "prod domain");
if (prodR.ok) {
  step("生产域名", true, prod);
  const m = await checkManifest(prod, "production");
  step(
    "checkUpdate production",
    m.ok,
    m.skip ? "skip" : m.empty ? "empty" : `${m.updateId} ${m.bytes}b`,
  );
} else {
  console.log(`[SKIP] 生产域名 — ${prodR.reason}（检查 /etc/hosts 与 Caddy）`);
}

// 3) 测试域名
const stR = await baseChecks(staging, "staging domain");
if (stR.ok) {
  step("测试域名", true, staging);
  const m = await checkManifest(staging, "staging");
  step(
    "checkUpdate staging",
    m.ok,
    m.empty ? "empty" : m.skip ? "skip" : `${m.updateId} ${m.bytes}b`,
  );
} else {
  console.log(`[SKIP] 测试域名 — ${stR.reason}`);
}

// 4) promote API（mutating）
const prom = await promoteSmoke(direct);
step("POST /v1/promote (Bearer)", prom.ok, prom.reason || prom.digest || prom.skip);

console.log("\nverify-local-distribution-chain: PASS");
console.log(`\nOpen:\n  ${prod}/portal/host\n  ${staging}/portal/js`);
