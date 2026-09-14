import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import {
  attachSbomSlot,
  supplyChainTrainForKind,
} from "./candidate.js";
import { writeLastCandidate } from "./candidate-store.js";
import {
  resolveRuntimeFingerprint,
  writeJsUpdateSidecar,
} from "./js-update-sidecar.js";
import { sealCandidateSignature } from "./signature.js";
import { pickCandidate } from "./release-shared.js";
import type {
  CandidateMetadata,
  SbomEvidence,
} from "./types.js";
import {
  DeliveryError,
  EXIT_FAIL,
  loadManifestOrEmpty,
  resolveProjectRoot,
} from "./util.js";

function readRnVersion(projectRoot: string): string {
  try {
    const pkg = JSON.parse(
      readFileSync(`${projectRoot}/package.json`, "utf8"),
    ) as { dependencies?: Record<string, string> };
    const raw = pkg.dependencies?.["react-native"] ?? "0.87.0";
    const match = raw.match(/(\d+\.\d+\.\d+)/);
    return match?.[1] ?? "0.87.0";
  } catch {
    return "0.87.0";
  }
}

/**
 * Minimal CycloneDX 1.4 SBOM document for sign-stage auto-attach (T2).
 * Real evidence — declares the artifact identity + timestamp — instead of a
 * `stub` placeholder. Enterprises may still attach their own richer SBOM;
 * sign preserves it (see {@link resolveSbomEvidence}).
 */
export function buildMinimalSbomEvidence(candidate: {
  release_id: string;
  business_module?: string;
  artifact_kind: string;
  digest: string;
}): SbomEvidence {
  const doc = {
    bomFormat: "CycloneDX",
    specVersion: "1.4",
    serialNumber: `urn:client-platform:sbom:${candidate.digest}`,
    version: 1,
    metadata: {
      timestamp: new Date().toISOString(),
      component: {
        type: "application",
        name: candidate.business_module ?? candidate.release_id,
        version: candidate.release_id,
        "bom-ref": candidate.digest,
      },
    },
  };
  const document = JSON.stringify(doc);
  return {
    artifact_kind: candidate.artifact_kind as SbomEvidence["artifact_kind"],
    format: "cyclonedx-json",
    digest: createHash("sha256").update(document).digest("hex"),
    document,
  };
}

/**
 * The SBOM evidence to attach at sign: preserve a provided real SBOM
 * (cyclonedx-json / spdx-json), only fill an empty or stub slot with a
 * generated minimal CycloneDX.
 */
export function resolveSbomEvidence(
  candidate: {
    release_id: string;
    business_module?: string;
    artifact_kind: string;
    digest: string;
  },
  existing: SbomEvidence | undefined,
): SbomEvidence {
  if (existing && existing.format !== "stub") return existing;
  return buildMinimalSbomEvidence(candidate);
}

/**
 * M5 thin sign: digest-seal signature + real minimal SBOM slot (no HSM).
 * Real backends replace this stage without changing metadata shape.
 */
export async function runSign(options: {
  cwd: string;
  candidatePath?: string;
}): Promise<void> {
  const projectRoot = resolveProjectRoot(options.cwd);
  const candidate = pickCandidate(projectRoot, undefined, options.candidatePath);

  if (candidate.profile !== "release") {
    throw new DeliveryError(
      "sign requires release-profile candidate",
      EXIT_FAIL,
    );
  }

  const train = supplyChainTrainForKind(candidate.artifact_kind);
  const baseSupply = candidate.supply_chain ?? { host: {}, js_update: {} };
  const existing =
    train === "host" ? baseSupply.host?.sbom : baseSupply.js_update?.sbom;
  // T2: preserve a provided real SBOM; only fill an empty / stub slot with a
  // generated minimal CycloneDX. Never clobber enterprise-supplied evidence.
  const supply = attachSbomSlot(
    baseSupply,
    train,
    resolveSbomEvidence(candidate, existing),
  );

  const sealed = sealCandidateSignature({
    release_id: candidate.release_id,
    digest: candidate.digest,
    artifact_kind: candidate.artifact_kind,
  });

  const leafCert = process.env.RN_DELIVERY_LEAF_CERT;
  const leafPubHex = process.env.RN_DELIVERY_LEAF_PUBKEY_HEX;
  const legacySign = process.env.RN_DELIVERY_LEGACY_SIGN === "1";
  // ADR-024 stage-3: cert chain is the default sign path. A missing leaf cert
  // is a hard failure unless the legacy single-key path is explicitly enabled
  // (sunset window escape hatch).
  if (!legacySign && (!leafCert || !leafPubHex)) {
    throw new DeliveryError(
      "sign requires the cert chain — set RN_DELIVERY_LEAF_CERT (PEM) + RN_DELIVERY_LEAF_PUBKEY_HEX " +
        "(run: ship keygen, then sign with the leaf key). Set RN_DELIVERY_LEGACY_SIGN=1 to use the legacy single-key path.",
      EXIT_FAIL,
    );
  }

  const signed: CandidateMetadata = {
    ...candidate,
    stage: "sign",
    signature: sealed.signature,
    supply_chain: supply,
    // ADR-024 (D3) stage-1: attach the leaf cert chain when provided via env
    // (RN_DELIVERY_LEAF_CERT PEM + RN_DELIVERY_LEAF_PUBKEY_HEX). Devices verify
    // the seal under the baked root-CA via this chain.
    cert_chain:
      leafCert && leafPubHex
        ? {
            leafCertPem: leafCert,
            leafPubkeyHex: leafPubHex,
          }
        : undefined,
  };

  if (
    candidate.artifact_kind === "js-update" &&
    candidate.path &&
    candidate.business_module
  ) {
    const { manifest } = loadManifestOrEmpty(projectRoot);
    const fingerprint = resolveRuntimeFingerprint(
      manifest,
      readRnVersion(projectRoot),
    );
    signed.sidecar_path = writeJsUpdateSidecar(projectRoot, {
      metadata: signed,
      bundlePath: candidate.path,
      fingerprint,
    });
  }

  writeLastCandidate(projectRoot, signed);
  console.log(
    JSON.stringify(
      { ok: true, algorithm: sealed.algorithm, candidate: signed },
      null,
      2,
    ),
  );
}
