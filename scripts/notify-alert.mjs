#!/usr/bin/env node
/**
 * G5 — canonical 告警事件 → 每 IM 一个薄 connector（ADR-017 运维 A）。
 *
 * 钉钉 / 企业微信：{"msgtype":"text","text":{"content":…}}
 * 飞书：            {"msg_type":"text","content":{"text":…}}
 * 换 IM 只改 --connector + --webhook，不动事件模型。
 *
 * 用法：
 *   node scripts/notify-alert.mjs --connector dingtalk|wecom|feishu \
 *     --webhook <url> --severity critical --title "…" --detail "…" [--host H] [--dry-run]
 *
 * 也接受 stdin JSON 事件：
 *   echo '{…canonical event…}' | node scripts/notify-alert.mjs --connector feishu --webhook <url> --dry-run
 */

import { hostname } from "node:os";

const args = process.argv.slice(2);
function opt(name, fallback) {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}

const connector = (opt("--connector") || "").toLowerCase();
const webhook = opt("--webhook");
const dryRun = args.includes("--dry-run");

// canonical event：优先 --event <json>，否则用参数拼
const eventJson = opt("--event");
const event = eventJson
  ? JSON.parse(eventJson)
  : {
      severity: opt("--severity") || "warning",
      title: opt("--title") || "untitled",
      detail: opt("--detail") || "",
      host: opt("--host") || hostname(),
      ts: new Date().toISOString(),
    };

function renderText(ev) {
  const tags = ev.tags && typeof ev.tags === "object"
    ? " " + Object.entries(ev.tags).map(([k, v]) => `${k}=${v}`).join(" ")
    : "";
  return `[${ev.severity}] ${ev.title} — ${ev.detail} (host=${ev.host}${tags})`;
}

let body;
switch (connector) {
  case "feishu":
    body = { msg_type: "text", content: { text: renderText(event) } };
    break;
  case "dingtalk":
  case "wecom":
  default:
    body = { msgtype: "text", text: { content: renderText(event) } };
    break;
}

if (dryRun) {
  console.log(JSON.stringify({ connector: connector || "dingtalk", payload: body }, null, 2));
  process.exit(0);
}

if (!webhook) {
  console.error("notify-alert: --webhook required (or --dry-run)");
  process.exit(1);
}

const res = await fetch(webhook, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});
if (!res.ok) {
  console.error(`notify-alert: ${connector} webhook HTTP ${res.status}: ${await res.text()}`);
  process.exit(1);
}
console.log(`notify-alert: ${connector} delivered`);