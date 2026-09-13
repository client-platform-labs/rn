#!/usr/bin/env node
/**
 * Map E #106 — JS/offline train: GET /v1/js-updates + console section.
 *
 * Migrated onto the verify fixture (#259). Both candidate sets (a JS train with
 * a bundle file, plus a host candidate as noise) are declared as fixture data;
 * the bundle path must be absolute, so the registry is written after the project
 * exists. `/v1/candidates` staying host-only is the point of the noise entry.
 *
 * Usage:
 *   node scripts/verify-cp-js-offline-console.mjs
 *   node scripts/_run-verify.mjs cp-js-offline-console
 */
import path from "node:path";

import { createHarness, emptyRegistry } from "./lib/verify/fixture.mjs";

const h = createHarness({ name: "verify-cp-js-offline-console" });

const DIGEST = "c".repeat(64);
const PROD_DIGEST = "e".repeat(64);

await h.run(async () => {
  const p = h.project({
    name: "cp-js-offline-console",
    files: { ".rn/delivery/updates/checkout/js-chk-p184.hbc": "fake-hbc" },
  });
  const bundlePath = path.join(
    p.root,
    ".rn/delivery/updates/checkout/js-chk-p184.hbc",
  );
  p.writeRegistry({
    ...emptyRegistry(),
    staging: [
      {
        release_id: "rel-js-1",
        artifact_kind: "js-update",
        platform: "js",
        profile: "release",
        digest: DIGEST,
        stage: "promote",
        path: bundlePath,
        business_module: "checkout",
        update_id: "js-chk-p184",
      },
      {
        // Noise: a host artifact in the same lane. It must never show up in the
        // JS/offline train.
        release_id: "rel-host-noise",
        artifact_kind: "app-host-debug",
        platform: "android",
        profile: "debug-host",
        digest: "d".repeat(64),
        stage: "promote",
        path: "/tmp/nope.apk",
        configuration: "debug",
      },
    ],
    production: [
      {
        release_id: "rel-js-prod",
        artifact_kind: "js-update",
        platform: "js",
        profile: "release",
        digest: PROD_DIGEST,
        stage: "promote",
        path: bundlePath,
        business_module: "home",
        update_id: "js-home-p30",
      },
    ],
  });

  const cp = await h.serve({ project: p, token: "", env: { RN_CP_TOKEN: "" } });

  h.step("the JS/offline train lists JS candidates only");
  const all = await cp.json("/v1/js-updates");
  h.assertStatus(all, 200, "GET /v1/js-updates");
  h.assertEq(all.body.candidates?.length, 2, "host noise is excluded");

  const staging = await cp.json("/v1/js-updates?lane=staging");
  h.assertEq(staging.body.candidates?.length, 1, "lane=staging narrows to one");
  h.assertEq(
    staging.body.candidates?.[0]?.business_module,
    "checkout",
    "the staged candidate is the checkout train",
  );

  const byModule = await cp.json("/v1/js-updates?lane=all&module=home");
  h.assertEq(byModule.body.candidates?.length, 1, "module=home narrows to one");
  h.assertEq(
    byModule.body.candidates?.[0]?.update_id,
    "js-home-p30",
    "the module filter selected the production update",
  );

  h.step("the host candidates endpoint stays host-only");
  const hosts = await cp.json("/v1/candidates");
  h.assertTruthy(
    !hosts.body.candidates?.some((c) => c.artifact_kind === "js-update"),
    "no JS artifact leaks into /v1/candidates",
  );

  h.step("the console surfaces the JS/offline section");
  const html = await cp.text("/");
  h.assertContains(html.body, "JS / 离线包", "console has the JS/offline section");
  h.assertContains(html.body, "js-updates", "console references js-updates");
});
