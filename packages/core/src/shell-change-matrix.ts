/**
 * Shell-change → JS revalidate / rebuild matrix (ADR-008 P0.5).
 * Machine-readable rules so promotion can block without wiki-only policy.
 */
import type { RuntimeFingerprint } from "./types.js";
import { fingerprintsEqual } from "./fingerprint.js";

export type ShellChangeKind =
  | "rn_exact_tuple"
  | "native_abi"
  | "capability_set"
  | "hbc_bytecode"
  | "cosmetic";

export type JsRevalidateAction =
  | "none"
  | "revalidate_fingerprint"
  | "rebuild_js"
  | "block_promotion";

export type ShellChangeRule = {
  change: string;
  action: JsRevalidateAction;
  summary: string;
};

/** Default enterprise matrix — hosts may extend, not silently weaken. */
export const DEFAULT_SHELL_CHANGE_MATRIX: readonly ShellChangeRule[] = [
  {
    change: "cosmetic",
    action: "none",
    summary: "Non-ABI shell cosmetics do not force JS rebuild",
  },
  {
    change: "rn_exact_tuple",
    action: "rebuild_js",
    summary: "RN exact tuple change invalidates prior JS train artifacts",
  },
  {
    change: "native_abi",
    action: "rebuild_js",
    summary: "Native ABI / Codegen surface change requires JS rebuild + gate",
  },
  {
    change: "capability_set",
    action: "revalidate_fingerprint",
    summary: "Capability shrink/expand must re-run selector against candidates",
  },
  {
    change: "hbc_bytecode",
    action: "block_promotion",
    summary: "HBC bytecode mismatch blocks promotion until rebuild",
  },
];

export function resolveShellChangeAction(
  change: string,
  matrix: readonly ShellChangeRule[] = DEFAULT_SHELL_CHANGE_MATRIX,
): ShellChangeRule {
  const hit = matrix.find((r) => r.change === change);
  if (!hit) {
    return {
      change,
      action: "block_promotion",
      summary: `unknown shell change "${change}" — fail closed`,
    };
  }
  return hit;
}

/** True when CI / control plane must refuse promotion. */
export function shouldBlockPromotion(action: JsRevalidateAction): boolean {
  return action === "block_promotion" || action === "rebuild_js";
}

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value !== null && typeof value === "object") {
    const src = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(src).sort()) out[key] = stable(src[key]);
    return out;
  }
  return value;
}

function engineAsideFromBytecode(engine: Record<string, unknown>): string {
  const copy = { ...engine };
  delete copy.hbcBytecodeVersion;
  return JSON.stringify(stable(copy));
}

/**
 * Which matrix rule applies when a business bundle's fingerprint is compared
 * to the shell it would run on. `null` means the fingerprints match and no
 * rule fires. Capability-lock drift maps to `capability_set`, which does not
 * block promotion.
 */
export function classifyShellChange(
  bundle: RuntimeFingerprint,
  shell: RuntimeFingerprint,
): ShellChangeRule | null {
  if (fingerprintsEqual(bundle, shell)) {
    const bundleLocks = JSON.stringify(
      [...(bundle.officialCapabilityNativeLocks ?? [])].sort(),
    );
    const shellLocks = JSON.stringify(
      [...(shell.officialCapabilityNativeLocks ?? [])].sort(),
    );
    if (bundleLocks !== shellLocks) {
      return resolveShellChangeAction("capability_set");
    }
    return null;
  }

  const bundleEngine = bundle.engine as Record<string, unknown>;
  const shellEngine = shell.engine as Record<string, unknown>;
  if (bundleEngine.hbcBytecodeVersion !== shellEngine.hbcBytecodeVersion) {
    return resolveShellChangeAction("hbc_bytecode");
  }
  if (
    engineAsideFromBytecode(bundleEngine) !==
    engineAsideFromBytecode(shellEngine)
  ) {
    return resolveShellChangeAction("rn_exact_tuple");
  }
  if (bundle.nativeAbiSurfaceDigest !== shell.nativeAbiSurfaceDigest) {
    return resolveShellChangeAction("native_abi");
  }
  return resolveShellChangeAction("fingerprint");
}
