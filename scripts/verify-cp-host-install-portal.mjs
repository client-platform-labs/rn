#!/usr/bin/env node
/**
 * Map E #105 — host install portal: candidates download_url + GET /v1/artifacts/:digest.
 *
 * Migrated onto the verify fixture (#259). The fake APK is a fixture file and the
 * staging candidate points at it by absolute path, so the registry is written
 * after the project exists (the candidate's `path` must name a real file).
 * Auth is open here: this probe covers the portal surface, not the token path.
 *
 * Usage:
 *   node scripts/verify-cp-host-install-portal.mjs
 *   node scripts/_run-verify.mjs cp-host-install-portal
 */
import path from "node:path";

import { createHarness, emptyRegistry } from "./lib/verify/fixture.mjs";

const h = createHarness({ name: "verify-cp-host-install-portal" });

const DIGEST = "a".repeat(64);
const MISSING = "b".repeat(64);

await h.run(async () => {
  const p = h.project({
    name: "cp-host-install-portal",
    files: { "fake-debug.apk": "PK\x03\x04fake-apk-body" },
  });
  p.writeRegistry({
    ...emptyRegistry(),
    staging: [
      {
        release_id: "rel-host-1",
        artifact_kind: "app-host-debug",
        platform: "android",
        profile: "debug-host",
        digest: DIGEST,
        stage: "promote",
        path: path.join(p.root, "fake-debug.apk"),
        configuration: "debug",
      },
    ],
  });

  const cp = await h.serve({ project: p, token: "", env: { RN_CP_TOKEN: "" } });

  h.step("staging candidates advertise a download URL");
  const candidates = await cp.json("/v1/candidates?lane=staging");
  h.assertStatus(candidates, 200, "GET /v1/candidates?lane=staging");
  h.assertContains(
    candidates.body.candidates?.[0]?.download_url ?? "",
    DIGEST,
    "the candidate's download_url points at its digest",
  );

  h.step("the artifact endpoint streams the host APK");
  const art = await cp.text(`/v1/artifacts/${DIGEST}`);
  h.assertStatus(art, 200, "GET /v1/artifacts/:digest");
  h.assertContains(art.body, "fake-apk-body", "the APK bytes are streamed back");

  const miss = await cp.text(`/v1/artifacts/${MISSING}`);
  h.assertStatus(miss, 404, "an unknown digest is a 404");

  h.step("the console surfaces the host-install section");
  const html = await cp.text("/");
  h.assertContains(html.body, "宿主装包台", "console has the host-install section");
  h.assertContains(html.body, "host-builds", "console references host-builds");
});
