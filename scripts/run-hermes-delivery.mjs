#!/usr/bin/env node
/**
 * Hermes GF map (#29) — one-shot delivery verification (AFK + optional AUTO-HITL).
 *
 * Usage:
 *   node scripts/run-hermes-delivery.mjs
 *   node scripts/run-hermes-delivery.mjs --skip-device
 *
 * Writes: docs/hitl/hermes-delivery-latest.json + .md
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const appRoot = path.resolve(process.env.HOME || "", "code/hermes-gf-app");
const skipDevice = process.argv.includes("--skip-device");
const nodeBin = process.execPath;
const stamp = new Date().toISOString().replace(/[:.]/g, "-");

// 资金 alone is polluted by Overview copy ("资金 Flow"); require tab-chrome labels.
const PRODUCT_TAB_REQUIRED = ["消息", "我的"];
const PRODUCT_TAB_OPTIONAL = ["资金"];

const results = [];
function step(id, kind, fn, { soft = false } = {}) {
  const started = Date.now();
  try {
    const detail = fn() || "";
    results.push({
      id,
      kind,
      soft,
      ok: true,
      ms: Date.now() - started,
      detail: String(detail).slice(0, 500),
    });
    console.log(`[OK] ${id}`);
  } catch (e) {
    results.push({
      id,
      kind,
      soft,
      ok: false,
      ms: Date.now() - started,
      detail: String(e?.message || e).slice(0, 500),
    });
    const tag = soft ? "SOFT-FAIL" : "FAIL";
    console.error(`[${tag}] ${id}: ${e?.message || e}`);
  }
}

function assertProductTabsInUiDump(xml) {
  const foundRequired = PRODUCT_TAB_REQUIRED.filter((label) => xml.includes(label));
  const missingRequired = PRODUCT_TAB_REQUIRED.filter((label) => !xml.includes(label));
  const foundOptional = PRODUCT_TAB_OPTIONAL.filter((label) => xml.includes(label));
  if (foundRequired.length === 0) {
    throw new Error(
      `R5 product tabs not found (device may still be steel-thread hub); missing all of: ${PRODUCT_TAB_REQUIRED.join(" · ")}`,
    );
  }
  if (missingRequired.length) {
    const found = [...foundRequired, ...foundOptional];
    throw new Error(
      `R5 product tabs incomplete; found: ${found.join(" · ")}; missing: ${missingRequired.join(" · ")} (tap other tabs or rebuild with B1–B4)`,
    );
  }
  const visible = [...PRODUCT_TAB_REQUIRED, ...PRODUCT_TAB_OPTIONAL].filter((label) =>
    xml.includes(label),
  );
  return `tabs visible: ${visible.join(" · ")}`;
}

function sh(cmd, opts = {}) {
  const r = spawnSync("bash", ["-lc", cmd], {
    encoding: "utf8",
    cwd: opts.cwd || repoRoot,
    env: {
      ...process.env,
      PATH: `${process.env.HOME}/.nvm/versions/node/v24.19.0/bin:/opt/homebrew/share/android-commandlinetools/platform-tools:/opt/homebrew/bin:${process.env.PATH}`,
      ANDROID_HOME: "/opt/homebrew/share/android-commandlinetools",
    },
  });
  if (r.status !== 0) {
    throw new Error((r.stderr || r.stdout || `exit ${r.status}`).trim().slice(0, 400));
  }
  return (r.stdout || "").trim();
}

function curlOk(url, { expectIncludes } = {}) {
  const out = sh(`curl -sS --connect-timeout 5 --max-time 12 ${JSON.stringify(url)}`);
  if (expectIncludes && !out.includes(expectIncludes)) {
    throw new Error(`unexpected body: ${out.slice(0, 200)}`);
  }
  return out.slice(0, 200);
}

console.log(`Hermes delivery verify · app=${appRoot}`);
console.log("");

step("L1.health", "AFK", () =>
  curlOk("http://127.0.0.1:8000/v1/health", { expectIncludes: '"status":"ok"' }),
);
step("L1.macro", "AFK", () => curlOk("http://127.0.0.1:8000/v1/macro/score"));
step("L1.sentiment", "AFK", () => curlOk("http://127.0.0.1:8000/v1/sentiment/latest"));
step("L1.messages_detail", "AFK", () => {
  const list = JSON.parse(sh(`curl -sS 'http://127.0.0.1:8000/v1/messages?limit=1'`));
  const id = list?.[0]?.id;
  if (!id) throw new Error("no messages to probe detail");
  return curlOk(`http://127.0.0.1:8000/v1/messages/${id}`, { expectIncludes: `"id":${id}` });
});
step("L1.reports_detail", "AFK", () => {
  const list = JSON.parse(sh(`curl -sS 'http://127.0.0.1:8000/v1/reports/latest'`));
  const id = Array.isArray(list) ? list[0]?.id : list?.id;
  if (!id) throw new Error("no reports to probe detail");
  return curlOk(`http://127.0.0.1:8000/v1/reports/${id}`, { expectIncludes: `"id":${id}` });
});
step("L1.portfolio", "AFK", () => curlOk("http://127.0.0.1:8000/v1/portfolio/live"));

step("Prod.api_health", "AFK", () =>
  curlOk("https://tiangong.uno/api/health", { expectIncludes: '"data_service":"ok"' }),
);
step("SSH.ecs", "AFK", () =>
  sh(
    `ssh -i "$HOME/.ssh/hermes-ecs" -o BatchMode=yes -o ConnectTimeout=12 root@47.93.214.189 'echo OK; curl -sf http://127.0.0.1:3099/v1/health'`,
  ),
);

if (!existsSync(appRoot)) {
  step("App.root", "AFK", () => {
    throw new Error(`missing ${appRoot}`);
  });
} else {
  step("L4.steel", "AFK", () => {
    const r = spawnSync(nodeBin, [path.join(repoRoot, "scripts/verify-l4-steel-thread.mjs"), appRoot], {
      encoding: "utf8",
      cwd: repoRoot,
    });
    if (r.status !== 0) throw new Error((r.stderr || r.stdout || "").slice(-400));
    return "PASS";
  });
  step("L4.js_gate", "AFK", () => {
    const r = spawnSync(
      nodeBin,
      [path.join(repoRoot, "scripts/verify-js-update-load.mjs"), appRoot, "--production"],
      { encoding: "utf8", cwd: repoRoot },
    );
    if (r.status !== 0) throw new Error((r.stderr || r.stdout || "").slice(-400));
    return "PASS";
  });
}

if (!skipDevice) {
  step("Device.adb", "AUTO-HITL", () => {
    const out = sh("adb devices");
    if (!/\tdevice$/m.test(out)) throw new Error("no adb device");
    return out.split("\n").filter((l) => l.includes("\tdevice")).join("; ");
  });
  step("Device.overview_ui", "AUTO-HITL", () => {
    sh("adb reverse tcp:8000 tcp:8000");
    sh("adb shell am start -n com.hermesgfapp/.MainActivity >/dev/null");
    sh("sleep 2");
    sh("adb shell uiautomator dump /sdcard/ui.xml >/dev/null");
    const xml = sh("adb shell cat /sdcard/ui.xml");
    if (xml.includes("开发跳过")) {
      // tap skip via python
      sh(`python3 - <<'PY'
import re,subprocess
xml=subprocess.check_output(['adb','shell','cat','/sdcard/ui.xml'],text=True,errors='replace')
for m in re.finditer(r'text="([^"]*)"[^>]*bounds="\\[(\\d+),(\\d+)\\]\\[(\\d+),(\\d+)\\]"', xml):
  if '开发跳过' in m.group(1):
    x=(int(m.group(2))+int(m.group(4)))//2; y=(int(m.group(3))+int(m.group(5)))//2
    subprocess.check_call(['adb','shell','input','tap',str(x),str(y)]); break
PY`);
      sh("sleep 2");
      sh("adb shell uiautomator dump /sdcard/ui.xml >/dev/null");
    }
    const xml2 = sh("adb shell cat /sdcard/ui.xml");
    if (!xml2.includes("市场概览") && !xml2.includes("HERMES")) {
      throw new Error("overview not visible");
    }
    return "overview visible";
  });
  step(
    "Device.product_tabs",
    "AUTO-HITL",
    () => {
      const xml = sh("adb shell cat /sdcard/ui.xml");
      return assertProductTabsInUiDump(xml);
    },
    { soft: true },
  );
}

const failed = results.filter((r) => !r.ok && !r.soft);
const softFailed = results.filter((r) => !r.ok && r.soft);
const payload = {
  schemaVersion: 1,
  stamp,
  map: 29,
  appRoot,
  ok: failed.length === 0,
  passed: results.filter((r) => r.ok).length,
  failed: failed.length,
  softFailed: softFailed.length,
  results,
};

const hitlDir = path.join(repoRoot, "docs/hitl");
mkdirSync(hitlDir, { recursive: true });
const jsonPath = path.join(hitlDir, "hermes-delivery-latest.json");
const mdPath = path.join(hitlDir, "hermes-delivery-latest.md");
writeFileSync(jsonPath, JSON.stringify(payload, null, 2));
const md = [
  `# Hermes GF delivery verify`,
  ``,
  `**stamp:** ${stamp}`,
  `**ok:** ${payload.ok}`,
  `**passed/failed:** ${payload.passed}/${payload.failed}`,
  ...(softFailed.length ? [`**soft-failed:** ${payload.softFailed}`, ``] : []),
  `| Step | Kind | OK | ms |`,
  `|------|------|----|----|`,
  ...results.map((r) => {
    const okCell = r.ok ? "✅" : r.soft ? "⚠️ soft" : "❌";
    return `| ${r.id} | ${r.kind} | ${okCell} | ${r.ms} |`;
  }),
  ``,
  failed.length
    ? `## Failures\n\n${failed.map((f) => `- **${f.id}**: ${f.detail}`).join("\n")}`
    : softFailed.length
      ? `## Verdict\n\nHard gates PASS; soft-fail:\n\n${softFailed.map((f) => `- **${f.id}**: ${f.detail}`).join("\n")}`
      : `## Verdict\n\nAll automated gates PASS.`,
  ``,
].join("\n");
writeFileSync(mdPath, md);
writeFileSync(path.join(hitlDir, `hermes-delivery-${stamp}.json`), JSON.stringify(payload, null, 2));

console.log("");
console.log(payload.ok ? "Hermes delivery: PASS" : "Hermes delivery: FAIL");
console.log(`wrote ${jsonPath}`);
process.exit(payload.ok ? 0 : 1);
