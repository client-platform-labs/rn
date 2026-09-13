#!/usr/bin/env node
/**
 * Thin alias for the native OTA adapter installer (#262).
 *
 * The installation itself now lives in `packages/rn/src/native-ota-adapter.ts`
 * and is called by `rn init`, so `rn init` can produce a device-OTA-ready
 * project instead of printing a hint telling the operator to run this script.
 * This entry point is kept because runbooks and the operations handbook still
 * reference it, and because a standalone re-run on an existing project is a
 * legitimate operation. It forwards to the module and prints the same JSON
 * shape it always did.
 *
 * Usage:
 *   node scripts/apply-ota-to-project.mjs <PROJECT_ROOT> \
 *     --rca-pubkey-hex <64hex>   # cert mode (ADR-024 default)
 *     --pubkey-hex <64hex>       # legacy single key
 *     [--dry-run]
 *
 * Requires a built package (`pnpm build`) — it imports packages/rn/dist.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");
const { installNativeOtaAdapter } = await import(
  path.join(repoRoot, "packages/rn/dist/native-ota-adapter.js")
);

const projectRoot = path.resolve(process.argv[2] ?? "");
const dryRun = process.argv.includes("--dry-run");
const flagValue = (name) => {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1].trim() : "";
};

try {
  const result = installNativeOtaAdapter({
    projectRoot,
    rcaPubkeyHex: flagValue("--rca-pubkey-hex"),
    pubkeyHex: flagValue("--pubkey-hex"),
    dryRun,
  });
  console.log(
    JSON.stringify(
      { ok: true, app_id: result.appId, steps: result.steps },
      null,
      2,
    ),
  );
} catch (err) {
  console.error(
    JSON.stringify({ ok: false, errors: [err?.message ?? String(err)] }, null, 2),
  );
  process.exit(err?.exitCode ?? 1);
}
