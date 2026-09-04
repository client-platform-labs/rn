#!/usr/bin/env node
/**
 * verify-base-peel (#141 + #141b) — AFK contract for the Metro peel pipeline.
 *
 * Two modes:
 *
 *   Default (synthetic): runs `scripts/pack-base-peel.mjs` into a temp
 *   --out dir (no `--real`), then asserts:
 *     1. all 4 artefact files exist
 *     2. assertPeeledContract holds for every peeled business entry
 *     3. sidecar-draft.base_digest === sha256(base.marker.json bytes)
 *     4. module-id-map is monotonic (nextId === Object.keys(ids).length)
 *
 *   --real: same as above PLUS:
 *     5. base/index.hbc exists with the Hermes magic (0xC61FBC03 LE)
 *     6. peeled/<id>/index.hbc exists with the same magic
 *     7. base.marker.json.base_digest == sha256(base/index.hbc)
 *     8. each peeled marker.base_digest == base.marker.json.base_digest
 *     9. sidecar-draft.base_digest == sha256(base.marker.json)
 *    10. id-stability contract: run --real twice into separate temp dirs
 *        and diff the base-module-id-map.json — must be empty.
 *   If hermesc is not installed, the script prints `[SKIP] hermesc not
 *   found — install per metro-base-peel-real-runbook.md` and exits 0
 *   (the contract verifies what it can).
 *
 * Exits 0 on all-ok, 1 on any failure. Prints `[OK]` / `[FAIL]` per check.
 *
 * Usage:
 *   node scripts/verify-base-peel.mjs
 *   node scripts/verify-base-peel.mjs --config examples/base-host/client-platform.peel.jsonc
 *   node scripts/verify-base-peel.mjs --config examples/base-host/client-platform.peel.jsonc --real
 *   node scripts/verify-base-peel.mjs --keep
 */
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  readdirSync,
} from "node:fs";
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
const realMode = process.argv.includes("--real");

// Hermes bytecode magic: the file starts with bytes `c6 1f bc 03` which
// is 0x03bc1fc6 when read as a little-endian u32. See hermes/BC/HBC.cpp.
const HERMES_MAGIC_LE = 0x03bc1fc6;
function readHbcMagic(file) {
  const fd = readFileSync(file);
  if (fd.length < 4) return -1;
  return fd.readUInt32LE(0);
}

const outDir = mkdtempSync(path.join(tmpdir(), "rn-verify-peel-"));
const checks = [];
let hardFail = false;

function record(name, ok, detail = "") {
  checks.push({ name, ok, detail });
  console.log(`${ok ? "[OK]  " : "[FAIL]"} ${name}${detail ? " — " + detail : ""}`);
  if (!ok) hardFail = true;
}

function skip(name, detail) {
  checks.push({ name, ok: true, detail, skipped: true });
  console.log(`[SKIP] ${name} — ${detail}`);
}

function runPack(extraArgs) {
  const packArgs = [
    path.join(repoRoot, "scripts/pack-base-peel.mjs"),
    "--out",
    outDir,
  ];
  if (configArg) packArgs.push("--config", configArg);
  if (extraArgs) packArgs.push(...extraArgs);
  return spawnSync(process.execPath, packArgs, {
    cwd: repoRoot,
    encoding: "utf8",
    env: { ...process.env },
  });
}

try {
  // ── 1) Run pack-base-peel (synthetic, seeds the map) ───────────────
  // In real mode this is the *seeding* pass — the synthetic prototype
  // marker JSONs are not written but the map is, so the Metro real
  // pass can re-use the seeded ids.
  const seedR = runPack();
  if (seedR.status !== 0) {
    console.error(
      `[verify] pack-base-peel (seed) failed:\n${(seedR.stderr || seedR.stdout || "").trim().slice(-1200)}`,
    );
    process.exit(1);
  }
  record("pack-base-peel (seed) exit 0", true);

  // In real mode the seed pass writes base-module-id-map.json but no
  // marker JSONs. We then run --real to overwrite both.
  if (realMode) {
    // Check hermesc is available; if not, skip real-only checks and
    // still run the synthetic checks (which will pass because the
    // seed pass already produced a valid map and the real pack will
    // emit a real base.marker.json even if it fails on hermesc).
    const hermescPath =
      "/Users/xuwei/code/tiangong-host/node_modules/hermes-compiler/hermesc/osx-bin/hermesc";
    if (!existsSync(hermescPath)) {
      skip(
        "real-mode checks",
        "hermesc not found at " +
          hermescPath +
          " — install per docs/guides/metro-base-peel.md",
      );
    } else {
      const realR = runPack(["--real"]);
      if (realR.status !== 0) {
        console.error(
          `[verify] pack-base-peel --real failed:\n${(realR.stderr || realR.stdout || "").trim().slice(-2000)}`,
        );
        process.exit(1);
      }
      record("pack-base-peel --real exit 0", true);
    }
  }

  // ── 2) All 4 artefact files exist ───────────────────────────────
  const expected = [
    "base-module-id-map.json",
    "base.marker.json",
    "sidecar-draft.json",
    "peeled",
  ];
  for (const name of expected) {
    record(`artefact exists: ${name}`, existsSync(path.join(outDir, name)));
  }

  // ── 3) Load the map + peeled markers; assert contract via rn-core ─
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

  // Reconstruct the base path set from base.marker.json modules (works
  // for both modes — synthetic: `base.marker.json.modules`, real: same).
  const basePaths = new Set(Object.keys(baseMarker.modules ?? {}));

  // ── 4) assertPeeledContract over every peeled/<id>.marker.json ───
  const peeledDir = path.join(outDir, "peeled");
  const peeledFiles = readdirSync(peeledDir).filter((f) =>
    f.endsWith(".marker.json"),
  );
  for (const file of peeledFiles) {
    const marker = JSON.parse(readFileSync(path.join(peeledDir, file), "utf8"));
    const check = core.assertPeeledContract({
      map,
      basePaths,
      peeledIds: marker.modules ?? {},
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

  // ── 5) sidecar-draft.base_digest === sha256(base.marker.json bytes)
  const baseMarkerBytes = readFileSync(path.join(outDir, "base.marker.json"));
  const baseMarkerSha = createHash("sha256").update(baseMarkerBytes).digest("hex");
  record(
    "sidecar-draft.base_digest == sha256(base.marker.json)",
    sidecarDraft.base_digest === baseMarkerSha,
    `draft=${sidecarDraft.base_digest?.slice(0, 12)}… file=${baseMarkerSha.slice(0, 12)}…`,
  );

  // ── 6) module-id-map is monotonic (nextId === |ids|) ────────────
  const idCount = Object.keys(map.ids).length;
  record(
    "module-id-map monotonic (nextId === |ids|)",
    map.nextId === idCount,
    `nextId=${map.nextId} ids=${idCount}`,
  );

  // ─── Real-mode-only checks (#141b P1) ────────────────────────────
  if (realMode) {
    const hermescPath =
      "/Users/xuwei/code/tiangong-host/node_modules/hermes-compiler/hermesc/osx-bin/hermesc";
    if (!existsSync(hermescPath)) {
      skip(
        "real-mode: hermesc magic + HBC digests",
        "hermesc missing — install per docs/guides/metro-base-peel.md",
      );
    } else {
      // 7) base/index.hbc exists with Hermes magic
      const baseHbc = path.join(outDir, "base/index.hbc");
      if (existsSync(baseHbc)) {
        const m = readHbcMagic(baseHbc);
        record(
          "real: base/index.hbc hermes magic",
          m === HERMES_MAGIC_LE,
          `magic=0x${m.toString(16).padStart(8, "0")}`,
        );
        // 7b) base.marker.json.base_digest == sha256(base/index.hbc)
        const hbcSha = createHash("sha256")
          .update(readFileSync(baseHbc))
          .digest("hex");
        record(
          "real: base.marker.json.base_digest == sha256(base/index.hbc)",
          baseMarker.base_digest === hbcSha,
          `marker=${baseMarker.base_digest?.slice(0, 12)}… hbc=${hbcSha.slice(0, 12)}…`,
        );
      } else {
        record("real: base/index.hbc exists", false, baseHbc);
      }

      // 8) peeled/<id>/index.hbc exists with the same magic; markers
      //    carry the same base_digest
      for (const file of peeledFiles) {
        const id = file.replace(/\.marker\.json$/, "");
        const peeledHbc = path.join(outDir, `peeled/${id}/index.hbc`);
        if (existsSync(peeledHbc)) {
          const m = readHbcMagic(peeledHbc);
          record(
            `real: peeled/${id}/index.hbc hermes magic`,
            m === HERMES_MAGIC_LE,
            `magic=0x${m.toString(16).padStart(8, "0")}`,
          );
        } else {
          record(`real: peeled/${id}/index.hbc exists`, false, peeledHbc);
        }
        const marker = JSON.parse(
          readFileSync(path.join(peeledDir, file), "utf8"),
        );
        record(
          `real: peeled/${id}.marker.json.base_digest == base marker`,
          marker.base_digest === baseMarker.base_digest,
          `peeled=${marker.base_digest?.slice(0, 12)}… base=${baseMarker.base_digest?.slice(0, 12)}…`,
        );
      }
    }

    // 9) id-stability contract: run --real again into a second temp
    //    dir; the base-module-id-map.json must be byte-identical.
    const outDir2 = mkdtempSync(path.join(tmpdir(), "rn-verify-peel-2-"));
    try {
      const r2Args = [
        path.join(repoRoot, "scripts/pack-base-peel.mjs"),
        "--out",
        outDir2,
      ];
      if (configArg) r2Args.push("--config", configArg);
      r2Args.push("--real");
      const r2 = spawnSync(process.execPath, r2Args, {
        cwd: repoRoot,
        encoding: "utf8",
        env: { ...process.env },
      });
      if (r2.status !== 0) {
        record(
          "id-stability: second --real run exit 0",
          false,
          (r2.stderr || r2.stdout || "").trim().slice(-400),
        );
      } else {
        const mapA = readFileSync(
          path.join(outDir, "base-module-id-map.json"),
        );
        const mapB = readFileSync(
          path.join(outDir2, "base-module-id-map.json"),
        );
        const same = Buffer.compare(mapA, mapB) === 0;
        record(
          "id-stability: base-module-id-map.json byte-identical between runs",
          same,
          same
            ? `${mapA.length}B == ${mapB.length}B`
            : `${mapA.length}B vs ${mapB.length}B`,
        );
      }
    } finally {
      rmSync(outDir2, { recursive: true, force: true });
    }
  }

  // ── summary ────────────────────────────────────────────────────
  console.log("");
  const passed = checks.filter((c) => c.ok).length;
  console.log(
    JSON.stringify(
      {
        ok: !hardFail,
        outDir,
        config: configArg ?? "default (synthetic fallback)",
        real: realMode,
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
