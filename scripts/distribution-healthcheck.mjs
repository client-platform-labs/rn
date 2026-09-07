#!/usr/bin/env node
/**
 * G5 — distribution service healthcheck（运维 A 最小集）。
 * 检查 /health、磁盘、晋级失败率、证书过期；任一失败 → 经 notify-alert 发告警。
 *
 * 用法：
 *   node scripts/distribution-healthcheck.mjs \
 *     --base http://127.0.0.1:4040 --project-root /data/project \
 *     --connector dingtalk --webhook <url>            # 发告警
 *   node scripts/distribution-healthcheck.mjs --dry-run   # 只打印将发的告警
 *
 * 环境变量：DIST_HEALTH_BASE / DIST_PROJECT_ROOT / DIST_ALERT_CONNECTOR / DIST_ALERT_WEBHOOK
 * 可选：--cert-file <path>（检查 TLS 证书到期），--disk-threshold <pct>（默认 85）
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { X509Certificate } from "node:crypto";
import { hostname } from "node:os";

const here = path.dirname(fileURLToPath(import.meta.url));
const arg = (name, env) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : process.env[env];
};

const base = (arg("base", "DIST_HEALTH_BASE") || "http://127.0.0.1:4040").replace(/\/$/, "");
const projectRoot = path.resolve(arg("project-root", "DIST_PROJECT_ROOT") || process.cwd());
const connector = arg("connector", "DIST_ALERT_CONNECTOR") || "dingtalk";
const webhook = arg("webhook", "DIST_ALERT_WEBHOOK");
const certFile = arg("cert-file", "DIST_ALERT_CERT_FILE");
const diskThreshold = Number(arg("disk-threshold", "DIST_DISK_THRESHOLD") || 85);
const dryRun = process.argv.includes("--dry-run");

const alerts = [];

function emit(severity, title, detail, tags = {}) {
  const ev = { severity, title, detail, host: hostname(), ts: new Date().toISOString(), tags };
  alerts.push(ev);
}

async function notify(ev) {
  const eventJson = JSON.stringify(ev);
  const r = spawnSync(
    process.execPath,
    [path.join(here, "notify-alert.mjs"), "--connector", connector, "--webhook", webhook || "", "--event", eventJson, ...(dryRun ? ["--dry-run"] : [])],
    { encoding: "utf8" },
  );
  process.stdout.write(r.stdout || "");
  if (r.status !== 0) process.stderr.write(r.stderr || "");
}

// 1) /health
try {
  const res = await fetch(`${base}/health`, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) emit("critical", "服务宕机", `/health HTTP ${res.status}`);
  else {
    const j = await res.json().catch(() => ({}));
    if (j.ok !== true) emit("critical", "服务不健康", "/health ok!=true");
  }
} catch (e) {
  emit("critical", "服务宕机", String(e));
}

// 2) disk usage（支持 POSIX df：容量百分比统一按 \d+% 取）
try {
  const df = spawnSync("df", ["-P", projectRoot], { encoding: "utf8" });
  const m = df.stdout.match(/(\d+)%/);
  if (m) {
    const pct = Number(m[1]);
    if (pct >= diskThreshold) emit("critical", "磁盘满", `使用率 ${pct}% (阈值 ${diskThreshold}%)`, { pct });
  }
} catch (e) {
  // disk check unavailable → skip (do not false-alarm)
}

// 3) promote failure rate（审计日志 outcome=error 占比）
const auditFile = path.join(projectRoot, ".rn/distribution-lab/logs/cp-audit.log");
if (existsSync(auditFile)) {
  let ok = 0;
  let err = 0;
  for (const line of readFileSync(auditFile, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try {
      const e = JSON.parse(line);
      if (e.outcome === "ok") ok += 1;
      else if (e.outcome === "error") err += 1;
    } catch {
      /* skip malformed */
    }
  }
  const total = ok + err;
  if (total >= 20 && err / total > 0.1) {
    emit("warning", "晋级失败率偏高", `${err}/${total} (${((err / total) * 100).toFixed(1)}%)`, {
      errors: err,
      total,
    });
  }
}

// 4) TLS 证书到期
if (certFile && existsSync(certFile)) {
  try {
    const cert = new X509Certificate(readFileSync(certFile));
    const days = Math.floor((new Date(cert.validTo).getTime() - Date.now()) / 86400000);
    if (days < 0) emit("critical", "证书已过期", `${cert.validTo}`);
    else if (days < 7) emit("warning", "证书将过期", `${days} 天后 (${cert.validTo})`, { days });
  } catch (e) {
    emit("warning", "证书解析失败", String(e));
  }
}

// deliver
for (const ev of alerts) await notify(ev);
console.log(JSON.stringify({ ok: alerts.length === 0, alerts: alerts.length }, null, 2));
process.exit(alerts.length > 0 ? 1 : 0);