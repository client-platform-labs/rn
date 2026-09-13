/**
 * Probe for the verification-plane checker (scripts/check-verification-plane.mjs).
 *
 * A checker is only worth having if it can FAIL, so every case here builds a
 * scratch repo root in a temp dir and asserts the checker's verdict on it — not
 * merely that it exits 0 on the healthy repo. The last case is a PRECISION
 * control: a reference whose step runs with an external cwd must NOT be reported
 * as a phantom, because reporting it would make the gate untrustworthy.
 *
 * REPO_ROOT resolves three levels up from packages/rn/test/ to the repo root.
 * (Getting this wrong is itself one of the six defects: a governance test in this
 * directory resolved REPO_ROOT to `packages/`, so its scan silently no-op'd and
 * it was permanently green — see #264.)
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { describe, it } from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  checkChainExitContract,
  checkPhantomCommands,
  checkProbeReachability,
  checkTestGlobCoverage,
  checkVerificationPlane,
  globToRegExp,
} from "../../../scripts/check-verification-plane.mjs";

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

/** Build a scratch repo root, run `body`, always clean up. */
function withFixture(
  files: Record<string, string>,
  body: (root: string) => void,
): void {
  const root = mkdtempSync(path.join(tmpdir(), "vp-"));
  try {
    for (const [rel, contents] of Object.entries(files)) {
      const full = path.join(root, rel);
      mkdirSync(path.dirname(full), { recursive: true });
      writeFileSync(full, contents);
    }
    body(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const failing = (messages: string[], needle: string) =>
  messages.some((m) => m.includes(needle));

describe("verification-plane checker (#256)", () => {
  it("passes on the real repo — no dangling probes, no phantom execution refs", () => {
    const result = checkVerificationPlane(REPO_ROOT);
    assert.equal(
      result.ok,
      true,
      `expected the repo to pass, got:\n${result.errors.join("\n")}`,
    );
  });

  it("CHK-1 FAILS when a package's tests are not matched by the root test glob", () => {
    // The shell-core class: the suite exists and passes, but no glob expands it.
    withFixture(
      {
        "package.json": JSON.stringify({
          scripts: { test: "tsc -b && node --test packages/core/test/*.test.ts" },
        }),
        "packages/core/test/covered.test.ts": "export const a = 1;\n",
        "packages/shell-core/test/uncovered.test.ts": "export const b = 1;\n",
      },
      (root) => {
        const errors = checkTestGlobCoverage(root);
        assert.ok(
          failing(errors, "packages/shell-core/test/uncovered.test.ts"),
          `expected the uncovered suite to be reported, got: ${JSON.stringify(errors)}`,
        );
        assert.ok(
          !failing(errors, "packages/core/test/covered.test.ts"),
          "a globbed test file must not be reported",
        );
      },
    );
  });

  it("CHK-1 accepts a nested ** glob (and rejects a * that cannot reach it)", () => {
    assert.ok(globToRegExp("packages/x/test/*.test.ts").test("packages/x/test/a.test.ts"));
    assert.ok(
      !globToRegExp("packages/x/test/*.test.ts").test("packages/x/test/sub/a.test.ts"),
      "`*` must not cross a directory separator (shell semantics)",
    );
    assert.ok(
      globToRegExp("packages/x/test/**/*.test.ts").test("packages/x/test/sub/a.test.ts"),
    );
  });

  it("CHK-2 FAILS on a chain that can exit 0 after a SKIP, and on one with no chain_done", () => {
    withFixture(
      {
        "scripts/e2e/lib.sh": "chain_done() { exit 0; }\n",
        // prints a skip, then exits 0: "not verified" would read as "verified"
        "scripts/e2e/chain-bad.sh":
          '#!/usr/bin/env bash\nsource "$(dirname "$0")/lib.sh"\nskip_step "no device"\nexit 0\n',
        // never sources the harness at all
        "scripts/e2e/chain-nolib.sh": '#!/usr/bin/env bash\nok "looks fine"\n',
        "scripts/e2e/chain-good.sh":
          '#!/usr/bin/env bash\nsource "$(dirname "$0")/lib.sh"\nok "yes"\nchain_done\n',
      },
      (root) => {
        const errors = checkChainExitContract(root);
        assert.ok(
          failing(errors, "chain-bad.sh") &&
            failing(errors, "exit 0") &&
            failing(errors, "chain_done"),
          `expected both contract breaches on chain-bad.sh, got: ${JSON.stringify(errors)}`,
        );
        assert.ok(
          failing(errors, "chain-nolib.sh"),
          "a chain that never sources lib.sh must be reported",
        );
        assert.ok(
          !failing(errors, "chain-good.sh"),
          "a chain routing through chain_done must pass",
        );
      },
    );
  });

  it("CHK-3 FAILS on a workflow that runs a script which does not exist", () => {
    withFixture(
      {
        ".github/workflows/ci.yml":
          "jobs:\n  x:\n    steps:\n      - run: node scripts/does-not-exist.mjs\n",
      },
      (root) => {
        const { errors } = checkPhantomCommands(root);
        assert.ok(
          failing(errors, "phantom-command") && failing(errors, "does-not-exist.mjs"),
          `expected the phantom execution reference to fail, got: ${JSON.stringify(errors)}`,
        );
      },
    );
  });

  it("CHK-3 FAILS on user-visible text naming a script this repo does not provide", () => {
    withFixture(
      {
        // The name is written as a script PATH somewhere, so it IS a script name.
        // It must come from a NON-runner file: a `run-*.mjs` containing this text
        // would (correctly) be an execution reference and a hard failure instead.
        "scripts/verify-synth.mjs": "export const cmd = 'node scripts/ghost.mjs';\n",
        // …the file is absent here, and this message tells the operator to run it
        "packages/ship/src/help.ts":
          "export const hint = 'HBC missing — run ghost first';\n",
      },
      (root) => {
        const { errors, findings } = checkPhantomCommands(root);
        assert.ok(
          !failing(errors, "ghost"),
          "user-visible instruction text must be a finding, not a hard failure",
        );
        assert.ok(
          failing(findings, "phantom-instruction") && failing(findings, "help.ts"),
          `expected a phantom-instruction finding for help.ts, got: ${JSON.stringify(findings)}`,
        );
      },
    );
  });

  it("CHK-3 PRECISION: an external-cwd reference is a note, never a phantom", () => {
    // The hermes loop drivers run `node scripts/pack-business.mjs` with
    // `cwd: shellApp` — a sibling checkout. `absent here` is expected, and
    // reporting it as a phantom would be a false positive.
    withFixture(
      {
        "scripts/run-synth-loop.mjs": [
          'import path from "node:path";',
          'const home = process.env.HOME;',
          'const shellApp = path.join(home, "code/host-android");',
          "export const steps = [",
          "  { run: () => sh(`node scripts/absent-in-external.mjs`, { cwd: shellApp }) },",
          "];",
          "",
        ].join("\n"),
      },
      (root) => {
        const { errors, findings } = checkPhantomCommands(root);
        assert.ok(
          !failing(errors, "absent-in-external.mjs"),
          `an external-cwd reference must not fail, got: ${JSON.stringify(errors)}`,
        );
        assert.ok(
          failing(findings, "phantom-external") &&
            failing(findings, "absent-in-external.mjs"),
          `expected an external note instead, got: ${JSON.stringify(findings)}`,
        );
      },
    );
  });

  it("CHK-4 FAILS on a dangling reference and only REPORTS orphans", () => {
    withFixture(
      {
        "scripts/verify-unreferenced.mjs": "console.log('never wired');\n",
        ".github/workflows/synth.yml":
          "jobs:\n  x:\n    steps:\n      - run: node scripts/verify-absent.mjs\n",
      },
      (root) => {
        const { errors, findings } = checkProbeReachability(root);
        assert.ok(
          failing(errors, "probe-dangling") && failing(errors, "verify-absent.mjs"),
          `expected the dangling reference to fail, got: ${JSON.stringify(errors)}`,
        );
        assert.ok(
          failing(findings, "probe-orphans") &&
            failing(findings, "verify-unreferenced.mjs"),
          `an orphan must be reported, got: ${JSON.stringify(findings)}`,
        );
      },
    );
  });
});
