import path from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import {
  computeFingerprint,
  DEV_SESSION_PROTOCOL_VERSION,
  discoverPlugins,
  evaluateReleaseSourceHygiene,
  findManifestRoot,
  findWorkspaceRoot,
  loadProjectManifest,
  MANIFEST_FILENAME,
  type DevSessionConfig,
} from "@client-platform/core";
import {
  isGreenfieldRnTrain,
  RN_GREENFIELD_MAJOR_MINOR,
} from "@client-platform/rn-engine";
import { CliError, EXIT_FAIL } from "../errors.js";
import { defaultInstallHome } from "../install-home.js";
import type { CliLogger } from "../logger.js";
import { probeMetroBridge } from "../android-dev-bridge.js";

/**
 * ADR-022 migration detection: a 1.x manifest has `runtime_fingerprint.rnExactTuple`
 * at the top level and no `engine` sub-object. Detected so `rn doctor` can give a
 * clear migration hint instead of a generic schema failure.
 */
export function detectLegacyFingerprint(manifestRoot: string): boolean {
  const file = path.join(manifestRoot, MANIFEST_FILENAME);
  if (!existsSync(file)) return false;
  try {
    const doc = JSON.parse(readFileSync(file, "utf8")) as {
      runtime_fingerprint?: Record<string, unknown>;
    };
    const fp = doc.runtime_fingerprint;
    return Boolean(fp && "rnExactTuple" in fp && !("engine" in fp));
  } catch {
    return false;
  }
}
import { probeAndroidHost } from "../host-env.js";
import { loadDevSessionConfig } from "../dev-session-config.js";
import {
  evaluateBrownfieldDoctor,
  loadHostProfile,
  type DoctorCheck,
  type DoctorProfile,
  type HostProfileLoader,
} from "../brownfield-doctor.js";
import type { PackageJsonTextLoader } from "../brownfield-native-doctor.js";
import { evaluateEnterpriseDoctor } from "../enterprise-doctor.js";
import {
  INDUSTRIAL_TEMPLATE_VERSION,
  shellTemplateDrift,
} from "../industrial-shell.js";
import { evaluateExpoDoctor } from "../expo-doctor.js";
import {
  collectPreflightFindings,
  collectPreflightIssues,
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

/* ─────────────────────── doctor check seam (#260) ─────────────────────── */

/**
 * Before: four check families each declared the same
 * `{ id, ok, summary, blocking }` record, `runDoctor` wrote one issue-push loop
 * and one print loop per family (4 + 4), and two independent verdicts
 * (`host.ok` and `issues.length === 0`) both fed the payload.
 *
 * After: one record (`DoctorCheck`), one evaluator interface
 * (`DoctorCheckFamily.evaluate(ctx) -> DoctorCheck[]`), one collect, one render,
 * one verdict. A new check family is one entry in `DOCTOR_CHECK_FAMILIES`.
 */
export type DoctorCheckFamily = {
  /** Issue prefix and stable id in machine output (`[enterprise] ...`). */
  id: string;
  /** Human section title. */
  title: string;
  /** Render a blank line before this section's title. */
  blankBefore: boolean;
  /**
   * Tag for a non-blocking failure. Doctor has always rendered expo advisory
   * gaps as WARN and every other family as INFO; preserved from the old loops.
   */
  advisory: "INFO" | "WARN";
  /**
   * Whether `--strict` escalates this family's non-blocking failures into
   * issues. Release hygiene opts out (blocking-only) — preserved behaviour.
   */
  strictEscalates: boolean;
  /** Profile gate: whether this family runs for a given profile. */
  appliesTo: (profile: DoctorProfile) => boolean;
  /** The F25 template-drift block is rendered before this family. */
  driftBefore?: boolean;
  /** The evaluator: one family in, checks out. */
  evaluate: (ctx: DoctorCheckContext) => DoctorCheck[];
};

/**
 * Everything a check family may consume. Files are read once per doctor run and
 * handed to every family through these loaders (#260), so four evaluators no
 * longer re-read the same `package.json` / `.rn/host-profile.jsonc`. Direct
 * callers of an evaluator omit the loaders and that family reads for itself.
 */
type DoctorCheckContext = {
  projectRoot: string;
  session: DevSessionConfig | null;
  readHostProfile: HostProfileLoader;
  readPackageJsonText: PackageJsonTextLoader;
};

/**
 * The check families, in issue order. Order is load-bearing: the collected issue
 * list is what `CliError` reports, and `driftBefore` places the F25
 * template-drift block in the human output.
 */
export const DOCTOR_CHECK_FAMILIES: readonly DoctorCheckFamily[] = [
  {
    id: "brownfield",
    title: "L3b Brownfield contract (map-a/#5)",
    blankBefore: true,
    advisory: "INFO",
    strictEscalates: true,
    appliesTo: (profile) => profile === "brownfield",
    evaluate: (ctx) =>
      evaluateBrownfieldDoctor({
        projectRoot: ctx.projectRoot,
        session: ctx.session,
        hostProfile: ctx.readHostProfile,
      }),
  },
  {
    id: "expo",
    title: "Expo interop",
    blankBefore: true,
    advisory: "WARN",
    strictEscalates: true,
    appliesTo: (profile) => profile === "expo",
    evaluate: (ctx) =>
      evaluateExpoDoctor(ctx.projectRoot, {
        packageJsonText: ctx.readPackageJsonText,
      }),
  },
  {
    id: "enterprise",
    title: "Enterprise readiness gates",
    blankBefore: false,
    advisory: "INFO",
    strictEscalates: true,
    driftBefore: true,
    appliesTo: () => true,
    evaluate: (ctx) =>
      evaluateEnterpriseDoctor({
        projectRoot: ctx.projectRoot,
        session: ctx.session,
        hostProfile: ctx.readHostProfile,
        packageJsonText: ctx.readPackageJsonText,
      }),
  },
  {
    id: "release",
    title: "L3f Release hygiene (M2 / G-P0)",
    blankBefore: true,
    advisory: "INFO",
    // Release hygiene has always been blocking-only: `--strict` never escalated
    // a non-blocking release finding into an issue.
    strictEscalates: false,
    appliesTo: () => true,
    evaluate: (ctx) => evaluateReleaseSourceHygiene(ctx.projectRoot),
  },
];

/**
 * Read-once-per-run loaders handed to every family (#260). Memoised so the
 * second caller sees the first read's value rather than touching disk again.
 */
export function createDoctorReaders(projectRoot: string): {
  readHostProfile: HostProfileLoader;
  readPackageJsonText: PackageJsonTextLoader;
} {
  const memoize = <T>(load: () => T): (() => T) => {
    let loaded = false;
    let value: T;
    return () => {
      if (!loaded) {
        value = load();
        loaded = true;
      }
      return value;
    };
  };
  return {
    readHostProfile: memoize(() => loadHostProfile(projectRoot)),
    readPackageJsonText: memoize(() => {
      const file = path.join(projectRoot, "package.json");
      return existsSync(file) ? readFileSync(file, "utf8") : undefined;
    }),
  };
}

/** The single collect (#260): `[family] summary` for every escalated failure. */
export function collectDoctorIssues(
  families: readonly {
    id: string;
    checks: readonly DoctorCheck[];
    strictEscalates?: boolean;
  }[],
  options: { strict?: boolean } = {},
): string[] {
  const issues: string[] = [];
  const strict = options.strict === true;
  for (const family of families) {
    const escalate = strict && family.strictEscalates !== false;
    for (const check of family.checks) {
      if (check.ok) continue;
      if (!check.blocking && !escalate) continue;
      issues.push(`[${family.id}] ${check.summary}`);
    }
  }
  return issues;
}

/** Row tag for one check: `OK  ` / `NEED` / the family's advisory tag. */
export function doctorCheckTag(
  check: DoctorCheck,
  advisory: "INFO" | "WARN" = "INFO",
): string {
  if (check.ok) return "OK  ";
  return check.blocking ? "NEED" : advisory;
}

/**
 * The single verdict (#260). Doctor passes iff the collect produced no issue —
 * a family's own partial verdict can no longer disagree with it.
 */
export function doctorIssueVerdict(issues: readonly string[]): boolean {
  return issues.length === 0;
}

export type DoctorCheckSection = {
  /** Omitted for untitled blocks (the F25 template-drift line). */
  title?: string;
  blankBefore: boolean;
  advisory?: "INFO" | "WARN";
  checks: readonly DoctorCheck[];
  /** Printed only when at least one check in the section failed. */
  hintOnFailure?: string;
};

/** The single renderer (#260) — replaced four per-family print loops. */
export function printDoctorCheckSections(
  logger: { writeHuman(message: string): void },
  sections: readonly DoctorCheckSection[],
): void {
  for (const section of sections) {
    if (section.blankBefore) logger.writeHuman("");
    if (section.title !== undefined) logger.writeHuman(section.title);
    for (const check of section.checks) {
      logger.writeHuman(
        `  [${doctorCheckTag(check, section.advisory ?? "INFO")}] ${check.summary}`,
      );
    }
    if (
      section.hintOnFailure &&
      section.checks.some((check) => !check.ok)
    ) {
      logger.writeHuman(section.hintOnFailure);
    }
  }
}

/**
 * F25 shell-template drift as a check (#260): it used to be the one diagnostic
 * row printed outside any family. Human output only — not part of the payload.
 */
export function shellTemplateDriftCheck(drift: string | null): DoctorCheck {
  return {
    id: "shell-template",
    ok: drift === null,
    summary: drift ?? `shell template is current (v${INDUSTRIAL_TEMPLATE_VERSION})`,
    blocking: true,
  };
}

/**
 * Whether this project actually HAS the industrial shell. F25 drift is only
 * meaningful for those.
 *
 * `shellTemplateDrift` answers "does the applied template version differ from the
 * current one" and returns a message whenever it does — including for a project
 * with NO marker at all, which is the `rn init --pure` case (and this platform
 * repo itself). Those projects would be told to "run rn shell refresh" forever,
 * with no shell to refresh. Applicability is the caller's question, not the
 * drift function's (#265) — nulling it inside shellTemplateDrift instead would
 * hide genuine drift on pre-marker industrial shells.
 */
function isIndustrialShellProject(projectRoot: string): boolean {
  return existsSync(path.join(projectRoot, "shell", "ShellHost.tsx"));
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
  // Host layers contribute their issues through the module that owns the L0–L2
  // record (#260). `host.ok` is a gate over that family, NOT the run verdict —
  // the verdict is doctorIssueVerdict(issues) below.
  issues.push(...collectPreflightIssues(findings, host, { strict }));

  const workspaceRoot = findWorkspaceRoot(cwd);
  const packages: Array<{ name: string; ok: boolean }> = [];
  if (workspaceRoot) {
    const workspaceParent = pathToFileURL(
      path.join(workspaceRoot, "package.json"),
    ).href;
    const packageChecks: Array<{ name: string; parent: string }> = [
      { name: "@client-platform/rn", parent: workspaceParent },
      { name: "@client-platform/core", parent: import.meta.url },
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
        const tuple = fp.engine.version;
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
        rnExactTuple: fp?.engine.version,
        newArch: fp?.engine.version.includes("newarch") ?? true,
        hermesV1: fp?.engine.version.includes("hermes-v1") ?? true,
        fingerprintDigest,
      };
    } else if (loaded.code === "invalid") {
      manifest = { present: true, errors: loaded.errors };
      issues.push(`invalid ${MANIFEST_FILENAME}`);
      // ADR-022: 1.x fingerprint (top-level rnExactTuple, no engine sub-object) needs migration.
      if (detectLegacyFingerprint(manifestRoot)) {
        issues.push(
          "legacy 1.x fingerprint detected (runtime_fingerprint.rnExactTuple) — migrate to engine sub-object (ADR-022)",
        );
      }
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

  // One evaluator interface, one collect (#260). Families are profile-gated by
  // the registry, evaluated with shared readers, and their issues gathered in
  // registry order so the CliError message stays stable.
  const readers = createDoctorReaders(cwd);
  const ctx: DoctorCheckContext = {
    projectRoot: cwd,
    session: sessionConfig,
    readHostProfile: readers.readHostProfile,
    readPackageJsonText: readers.readPackageJsonText,
  };
  const activeFamilies = DOCTOR_CHECK_FAMILIES.filter((family) =>
    family.appliesTo(profile),
  );
  const familyChecks = activeFamilies.map((family) => ({
    id: family.id,
    checks: family.evaluate(ctx),
    strictEscalates: family.strictEscalates,
  }));
  issues.push(...collectDoctorIssues(familyChecks, { strict }));

  // The payload keeps one key per family even when the profile gated that family
  // out (greenfield reports brownfield/expo as present-but-empty) — field
  // compatibility for `rn doctor --json` consumers.
  const checksFor = (familyId: string): DoctorCheck[] =>
    familyChecks.find((family) => family.id === familyId)?.checks ?? [];

  const ok = doctorIssueVerdict(issues);
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
      brownfield: checksFor("brownfield"),
      expo: checksFor("expo"),
      enterprise: checksFor("enterprise"),
      releaseHygiene: checksFor("release"),
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

    // One renderer (#260): sections in registry order, with the F25 drift block
    // placed by `driftBefore`. Titles, blank lines, tags and the release hint are
    // identical to the four per-family loops this replaced.
    const sections: DoctorCheckSection[] = [];
    for (const family of activeFamilies) {
      if (family.driftBefore && isIndustrialShellProject(cwd)) {
        sections.push({
          blankBefore: true,
          checks: [shellTemplateDriftCheck(shellTemplateDrift(cwd))],
        });
      }
      sections.push({
        title: family.title,
        blankBefore: family.blankBefore,
        advisory: family.advisory,
        checks: checksFor(family.id),
        hintOnFailure:
          family.id === "release"
            ? "  hint: run rn dev-support remove before ship build --profile release"
            : undefined,
      });
    }
    printDoctorCheckSections(logger, sections);

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
