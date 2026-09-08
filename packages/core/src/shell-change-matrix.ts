/**
 * Shell-change → JS revalidate / rebuild matrix (ADR-008 P0.5).
 * Machine-readable rules so promotion can block without wiki-only policy.
 */
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
  change: ShellChangeKind;
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
  change: ShellChangeKind,
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
