/**
 * Map E — wire rn-core dependency gates into delivery promote / publish.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import {
  defaultGreenfieldFingerprint,
  evaluatePromoteDependencyGate,
  evaluatePublishDependencyGate,
  evaluateRuntimeCompositionGate,
  type BundleDependencyEdge,
  type DependencyRegistryEntry,
  type HostSelectorContext,
  type JsUpdateCandidate,
} from "@client-platform/rn-core";

import { loadRegistry } from "./candidate-store.js";
import {
  loadDependencyManifest,
  type DependencyManifestStore,
} from "./dependency-store.js";
import type { JsUpdateSidecar } from "./js-update-sidecar.js";
import type { CandidateMetadata } from "./types.js";
import { DeliveryError, EXIT_FAIL } from "./util.js";

function readSidecar(
  projectRoot: string,
  candidate: CandidateMetadata,
): JsUpdateSidecar | null {
  const sidecarPath =
    candidate.sidecar_path ??
    path.join(
      projectRoot,
      ".rn/delivery/updates",
      candidate.business_module ?? "main",
      `${candidate.update_id}.json`,
    );
  if (!existsSync(sidecarPath)) return null;
  try {
    return JSON.parse(readFileSync(sidecarPath, "utf8")) as JsUpdateSidecar;
  } catch {
    return null;
  }
}

function registryEntries(
  projectRoot: string,
  store: DependencyManifestStore,
): DependencyRegistryEntry[] {
  const registry = loadRegistry(projectRoot);
  const out: DependencyRegistryEntry[] = [];
  const seen = new Set<string>();
  for (const c of [...registry.production, ...registry.staging]) {
    if (c.artifact_kind !== "js-update" || !c.update_id) continue;
    if (seen.has(c.update_id)) continue;
    seen.add(c.update_id);
    out.push({
      update_id: c.update_id,
      business_module: c.business_module ?? "",
      version_label: store.version_labels[c.update_id] ?? c.update_id,
    });
  }
  // Contract packages may exist only in version_labels + edges (not yet staged).
  for (const [update_id, version_label] of Object.entries(store.version_labels)) {
    if (seen.has(update_id)) continue;
    out.push({
      update_id,
      business_module: "shared-contract",
      version_label,
    });
  }
  return out;
}

function compositionMap(
  projectRoot: string,
  store: DependencyManifestStore,
  selfModule?: string,
): Record<string, DependencyRegistryEntry | undefined> {
  const registry = loadRegistry(projectRoot);
  const map: Record<string, DependencyRegistryEntry | undefined> = {};
  for (const c of [...registry.production, ...registry.staging]) {
    if (c.artifact_kind !== "js-update" || !c.update_id || !c.business_module) {
      continue;
    }
    if (selfModule && c.business_module === selfModule) continue;
    if (map[c.business_module]) continue;
    map[c.business_module] = {
      update_id: c.update_id,
      business_module: c.business_module,
      version_label: store.version_labels[c.update_id] ?? c.update_id,
    };
  }
  return map;
}

function toJsCandidate(
  candidate: CandidateMetadata,
  sidecar: JsUpdateSidecar | null,
): JsUpdateCandidate {
  if (sidecar?.candidate) return sidecar.candidate;
  const fp =
    sidecar?.host_context.runtime_fingerprint ??
    defaultGreenfieldFingerprint("0.87.0");
  return {
    business_module: candidate.business_module ?? "main",
    update_id: candidate.update_id ?? candidate.digest.slice(0, 16),
    runtime_fingerprint: fp,
    hbcBytecodeVersion: fp.hbcBytecodeVersion,
    required_capabilities: [],
    target_artifact_lines: [
      candidate.artifact_line ??
        sidecar?.host_context.artifact_line ??
        "pure-rn-greenfield",
    ],
    release_gate: "js-standard",
    channel: candidate.channel,
  };
}

function toHostContext(
  candidate: CandidateMetadata,
  sidecar: JsUpdateSidecar | null,
  store: DependencyManifestStore,
): HostSelectorContext {
  const fp =
    sidecar?.host_context.runtime_fingerprint ??
    defaultGreenfieldFingerprint("0.87.0");
  return {
    runtime_fingerprint: fp,
    capability_set: store.host_capability_set ?? [],
    artifact_line:
      candidate.artifact_line ??
      sidecar?.host_context.artifact_line ??
      "pure-rn-greenfield",
    hbcBytecodeVersion:
      sidecar?.host_context.hbcBytecodeVersion ?? fp.hbcBytecodeVersion,
    channel_js_allowed: true,
  };
}

function edgesFor(
  store: DependencyManifestStore,
  updateId: string,
): BundleDependencyEdge[] {
  return store.dependencies.filter((d) => d.from_update_id === updateId);
}

/** Fail-closed publish: hard contract targets must be listed (registry or labels). */
export function assertDependencyAllowsPublish(
  projectRoot: string,
  candidate: CandidateMetadata,
): void {
  if (candidate.artifact_kind !== "js-update") return;
  const updateId = candidate.update_id;
  if (!updateId) return;

  const store = loadDependencyManifest(projectRoot);
  const edges = edgesFor(store, updateId);
  if (edges.length === 0 && !store.require_declared) return;

  const gate = evaluatePublishDependencyGate({
    candidate_update_id: updateId,
    dependencies: store.dependencies,
    registry: registryEntries(projectRoot, store),
  });
  if (!gate.ok) {
    const first = gate.checks.find((c) => !c.pass);
    throw new DeliveryError(
      `${first?.message ?? "dependency publish gate failed"} — fix dependency-manifest before release`,
      EXIT_FAIL,
    );
  }
}

/** Fail-closed promote: shell↔bundle + peer composition. */
export function assertDependencyAllowsPromote(
  projectRoot: string,
  candidate: CandidateMetadata,
): void {
  if (candidate.artifact_kind !== "js-update") return;
  const updateId = candidate.update_id;
  if (!updateId) return;

  const store = loadDependencyManifest(projectRoot);
  const edges = edgesFor(store, updateId);
  if (edges.length === 0 && !store.require_declared) return;

  const sidecar = readSidecar(projectRoot, candidate);
  const jsCandidate = toJsCandidate(candidate, sidecar);
  const host = toHostContext(candidate, sidecar, store);

  const pub = evaluatePublishDependencyGate({
    candidate_update_id: updateId,
    dependencies: store.dependencies,
    registry: registryEntries(projectRoot, store),
  });
  if (!pub.ok) {
    const first = pub.checks.find((c) => !c.pass);
    throw new DeliveryError(
      `${first?.message ?? "dependency publish gate failed"} — resolve deps before promote`,
      EXIT_FAIL,
    );
  }

  const gate = evaluatePromoteDependencyGate({
    candidate: jsCandidate,
    host,
    dependencies: store.dependencies,
    composition: compositionMap(
      projectRoot,
      store,
      candidate.business_module,
    ),
  });

  if (!gate.ok) {
    const first = gate.checks.find((c) => !c.pass);
    throw new DeliveryError(
      `${first?.message ?? "dependency promote gate failed"} — resolve deps before promote`,
      EXIT_FAIL,
    );
  }
}

/**
 * Optional runtime composition check (script / CP hook).
 * Pass module → JsUpdateCandidate map built by caller or from sidecars.
 */
export function assertDependencyAllowsRuntimeComposition(
  projectRoot: string,
  composition: Readonly<Record<string, JsUpdateCandidate | undefined>>,
  host: HostSelectorContext,
): void {
  const store = loadDependencyManifest(projectRoot);
  if (store.dependencies.length === 0) return;

  const gate = evaluateRuntimeCompositionGate({
    host,
    composition,
    version_labels: store.version_labels,
    dependencies: store.dependencies,
  });
  if (!gate.ok) {
    const first = gate.checks.find((c) => !c.pass);
    throw new DeliveryError(
      `${first?.message ?? "dependency runtime gate failed"} — refuse load composition`,
      EXIT_FAIL,
    );
  }
}
