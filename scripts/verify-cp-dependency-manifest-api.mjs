#!/usr/bin/env node
/**
 * Map E #103 — GET/PUT /v1/dependency-manifest + gateBundleLoad composition.
 *
 * Migrated onto the verify fixture (#259). Covers the manifest API round-trip
 * (empty → PUT → one), the composition gate it feeds, and the console section
 * that projects it.
 *
 * Usage:
 *   node scripts/verify-cp-dependency-manifest-api.mjs
 *   node scripts/_run-verify.mjs cp-dependency-manifest-api
 */
import path from "node:path";
import { pathToFileURL } from "node:url";

import { createHarness, REPO_ROOT } from "./lib/verify/fixture.mjs";

const { gateBundleLoad } = await import(
  pathToFileURL(path.join(REPO_ROOT, "packages/core/dist/index.js")).href
);
// ADR-022 split: the greenfield fingerprint helper lives in the engine adapter
// package, so it is a separate import rather than a second symbol from core.
const { defaultGreenfieldFingerprint } = await import(
  pathToFileURL(path.join(REPO_ROOT, "packages/rn-engine/dist/index.js")).href
);

const h = createHarness({ name: "verify-cp-dependency-manifest-api" });

const MANIFEST = {
  dependencies: [
    {
      from_update_id: "js-chk-p184",
      from_module: "checkout",
      strength: "hard",
      kind: "contract",
      to_update_id: "js-base-p12",
    },
  ],
  version_labels: { "js-base-p12": "1.2.0" },
  host_capability_set: ["PaymentTurbo"],
};

await h.run(async () => {
  const p = h.project({ name: "cp-dependency-manifest-api" });
  const cp = await h.serve({ project: p, role: "admin" });

  h.step("manifest API round-trip");
  const empty = await cp.json("/v1/dependency-manifest");
  h.assertStatus(empty, 200, "GET /v1/dependency-manifest");
  h.assertTruthy(
    Array.isArray(empty.body.dependencies),
    "an empty manifest still reports a dependencies list",
  );

  const put = await cp.json("/v1/dependency-manifest", {
    method: "PUT",
    headers: cp.auth,
    body: JSON.stringify(MANIFEST),
  });
  h.assertStatus(put, 200, "PUT /v1/dependency-manifest");
  h.assertTruthy(put.body.ok, "the write is acknowledged");

  const after = await cp.json("/v1/dependency-manifest");
  h.assertEq(after.body.dependencies?.length, 1, "the written dependency is read back");

  h.step("composition gate blocks an out-of-range peer");
  const fp = defaultGreenfieldFingerprint("0.87.0");
  const host = {
    runtime_fingerprint: fp,
    capability_set: ["PaymentTurbo", "ShellBus.v2", "MapTurbo"],
    artifact_line: "pure-rn-greenfield",
    hbcBytecodeVersion: fp.hbcBytecodeVersion,
    channel_js_allowed: true,
  };
  const checkout = {
    business_module: "checkout",
    update_id: "js-chk-p184",
    runtime_fingerprint: fp,
    hbcBytecodeVersion: fp.hbcBytecodeVersion,
    required_capabilities: ["PaymentTurbo", "ShellBus.v2"],
    target_artifact_lines: ["pure-rn-greenfield"],
    release_gate: "js-standard",
  };
  const home = {
    business_module: "home",
    update_id: "js-home-p29",
    runtime_fingerprint: fp,
    hbcBytecodeVersion: fp.hbcBytecodeVersion,
    required_capabilities: ["ShellBus.v2"],
    target_artifact_lines: ["pure-rn-greenfield"],
    release_gate: "js-standard",
  };
  const blocked = gateBundleLoad(
    {
      candidate: checkout,
      signature: "x",
      expectedDigest: "x",
      composition: { checkout, home },
      dependencies: [
        {
          from_update_id: "js-chk-p184",
          from_module: "checkout",
          strength: "peer",
          kind: "coexistence",
          to_module: "home",
          to_range: ">=3.0.0",
        },
      ],
      version_labels: { "js-home-p29": "2.9.4", "js-chk-p184": "1.8.4" },
    },
    host,
  );
  h.assertTruthy(!blocked.ok, "a peer below its range blocks the composition");

  h.step("the console projects the dependency manifest");
  const html = await cp.text("/");
  h.assertStatus(html, 200, "GET /");
  h.assertContains(html.body, "依赖清单", "console has the dependency section");
  h.assertContains(
    html.body,
    "/v1/dependency-manifest",
    "console references the manifest endpoint",
  );
  h.assertContains(html.body, "btn-dep-save", "console exposes the save control");
});
