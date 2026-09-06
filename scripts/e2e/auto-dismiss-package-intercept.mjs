#!/usr/bin/env node
// scripts/e2e/auto-dismiss-package-intercept.mjs
// 兼容入口 — 实际逻辑在 lib-dismiss.mjs
// 用法:
//   node scripts/e2e/auto-dismiss-package-intercept.mjs [--ms=60000]
//   bash scripts/e2e/chain-03-release-load.sh  // 内部自动调
import { ensureInstallPageDismissed } from "./lib-dismiss.mjs";

const msIdx = process.argv.findIndex((a) => a.startsWith("--ms="));
const timeoutMs = msIdx >= 0 ? parseInt(process.argv[msIdx].slice(5), 10) : 60000;

ensureInstallPageDismissed({ timeoutMs })
  .then((r) => process.exit(r.ok ? 0 : 1))
  .catch((e) => { console.error(e); process.exit(2); });
