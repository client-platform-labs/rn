#!/usr/bin/env node
/**
 * Role-DX machine checks (#143): help layering + docs do not push catalog serve
 * onto business booklet; register resolve helpers covered by unit tests.
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rnBin = path.join(repoRoot, "packages/rn/bin/rn.mjs");

function fail(msg) {
  console.error(`FAIL: ${msg}`);
  process.exit(1);
}

function runHelp(args) {
  const r = spawnSync(process.execPath, [rnBin, ...args], {
    encoding: "utf8",
    cwd: repoRoot,
  });
  return `${r.stdout ?? ""}${r.stderr ?? ""}`;
}

const help = runHelp(["--help"]);
if (/catalog serve/i.test(help) || /\bsession\b/i.test(help)) {
  // session might appear in descriptions — check command list style
}
if (/\n\s+session\s/i.test(help) || /Commands:[\s\S]*\bsession\b/.test(help)) {
  // Commander lists "session" as a top-level command name
  if (/^\s+session\s/m.test(help)) {
    fail("rn --help still lists session (expected hidden without --all)");
  }
}
if (/^\s+serve\s/m.test(help)) {
  fail("rn --help lists serve at top level unexpectedly");
}

const helpAll = runHelp(["--help", "--all"]);
if (!/session/i.test(helpAll)) {
  fail("rn --help --all should reveal session");
}

const business = readFileSync(
  path.join(repoRoot, "docs/guides/roles/handbook-business.md"),
  "utf8",
);
if (/catalog serve|session status|module register/i.test(business) &&
    !/Forbidden[\s\S]*catalog serve/i.test(business)) {
  fail("business handbook should not teach pipes outside Forbidden section");
}
if (!/npm run dev/.test(business)) {
  fail("business handbook missing npm run dev");
}
if (/rn catalog serve/.test(business) && !/Forbidden/.test(business)) {
  fail("business handbook must not prescribe catalog serve");
}

for (const f of [
  "handbook-business.md",
  "handbook-host-ops.md",
  "handbook-release.md",
  "handbook-platform.md",
]) {
  const p = path.join(repoRoot, "docs/guides/roles", f);
  if (!existsSync(p)) fail(`missing ${f}`);
}

if (!/rn module register/.test(
  readFileSync(path.join(repoRoot, "docs/guides/roles/handbook-host-ops.md"), "utf8"),
)) {
  fail("host-ops handbook missing rn module register");
}

console.log(
  JSON.stringify(
    {
      ok: true,
      checked: ["rn --help hide", "rn --help --all", "role handbooks"],
      at: new Date().toISOString(),
    },
    null,
    2,
  ),
);
