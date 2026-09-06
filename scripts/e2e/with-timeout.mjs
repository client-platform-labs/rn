#!/usr/bin/env node
// scripts/e2e/with-timeout.mjs — 跨平台 (macOS 友好) 的 timeout 包装
// usage:
//   node with-timeout.mjs <cmd> [args...] --ms=<n>
//   node with-timeout.mjs bash -c "..." --ms=60000
// macOS 没有 GNU timeout，用这个包
import { spawn } from "node:child_process";

const argv = process.argv.slice(2);
const msIdx = argv.findIndex((a) => a.startsWith("--ms="));
if (msIdx < 0) {
  console.error("usage: with-timeout.mjs <cmd> [args...] --ms=<n>");
  process.exit(2);
}
const ms = parseInt(argv[msIdx].slice(5), 10);
const args = [...argv.slice(0, msIdx), ...argv.slice(msIdx + 1)];
const [cmd, ...rest] = args;

const child = spawn(cmd, rest, { stdio: "inherit" });
const timer = setTimeout(() => {
  console.error(`\n[with-timeout] TIMEOUT after ${ms}ms, killing ${cmd}`);
  try { child.kill("SIGKILL"); } catch {}
  process.exit(124);
}, ms);

child.on("exit", (code, sig) => {
  clearTimeout(timer);
  if (sig === "SIGKILL") process.exit(124);
  process.exit(code || 0);
});
