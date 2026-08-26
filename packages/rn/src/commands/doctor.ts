import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  computeFingerprint,
  DEV_SESSION_PROTOCOL_VERSION,
  discoverPlugins,
  evaluateReleaseSourceHygiene,
  findManifestRoot,
  findWorkspaceRoot,
  isGreenfieldRnTrain,
  loadProjectManifest,
  MANIFEST_FILENAME,
  RN_GREENFIELD_MAJOR_MINOR,
} from "@client-platform/rn-core";
import { CliError, EXIT_FAIL } from "../errors.js";
import { defaultInstallHome } from "../install-home.js";
import type { CliLogger } from "../logger.js";
import { probeMetroBridge } from "../android-dev-bridge.js";
import { probeAndroidHost } from "../host-env.js";
import { loadDevSessionConfig } from "../dev-session-config.js";
import {
  evaluateBrownfieldDoctor,
  parseDoctorProfile,
  type DoctorProfile,
} from "../brownfield-doctor.js";
import { evaluateEnterpriseDoctor } from "../enterprise-doctor.js";
import { evaluateExpoDoctor } from "../expo-doctor.js";
import {
  collectPreflightFindings,
  evaluatePreflight,
  printHostLayers,
  type PreflightFinding,
} from "../preflight-layers.js";

function canResolve(specifier: string, parentHref: string): boolean {
  try {
    import.meta.resolve(specifier, parentHref);
    return true;
  } catch {
    return false;
  }
}

export function nodeMajor(version = process.versions.node): number {
  return Number.parseInt(version.split(".")[0] ?? "0", 10);
}

/**
 * Unified diagnostics: host layers L0–L2 + project contract L3 when present.
 * Does not mutate the machine.
 */
export async function runDoctor(options: {
  cwd: string;
  logger: CliLogger;
  strict?: boolean;
  profile?: DoctorProfile;
}): Promise<void> {
  const { cwd, logger } = options;
  const strict = Boolean(options.strict);
  const profile: DoctorProfile = options.profile ?? "greenfield";
  const issues: string[] = [];
  const home = defaultInstallHome();

  const androidHost = probeAndroidHost();
  const bridge =
    androidHost.adbPath != null
      ? probeMetroBridge({ adbPath: androidHost.adbPath })
      : undefined;
  const findings = collectPreflightFindings({ android: androidHost, bridge });
  const host = evaluatePreflight(findings, { strict });

  const major = nodeMajor();
  const nodeOk = major === 24;
  if (!nodeOk) {
    issues.push(
      `Node.js ${process.versions.node} is not 24.x (rn doctor requires Node 24.x)`,
    );
  }
  if (!host.ok) {
    for (const f of findings) {
      if (f.status !== "missing") {
        continue;
      }
      if (f.plane === "cli") {
        issues.push(f.summary);
      } else if (
        strict &&
        (f.plane === "assisted" || (f.plane === "manual" && f.id === "ios"))
      ) {
        issues.push(f.summary);
      }
    }
  }

  const workspaceRoot = findWorkspaceRoot(cwd);
  const packages: Array<{ name: string; ok: boolean }> = [];
  if (workspaceRoot) {
    const workspaceParent = pathToFileURL(
      path.join(workspaceRoot, "package.json"),
    ).href;
    const packageChecks: Array<{ name: string; parent: string }> = [
      { name: "@client-platform/rn", parent: workspaceParent },
      { name: "@client-platform/rn-core", parent: import.meta.url },
    ];
    for (const check of packageChecks) {
      const ok = canResolve(check.name, check.parent);
      packages.push({ name: check.name, ok });
      if (!ok) {
        issues.push(`cannot resolve ${check.name}`);
      }
    }
  }

  const manifestRoot = findManifestRoot(cwd);
  let manifest: {
    present: boolean;
    schemaVersion?: number;
    rnExactTuple?: string;
    newArch?: boolean;
    hermesV1?: boolean;
    fingerprintDigest?: string;
    errors?: string[];
  } = { present: false };

  if (manifestRoot) {
    const loaded = loadProjectManifest(manifestRoot);
    if (loaded.ok) {
      const fp = loaded.manifest.runtime_fingerprint;
      let fingerprintDigest: string | undefined;
      if (fp) {
        fingerprintDigest = computeFingerprint(fp).digest;
        const tuple = fp.rnExactTuple;
        const trainVersion = tuple.split("+")[0] ?? "";
        if (!isGreenfieldRnTrain(trainVersion)) {
          issues.push(
            `rnExactTuple train is not ${RN_GREENFIELD_MAJOR_MINOR}.x (got ${tuple})`,
          );
        }
        if (!tuple.includes("hermes-v1")) {
          issues.push(`rnExactTuple missing hermes-v1 marker: ${tuple}`);
        }
        if (!tuple.includes("newarch")) {
          issues.push(`rnExactTuple missing newarch marker: ${tuple}`);
        }
      }
      manifest = {
        present: true,
        schemaVersion: loaded.manifest.schemaVersion,
        rnExactTuple: fp?.rnExactTuple,
        newArch: fp?.rnExactTuple.includes("newarch") ?? true,
        hermesV1: fp?.rnExactTuple.includes("hermes-v1") ?? true,
        fingerprintDigest,
      };
    } else if (loaded.code === "invalid") {
      manifest = { present: true, errors: loaded.errors };
      issues.push(`invalid ${MANIFEST_FILENAME}`);
    }
  }

  const plugins = await discoverPlugins({
    cwd,
    onWarn: (message) => logger.warn(message),
  });

  let devSessionSummary:
    | {
        present: true;
        protocol: number;
        cliProtocol: number;
        ports: Record<string, number>;
      }
    | { present: false } = { present: false };
  let sessionConfig: ReturnType<typeof loadDevSessionConfig> = null;
  try {
    sessionConfig = loadDevSessionConfig(cwd);
    if (sessionConfig) {
      const ports: Record<string, number> = {};
      for (const [id, b] of Object.entries(sessionConfig.modules)) {
        ports[id] = b.metroPort;
      }
      devSessionSummary = {
        present: true,
        protocol:
          sessionConfig.devSessionProtocolVersion ?? DEV_SESSION_PROTOCOL_VERSION,
        cliProtocol: DEV_SESSION_PROTOCOL_VERSION,
        ports,
      };
    }
  } catch (err) {
    issues.push(err instanceof Error ? err.message : String(err));
  }

  const brownfieldChecks =
    profile === "brownfield"
      ? evaluateBrownfieldDoctor({
          projectRoot: cwd,
          session: sessionConfig,
        })
      : [];

  const expoChecks =
    profile === "expo" ? evaluateExpoDoctor(cwd) : [];

  for (const check of brownfieldChecks) {
    if (!check.ok && (check.blocking || strict)) {
      issues.push(`[brownfield] ${check.summary}`);
    }
  }

  for (const check of expoChecks) {
    if (!check.ok && (check.blocking || strict)) {
      issues.push(`[expo] ${check.summary}`);
    }
  }

  const enterpriseChecks = evaluateEnterpriseDoctor({
    projectRoot: cwd,
    session: sessionConfig,
  });
  for (const check of enterpriseChecks) {
    if (!check.ok && (check.blocking || strict)) {
      issues.push(`[enterprise] ${check.summary}`);
    }
  }

  const releaseChecks = evaluateReleaseSourceHygiene(cwd);
  for (const check of releaseChecks) {
    if (!check.ok && check.blocking) {
      issues.push(`[release] ${check.summary}`);
    }
  }

  const ok = issues.length === 0;
  const payload = {
    ok,
    strict,
    profile,
    installHome: home,
    host: {
      cliOk: host.cliOk,
      deviceReady: host.deviceReady,
      layers: {
        cli: findings.filter((f: PreflightFinding) => f.plane === "cli"),
        assisted: findings.filter((f) => f.plane === "assisted"),
        manual: findings.filter((f) => f.plane === "manual"),
      },
      findings,
      /** Ticket 13 — L2 Dev Session probe ids for jq filters */
      devSession: findings.filter(
        (f) =>
          f.id.startsWith("dev-session-") || f.id === "android-bridge",
      ),
    },
    project: {
      node: { version: process.versions.node, major, ok: nodeOk },
      packages,
      manifest,
      plugins,
      multiMetro: devSessionSummary,
      brownfield: brownfieldChecks,
      expo: expoChecks,
      enterprise: enterpriseChecks,
      releaseHygiene: releaseChecks,
    },
    autofix: {
      available: false,
      note: "TODO: safe autofix only; no unsafe rewrite",
    },
  };

  if (logger.json) {
    logger.writeMachine(payload);
  } else {
    logger.writeHuman("rn doctor");
    logger.writeHuman(`profile: ${profile}`);
    printHostLayers(logger, findings);
    logger.writeHuman("");
    logger.writeHuman(
      `host summary: CLI ${host.cliOk ? "PASS" : "FAIL"} · device-build ${host.deviceReady ? "READY" : "NOT READY"}`,
    );
    if (!host.deviceReady && !strict) {
      logger.writeHuman(
        "note: L1 device-build gaps are advisory unless --strict (Metro-only still works)",
      );
    }

    logger.writeHuman("");
    logger.writeHuman(
      "L3  Project contract — manifest / workspace / plugins (cwd)",
    );
    logger.writeHuman(
      `  [${nodeOk ? "OK  " : "NEED"}] Node.js ${process.versions.node}${nodeOk ? "" : " (doctor requires 24.x)"}`,
    );
    if (packages.length === 0) {
      logger.writeHuman("  [INFO] workspace packages: (not inside monorepo)");
    } else {
      for (const pkg of packages) {
        logger.writeHuman(
          `  [${pkg.ok ? "OK  " : "NEED"}] ${pkg.name}`,
        );
      }
    }
    if (!manifest.present) {
      logger.writeHuman(
        "  [INFO] manifest: (none — run from an rn init project for L3 contract checks)",
      );
    } else if (manifest.schemaVersion !== undefined) {
      logger.writeHuman(
        `  [OK  ] ${MANIFEST_FILENAME} schemaVersion=${manifest.schemaVersion}`,
      );
      if (manifest.rnExactTuple) {
        logger.writeHuman(`           rnExactTuple: ${manifest.rnExactTuple}`);
        logger.writeHuman(
          `           expectations: New Arch + Hermes V1 (RN ${RN_GREENFIELD_MAJOR_MINOR}.x)`,
        );
      }
      if (manifest.fingerprintDigest) {
        logger.writeHuman(
          `           fingerprint: ${manifest.fingerprintDigest}`,
        );
      }
    } else {
      logger.writeHuman(`  [NEED] ${MANIFEST_FILENAME} invalid`);
      for (const err of manifest.errors ?? []) {
        logger.writeHuman(`           ${err}`);
      }
    }
    if (plugins.length === 0) {
      logger.writeHuman("  [INFO] plugins: (none)");
    } else {
      for (const plugin of plugins) {
        logger.writeHuman(
          `  [OK  ] plugin ${plugin.id}  ${plugin.kind}  api=${plugin.apiVersion}  ${plugin.packageName}`,
        );
      }
    }

    if (devSessionSummary.present) {
      const ports = Object.entries(devSessionSummary.ports)
        .map(([id, port]) => `${id}=:${port}`)
        .join(", ");
      logger.writeHuman(
        `  [OK  ] .rn/dev-session.jsonc protocol=${devSessionSummary.protocol} (cli=${devSessionSummary.cliProtocol}) · ${ports}`,
      );
    } else {
      logger.writeHuman("  [INFO] .rn/dev-session.jsonc: (none)");
    }

    if (profile === "brownfield") {
      logger.writeHuman("");
      logger.writeHuman("L3b Brownfield contract (map-a/#5)");
      for (const check of brownfieldChecks) {
        logger.writeHuman(
          `  [${check.ok ? "OK  " : check.blocking ? "NEED" : "INFO"}] ${check.summary}`,
        );
      }
    }

    if (profile === "expo") {
      logger.writeHuman("");
      logger.writeHuman("L3x Expo interop (ADR-003 / map-a/#16)");
      for (const check of expoChecks) {
        logger.writeHuman(
          `  [${check.ok ? "OK  " : check.blocking ? "NEED" : "WARN"}] ${check.summary}`,
        );
      }
    }

    logger.writeHuman("");
    logger.writeHuman("L3e Enterprise P0 gates (ADR-008)");
    for (const check of enterpriseChecks) {
      logger.writeHuman(
        `  [${check.ok ? "OK  " : check.blocking ? "NEED" : "INFO"}] ${check.summary}`,
      );
    }

    logger.writeHuman("");
    logger.writeHuman("L3f Release hygiene (M2 / G-P0)");
    for (const check of releaseChecks) {
      logger.writeHuman(
        `  [${check.ok ? "OK  " : check.blocking ? "NEED" : "INFO"}] ${check.summary}`,
      );
    }
    if (releaseChecks.some((c) => !c.ok)) {
      logger.writeHuman(
        "  hint: run rn dev-support remove before rn-delivery build --profile release",
      );
    }

    logger.writeHuman(
      "  [INFO] autofix: not available (safe autofix TODO; unsafe never)",
    );

    logger.writeHuman("");
    logger.writeHuman(ok ? "doctor: PASS" : "doctor: FAIL");
  }

  if (!ok) {
    throw new CliError(issues.join("\n"), EXIT_FAIL);
  }
}
