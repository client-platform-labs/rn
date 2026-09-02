/**
 * Map E — shell↔bundle / bundle↔bundle dependency contracts (ADR-007/008).
 *
 * Architecture:
 * - Shell↔bundle = capability closure (delegates to gateJsCandidate / fingerprint).
 * - Bundle↔bundle = manifest edges (hard contract · peer coexistence · soft hint).
 * - Business-module digest hard-pins are discouraged (soft/hint only).
 *
 * Three fail-closed gates: publish · promote · runtime composition.
 */
import { gateJsCandidate } from "./selector.js";
import type {
  GateJsCandidateResult,
  HostSelectorContext,
  JsUpdateCandidate,
} from "./types.js";

export type DependencyStrength = "hard" | "peer" | "soft";

export type BundleDependencyKind = "contract" | "coexistence" | "hint";

/**
 * Declared dependency edge from one JS update to another artifact or module range.
 */
export type BundleDependencyEdge = {
  from_update_id: string;
  from_module: string;
  strength: DependencyStrength;
  kind: BundleDependencyKind;
  /** Contract package update_id (shared-contract). */
  to_update_id?: string;
  /** Peer: other business_module on the same host. */
  to_module?: string;
  /** Peer/soft range, e.g. ">=3.0.0" (minimum only in v1). */
  to_range?: string;
  reason?: string;
};

/** Registry row used by publish/promote gates (CP projection). */
export type DependencyRegistryEntry = {
  update_id: string;
  business_module: string;
  /** Semver-ish label for peer range checks (e.g. "3.0.0"). */
  version_label: string;
};

export type DependencyGateCheck = {
  gate: "publish" | "promote" | "runtime";
  strength: DependencyStrength;
  pass: boolean;
  /** Soft failure still pass=true with warn. */
  warn?: boolean;
  code: string;
  message: string;
};

export type DependencyGateResult =
  | { ok: true; checks: DependencyGateCheck[] }
  | { ok: false; checks: DependencyGateCheck[] };

function hardFailed(checks: DependencyGateCheck[]): boolean {
  return checks.some((c) => c.strength === "hard" && !c.pass);
}

function parseMinVersion(range: string | undefined): string | null {
  if (!range) return null;
  const m = range.trim().match(/^>=?\s*v?(\d+\.\d+\.\d+)/);
  return m?.[1] ?? null;
}

/** Compare dotted semver triples; missing parts treated as 0. */
export function versionGte(label: string, min: string): boolean {
  const take = (s: string) => {
    const m = s.match(/(\d+)\.(\d+)\.(\d+)/);
    return m
      ? [Number(m[1]), Number(m[2]), Number(m[3])]
      : ([0, 0, 0] as const);
  };
  const a = take(label);
  const b = take(min);
  for (let i = 0; i < 3; i++) {
    if (a[i]! > b[i]!) return true;
    if (a[i]! < b[i]!) return false;
  }
  return true;
}

/**
 * Publish gate: hard contract targets must exist in registry.
 * Soft misses → warn only. Peer edges are deferred to promote/runtime.
 */
export function evaluatePublishDependencyGate(input: {
  candidate_update_id: string;
  dependencies: readonly BundleDependencyEdge[];
  registry: readonly DependencyRegistryEntry[];
}): DependencyGateResult {
  const checks: DependencyGateCheck[] = [];
  const ids = new Set(input.registry.map((r) => r.update_id));
  const edges = input.dependencies.filter(
    (d) => d.from_update_id === input.candidate_update_id,
  );

  for (const edge of edges) {
    if (edge.kind === "coexistence" || edge.to_module) {
      checks.push({
        gate: "publish",
        strength: edge.strength,
        pass: true,
        code: "PEER_DEFERRED",
        message: `peer ${edge.to_module ?? "?"} deferred to promote/runtime`,
      });
      continue;
    }

    if (!edge.to_update_id) {
      const pass = edge.strength !== "hard";
      checks.push({
        gate: "publish",
        strength: edge.strength,
        pass,
        warn: edge.strength === "soft",
        code: "EDGE_INCOMPLETE",
        message: edge.reason ?? "dependency edge missing to_update_id",
      });
      continue;
    }

    const found = ids.has(edge.to_update_id);
    if (edge.strength === "hard") {
      checks.push({
        gate: "publish",
        strength: "hard",
        pass: found,
        code: found ? "CONTRACT_PRESENT" : "CONTRACT_MISSING",
        message: found
          ? `contract ${edge.to_update_id} present in registry`
          : `hard contract missing: ${edge.to_update_id}${edge.reason ? ` (${edge.reason})` : ""}`,
      });
    } else {
      checks.push({
        gate: "publish",
        strength: edge.strength,
        pass: true,
        warn: !found,
        code: found ? "CONTRACT_PRESENT" : "CONTRACT_SOFT_MISSING",
        message: found
          ? `contract ${edge.to_update_id} present`
          : `soft: contract ${edge.to_update_id} not in registry`,
      });
    }
  }

  if (edges.length === 0) {
    checks.push({
      gate: "publish",
      strength: "soft",
      pass: true,
      code: "NO_EDGES",
      message: "no bundle↔bundle edges declared",
    });
  }

  return hardFailed(checks) ? { ok: false, checks } : { ok: true, checks };
}

/**
 * Promote gate: shell↔bundle via gateJsCandidate + peer resolvable against
 * a proposed same-host composition (module → registry entry).
 */
export function evaluatePromoteDependencyGate(input: {
  candidate: JsUpdateCandidate;
  host: HostSelectorContext;
  dependencies: readonly BundleDependencyEdge[];
  /** Other modules expected on the same host after promote (peer check). */
  composition?: Readonly<Record<string, DependencyRegistryEntry | undefined>>;
  /** When true, warn on hint edges that pin another business_module digest. */
  discourageBusinessDigestPin?: boolean;
}): DependencyGateResult {
  const checks: DependencyGateCheck[] = [];
  const selector = gateJsCandidate(input.candidate, input.host);
  if (!selector.ok) {
    checks.push({
      gate: "promote",
      strength: "hard",
      pass: false,
      code: selector.reason,
      message: `shell↔bundle: ${selector.detail}`,
    });
  } else {
    checks.push({
      gate: "promote",
      strength: "hard",
      pass: true,
      code: "SHELL_BUNDLE_OK",
      message: "shell↔bundle capability/fingerprint closed",
    });
  }

  const edges = input.dependencies.filter(
    (d) => d.from_update_id === input.candidate.update_id,
  );

  for (const edge of edges) {
    if (edge.to_module) {
      const peer = input.composition?.[edge.to_module];
      const min = parseMinVersion(edge.to_range);
      let ok = !!peer;
      let detail = peer
        ? `peer ${edge.to_module} → ${peer.update_id} (${peer.version_label})`
        : `peer module ${edge.to_module} absent from composition`;
      if (ok && min && peer && !versionGte(peer.version_label, min)) {
        ok = false;
        detail = `peer ${edge.to_module} ${peer.version_label} < ${min}`;
      }
      if (edge.strength === "hard" || edge.strength === "peer") {
        checks.push({
          gate: "promote",
          strength: edge.strength === "hard" ? "hard" : "peer",
          pass: ok,
          code: ok ? "PEER_OK" : "PEER_FAIL",
          message: `${detail}${edge.reason ? ` — ${edge.reason}` : ""}`,
        });
      } else {
        checks.push({
          gate: "promote",
          strength: "soft",
          pass: true,
          warn: !ok,
          code: ok ? "PEER_OK" : "PEER_SOFT_FAIL",
          message: detail,
        });
      }
      continue;
    }

    if (
      input.discourageBusinessDigestPin !== false &&
      edge.kind === "hint" &&
      edge.to_update_id &&
      edge.strength === "soft"
    ) {
      checks.push({
        gate: "promote",
        strength: "soft",
        pass: true,
        warn: true,
        code: "DIGEST_PIN_DISCOURAGED",
        message:
          edge.reason ??
          `discouraged: business digest pin to ${edge.to_update_id}`,
      });
    }
  }

  return hardFailed(checks) ||
    checks.some((c) => c.strength === "peer" && !c.pass)
    ? { ok: false, checks }
    : { ok: true, checks };
}

/**
 * Runtime composition gate: every module candidate must pass shell selector;
 * peer edges must be satisfied by the live composition map.
 */
export function evaluateRuntimeCompositionGate(input: {
  host: HostSelectorContext;
  /** Live modules on device: module id → candidate */
  composition: Readonly<Record<string, JsUpdateCandidate | undefined>>;
  /** version labels for peer range (update_id → label) */
  version_labels: Readonly<Record<string, string>>;
  dependencies: readonly BundleDependencyEdge[];
}): DependencyGateResult {
  const checks: DependencyGateCheck[] = [];

  for (const [mod, candidate] of Object.entries(input.composition)) {
    if (!candidate) continue;
    const selector: GateJsCandidateResult = gateJsCandidate(
      candidate,
      input.host,
    );
    checks.push({
      gate: "runtime",
      strength: "hard",
      pass: selector.ok,
      code: selector.ok ? "LOAD_OK" : (selector as { reason: string }).reason,
      message: selector.ok
        ? `load ${mod} update_id=${candidate.update_id}`
        : `refuse load ${mod}: ${selector.ok === false ? selector.detail : ""}`,
    });
  }

  for (const candidate of Object.values(input.composition)) {
    if (!candidate) continue;
    const edges = input.dependencies.filter(
      (d) => d.from_update_id === candidate.update_id && d.to_module,
    );
    for (const edge of edges) {
      const peerCand = input.composition[edge.to_module!];
      const label =
        (peerCand && input.version_labels[peerCand.update_id]) ||
        peerCand?.update_id ||
        "";
      const min = parseMinVersion(edge.to_range);
      let ok = !!peerCand;
      let message = ok
        ? `runtime peer ${edge.to_module} → ${peerCand!.update_id}`
        : `runtime peer missing: ${edge.to_module}`;
      if (ok && min && !versionGte(label, min)) {
        ok = false;
        message = `runtime peer ${edge.to_module} label ${label} < ${min}`;
      }
      const blocking = edge.strength === "hard" || edge.strength === "peer";
      checks.push({
        gate: "runtime",
        strength: edge.strength,
        pass: blocking ? ok : true,
        warn: !blocking && !ok,
        code: ok ? "PEER_OK" : "PEER_FAIL",
        message,
      });
    }
  }

  return hardFailed(checks) ||
    checks.some((c) => c.strength === "peer" && !c.pass)
    ? { ok: false, checks }
    : { ok: true, checks };
}
