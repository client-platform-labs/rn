#!/usr/bin/env node
/**
 * Verification-plane checker — the anti-vacuity gate.
 *
 * Six real defects in this repo shared one shape: a gate that *looked like it
 * verified* but could not. This checker turns each class into a machine-checkable
 * assertion so it cannot come back:
 *
 *   CHK-1  TEST GLOB COVERAGE      a test file no `pnpm test` invocation runs
 *                                  (the whole `packages/shell-core/test/` suite
 *                                  was unenforced for exactly this reason)
 *   CHK-2  CHAIN EXIT CONTRACT     an e2e chain that can exit 0 after a SKIP,
 *                                  making "not verified" look like "verified"
 *                                  (`verify-cp-registry-postgres.mjs` did this)
 *   CHK-3  PHANTOM COMMANDS        a step the operator is told to run that does
 *                                  not exist (`apply-ota`, `pack-business`)
 *   CHK-4  PROBE REACHABILITY      a probe referenced but absent (26 dead refs
 *                                  across 23 probes), or an orphan nobody runs
 *
 * The two remaining classes are not statically decidable and are covered by the
 * review checklist in docs/agents/engineering-principles.md § Verification
 * integrity: a signal that is ALWAYS true (a pid change `force-stop` makes
 * unconditional) or ALWAYS false (grepping for a symbol that was moved away),
 * and an assertion that states current behaviour instead of intent.
 *
 * Usage:
 *   node scripts/check-verification-plane.mjs
 *   node scripts/check-verification-plane.mjs --root <dir>   # fixture roots (tests)
 *
 * Exit: 0 = pass, 1 = fail. Non-fatal findings are printed but do not fail.
 *
 * MATCHER NOTES (CHK-3) — precision matters more than recall here, because a
 * false positive makes the gate untrustworthy:
 *   - Only LITERAL paths are resolved. `$RD` / `"$E2E_REPO/..."` style references
 *     are skipped: they cannot be resolved statically, and guessing would produce
 *     false positives.
 *   - A reference whose step runs with an EXTERNAL cwd (a checkout outside this
 *     repo, e.g. `~/code/tiangong-host`) is classified `external` and is NOT
 *     required to exist here. This mirrors the structural rule already proven in
 *     `scripts/lib/verify/registry.mjs` (`external` vs `dangling`). Without it,
 *     the hermes loop drivers' `cwd: shellApp` references to
 *     `scripts/pack-business.mjs` would be reported as phantoms when the real
 *     defect is a cross-checkout contract.
 *   - Runner files are the ones that EXECUTE what they name (`scripts/run-*-loop.mjs`,
 *     workflows). A probe's own fixture strings (e.g. `verify-harness.mjs`
 *     synthesising `verify-gone.mjs` to test the registry) are DATA, not
 *     instructions, so probe files are not scanned as runners.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { auditProbes } from "./lib/verify/registry.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(__dirname, "..");

/* ───────────────────────────── helpers ───────────────────────────── */

function walk(dir, filter, out = [], depth = 0) {
  if (depth > 8 || !existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".git") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, filter, out, depth + 1);
    else if (filter(full)) out.push(full);
  }
  return out;
}

const read = (file) => readFileSync(file, "utf8");

/**
 * Translate a shell-style glob to a RegExp.
 * `*` does not cross `/` (matching the shell, which expands these globs);
 * `**` does.
 */
export function globToRegExp(pattern) {
  const escaped = pattern.replace(/[.+^${}()|[\]\\?]/g, "\\$&");
  const body = escaped
    .replace(/\*\*/g, "\u0000")
    .replace(/\*/g, "[^/]*")
    .replace(/\u0000/g, ".*");
  return new RegExp(`^${body}$`);
}

/* ──────────────────── CHK-1: test glob coverage ──────────────────── */

/**
 * Every `packages/<pkg>/test/**\/*.test.ts` must be matched by a `.test.ts`
 * glob in the root `package.json` "test" script.
 *
 * This is the shell-core class: the suite existed and passed, but no runner ever
 * expanded its path, so `pnpm test` silently omitted it.
 */
export function checkTestGlobCoverage(root = DEFAULT_ROOT) {
  const pkgPath = path.join(root, "package.json");
  if (!existsSync(pkgPath)) return [];
  let testScript = "";
  try {
    testScript = JSON.parse(read(pkgPath)).scripts?.test ?? "";
  } catch {
    return ["package.json is not valid JSON — cannot check test glob coverage"];
  }
  const patterns = testScript
    .split(/\s+/)
    .filter((t) => t.includes("*") && t.endsWith(".test.ts"))
    .map((t) => globToRegExp(t.replace(/^\.\//, "")));

  const testFiles = walk(
    path.join(root, "packages"),
    (f) => f.endsWith(".test.ts") && f.split(path.sep).includes("test"),
  ).map((f) => path.relative(root, f));

  const errors = [];
  for (const file of testFiles) {
    const rel = file.split(path.sep).join("/");
    if (!patterns.some((re) => re.test(rel))) {
      errors.push(
        `test-glob: ${rel} is not matched by the root "test" script — it will never run`,
      );
    }
  }
  return errors;
}

/* ───────────────── CHK-2: chain exit-code contract ───────────────── */

/**
 * Every e2e chain must route its exit through `chain_done`, which encodes
 * 0 PASS / 1 FAIL / 2 SKIP. A bare `exit 0` in a chain bypasses that and can
 * report a SKIP as a PASS.
 */
export function checkChainExitContract(root = DEFAULT_ROOT) {
  const dir = path.join(root, "scripts/e2e");
  const errors = [];
  for (const file of walk(dir, (f) => /chain-.*\.sh$/.test(f)).filter(
    (f) => path.dirname(f) === dir,
  )) {
    const rel = path.relative(root, file);
    const src = read(file);
    if (!/^[ \t]*(?:source|\.)[ \t].*lib\.sh/m.test(src)) {
      errors.push(`chain-exit: ${rel} does not source lib.sh (no chain_done contract)`);
    }
    if (!/^[ \t]*chain_done([ \t]|$)/m.test(src)) {
      errors.push(
        `chain-exit: ${rel} never calls chain_done — its exit code cannot distinguish PASS/FAIL/SKIP`,
      );
    }
    for (const m of src.matchAll(/^[ \t]*exit[ \t]+0([ \t]|$)/gm)) {
      const line = src.slice(0, m.index).split("\n").length;
      errors.push(
        `chain-exit: ${rel}:${line} has a bare \`exit 0\` — a SKIP path could exit as PASS`,
      );
    }
  }
  return errors;
}

/* ─────────────────── CHK-3: phantom commands ────────────────────── */

/** Bindings in a runner that point OUTSIDE this repo (relative to `root`). */
function externalBindings(src, root) {
  const names = new Set();
  const assignRe = /(?:const|let|var)\s+([A-Za-z0-9_$]+)\s*=\s*([^\n;]+)/g;
  for (const m of src.matchAll(assignRe)) {
    const [, name, expr] = m;
    // ~, $HOME, os.homedir(), or an absolute path outside the repo
    if (/\bhome(dir)?\b|\$HOME|~/i.test(expr)) {
      names.add(name);
      continue;
    }
    const literal = expr.match(/["'`]([^"'`]+)["'`]/);
    if (literal && path.isAbsolute(literal[1])) {
      const resolved = path.resolve(literal[1]);
      if (!resolved.startsWith(root + path.sep) && resolved !== root) names.add(name);
    }
  }
  return names;
}

/**
 * A script referenced from an execution context that does not exist in this
 * repo, plus user-visible instruction text naming a script this repo lacks.
 */
export function checkPhantomCommands(root = DEFAULT_ROOT) {
  const errors = [];
  const findings = [];

  const literalRefRe = /(?:^|[\s"'`(])(?:node|bash|sh)[ \t]+((?:\.\/)?scripts\/[A-Za-z0-9._-]+\.(?:mjs|sh))/gm;

  // ── execution contexts: workflows (cwd = repo root) ──
  const workflows = walk(path.join(root, ".github/workflows"), (f) =>
    /\.ya?ml$/.test(f),
  );
  for (const file of workflows) {
    const src = read(file);
    const rel = path.relative(root, file);
    for (const line of src.split("\n")) {
      const trimmed = line.trim();
      // only `run:` payloads are executed
      if (!/(?:^-\s*)?run:/.test(trimmed)) continue;
      for (const m of trimmed.matchAll(new RegExp(literalRefRe, "g"))) {
        const ref = m[1].replace(/^\.\//, "");
        if (!existsSync(path.join(root, ref))) {
          errors.push(`phantom-command: ${rel} runs "${ref}" — file does not exist`);
        }
      }
    }
  }

  // ── execution contexts: loop drivers (cwd may be external) ──
  const runners = walk(path.join(root, "scripts"), (f) =>
    /^run-.*\.mjs$/.test(path.basename(f)),
  );
  const externalRefs = [];
  for (const file of runners) {
    const src = read(file);
    const rel = path.relative(root, file);
    const external = externalBindings(src, root);
    const isExternalCwdAt = (index) => {
      const tail = src.slice(index, index + 400);
      const m = tail.match(/cwd:\s*([A-Za-z0-9_$"'][^,}\n]*)/);
      if (!m) return false;
      const value = m[1].trim();
      return [...external].some((name) => value === name || value.startsWith(`${name}.`));
    };
    for (const m of src.matchAll(new RegExp(literalRefRe, "g"))) {
      const ref = m[1].replace(/^\.\//, "");
      if (existsSync(path.join(root, ref))) continue;
      if (isExternalCwdAt(m.index)) {
        // A cross-checkout contract: the step runs against a checkout outside
        // this repo, so "absent here" is expected. It cannot be verified
        // statically, so it is surfaced as a note rather than silently ignored
        // (a sibling that later loses the file would otherwise go unnoticed).
        const line = src.slice(0, m.index).split("\n").length;
        externalRefs.push(`${rel}:${line} runs "${ref}" from an external cwd`);
        continue;
      }
      const line = src.slice(0, m.index).split("\n").length;
      errors.push(`phantom-command: ${rel}:${line} runs "${ref}" — file does not exist`);
    }
  }

  // ── user-visible instruction text naming a script this repo does not have ──
  // A name qualifies only if some surface writes it as a script PATH
  // (e.g. `scripts/pack-business.mjs`) yet the file is absent here — otherwise
  // any kebab-case word in prose would be flagged.
  const pathMentions = new Set();
  for (const file of [
    ...walk(path.join(root, "scripts"), (f) => f.endsWith(".mjs")),
    ...walk(path.join(root, "packages"), (f) => f.endsWith(".ts")),
    ...workflows,
  ]) {
    for (const m of read(file).matchAll(/scripts\/([A-Za-z0-9._-]+)\.(?:mjs|sh)/g)) {
      pathMentions.add(m[1]);
    }
  }
  const absentScriptNames = [...pathMentions].filter(
    (name) =>
      !existsSync(path.join(root, "scripts", `${name}.mjs`)) &&
      !existsSync(path.join(root, "scripts", `${name}.sh`)),
  );
  if (absentScriptNames.length > 0) {
    const srcRoots = [
      path.join(root, "packages/rn/src"),
      path.join(root, "packages/ship/src"),
    ];
    for (const dir of srcRoots) {
      for (const file of walk(dir, (f) => f.endsWith(".ts"))) {
        const src = read(file);
        const rel = path.relative(root, file);
        for (const name of absentScriptNames) {
          // Report EVERY occurrence: a phantom usually appears in several
          // places (help text, docblock, error message) and a fixer needs the
          // whole list, not the first hit.
          const re = new RegExp(`\\b${name.replace(/\./g, "\\.")}\\b`, "g");
          for (const m of src.matchAll(re)) {
            const line = src.slice(0, m.index).split("\n").length;
            findings.push(
              `phantom-instruction: ${rel}:${line} tells the user to use "${name}", which this repo does not provide (scripts/${name}.mjs is absent) — name a step that exists here`,
            );
          }
        }
      }
    }
  }

  if (externalRefs.length > 0) {
    findings.push(
      `phantom-external: ${externalRefs.length} reference(s) run from a cwd outside this repo, so they cannot be verified here — confirm the external checkout still has them: ${externalRefs.slice(0, 4).join("; ")}`,
    );
  }

  return { errors, findings };
}

/* ─────────────────── CHK-4: probe reachability ──────────────────── */

/**
 * Reuses the existing registry (`scripts/lib/verify/registry.mjs`) rather than
 * reimplementing probe discovery.
 *
 * Hard failure: a reference to a probe that is not on disk (the 26-dead-refs
 * class; usually hidden behind `[[ -f ]]`, so it rots silently).
 * Reported only: orphans. An orphan is a triage backlog, not a regression — and
 * making it fatal would force everyone to wire up 15 probes at once.
 */
export function checkProbeReachability(root = DEFAULT_ROOT) {
  let audit;
  try {
    audit = auditProbes({ repoRoot: root });
  } catch (err) {
    return { errors: [`probe-registry: could not audit probes — ${err.message}`], findings: [] };
  }
  const errors = audit.dangling.map(
    (d) =>
      `probe-dangling: ${d.source} references ${d.base} (${d.kind}) — no such probe on disk; a \`[[ -f ]]\` guard can hide this`,
  );
  const findings = [];
  if (audit.orphans.length > 0) {
    findings.push(
      `probe-orphans: ${audit.orphans.length}/${audit.total} probes have no automated caller (triage backlog, not fatal): ${audit.orphans
        .map((o) => o.base)
        .join(", ")}`,
    );
  }
  if (audit.external.length > 0) {
    findings.push(
      `probe-external: ${audit.external.length} reference(s) resolve into another checkout (expected, not rot)`,
    );
  }
  return { errors, findings };
}

/* ───────────────────────────── driver ───────────────────────────── */

export function checkVerificationPlane(root = DEFAULT_ROOT) {
  const errors = [];
  const findings = [];

  errors.push(...checkTestGlobCoverage(root));
  errors.push(...checkChainExitContract(root));

  const phantom = checkPhantomCommands(root);
  errors.push(...phantom.errors);
  findings.push(...phantom.findings);

  const probes = checkProbeReachability(root);
  errors.push(...probes.errors);
  findings.push(...probes.findings);

  return { ok: errors.length === 0, errors, findings };
}

function main() {
  const argRoot = process.argv.indexOf("--root");
  const root = argRoot === -1 ? DEFAULT_ROOT : path.resolve(process.argv[argRoot + 1]);
  const result = checkVerificationPlane(root);

  for (const finding of result.findings) console.log(`  note: ${finding}`);

  if (result.ok) {
    console.log("verification-plane: PASS");
    return;
  }
  console.error("verification-plane: FAIL");
  for (const err of result.errors) console.error(`  - ${err}`);
  process.exit(1);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main();
}
