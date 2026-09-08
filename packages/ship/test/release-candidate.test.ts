import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { buildCandidateMetadata, attachSbomSlot, supplyChainTrainForKind } from "../dist/candidate.js";
import {
  blockCandidateInRegistry,
  listInstallableCandidates,
  loadRegistry,
  promoteCandidateToStaging,
  readLastCandidate,
  writeBuildResults,
  writeLastCandidate,
} from "../dist/candidate-store.js";
import { evaluateDeliveryValidate } from "../dist/validate.js";
import { pickCandidate } from "../dist/release-shared.js";

const SEALED =
  "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

function sampleCandidate(root: string) {
  const apk = path.join(root, "app-release.apk");
  writeFileSync(apk, "fake-apk");
  return buildCandidateMetadata({
    release_id: "rel-1",
    artifact_kind: "app-host",
    platform: "android",
    profile: "release",
    digest: SEALED,
    path: apk,
    configuration: "release",
    stage: "compile",
  });
}

describe("candidate store", () => {
  it("persists last candidate from build results", () => {
    const root = mkdtempSync(path.join(tmpdir(), "rn-delivery-store-"));
    writeFileSync(
      path.join(root, "package.json"),
      JSON.stringify({ name: "demo" }),
    );
    const meta = sampleCandidate(root);
    writeBuildResults(root, [meta]);
    const loaded = readLastCandidate(root);
    assert.equal(loaded?.digest, SEALED);
    assert.ok(existsSync(path.join(root, ".rn/delivery/last-build.json")));
  });

  it("pickCandidate prefers signed last-candidate over stale last-build", () => {
    const root = mkdtempSync(path.join(tmpdir(), "rn-delivery-pick-"));
    writeFileSync(
      path.join(root, "package.json"),
      JSON.stringify({ name: "demo" }),
    );
    const unsigned = sampleCandidate(root);
    writeBuildResults(root, [unsigned]);
    const signed = {
      ...unsigned,
      stage: "sign" as const,
      signature: SEALED,
      supply_chain: attachSbomSlot(
        { host: {}, js_update: {} },
        supplyChainTrainForKind(unsigned.artifact_kind),
        {
          artifact_kind: unsigned.artifact_kind,
          format: "stub" as const,
          digest: unsigned.digest,
        },
      ),
    };
    writeLastCandidate(root, signed);
    const picked = pickCandidate(root, "android");
    assert.equal(picked.stage, "sign");
    assert.ok(picked.supply_chain?.host?.sbom?.digest);
  });

  it("promotes to staging and blocks with rollback drill", () => {
    const root = mkdtempSync(path.join(tmpdir(), "rn-delivery-store-"));
    writeFileSync(
      path.join(root, "package.json"),
      JSON.stringify({ name: "demo" }),
    );
    const meta = sampleCandidate(root);
    promoteCandidateToStaging(root, meta);
    let registry = loadRegistry(root);
    assert.equal(registry.staging.length, 1);
    assert.equal(registry.staging[0]?.stage, "promote");

    blockCandidateInRegistry(root, meta, "rollback drill");
    registry = loadRegistry(root);
    assert.equal(registry.staging.length, 0);
    assert.equal(registry.blocked.length, 1);
    assert.equal(registry.blocked[0]?.reason, "rollback drill");
  });

  it("lists installable app-host candidates for #15", () => {
    const root = mkdtempSync(path.join(tmpdir(), "rn-delivery-store-"));
    const meta = sampleCandidate(root);
    const debugApk = path.join(root, "app-debug.apk");
    writeFileSync(debugApk, "fake-debug");
    const debugMeta = buildCandidateMetadata({
      release_id: "rel-d",
      artifact_kind: "app-host-debug",
      platform: "android",
      profile: "debug-host",
      digest: "d".repeat(64),
      path: debugApk,
      configuration: "debug",
      stage: "compile",
    });
    promoteCandidateToStaging(root, meta);
    promoteCandidateToStaging(root, debugMeta);
    const registry = loadRegistry(root);
    const installable = listInstallableCandidates(registry, "staging");
    assert.equal(installable.length, 2);
    assert.ok(installable.every((c) => c.platform === "android"));
  });
});

describe("evaluateDeliveryValidate", () => {
  it("passes clean project with sealed candidate", () => {
    const root = mkdtempSync(path.join(tmpdir(), "rn-delivery-validate-"));
    writeFileSync(
      path.join(root, "package.json"),
      JSON.stringify({ name: "demo" }),
    );
    writeFileSync(
      path.join(root, "App.tsx"),
      "export default function App() { return null; }\n",
    );
    const meta = sampleCandidate(root);
    const result = evaluateDeliveryValidate({ projectRoot: root, candidate: meta });
    assert.equal(result.ok, true);
  });

  it("fails when dev-support dir is present", () => {
    const root = mkdtempSync(path.join(tmpdir(), "rn-delivery-validate-"));
    writeFileSync(
      path.join(root, "package.json"),
      JSON.stringify({ name: "demo" }),
    );
    mkdirSync(path.join(root, "src", ".rn-dev-support"), { recursive: true });
    const meta = sampleCandidate(root);
    const result = evaluateDeliveryValidate({ projectRoot: root, candidate: meta });
    assert.equal(result.ok, false);
    assert.ok(
      result.checks.some(
        (c) => c.id === "release-release-dev-support-dir" && !c.ok,
      ),
    );
  });
});
