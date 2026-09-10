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
import type { CandidateMetadata } from "./types.js";
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
 * M5 thin sign: digest-seal signature + stub SBOM slot (no HSM).
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
  const supply = attachSbomSlot(
    candidate.supply_chain ?? { host: {}, js_update: {} },
    train,
    {
      artifact_kind: candidate.artifact_kind,
      format: "stub",
      digest: candidate.digest,
    },
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
