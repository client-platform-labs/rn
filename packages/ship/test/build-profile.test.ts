import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { androidAssembleGradleTask } from "../dist/build.js";
import { hostArtifactKindForProfile } from "../dist/candidate.js";

describe("androidAssembleGradleTask", () => {
  it("maps debug-host to assembleDebug", () => {
    assert.equal(androidAssembleGradleTask("debug-host"), "assembleDebug");
  });

  it("maps release to assembleRelease", () => {
    assert.equal(androidAssembleGradleTask("release"), "assembleRelease");
  });
});

describe("hostArtifactKindForProfile", () => {
  it("maps debug-host to app-host-debug", () => {
    assert.equal(hostArtifactKindForProfile("debug-host"), "app-host-debug");
  });

  it("maps release to app-host", () => {
    assert.equal(hostArtifactKindForProfile("release"), "app-host");
  });
});
