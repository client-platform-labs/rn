#!/usr/bin/env node
/**
 * verify-base-peel (#141) — AFK contract for the Metro peel pipeline MVP.
 *
 * Runs `scripts/pack-base-peel.mjs` into a temp --out dir, then asserts:
 *   1. all 4 artefact files exist
 *   2. assertPeeledContract holds for every peeled business entry
 *   3. sidecar-draft.base_digest === sha256(base.marker.json bytes)
 *   4. module-id-map is monotonic (nextId === Object.keys(ids).length)
 *
 * Exits 0 on all-ok, 1 on any failure. Prints `[OK]` / `[FAIL]` per check.
 *
 * Usage:
 *   node scripts/verify-base-peel.mjs
 *   node scripts/verify-base-peel.mjs --config examples/base-host/client-platform.peel.jsonc
 *   node scripts/verify-base-peel.mjs --keep
 */
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const repoRoot = path.resolve(import.meta.dirname, "..");

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0) return fallback;
  const v = process.argv[i + 1];
  if (!v || v.startsWith("--")) return true;
  return v;
}

const configArg = arg("config");
const keep = process.argv.includes("--keep");

const outDir = mkdtempSync(path.join(tmpdir(), "rn-verify-peel-"));
const checks = [];
let hardFail = false;

function record(name, ok, detail = "") {
  checks.push({ name, ok, detail });
  console.log(`${ok ? "[OK]  " : "[FAIL]"} ${name}${detail ? " — " + detail : ""}`);
  if (!ok) hardFail = true;
}

try {
  // ── 1) Run pack-base-peel into a fresh temp dir ────────────────────────
  const packArgs = [path.join(repoRoot, "scripts/pack-base-peel.mjs"), "--out", outDir];
  if (configArg) packArgs.push("--config", configArg);
  const r = spawnSync(process.execPath, packArgs, {
    cwd: repoRoot,
    encoding: "utf8",
    env: { ...process.env },
  });
  record("pack-base-peel exit 0", r.status === 0, `status=${r.status}`);

  if (r.status !== 0 && !existsSync(path.join(outDir, "base-module-id-map.json"))) {
    // pack failed before writing artefacts — no point checking further
    console.error((r.stderr || r.stdout || "").trim().slice(-600));
    process.exit(1);
  }

  // ── 2) All 4 artefact files exist ───────────────────────────────────────
  const expected = [
    "base-module-id-map.json",
    "base.marker.json",
    "sidecar-draft.json",
    "peeled",
  ];
  for (const name of expected) {
    record(`artefact exists: ${name}`, existsSync(path.join(outDir, name)));
  }

  // ── 3) Load the map + peeled markers; assert contract via rn-core ─────
  const core = await import(
    pathToFileURL(path.join(repoRoot, "packages/rn-core/dist/index.js")).href
  );
  const map = JSON.parse(
    readFileSync(path.join(outDir, "base-module-id-map.json"), "utf8"),
  );
  const baseMarker = JSON.parse(
    readFileSync(path.join(outDir, "base.marker.json"), "utf8"),
  );
  const sidecarDraft = JSON.parse(
    readFileSync(path.join(outDir, "sidecar-draft.json"), "utf8"),
  );

  // Reconstruct the base path set from base.marker.json modules
  const basePaths = new Set(Object.keys(baseMarker.modules));

  // ── 4) assertPeeledContract over every peeled/<id>.marker.json ────────
  const { readdirSync } = await import("node:fs");
  const peeledDir = path.join(outDir, "peeled");
  const peeledFiles = readdirSync(peeledDir).filter((f) => f.endsWith(".marker.json"));
  for (const file of peeledFiles) {
    const marker = JSON.parse(readFileSync(path.join(peeledDir, file), "utf8"));
    const check = core.assertPeeledContract({
      map,
      basePaths,
      peeledIds: marker.modules,
    });
    record(
      `assertPeeledContract: ${file}`,
      check.ok,
      check.ok ? "" : check.reason,
    );
  }
  if (peeledFiles.length === 0) {
    record("assertPeeledContract: at least 1 peeled entry", false, "no peeled markers");
  }

  // ── 5) sidecar-draft.base_digest === sha256(base.marker.json bytes) ───
  const baseMarkerBytes = readFileSync(path.join(outDir, "base.marker.json"));
  const baseMarkerSha = createHash("sha256").update(baseMarkerBytes).digest("hex");
  record(
    "sidecar-draft.base_digest == sha256(base.marker.json)",
    sidecarDraft.base_digest === baseMarkerSha,
    `draft=${sidecarDraft.base_digest?.slice(0, 12)}… file=${baseMarkerSha.slice(0, 12)}…`,
  );

  // ── 6) module-id-map is monotonic (nextId === |ids|) ──────────────────
  const idCount = Object.keys(map.ids).length;
  record(
    "module-id-map monotonic (nextId === |ids|)",
    map.nextId === idCount,
    `nextId=${map.nextId} ids=${idCount}`,
  );

  // ── summary ────────────────────────────────────────────────────────────
  console.log("");
  const passed = checks.filter((c) => c.ok).length;
  console.log(
    JSON.stringify(
      {
        ok: !hardFail,
        outDir,
        config: configArg ?? "default (synthetic fallback)",
        passed,
        total: checks.length,
        checks,
      },
      null,
      2,
    ),
  );
  process.exit(hardFail ? 1 : 0);
} finally {
  if (!keep) {
    rmSync(outDir, { recursive: true, force: true });
  } else {
    console.log(`--keep: out dir left at ${outDir}`);
  }
}
