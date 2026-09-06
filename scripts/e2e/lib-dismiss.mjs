#!/usr/bin/env node
// scripts/e2e/lib-dismiss.mjs — 通用安装弹窗处理库 (自动化测试场景)
// 部分机型 (vivo iQOO Neo10 Android 16) 弹窗 lifecycle:
//   1) 出现 "继续安装" 按钮
//   2) 必须先勾选 "已了解应用的风险检测结果" checkbox
//   3) 勾上后 "继续安装" 按钮才可点
//
// 用法:
//   import { ensureInstallPageDismissed } from "./lib-dismiss.mjs";
//   await ensureInstallPageDismissed({ timeoutMs: 60000, log: console });
//
//   // 或命令行: node lib-dismiss.mjs  (默认 60s timeout)
//   //   node lib-dismiss.mjs --ms=90000
//
// 设计原则:
//   - 每次调用都是单次 lifecycle, 完成后立即退出 (不残留后台进程)
//   - 调用方负责在 install 之前同步调用, 内部会等 install page 出现 + 处理完
//   - 多次 install 不会互相干扰, 因为每次都是独立进程

import { execSync } from "node:child_process";
import { readFileSync, existsSync, unlinkSync } from "node:fs";

const ADB = process.env.ADB || "adb";
const DEVICE = process.env.ANDROID_SERIAL || "";

function adb(args, opts = {}) {
  const a = DEVICE ? ["-s", DEVICE, ...args] : args;
  return execSync(`${ADB} ${a.map(quote).join(" ")}`, {
    encoding: "utf8",
    timeout: opts.timeout || 10000,
  });
}
function quote(s) { return /\s/.test(s) ? `"${s}"` : s; }
function adbShell(cmd) { return adb(["shell", cmd]); }
function tap(x, y) { adbShell(`input tap ${x} ${y}`); }
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

export function dumpUi() {
  try {
    adbShell("uiautomator dump /sdcard/_e2e_ui.xml >/dev/null 2>&1");
    adb(["pull", "/sdcard/_e2e_ui.xml", "/tmp/_e2e_ui.xml"], { timeout: 5000 });
    if (!existsSync("/tmp/_e2e_ui.xml")) return null;
    return readFileSync("/tmp/_e2e_ui.xml", "utf8");
  } catch {
    return null;
  }
}

export function findAllNodes(xml) {
  const re = /<node\b([^>]*?)\/?>/g;
  const out = [];
  let m;
  while ((m = re.exec(xml))) {
    const a = m[1];
    const b = a.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
    if (!b) continue;
    out.push({
      text: (a.match(/text="([^"]*)"/) || [])[1] || "",
      cx: Math.round((+b[1] + +b[3]) / 2),
      cy: Math.round((+b[2] + +b[4]) / 2),
      clickable: /clickable="true"/.test(a),
      checked: /checked="true"/.test(a),
    });
  }
  return out;
}

export function isInstallPage(nodes) {
  return nodes.some((n) =>
    n.text === "继续安装" || n.text === "仍要安装" ||
    n.text.includes("已了解") || n.text.includes("未经") ||
    n.text.includes("安全守护")
  );
}

function findCheckbox(nodes) {
  // vivo 风格: "已了解应用的风险检测结果" (clickable + checkbox)
  return nodes.find((n) => n.text.includes("已了解") && n.clickable) || null;
}

function findContinueButton(nodes) {
  return nodes.find((n) =>
    n.text === "继续安装" || n.text === "仍要安装" || n.text === "安装"
  ) || null;
}

/**
 * 通用函数: 等待 install page 出现, 勾选 checkbox, 点 "继续安装"
 *
 * @param {Object} opts
 * @param {number} [opts.timeoutMs=60000] - 总超时
 * @param {Object} [opts.log=console] - 日志对象
 * @returns {Promise<{ok: boolean, reason: string}>}
 */
export async function ensureInstallPageDismissed(opts = {}) {
  const timeoutMs = opts.timeoutMs || 60000;
  const log = opts.log || console;
  const start = Date.now();
  let round = 0;
  let checkboxTapped = false;
  let buttonTapped = false;

  log.log?.("[dismiss] watching for install page...");

  while (Date.now() - start < timeoutMs) {
    round++;
    const xml = dumpUi();
    if (!xml) { await sleep(300); continue; }
    const nodes = findAllNodes(xml);
    if (!isInstallPage(nodes)) { await sleep(300); continue; }

    // 1) 勾选 checkbox
    const ack = findCheckbox(nodes);
    if (ack && !ack.checked) {
      log.log?.(`[dismiss] round ${round}: tap checkbox "${ack.text}" @ (${ack.cx},${ack.cy})`);
      tap(ack.cx, ack.cy);
      checkboxTapped = true;
      await sleep(600);
      continue;
    }

    // 2) 点继续安装按钮
    const btn = findContinueButton(nodes);
    if (btn) {
      log.log?.(`[dismiss] round ${round}: tap button "${btn.text}" @ (${btn.cx},${btn.cy})`);
      tap(btn.cx, btn.cy);
      buttonTapped = true;
      // 完成 lifecycle, 立即退出
      try { adbShell("rm /sdcard/_e2e_ui.xml"); } catch {}
      try { if (existsSync("/tmp/_e2e_ui.xml")) unlinkSync("/tmp/_e2e_ui.xml"); } catch {}
      log.log?.(`[dismiss] done in ${Date.now() - start}ms (checkbox=${checkboxTapped} button=${buttonTapped})`);
      return { ok: true, reason: "tapped", checkboxTapped, buttonTapped };
    }
    await sleep(300);
  }

  log.log?.(`[dismiss] timeout after ${timeoutMs}ms, no install page handled`);
  return { ok: false, reason: "timeout", checkboxTapped, buttonTapped };
}

// CLI 入口: 直接当脚本跑
if (import.meta.url === `file://${process.argv[1]}`) {
  const msIdx = process.argv.findIndex((a) => a.startsWith("--ms="));
  const timeoutMs = msIdx >= 0 ? parseInt(process.argv[msIdx].slice(5), 10) : 60000;
  ensureInstallPageDismissed({ timeoutMs })
    .then((r) => process.exit(r.ok ? 0 : 1))
    .catch((e) => { console.error(e); process.exit(2); });
}
