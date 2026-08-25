/**
 * Host readiness layers for `rn doctor` (diagnose + guide; never mutate).
 *
 * L0 CLI plane     — required to run `rn` itself (get-rn / Node can bootstrap some)
 * L1 Assisted      — machine packages with copy-paste install commands (brew/sdkmanager)
 * L2 Manual        — human-gated: Studio GUI, licenses, USB debug, Xcode first-run
 * L3 Project       — printed by doctor when cwd has a project (manifest / plugins)
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

import { iosHostCheckItems, probeAndroidHost, type AndroidHostProbe } from "./host-env.js";
import type { MetroBridgeProbe } from "./android-dev-bridge.js";
import { buildLanBundlerUrl, isWifiAdbSerial } from "./dev-transport.js";
import { defaultInstallHome, localBinDir } from "./install-home.js";
import { commandExists } from "./process.js";

export type PreflightPlane = "cli" | "assisted" | "manual";
export type PreflightStatus = "ok" | "missing" | "degraded" | "info";

export interface PreflightRemediation {
  kind: "none" | "command" | "manual";
  title: string;
  lines: string[];
}

export interface PreflightFinding {
  id: string;
  plane: PreflightPlane;
  status: PreflightStatus;
  summary: string;
  remediation?: PreflightRemediation;
}

export const ANDROID_SDK_PACKAGES = [
  "platform-tools",
  "platforms;android-35",
  "build-tools;35.0.0",
] as const;

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

function brewPresent(): boolean {
  return commandExists("brew");
}

export function androidAssistedInstallLines(): string[] {
  return [
    "rn host android --check",
    "rn host android --dry-run",
    "rn host android --yes",
    "rn doctor --strict",
  ];
}

/**
 * L2 Dev Session probes (ticket 13): transport reachability, Metro, reverse/LAN URL.
 * Pure + injectable — no subprocess beyond what the caller already probed.
 */
export function collectDevSessionFindings(options: {
  bridge: MetroBridgeProbe;
  lanBundlerUrl?: string;
}): PreflightFinding[] {
  const { bridge } = options;
  const findings: PreflightFinding[] = [];
  const lanUrl =
    options.lanBundlerUrl ?? buildLanBundlerUrl(bridge.metroPort);
  const usbDevices = bridge.authorizedDevices.filter(
    (d) => !isWifiAdbSerial(d.serial),
  );
  const wifiDevices = bridge.authorizedDevices.filter((d) =>
    isWifiAdbSerial(d.serial),
  );
  const modes: string[] = [];
  if (usbDevices.length > 0) {
    modes.push("usb");
  }
  if (wifiDevices.length > 0) {
    modes.push("wifi-adb");
  }
  // LAN is always a reachable *option* when Metro can bind on the host LAN IP
  modes.push("lan");

  // ——— transport reachability ———
  if (bridge.unauthorizedCount > 0 && bridge.authorizedDevices.length === 0) {
    findings.push({
      id: "dev-session-transport",
      plane: "manual",
      status: "missing",
      summary: `${bridge.unauthorizedCount} adb device(s) unauthorized (usb/wifi-adb blocked)`,
      remediation: {
        kind: "manual",
        title: "Authorize debugging on the phone",
        lines: [
          "Unlock phone → accept “Allow USB debugging?” / wireless debug pair",
          "Or: Developer options → Revoke USB debugging authorizations, replug / re-pair",
          "adb devices   # should show “device”, not “unauthorized”",
          `LAN fallback: rn dev --android --transport lan  # bundler ${lanUrl}`,
        ],
      },
    });
  } else if (bridge.authorizedDevices.length === 0) {
    findings.push({
      id: "dev-session-transport",
      plane: "manual",
      status: "info",
      summary: `No authorized adb device (modes available: lan only → ${lanUrl})`,
      remediation: {
        kind: "manual",
        title: "Connect a device or use LAN transport",
        lines: [
          "adb devices",
          "USB: enable USB debugging and trust this computer",
          "Wi‑Fi adb: adb connect <ip>:5555 then rn dev --android --transport wifi",
          `LAN: rn dev --android --transport lan  # device Dev Menu → ${lanUrl}`,
        ],
      },
    });
  } else {
    const parts: string[] = [];
    if (usbDevices.length > 0) {
      parts.push(`usb×${usbDevices.length}`);
    }
    if (wifiDevices.length > 0) {
      parts.push(
        `wifi-adb×${wifiDevices.length} (${wifiDevices.map((d) => d.serial).join(", ")})`,
      );
    }
    findings.push({
      id: "dev-session-transport",
      plane: "manual",
      status: "ok",
      summary: `Transport reachable: ${parts.join(", ")}; lan option ${lanUrl}`,
    });
  }

  // ——— Metro ———
  if (bridge.metroRunning) {
    findings.push({
      id: "dev-session-metro",
      plane: "manual",
      status: "ok",
      summary: `Metro responding on :${bridge.metroPort}`,
    });
  } else {
    findings.push({
      id: "dev-session-metro",
      plane: "manual",
      status: "info",
      summary: `Metro not running on :${bridge.metroPort}`,
      remediation: {
        kind: "command",
        title: "Start Metro",
        lines: ["rn dev --android", "rn dev  # Metro foreground only"],
      },
    });
  }

  // ——— reverse / LAN URL ———
  if (bridge.authorizedDevices.length === 0) {
    findings.push({
      id: "dev-session-bridge",
      plane: "manual",
      status: "info",
      summary: `Bridge idle — LAN bundler URL: ${lanUrl}`,
      remediation: {
        kind: "manual",
        title: "When a device is connected",
        lines: [
          `usb/wifi-adb: rn dev --android  # adb reverse tcp:${bridge.metroPort}`,
          `lan: set Dev Menu bundle location to ${lanUrl}`,
        ],
      },
    });
  } else if (bridge.reverseConfigured) {
    findings.push({
      id: "dev-session-bridge",
      plane: "manual",
      status: bridge.metroRunning ? "ok" : "info",
      summary: bridge.metroRunning
        ? `Dev session ready (reverse :${bridge.metroPort}; LAN alt ${lanUrl})`
        : `adb reverse :${bridge.metroPort} ok; Metro not up yet (LAN alt ${lanUrl})`,
    });
  } else {
    findings.push({
      id: "dev-session-bridge",
      plane: "manual",
      status: "degraded",
      summary: `Device connected but Metro port :${bridge.metroPort} not reversed`,
      remediation: {
        kind: "command",
        title: "Configure DevTransport bridge",
        lines: [
          "rn dev --android   # auto reverse for usb/wifi-adb",
          `adb reverse tcp:${bridge.metroPort} tcp:${bridge.metroPort}`,
          `Or LAN: --transport lan → ${lanUrl}`,
        ],
      },
    });
  }

  // Keep a compact summary id for jq filters that still look for android-bridge
  const worst = findings.reduce<PreflightStatus>((acc, f) => {
    const rank = { missing: 0, degraded: 1, info: 2, ok: 3 } as const;
    return rank[f.status] < rank[acc] ? f.status : acc;
  }, "ok");
  const transport = findings.find((f) => f.id === "dev-session-transport");
  findings.push({
    id: "android-bridge",
    plane: "manual",
    status: worst,
    summary: `Dev session (${modes.join("|")}): ${transport?.summary ?? "probed"}`,
  });

  return findings;
}

export function collectPreflightFindings(options: {
  android?: AndroidHostProbe;
  bridge?: MetroBridgeProbe;
} = {}): PreflightFinding[] {
  const findings: PreflightFinding[] = [];
  const android = options.android ?? probeAndroidHost();

  // ——— L0 CLI plane ———
  const major = nodeMajor();
  if (major === 24) {
    findings.push({
      id: "node",
      plane: "cli",
      status: "ok",
      summary: `Node.js ${process.versions.node}`,
    });
  } else if (major !== null && major >= 22 && major < 25) {
    findings.push({
      id: "node",
      plane: "cli",
      status: "degraded",
      summary: `Node.js ${process.versions.node} (prefer 24.x)`,
      remediation: {
        kind: "command",
        title: "Switch to Node 24 (get-rn / nvm)",
        lines: ["nvm install 24 && nvm use 24"],
      },
    });
  } else {
    findings.push({
      id: "node",
      plane: "cli",
      status: "missing",
      summary: `Node.js ${process.versions.node} unsupported (need >=22 <25, prefer 24)`,
      remediation: {
        kind: "command",
        title: "Install Node 24",
        lines: [
          "curl -fsSL https://raw.githubusercontent.com/client-platform-labs/rn/main/scripts/get-rn.sh | bash -s -- --preflight",
          "nvm install 24 && nvm use 24",
        ],
      },
    });
  }

  for (const cmd of ["git", "curl"] as const) {
    const p = which(cmd);
    if (p) {
      findings.push({
        id: cmd,
        plane: "cli",
        status: "ok",
        summary: `${cmd}: ${p}`,
      });
    } else {
      findings.push({
        id: cmd,
        plane: "cli",
        status: "missing",
        summary: `${cmd} not on PATH`,
        remediation: {
          kind: "command",
          title: `Install ${cmd}`,
          lines:
            process.platform === "darwin"
              ? [`xcode-select --install`, `brew install ${cmd}`]
              : [`# install ${cmd} via your OS package manager`],
        },
      });
    }
  }

  const pnpm = which("pnpm");
  findings.push(
    pnpm
      ? { id: "pnpm", plane: "cli", status: "ok", summary: `pnpm: ${pnpm}` }
      : {
          id: "pnpm",
          plane: "cli",
          status: "degraded",
          summary: "pnpm not on PATH (get-rn.sh bootstraps via Corepack)",
          remediation: {
            kind: "command",
            title: "Enable pnpm",
            lines: ["corepack enable && corepack prepare pnpm@latest --activate"],
          },
        },
  );

  const home = defaultInstallHome();
  const managed = existsSync(path.join(home, "package.json"));
  findings.push(
    managed
      ? {
          id: "install-home",
          plane: "cli",
          status: "ok",
          summary: `install home: ${home}`,
        }
      : {
          id: "install-home",
          plane: "cli",
          status: "degraded",
          summary: `install home not present yet: ${home}`,
          remediation: {
            kind: "command",
            title: "Install product CLI (auto)",
            lines: [
              "curl -fsSL https://raw.githubusercontent.com/client-platform-labs/rn/main/scripts/get-rn.sh | bash",
            ],
          },
        },
  );

  const rnBin = which("rn");
  findings.push(
    rnBin
      ? {
          id: "rn-path",
          plane: "cli",
          status: "ok",
          summary: `rn on PATH: ${rnBin}`,
        }
      : {
          id: "rn-path",
          plane: "cli",
          status: "degraded",
          summary: `rn not on PATH (expected ${localBinDir()}/rn)`,
          remediation: {
            kind: "command",
            title: "Link CLI onto PATH (auto via get-rn)",
            lines: [
              "curl -fsSL https://raw.githubusercontent.com/client-platform-labs/rn/main/scripts/get-rn.sh | bash",
            ],
          },
        },
  );

  try {
    const probe = path.join(homedir(), ".client-platform", ".write-probe");
    mkdirSync(path.dirname(probe), { recursive: true });
    writeFileSync(probe, "ok");
    unlinkSync(probe);
    findings.push({
      id: "home-write",
      plane: "cli",
      status: "ok",
      summary: "home dir writable (~/.client-platform)",
    });
  } catch {
    findings.push({
      id: "home-write",
      plane: "cli",
      status: "missing",
      summary: "cannot write under ~/.client-platform",
      remediation: {
        kind: "manual",
        title: "Fix home directory permissions",
        lines: ["Ensure your user can create ~/.client-platform"],
      },
    });
  }

  // ——— L1 Assisted ———
  if (android.javaMajor !== undefined && android.javaMajor >= 17) {
    findings.push({
      id: "jdk",
      plane: "assisted",
      status: "ok",
      summary: `JDK ${android.javaMajor}`,
    });
  } else {
    findings.push({
      id: "jdk",
      plane: "assisted",
      status: "missing",
      summary: android.javaMessage,
      remediation: {
        kind: "command",
        title: "Install JDK 17 + Android SDK (rn host android)",
        lines: [
          "rn host android --check",
          "rn host android --yes",
          ...(brewPresent() ? [] : ["# requires Homebrew: https://brew.sh"]),
        ],
      },
    });
  }

  if (android.sdkRoot) {
    findings.push({
      id: "android-sdk",
      plane: "assisted",
      status: "ok",
      summary: `Android SDK: ${android.sdkRoot}`,
    });
  } else {
    findings.push({
      id: "android-sdk",
      plane: "assisted",
      status: "missing",
      summary: "Android SDK missing",
      remediation: {
        kind: "command",
        title: "Install Android SDK (cmdline-tools)",
        lines: androidAssistedInstallLines(),
      },
    });
  }

  if (android.adbPath) {
    findings.push({
      id: "adb",
      plane: "assisted",
      status: android.adbOnPath ? "ok" : "degraded",
      summary: android.adbOnPath
        ? `adb: ${android.adbPath}`
        : `adb found but not on PATH: ${android.adbPath}`,
      remediation: android.adbOnPath
        ? undefined
        : {
            kind: "command",
            title: "Add platform-tools to PATH",
            lines: [
              `export ANDROID_HOME=${JSON.stringify(android.sdkRoot)}`,
              'export PATH="$ANDROID_HOME/platform-tools:$PATH"',
            ],
          },
    });
  } else {
    findings.push({
      id: "adb",
      plane: "assisted",
      status: "missing",
      summary: "adb missing (needed for rn dev --android)",
      remediation: {
        kind: "command",
        title: "Follow Android SDK steps above (platform-tools provides adb)",
        lines: android.sdkRoot
          ? androidAssistedInstallLines()
          : [
              "# same L1 block as Android SDK — install cmdline-tools + platform-tools once",
            ],
      },
    });
  }

  // ——— L2 Manual ———
  findings.push({
    id: "android-licenses",
    plane: "manual",
    status: "info",
    summary: "Android SDK licenses (accept once per machine)",
    remediation: {
      kind: "manual",
      title: "Accept Google SDK licenses",
      lines: [
        "sdkmanager --licenses",
        "# or Android Studio → SDK Manager (GUI prompts)",
      ],
    },
  });

  findings.push({
    id: "android-device",
    plane: "manual",
    status: "info",
    summary: "Device/emulator is never auto-installed by rn",
    remediation: {
      kind: "manual",
      title: "Prepare a run target",
      lines: [
        "Phone: Developer options → USB debugging → trust this computer",
        "adb devices   # must list device (not unauthorized)",
        "rn dev --android   # fail-fast if no device; --transport usb|wifi|lan",
        "# or create/start an AVD in Android Studio",
      ],
    },
  });

  if (options.bridge?.adbAvailable) {
    findings.push(...collectDevSessionFindings({ bridge: options.bridge }));
  }

  for (const row of iosHostCheckItems({ strict: false })) {
    if (row.id !== "ios") continue;
    if (process.platform !== "darwin") {
      findings.push({
        id: "ios",
        plane: "manual",
        status: "info",
        summary: "iOS toolchain skipped (non-darwin)",
      });
    } else if (row.level === "ok") {
      findings.push({
        id: "ios",
        plane: "manual",
        status: "ok",
        summary: "xcodebuild available",
        remediation: {
          kind: "manual",
          title: "Xcode first-run / pods (per machine & project)",
          lines: [
            "open Xcode once to accept license",
            "cd <app>/ios && bundle exec pod install",
          ],
        },
      });
    } else {
      findings.push({
        id: "ios",
        plane: "manual",
        status: "missing",
        summary: "xcodebuild not found",
        remediation: {
          kind: "manual",
          title: "Install Xcode (App Store) + CLT",
          lines: ["xcode-select --install", "open Xcode once to finish setup"],
        },
      });
    }
  }

  return findings;
}

export function planeLabel(plane: PreflightPlane): string {
  switch (plane) {
    case "cli":
      return "L0  CLI plane — required for rn (product may auto-bootstrap)";
    case "assisted":
      return "L1  Assisted packages — copy/paste install (Homebrew / sdkmanager; not silent)";
    case "manual":
      return "L2  Manual / human-gated — licenses, USB trust, Dev Session (transport/Metro/bridge), Xcode";
  }
}

export function statusTag(status: PreflightStatus): string {
  switch (status) {
    case "ok":
      return "OK  ";
    case "missing":
      return "NEED";
    case "degraded":
      return "WEAK";
    case "info":
      return "INFO";
  }
}

export function evaluatePreflight(
  findings: PreflightFinding[],
  options: { strict?: boolean },
): { ok: boolean; cliOk: boolean; deviceReady: boolean } {
  const cliOk = !findings.some(
    (f) => f.plane === "cli" && f.status === "missing",
  );
  const deviceReady = !findings.some(
    (f) =>
      f.plane === "assisted" &&
      f.status === "missing" &&
      (f.id === "jdk" || f.id === "android-sdk" || f.id === "adb"),
  );
  const iosBlocking =
    process.platform === "darwin" &&
    findings.some((f) => f.id === "ios" && f.status === "missing");

  const ok = options.strict
    ? cliOk && deviceReady && !iosBlocking
    : cliOk;
  return { ok, cliOk, deviceReady };
}

const PLANE_ORDER: PreflightPlane[] = ["cli", "assisted", "manual"];

/** Shared human printer for L0–L2 (used by `rn doctor`). */
export function printHostLayers(
  logger: { writeHuman(message: string): void },
  findings: PreflightFinding[],
): void {
  for (const plane of PLANE_ORDER) {
    const rows = findings.filter((f) => f.plane === plane);
    if (rows.length === 0) {
      continue;
    }
    logger.writeHuman("");
    logger.writeHuman(planeLabel(plane));
    for (const f of rows) {
      logger.writeHuman(`  [${statusTag(f.status)}] ${f.summary}`);
      const showRemediation =
        f.remediation &&
        f.remediation.lines.length > 0 &&
        ((f.status !== "ok" && f.remediation.kind !== "none") ||
          (f.status === "info" && f.remediation.kind === "manual") ||
          (f.status === "ok" && f.remediation.kind === "manual" && f.id === "ios"));
      if (showRemediation && f.remediation) {
        logger.writeHuman(`           → ${f.remediation.title}`);
        for (const line of f.remediation.lines) {
          logger.writeHuman(`             ${line}`);
        }
      }
    }
  }
}
