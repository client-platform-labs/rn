import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import {
  evaluateReleaseSourceHygiene,
  releaseSourceHygieneOk,
} from "@client-platform/rn-core";

import { validateCandidateMetadata } from "./candidate.js";
import { readLastCandidate } from "./candidate-store.js";
import type { CandidateMetadata } from "./types.js";
import { sealCandidateSignature } from "./signature.js";
import { DeliveryError, EXIT_FAIL, resolveProjectRoot } from "./util.js";

const DIGEST_RE = /^[a-f0-9]{64}$/;

export type DeliveryValidateCheck = {
  id: string;
  ok: boolean;
  summary: string;
  blocking: boolean;
};

export function evaluateCandidateReady(
  candidate: CandidateMetadata,
): DeliveryValidateCheck[] {
  const checks: DeliveryValidateCheck[] = [];

  const structural = validateCandidateMetadata(candidate);
  checks.push({
    id: "candidate-metadata",
    ok: structural.ok,
    summary: structural.ok
      ? "candidate metadata schema valid"
      : `metadata invalid: ${structural.errors.join("; ")}`,
    blocking: !structural.ok,
  });

  const releaseProfile = candidate.profile === "release";
  checks.push({
    id: "candidate-release-profile",
    ok: releaseProfile,
    summary: releaseProfile
      ? "profile is release"
      : `profile is ${candidate.profile} — release promote requires --profile release build`,
    blocking: !releaseProfile,
  });

  const sealed = DIGEST_RE.test(candidate.digest);
  checks.push({
    id: "candidate-digest-sealed",
    ok: sealed,
    summary: sealed
      ? `digest sealed (${candidate.digest.slice(0, 12)}…)`
      : `digest not sealed: ${candidate.digest}`,
    blocking: !sealed,
  });

  if (candidate.platform === "android" && candidate.path) {
    const apkExists = existsSync(candidate.path);
    checks.push({
      id: "candidate-artifact-present",
      ok: apkExists,
      summary: apkExists
        ? `artifact present: ${candidate.path}`
        : `artifact missing: ${candidate.path}`,
      blocking: !apkExists,
    });
  }

  if (candidate.platform === "js" && candidate.path) {
    const bundleExists = existsSync(candidate.path);
    checks.push({
      id: "candidate-bundle-present",
      ok: bundleExists,
      summary: bundleExists
        ? `js bundle present: ${candidate.path}`
        : `js bundle missing: ${candidate.path}`,
      blocking: !bundleExists,
    });
  }

  if (candidate.artifact_kind === "js-update" && candidate.profile === "release") {
    const signed = Boolean(candidate.signature?.trim());
    checks.push({
      id: "candidate-signed",
      ok: signed,
      summary: signed
        ? "js-update signature sealed"
        : "js-update missing signature — run rn-delivery sign",
      blocking: !signed,
    });

    if (signed && process.env.RN_DELIVERY_SIGN_KEY?.trim()) {
      const sealed = sealCandidateSignature({
        release_id: candidate.release_id,
        digest: candidate.digest,
        artifact_kind: candidate.artifact_kind,
      });
      const valid = candidate.signature === sealed.signature;
      checks.push({
        id: "candidate-signature-hmac",
        ok: valid,
        summary: valid
          ? "js-update HMAC signature valid"
          : "js-update HMAC signature mismatch — re-run rn-delivery sign",
        blocking: !valid,
      });
    }
  }

  return checks;
}

export function evaluateDeliveryValidate(options: {
  projectRoot: string;
  candidate?: CandidateMetadata | null;
}): {
  ok: boolean;
  checks: DeliveryValidateCheck[];
  candidate: CandidateMetadata | null;
} {
  const checks: DeliveryValidateCheck[] = [];
  const root = options.projectRoot;

  const hygiene = evaluateReleaseSourceHygiene(root);
  for (const h of hygiene) {
    checks.push({
      id: `release-${h.id}`,
      ok: h.ok,
      summary: h.summary,
      blocking: h.blocking,
    });
  }

  const candidate =
    options.candidate ?? readLastCandidate(root);
  if (!candidate) {
    checks.push({
      id: "candidate-present",
      ok: false,
      summary:
        "no candidate metadata — run rn-delivery build --profile release first",
      blocking: true,
    });
    return { ok: false, checks, candidate: null };
  }

  checks.push({
    id: "candidate-present",
    ok: true,
    summary: `candidate loaded (${candidate.platform} · ${candidate.artifact_kind})`,
    blocking: false,
  });

  checks.push(...evaluateCandidateReady(candidate));

  const ok = checks.every((c) => c.ok || !c.blocking);
  return { ok, checks, candidate };
}

export async function runValidate(options: {
  cwd: string;
  candidatePath?: string;
}): Promise<void> {
  const projectRoot = resolveProjectRoot(options.cwd);
  let candidate: CandidateMetadata | null = null;
  if (options.candidatePath) {
    const raw = JSON.parse(
      readFileSync(path.resolve(options.candidatePath), "utf8"),
    );
    const parsed = validateCandidateMetadata(raw);
    if (!parsed.ok) {
      throw new DeliveryError(
        `candidate file invalid: ${parsed.errors.join("; ")}`,
        EXIT_FAIL,
      );
    }
    candidate = parsed.metadata;
  }

  const result = evaluateDeliveryValidate({ projectRoot, candidate });
  console.log(
    JSON.stringify(
      {
        ok: result.ok,
        release_hygiene_ok: releaseSourceHygieneOk(projectRoot),
        checks: result.checks,
        candidate: result.candidate,
      },
      null,
      2,
    ),
  );
  if (!result.ok) {
    throw new DeliveryError("rn-delivery validate: FAIL", EXIT_FAIL);
  }
}
