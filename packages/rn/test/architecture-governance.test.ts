import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { describe, it } from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  checkArchitectureGovernance,
  checkImportDirection,
} from "../../../scripts/check-architecture-governance.mjs";

/**
 * #264: this resolved to `packages/` (the test sits in packages/rn/test, so
 * `"../.."` is one level short of the repo root). checkImportDirection then
 * scanned a nonexistent `packages/packages`, found nothing and passed — a dead
 * canary that no injected violation could ever fail.
 */
const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

describe("architecture governance (ADR-009)", () => {
  it("repo passes governance checks", () => {
    const result = checkArchitectureGovernance(REPO_ROOT);
    assert.equal(
      result.ok,
      true,
      result.errors.join("\n") || "expected pass",
    );
  });

  it("fails when a reverse dependency is injected (negative control)", () => {
    // Proves the check above can actually fail. Run against a throwaway tree
    // rather than the real repo, so a broken canary cannot hide behind a
    // temporarily dirty working tree.
    const root = mkdtempSync(path.join(tmpdir(), "gov-probe-"));
    try {
      mkdirSync(path.join(root, "packages/core/src"), { recursive: true });
      writeFileSync(
        path.join(root, "packages/core/src/reverse.ts"),
        'import { assertModulesIsolated } from "@client-platform/ship";\n' +
          "export const x = assertModulesIsolated;\n",
      );
      const errors = checkImportDirection(root);
      assert.equal(errors.length, 1, JSON.stringify(errors));
      assert.match(errors[0], /packages\/core\/src\/reverse\.ts/);
      assert.match(errors[0], /@client-platform\/ship/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

/**
 * A gate that names a file which does not exist is not a gate. Both failure
 * modes this ticket exists to end looked identical from the outside: a `[[ -f ]]`
 * guard (or a probe importing a deleted package) turns "we verified it" into
 * "we skipped it", and the stage still reports PASS.
 *
 * These are not part of ADR-009's architecture rules — the file is simply the
 * only in-scope home for a repo-wide governance assertion.
 */
describe("verification plane: no dead references (#264)", () => {
  // verify-harness.mjs fabricates probe names that deliberately do not exist —
  // that is how it tests dead-wiring detection. Any other exception must be
  // argued for in review, so the allowlist is asserted to stay this small.
  const SYNTHETIC_PROBE_ALLOWLIST = ["verify-harness.mjs"];

  // A reference is only checkable when its base is knowable from the code:
  //   path.join(repoRoot, "...")        -> repo root
  //   path.resolve(import.meta.dirname, "...") -> the source file's directory
  //   "../something.js"                -> the source file's directory
  // A bare literal such as ["scripts/pack-business.mjs", ...] passed as a CLI
  // argument is deliberately NOT checked: it resolves against whatever cwd the
  // caller passes (several probes run against an external host checkout), so
  // flagging it would be a false positive — and a gate that cries wolf gets
  // suppressed, which is the illness this ticket treats.
  const ANCHORED_ROOT =
    /path\.(?:join|resolve)\(\s*(?:repoRoot|REPO_ROOT)\s*,\s*["']([^"']+)["']/g;
  const ANCHORED_FILE =
    /path\.(?:join|resolve)\(\s*(?:import\.meta\.dirname|__dirname)\s*,\s*["']([^"']+)["']/g;
  const RELATIVE_LITERAL = /["'](\.{1,2}\/[^"']+)["']/g;
  const SHELL_ROOT = /\$REPO_ROOT\/([\w./@-]+)/g;

  /** A literal worth checking: a file (has an extension) or a repo-anchored dir. */
  const looksLikeFile = (literal: string): boolean => /\.[a-z0-9]{1,5}$/.test(literal);
  /**
   * Shell/JS interpolation or a glob — not a literal path. Also rejects a
   * trailing "/": `$REPO_ROOT/wayfinding/docs/adr/${adr}.md` captures
   * `wayfinding/docs/adr/` as a prefix, and checking that prefix would be a
   * false positive (it is a directory fragment, not a referenced path).
   */
  const isDynamic = (literal: string): boolean =>
    /[$*{?}\\]/.test(literal) || literal.endsWith("/");

  /** Path literals in `source` that name a repo file, and where they resolve to. */
  function referencedPaths(source: string, fromFile: string): { literal: string; resolved: string }[] {
    const found: { literal: string; base: "root" | "file"; anchoredRoot: boolean }[] = [];
    for (const m of source.matchAll(ANCHORED_ROOT))
      found.push({ literal: m[1]!, base: "root", anchoredRoot: true });
    for (const m of source.matchAll(ANCHORED_FILE))
      found.push({ literal: m[1]!, base: "file", anchoredRoot: false });
    for (const m of source.matchAll(RELATIVE_LITERAL))
      found.push({ literal: m[1]!, base: "file", anchoredRoot: false });
    for (const m of source.matchAll(SHELL_ROOT))
      found.push({ literal: m[1]!, base: "root", anchoredRoot: true });
    return found
      // A repo-anchored literal may be a directory (e.g. "$REPO_ROOT/packages/x"),
      // which is how a stale package reference hid from the first version of
      // this scan. A file-relative one must name a file to stay checkable.
      .filter((r) => (looksLikeFile(r.literal) || r.anchoredRoot) && !isDynamic(r.literal))
      .map((r) => ({
        literal: r.literal,
        resolved:
          r.base === "root"
            ? path.join(REPO_ROOT, r.literal)
            : path.resolve(path.dirname(fromFile), r.literal),
      }))
      // a literal can match both an anchored pattern and the relative one
      .filter((r, i, all) => all.findIndex((o) => o.resolved === r.resolved) === i);
  }

  function deadReferences(source: string, fromFile: string): string[] {
    return referencedPaths(source, fromFile)
      .filter((r) => !existsSync(r.resolved))
      .map((r) => r.literal);
  }

  it("the detector reports missing references in every supported form (negative control)", () => {
    // Keeps the two assertions below honest once the repo is clean: without
    // this, an empty result and a broken scanner look the same.
    const dead = deadReferences(
      'const a = path.join(repoRoot, "packages/does-not-exist/dist/x.js");\n' +
        'const b = path.resolve(import.meta.dirname, "../packages/gone/dist/y.js");\n' +
        'import { z } from "../dist/z-missing.js";\n' +
        'if [[ -f "$REPO_ROOT/scripts/verify-a.mjs" ]]; then :; fi\n' +
        'if [[ -d "$REPO_ROOT/packages/rn-gone" ]]; then :; fi\n',
      "/tmp/not-a-real-lane/verify-probe.mjs",
    );
    assert.deepEqual(dead, [
      "packages/does-not-exist/dist/x.js",
      "../packages/gone/dist/y.js",
      "../dist/z-missing.js",
      "scripts/verify-a.mjs",
      "packages/rn-gone",
    ]);
  });

  it("ignores interpolated and project-relative literals (no false positives)", () => {
    // Several probes invoke tooling inside an EXTERNAL host checkout, e.g.
    // runNode(["scripts/pack-business.mjs", ...], HOST), and section scripts
    // build paths by interpolation. Reporting either would be a false positive,
    // and a gate that cries wolf gets suppressed.
    const dead = deadReferences(
      'const pack = runNode(["scripts/pack-business.mjs", "--module", "desk"], HOST);\n' +
        'if [[ -f "$REPO_ROOT/wayfinding/docs/adr/${adr}.md" ]]; then :; fi\n',
      "/tmp/not-a-real-lane/verify-probe.mjs",
    );
    assert.deepEqual(dead, []);
  });

  it("every path a verify probe references exists", () => {
    const dir = path.join(REPO_ROOT, "scripts");
    const offenders: string[] = [];
    for (const file of readdirSync(dir).filter((f) => /^verify-.*\.mjs$/.test(f))) {
      if (SYNTHETIC_PROBE_ALLOWLIST.includes(file)) continue;
      const source = readFileSync(path.join(dir, file), "utf8");
      for (const literal of deadReferences(source, path.join(dir, file))) {
        offenders.push(`${file} -> ${literal}`);
      }
    }
    assert.deepEqual(
      offenders,
      [],
      `probes import or invoke something that does not exist (they cannot pass):\n${offenders.join("\n")}`,
    );
  });

  it("every path a release-readiness stage references exists", () => {
    const dir = path.join(REPO_ROOT, "scripts/release-readiness");
    const offenders: string[] = [];
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".sh"))) {
      const source = readFileSync(path.join(dir, file), "utf8");
      for (const literal of deadReferences(source, path.join(dir, file))) {
        offenders.push(`${file} -> ${literal}`);
      }
    }
    assert.deepEqual(offenders, [], `dead stage references:\n${offenders.join("\n")}`);
  });
});
