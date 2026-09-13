/**
 * Probe registry (Map I / C5 — #259).
 *
 * Whether a `scripts/verify-*.mjs` probe ever RUNS is decided today by string
 * literals scattered across CI workflows, loop drivers, release-readiness
 * stages and the e2e chains. Nothing enumerates the probes, so a probe can rot
 * silently with no caller. This module makes that visible: it DERIVES the
 * wiring from the automation sources instead of maintaining a second list.
 *
 * Reports three distinct facts:
 *   - references : non-comment occurrences of the probe in an automation source
 *   - orphans    : probes with zero such reference (nobody runs them)
 *   - dangling   : referenced probe names with no file on disk (a guard hides it)
 *
 * References inside comment lines are ignored: a probe named in a comment is
 * documentation, not an execution path.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(HERE, "..", "..", "..");

/**
 * Where a probe can be wired in. `kind` is the execution path a probe gets.
 * Order matters for reporting: CI first (the only always-on path).
 */
const AUTOMATION_SOURCES = [
  { dir: ".github/workflows", ext: [".yml", ".yaml"], kind: "ci" },
  { dir: "scripts", ext: [".mjs"], namePrefix: "run-", kind: "loop" },
  { dir: "scripts", ext: [".sh"], kind: "script" },
  { dir: "scripts/e2e", ext: [".sh"], kind: "device" },
  { dir: "scripts/release-readiness", ext: [".sh"], kind: "release-readiness" },
];

/** Strip comment-only lines so a mention in prose is not counted as a caller. */
function executableText(text) {
  return text
    .split("\n")
    .filter((line) => {
      const t = line.trim();
      return (
        t.length > 0 &&
        !t.startsWith("#") &&
        !t.startsWith("//") &&
        !t.startsWith("/*") &&
        !t.startsWith("*")
      );
    })
    .join("\n");
}

function listDir(dir, filter) {
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return [];
  return readdirSync(dir)
    .filter(filter)
    .map((f) => path.join(dir, f))
    .sort();
}

/** The automation sources that can reference a probe. */
export function automationSources({ repoRoot = REPO_ROOT } = {}) {
  const sources = [];
  for (const spec of AUTOMATION_SOURCES) {
    const dir = path.join(repoRoot, spec.dir);
    for (const file of listDir(dir, (f) => {
      if (!spec.ext.some((e) => f.endsWith(e))) return false;
      if (spec.namePrefix && !f.startsWith(spec.namePrefix)) return false;
      return true;
    })) {
      sources.push({
        path: file,
        rel: path.relative(repoRoot, file),
        kind: spec.kind,
        text: executableText(readFileSync(file, "utf8")),
      });
    }
  }
  const pkg = path.join(repoRoot, "package.json");
  if (existsSync(pkg)) {
    sources.push({
      path: pkg,
      rel: "package.json",
      kind: "package",
      text: readFileSync(pkg, "utf8"),
    });
  }
  return sources;
}

/** Enumerate every `scripts/verify-*.mjs` probe on disk. */
export function listProbes({ repoRoot = REPO_ROOT } = {}) {
  const scriptsDir = path.join(repoRoot, "scripts");
  const sources = automationSources({ repoRoot });
  return listDir(
    scriptsDir,
    (f) => f.startsWith("verify-") && f.endsWith(".mjs"),
  ).map((file) => {
    const base = path.basename(file);
    const name = base.replace(/\.mjs$/, "");
    const references = sources
      .filter((s) => s.text.includes(base))
      .map((s) => ({ source: s.rel, kind: s.kind }));
    const kinds = [...new Set(references.map((r) => r.kind))];
    return {
      name,
      base,
      path: file,
      rel: path.relative(repoRoot, file),
      references,
      kinds,
      /** True when some CI workflow invokes it — the only always-on path. */
      ciReferenced: kinds.includes("ci"),
      /** Wire only inside a device/e2e chain. */
      deviceOnly:
        kinds.length > 0 && kinds.every((k) => k === "device" || k === "script"),
      orphan: references.length === 0,
    };
  });
}

/**
 * Resolve a probe from a name, slug, filename or path.
 * `verify-cp-auth`, `verify-cp-auth.mjs`, `cp-auth` and a path all work.
 */
export function findProbe(query, options = {}) {
  const probes = listProbes(options);
  const file = query.replace(/^.*\//, "").replace(/\.mjs$/, "");
  const name = file.startsWith("verify-") ? file : `verify-${file}`;
  return probes.find((p) => p.name === name) ?? null;
}

/**
 * Audit the probe fleet: who runs, who does not, and which references point at
 * files that no longer exist.
 */
export function auditProbes({ repoRoot = REPO_ROOT } = {}) {
  const probes = listProbes({ repoRoot });
  const existing = new Set(probes.map((p) => p.base));

  // Dangling: a source names a verify-*.mjs that is not on disk. Such a
  // reference is usually guarded by `[[ -f ]]`, so it fails silently.
  const nameRe = /verify-[A-Za-z0-9._-]+\.mjs/g;
  const dangling = [];
  for (const source of automationSources({ repoRoot })) {
    for (const match of source.text.matchAll(nameRe)) {
      const base = match[0];
      if (existing.has(base)) continue;
      if (dangling.some((d) => d.base === base && d.source === source.rel)) continue;
      dangling.push({ base, source: source.rel, kind: source.kind });
    }
  }

  return {
    total: probes.length,
    ciReferenced: probes.filter((p) => p.ciReferenced),
    orphans: probes.filter((p) => p.orphan),
    referenced: probes.filter((p) => !p.orphan),
    dangling,
    probes,
  };
}
