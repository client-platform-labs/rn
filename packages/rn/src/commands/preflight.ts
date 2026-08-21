import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

import { CliError, EXIT_FAIL } from "../errors.js";
import type { CliLogger } from "../logger.js";
import { defaultInstallHome, localBinDir } from "../install-home.js";

export type PreflightLevel = "ok" | "warn" | "fail";

export interface PreflightItem {
  id: string;
  level: PreflightLevel;
  message: string;
}

function which(cmd: string): string | null {
  const r = spawnSync("which", [cmd], { encoding: "utf8" });
  if (r.status !== 0) {
    return null;
  }
  return r.stdout.trim() || null;
}

function nodeMajor(): number | null {
  const m = process.versions.node.split(".")[0];
  const n = Number(m);
  return Number.isFinite(n) ? n : null;
}

/**
 * Host / toolchain preflight (install-time and day-2).
 * Does not require a project manifest.
 */
export function runPreflight(options: {
  logger: CliLogger;
  strict?: boolean;
}): { ok: boolean; items: PreflightItem[] } {
  const items: PreflightItem[] = [];
  const strict = Boolean(options.strict);

  const major = nodeMajor();
  if (major === 24) {
    items.push({
      id: "node",
      level: "ok",
      message: `Node.js ${process.versions.node} (ok)`,
    });
  } else if (major !== null && major >= 22 && major < 25) {
    items.push({
      id: "node",
      level: "warn",
      message: `Node.js ${process.versions.node} — prefer 24.x`,
    });
  } else {
    items.push({
      id: "node",
      level: "fail",
      message: `Node.js ${process.versions.node} unsupported (need >=22 <25, prefer 24)`,
    });
  }

  for (const cmd of ["git", "curl"] as const) {
    const p = which(cmd);
    items.push(
      p
        ? { id: cmd, level: "ok", message: `${cmd}: ${p}` }
        : { id: cmd, level: "fail", message: `${cmd} not found on PATH` },
    );
  }

  const pnpm = which("pnpm");
  items.push(
    pnpm
      ? { id: "pnpm", level: "ok", message: `pnpm: ${pnpm}` }
      : {
          id: "pnpm",
          level: "warn",
          message: "pnpm not on PATH (get-rn.sh bootstraps via Corepack)",
        },
  );

  const home = defaultInstallHome();
  const managed = existsSync(path.join(home, "package.json"));
  items.push(
    managed
      ? { id: "install-home", level: "ok", message: `install home: ${home}` }
      : {
          id: "install-home",
          level: "warn",
          message: `install home not present yet: ${home}`,
        },
  );

  const rnBin = which("rn");
  items.push(
    rnBin
      ? { id: "rn-path", level: "ok", message: `rn on PATH: ${rnBin}` }
      : {
          id: "rn-path",
          level: "warn",
          message: `rn not on PATH (expected ${localBinDir()}/rn)`,
        },
  );

  const androidHome =
    process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || "";
  const adb = which("adb");
  if (androidHome && existsSync(androidHome) && adb) {
    items.push({
      id: "android",
      level: "ok",
      message: `Android SDK + adb (${androidHome})`,
    });
  } else {
    items.push({
      id: "android",
      level: strict ? "fail" : "warn",
      message: "Android SDK / adb not fully available",
    });
  }

  if (process.platform === "darwin") {
    const xcode = which("xcodebuild");
    items.push(
      xcode
        ? { id: "ios", level: "ok", message: `xcodebuild: ${xcode}` }
        : {
            id: "ios",
            level: strict ? "fail" : "warn",
            message: "xcodebuild not found",
          },
    );
  }

  try {
    const probe = path.join(homedir(), ".client-platform", ".write-probe");
    mkdirSync(path.dirname(probe), { recursive: true });
    writeFileSync(probe, "ok");
    unlinkSync(probe);
    items.push({ id: "home-write", level: "ok", message: "home dir writable" });
  } catch {
    items.push({
      id: "home-write",
      level: "fail",
      message: "cannot write under ~/.client-platform",
    });
  }

  const ok = !items.some((i) => i.level === "fail");

  if (options.logger.json) {
    options.logger.writeMachine({ ok, installHome: home, items });
  } else {
    options.logger.writeHuman("rn preflight:");
    for (const i of items) {
      options.logger.writeHuman(
        `  [${i.level.toUpperCase().padEnd(4)}] ${i.message}`,
      );
    }
    options.logger.writeHuman(ok ? "preflight: PASS" : "preflight: FAIL");
  }

  if (!ok) {
    throw new CliError("preflight failed", EXIT_FAIL);
  }
  return { ok, items };
}
