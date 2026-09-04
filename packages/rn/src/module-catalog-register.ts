/**
 * Unified host-ops flow: ensure module(s) in dev-session draft → publish Catalog SoT.
 * Replaces the user-visible two-step `link` → `register` chain (#160 / C4).
 *
 * CP intake path (#172): business-side `rn module apply` emits a versioned
 * intake artifact under `.rn/intake/<id>-<hash>.json`; host-ops then runs
 * `rn module register --file <intake.json>` to publish the module into CP
 * without needing the business git repo on the shell machine.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";

import { runCatalogPublish } from "./commands/catalog.js";
import { CliError, EXIT_FAIL, EXIT_USAGE } from "./errors.js";
import type { CliLogger } from "./logger.js";
import { loadDevSessionConfig, writeDevSessionConfig } from "./dev-session-config.js";
import {
  linkModuleToDevSession,
  moduleWorkspaceRoot,
  MODULES_DIR,
} from "./module-workspace.js";
import { loadModuleSelfDescriptor } from "./module-dev/self-descriptor.js";

const MODULE_ID_RE = /^[a-z][a-z0-9_-]{0,63}$/;
const INTAKE_DIR = ".rn/intake";
const INTAKE_VERSION = 1 as const;

/** Business self-descriptor shape (mirrors `client-platform.module.jsonc`). */
type ModuleSelfDescriptor = ReturnType<typeof loadModuleSelfDescriptor> extends infer T
  ? Exclude<T, null>
  : never;

function assertModuleId(moduleId: string): void {
  if (!MODULE_ID_RE.test(moduleId)) {
    throw new CliError(
      `invalid module id ${JSON.stringify(moduleId)} — use /^[a-z][a-z0-9_-]{0,63}$/`,
      EXIT_USAGE,
    );
  }
}

export type EnsureModuleResult = {
  moduleId: string;
  action: "already_linked" | "linked_from_workspace" | "linked_from_descriptor" | "dry_run";
  metroPort?: number;
  entry?: string;
};

/**
 * Idempotently ensure `moduleId` appears in `.rn/dev-session.jsonc`.
 * Does not publish — use {@link runModuleRegisterFlow} for the full host-ops job.
 */
export function ensureModuleInDevSession(options: {
  projectRoot: string;
  moduleId: string;
  logger: CliLogger;
  metroPort?: number;
  entry?: string;
  /** External business repo — reads `client-platform.module.jsonc`. */
  from?: string;
  dryRun?: boolean;
}): EnsureModuleResult {
  const projectRoot = path.resolve(options.projectRoot);
  assertModuleId(options.moduleId);

  const existing = loadDevSessionConfig(projectRoot);
  if (existing?.modules[options.moduleId] && !options.metroPort && !options.entry && !options.from) {
    const binding = existing.modules[options.moduleId]!;
    return {
      moduleId: options.moduleId,
      action: "already_linked",
      metroPort: binding.metroPort,
      entry: binding.entry,
    };
  }

  const workspace = moduleWorkspaceRoot(projectRoot, options.moduleId);
  if (existsSync(workspace)) {
    if (options.dryRun) {
      return { moduleId: options.moduleId, action: "dry_run" };
    }
    const config = linkModuleToDevSession({
      projectRoot,
      moduleId: options.moduleId,
      metroPort: options.metroPort,
      entry: options.entry,
    });
    const binding = config.modules[options.moduleId]!;
    return {
      moduleId: options.moduleId,
      action: "linked_from_workspace",
      metroPort: binding.metroPort,
      entry: binding.entry,
    };
  }

  if (options.from) {
    const fromRoot = path.resolve(options.from);
    const descriptor = loadModuleSelfDescriptor(fromRoot);
    if (!descriptor) {
      throw new CliError(
        `missing client-platform.module.jsonc in ${fromRoot}`,
        EXIT_FAIL,
      );
    }
    if (descriptor.business_module !== options.moduleId) {
      throw new CliError(
        `module id mismatch: CLI ${JSON.stringify(options.moduleId)} vs descriptor ${JSON.stringify(descriptor.business_module)} in ${fromRoot}`,
        EXIT_USAGE,
      );
    }
    if (options.dryRun) {
      return { moduleId: options.moduleId, action: "dry_run" };
    }
    const config = linkModuleToDevSession({
      projectRoot,
      moduleId: options.moduleId,
      metroPort: options.metroPort ?? descriptor.preferredMetroPort,
      entry: options.entry ?? "index",
    });
    const binding = config.modules[options.moduleId]!;
    return {
      moduleId: options.moduleId,
      action: "linked_from_descriptor",
      metroPort: binding.metroPort,
      entry: binding.entry,
    };
  }

  throw new CliError(
    `cannot register ${JSON.stringify(options.moduleId)}: no ${MODULES_DIR}/${options.moduleId}/ in shell workspace.\n` +
      `  Shell module: rn module init ${options.moduleId}\n` +
      `  External repo: rn module register ${options.moduleId} --from <businessRepo>`,
    EXIT_FAIL,
  );
}

/** Resolve module ids when user passes only `--from`. */
export function resolveRegisterModuleIds(options: {
  moduleIds: string[];
  from?: string;
}): { moduleIds: string[]; from?: string } {
  if (options.moduleIds.length > 0) {
    if (options.from && options.moduleIds.length > 1) {
      throw new CliError(
        "--from applies to a single external module; pass one moduleId or omit ids and use only --from",
        EXIT_USAGE,
      );
    }
    for (const id of options.moduleIds) {
      assertModuleId(id);
    }
    return { moduleIds: options.moduleIds, from: options.from };
  }
  if (options.from) {
    const descriptor = loadModuleSelfDescriptor(path.resolve(options.from));
    if (!descriptor) {
      throw new CliError(
        `missing client-platform.module.jsonc in ${path.resolve(options.from)}`,
        EXIT_FAIL,
      );
    }
    return {
      moduleIds: [descriptor.business_module],
      from: options.from,
    };
  }
  return { moduleIds: [] };
}

/**
 * Host-ops one job: ensure module(s) in dev-session (if requested) → publish Catalog.
 */
export async function runModuleRegisterFlow(
  options: {
    cwd: string;
    logger: CliLogger;
    moduleIds?: string[];
    from?: string;
    metroPort?: number;
    entry?: string;
    dryRun?: boolean;
    productApp?: string;
    catalogRoot?: string;
    embedOut?: string;
    noEmbed?: boolean;
  },
): Promise<void> {
  const projectRoot = path.resolve(options.cwd);
  const resolved = resolveRegisterModuleIds({
    moduleIds: options.moduleIds ?? [],
    from: options.from,
  });

  if (resolved.moduleIds.length > 0) {
    for (const moduleId of resolved.moduleIds) {
      const result = ensureModuleInDevSession({
        projectRoot,
        moduleId,
        logger: options.logger,
        metroPort: options.metroPort,
        entry: options.entry,
        from: resolved.from,
        dryRun: options.dryRun,
      });
      if (result.action === "dry_run") {
        options.logger.writeHuman(
          `register plan: ensure ${moduleId} in dev-session` +
            (resolved.from ? ` (from ${resolved.from})` : ""),
        );
        continue;
      }
      if (result.action === "already_linked") {
        options.logger.writeHuman(
          `dev-session: ${moduleId} already linked (:${result.metroPort})`,
        );
      } else {
        options.logger.writeHuman(
          `dev-session: linked ${moduleId} → Metro :${result.metroPort} (entry=${result.entry})`,
        );
      }
    }
    if (options.dryRun) {
      options.logger.writeHuman("register plan: publish catalog from dev-session");
      return;
    }
  } else if (!loadDevSessionConfig(projectRoot)) {
    throw new CliError(
      "no .rn/dev-session.jsonc — run: rn module register <id> [--from <repo>] or rn module init <id>",
      EXIT_FAIL,
    );
  }

  if (options.dryRun) {
    options.logger.writeHuman("register plan: publish catalog from dev-session");
    return;
  }

  await runCatalogPublish({
    cwd: projectRoot,
    logger: options.logger,
    productApp: options.productApp,
    catalogRoot: options.catalogRoot,
    embedOut: options.embedOut,
    noEmbed: options.noEmbed,
    actionVerb: "Registered",
  });
}

/* ──────────────────────────────────────────────────────────────────────────
 * CP intake path (#172). Business-side `rn module apply` snapshots the
 * `client-platform.module.jsonc` into a versioned intake artifact. Host-ops
 * then consumes it via `rn module register --file <intake>` — no business git
 * repo required on the shell machine, no `--from` plumbing for the main path.
 * ──────────────────────────────────────────────────────────────────────────
 */

export type IntakeArtifact = {
  schemaVersion: 1;
  kind: "module-intake";
  /** The id registered into CP. */
  moduleId: string;
  /** productApp this intake applies to (validated against host `.rn/host-profile.jsonc`). */
  productApp: string;
  /** Stable content hash of the descriptor (intake files are content-addressed). */
  descriptorDigest: string;
  /** Snapshot of the business self-descriptor (no `entry` / Metro transport). */
  descriptor: ModuleSelfDescriptor;
  /** When the intake was produced. */
  producedAt: string;
};

/**
 * Business-side: snapshot `client-platform.module.jsonc` into a CP intake
 * artifact under `.rn/intake/<moduleId>-<hash>.json`. Returns the artifact path.
 */
export function runModuleApply(options: {
  cwd: string;
  logger: CliLogger;
  /** Optional explicit business module root. Defaults to cwd. */
  fromRoot?: string;
  /** Override the output intake dir. Defaults to `<cwd>/.rn/intake`. */
  intakeDir?: string;
}): { intakePath: string; artifact: IntakeArtifact } {
  const projectRoot = path.resolve(options.cwd);
  const fromRoot = path.resolve(options.fromRoot ?? options.cwd);
  const descriptor = loadModuleSelfDescriptor(fromRoot);
  if (!descriptor) {
    throw new CliError(
      `missing client-platform.module.jsonc in ${fromRoot} — apply needs the business self-descriptor`,
      EXIT_FAIL,
    );
  }
  assertModuleId(descriptor.business_module);

  const intakeDir = path.resolve(
    projectRoot,
    options.intakeDir ?? INTAKE_DIR,
  );
  mkdirSync(intakeDir, { recursive: true });

  const digest = digestDescriptor(descriptor);
  const intakePath = path.join(intakeDir, `${descriptor.business_module}-${digest}.json`);
  const artifact: IntakeArtifact = {
    schemaVersion: 1,
    kind: "module-intake",
    moduleId: descriptor.business_module,
    productApp: descriptor.productApp ?? "tiangong",
    descriptorDigest: digest,
    descriptor,
    producedAt: new Date().toISOString(),
  };
  writeFileSync(intakePath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  options.logger.writeHuman(
    `intake: ${descriptor.business_module} → ${intakePath} (digest=${digest.slice(0, 12)})`,
  );
  return { intakePath, artifact };
}

/**
 * Host-ops: register a module from a CP intake artifact. Does not require the
 * business repo on the shell machine; only writes the dev-session draft and
 * publishes to Catalog/CP.
 */
export async function runModuleRegisterFromIntake(options: {
  cwd: string;
  logger: CliLogger;
  /** Path to the intake artifact (`.rn/intake/<id>-<hash>.json`). */
  intakePath: string;
  productApp?: string;
  catalogRoot?: string;
  embedOut?: string;
  noEmbed?: boolean;
  dryRun?: boolean;
}): Promise<void> {
  const projectRoot = path.resolve(options.cwd);
  const intakeFile = path.resolve(options.intakePath);
  if (!existsSync(intakeFile)) {
    throw new CliError(
      `intake not found: ${intakeFile}`,
      EXIT_FAIL,
    );
  }
  const raw = readFileSync(intakeFile, "utf8");
  const parsed = JSON.parse(raw) as Partial<IntakeArtifact>;
  if (parsed.kind !== "module-intake" || parsed.schemaVersion !== 1) {
    throw new CliError(
      `intake schema mismatch — expected kind=module-intake schemaVersion=1, got ${JSON.stringify({
        kind: parsed.kind,
        schemaVersion: parsed.schemaVersion,
      })}`,
      EXIT_USAGE,
    );
  }
  if (!parsed.moduleId || !parsed.descriptor) {
    throw new CliError("intake missing moduleId or descriptor", EXIT_USAGE);
  }
  assertModuleId(parsed.moduleId);

  if (options.productApp && parsed.productApp && parsed.productApp !== options.productApp) {
    throw new CliError(
      `intake productApp ${JSON.stringify(parsed.productApp)} does not match host --product-app ${JSON.stringify(options.productApp)}`,
      EXIT_USAGE,
    );
  }

  if (options.dryRun) {
    const digest = parsed.descriptorDigest ?? "unknown";
    options.logger.writeHuman(
      `register plan: intake ${parsed.moduleId} (${digest.slice(0, 12)}) → dev-session + catalog`,
    );
    return;
  }

  // Link into dev-session from intake (no business repo needed).
  const config = linkModuleToDevSession({
    projectRoot,
    moduleId: parsed.moduleId,
    metroPort: parsed.descriptor.preferredMetroPort,
    entry: "index",
  });
  options.logger.writeHuman(
    `dev-session: linked ${parsed.moduleId} from intake → Metro :${config.modules[parsed.moduleId]?.metroPort} (entry=index)`,
  );

  // Tag the dev-session with the intake digest so phones can prove freshness.
  const tagged = loadDevSessionConfig(projectRoot) ?? config;
  const merged: DevSessionConfigLike = {
    ...tagged,
    lastIntakeDigest: parsed.descriptorDigest ?? undefined,
  };
  writeDevSessionConfig(projectRoot, merged as Parameters<typeof writeDevSessionConfig>[1]);

  await runCatalogPublish({
    cwd: projectRoot,
    logger: options.logger,
    productApp: options.productApp ?? parsed.productApp,
    catalogRoot: options.catalogRoot,
    embedOut: options.embedOut,
    noEmbed: options.noEmbed,
    actionVerb: "Registered",
  });
}

/** Stable hash of the descriptor fields that CP cares about. */
function digestDescriptor(descriptor: ModuleSelfDescriptor): string {
  const canonical = {
    schemaVersion: descriptor.schemaVersion,
    business_module: descriptor.business_module,
    productApp: descriptor.productApp,
    preferredMetroPort: descriptor.preferredMetroPort,
  };
  return createHash("sha256")
    .update(JSON.stringify(canonical))
    .digest("hex");
}

/** Local alias to avoid pulling DevSessionConfig from rn-core (keeps the import surface tight). */
type DevSessionConfigLike = Parameters<typeof writeDevSessionConfig>[1];
