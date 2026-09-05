#!/usr/bin/env node
// scripts/_run-verify.mjs — 给单个 verify-*.mjs 套 60s 超时 + 退出码透传
// 用法: node scripts/_run-verify.mjs <verify-script.mjs>
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const script = process.argv[2];
if (!script) {
  console.error('usage: node scripts/_run-verify.mjs <verify-script.mjs>');
  process.exit(2);
}

const TIMEOUT_MS = parseInt(process.env.VERIFY_TIMEOUT_MS || '60000', 10);

const child = spawn(process.execPath, [resolve(script)], {
  stdio: 'inherit',
});

const killTimer = setTimeout(() => {
  console.error(`[timeout] ${script} 超时 ${TIMEOUT_MS}ms，kill`);
  child.kill('SIGKILL');
  process.exit(124);  // 模仿 coreutils timeout
}, TIMEOUT_MS);

child.on('exit', (code, signal) => {
  clearTimeout(killTimer);
  if (signal === 'SIGKILL') {
    process.exit(124);
  }
  process.exit(code ?? 1);
});
