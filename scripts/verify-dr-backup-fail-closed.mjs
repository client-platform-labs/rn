#!/usr/bin/env node
/**
 * DR backup fail-closed probe (ADR-014) — the registry leg.
 *
 * The 2026-09-13 closure review found a verification hole: `backup.mjs`
 * defaults to the sqlite backend (`RN_CP_REGISTRY ?? "sqlite"`) while the
 * runtime's `useSqliteRegistry()` defaults to file, and when the assumed
 * backend's file was absent it produced an archive with NO registry while
 * still exiting 0 (`items: [], failures: []`). The DR drill pinned the backend
 * on both sides, so it could not see the mismatch.
 *
 * This probe machine-checks the fail-closed contract, hermetic (no docker, no
 * age, no sign key — an empty project has nothing to encrypt):
 *
 *   1. wrong backend  (or the documented invocation's sqlite default) → backup
 *      MUST exit non-zero and report the failure
 *   2. right backend  → backup exits 0 and the archive carries the registry
 *   3. restore from an archive whose manifest has no registry item → MUST error
 *
 * Usage:
 *   node scripts/verify-dr-backup-fail-closed.mjs
 *   node scripts/_run-verify.mjs dr-backup-fail-closed
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { createHarness, REPO_ROOT } from "./lib/verify/fixture.mjs";

const h = createHarness({ name: "verify-dr-backup-fail-closed" });

const BACKUP = path.join(
  REPO_ROOT,
  "deploy",
  "distribution-service",
  "backup.mjs",
);
const RESTORE = path.join(
  REPO_ROOT,
  "deploy",
  "distribution-service",
  "restore.mjs",
);

// A throwaway age recipient — a project with no sign key / env has nothing to
// encrypt, so the age step is skipped and the recipient is never used.
const AGE_RECIPIENT =
  "age1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq";

await h.run(async () => {
  // Hermetic: never inherit a backend selection from the runner environment.
  delete process.env.RN_CP_REGISTRY;

  // Seeds `.rn/delivery/registry.json` (the file backend), nothing else.
  const project = h.project({ name: "dr-fail-closed" });
  const backupDir = path.join(project.root, "backups");

  const runBackup = (env) =>
    h.runNode(
      BACKUP,
      [
        project.root,
        "--backup-dir",
        backupDir,
        "--age-recipient",
        AGE_RECIPIENT,
      ],
      {
        cwd: REPO_ROOT,
        env: {
          RN_DELIVERY_SIGN_KEY_FILE: "",
          RN_DELIVERY_SIGN_KEY_PEM: "",
          RN_DELIVERY_KEYS_DIR: "",
          ...env,
        },
      },
    );

  h.step("backup with the wrong backend (sqlite) on a file deployment");
  const wrong = await runBackup({ RN_CP_REGISTRY: "sqlite" });
  h.assertCmdFails(
    wrong,
    "backup exits non-zero when the selected backend's registry is absent",
  );
  h.assertCmdOutputContains(
    wrong,
    "registry.sqlite not found",
    "failure names the missing backend file",
  );
  h.assertCmdOutputContains(
    wrong,
    "registry.json IS present",
    "failure points at the actual backend",
  );

  h.step("backup with RN_CP_REGISTRY unset — the documented invocation (defaults to sqlite)");
  const unset = await runBackup({});
  h.assertCmdFails(
    unset,
    "the documented invocation fails closed instead of silently capturing nothing",
  );

  h.step("backup with the right backend (file)");
  const right = await runBackup({ RN_CP_REGISTRY: "file" });
  h.assertCmdOk(right, "backup succeeds for the matching backend");
  h.assertCmdOutputContains(right, '"registry.json"', "archive records registry.json");

  h.step("restore from an archive whose manifest has no registry item");
  const emptyArchive = path.join(project.root, "empty-registry-archive");
  mkdirSync(emptyArchive, { recursive: true });
  writeFileSync(
    path.join(emptyArchive, "manifest.json"),
    JSON.stringify({ schemaVersion: 1, items: {} }),
  );
  const restore = await h.runNode(
    RESTORE,
    [emptyArchive, path.join(project.root, "restored")],
    { cwd: REPO_ROOT },
  );
  h.assertCmdFails(restore, "restore errors when the manifest carries no registry");
  h.assertCmdOutputContains(restore, "captured no registry", "restore names the empty registry");
});

h.done();
