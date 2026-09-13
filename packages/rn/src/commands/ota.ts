/**
 * `rn ota install` (#265) — install the native OTA adapter into an EXISTING project.
 *
 * Why this needs a verb of its own:
 *
 *  - `rn init` already installs the adapter, but init refuses a non-empty target,
 *    so it cannot serve the projects that need this most — the ones already on
 *    disk that are missing the adapter (the F04/F25 population).
 *  - `rn shell refresh` was the alternative, and it was rejected. That command's
 *    advertised contract is "idempotent regeneration from the current template,
 *    no security-relevant arguments". Baking a device trust root is the opposite:
 *    an explicit, key-bearing write. Folding it in would make one command name
 *    mean two very different things, which is exactly the POLA failure the
 *    engineering principles warn about.
 *  - The adapter is host-shape-orthogonal: greenfield, brownfield and `--pure`
 *    projects all need it. The `shell` noun denotes the industrial shell
 *    (topology B, ADR-005), so hanging the install there would leave brownfield
 *    without a defensible entry point and break ADR-016's GF/BF symmetry.
 *
 * The install itself is NOT reimplemented here. This module is a caller of
 * `installNativeOtaAdapter` (#262), so detection, installation and `rn init` all
 * share one definition of what the adapter is — which is what makes the
 * "the CLI says ready but the native side is missing" class (G2) impossible.
 */
import path from "node:path";

import { CliError, EXIT_FAIL } from "../errors.js";
import { nativeOtaAdapterPresent } from "../industrial-shell.js";
import type { CliLogger } from "../logger.js";
import { installNativeOtaAdapter } from "../native-ota-adapter.js";

export function runOtaInstall(options: {
  cwd: string;
  logger: CliLogger;
  /** Root-CA public key (hex, 64) — cert mode, the ADR-024 default. */
  rcaPubkeyHex?: string;
  /** Legacy single signing key (hex, 64); used only when rcaPubkeyHex is absent. */
  pubkeyHex?: string;
  dryRun?: boolean;
}): void {
  const projectRoot = path.resolve(options.cwd);
  const dryRun = Boolean(options.dryRun);

  // The installer validates the key BEFORE its first write, so a missing or
  // malformed key fails here with nothing touched on disk (ADR-024 stage-3:
  // never silently default a trust root).
  const result = installNativeOtaAdapter({
    projectRoot,
    rcaPubkeyHex: options.rcaPubkeyHex,
    pubkeyHex: options.pubkeyHex,
    dryRun,
  });

  const adapterPresent = nativeOtaAdapterPresent(projectRoot);

  // Claim/outcome guard: an install that returns without the adapter on disk
  // would reproduce the "ready but missing" bug this seam exists to kill, so it
  // is a hard failure rather than a warning. (Dry-run writes nothing by design.)
  if (!dryRun && !adapterPresent) {
    throw new CliError(
      "native OTA adapter: install reported success but android/…/ota/ is not present — " +
        "the adapter and its detector disagree (see #262/#265)",
      EXIT_FAIL,
    );
  }

  if (options.logger.json) {
    options.logger.writeMachine({
      ok: true,
      dryRun,
      projectRoot,
      appId: result.appId,
      steps: result.steps,
      written: result.written,
      bakedTrustRoot: result.bakedTrustRoot,
      adapterPresent,
    });
    return;
  }

  options.logger.writeHuman(
    `native OTA adapter → ${result.appId ? `android/…/${result.appId}/ota/` : "(android applicationId not found)"}`,
  );
  for (const step of result.steps) {
    options.logger.writeHuman(`  ${step}`);
  }
  if (dryRun) {
    options.logger.writeHuman(
      "✅ plan only — nothing written (rerun without --dry-run to apply)",
    );
    return;
  }
  options.logger.writeHuman(
    result.bakedTrustRoot
      ? `✅ native OTA adapter installed (trust root baked) — ${result.written.length} file(s) written`
      : `✅ native OTA adapter installed — ${result.written.length} file(s) written`,
  );
  options.logger.writeHuman(
    "  next: rebuild the host so the APK carries the adapter and the baked trust root",
  );
}
