import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import { defaultDualModuleDevSession } from "@client-platform/rn-core";

import { evaluateBrownfieldDoctor } from "../dist/brownfield-doctor.js";

const exampleRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../examples/brownfield-host",
);

describe("brownfield native doctor (P4/P6)", () => {
  it("passes AGP/Kotlin/ABI on examples/brownfield-host", () => {
    const session = defaultDualModuleDevSession();
    const checks = evaluateBrownfieldDoctor({
      projectRoot: exampleRoot,
      session,
    });
    for (const id of ["bf-p4-agp", "bf-p4-kotlin", "bf-p6-abi"]) {
      const check = checks.find((c) => c.id === id);
      assert.ok(check, `missing ${id}`);
      assert.equal(check?.ok, true, check?.summary);
    }
  });

  it("passes B10 hermes/newarch/tuple/codegen on examples/brownfield-host", () => {
    const session = defaultDualModuleDevSession();
    const checks = evaluateBrownfieldDoctor({
      projectRoot: exampleRoot,
      session,
    });
    for (const id of [
      "bf-p4-hermes",
      "bf-p4-newarch",
      "bf-p4-tuple-drift",
      "bf-p6-codegen",
    ]) {
      const check = checks.find((c) => c.id === id);
      assert.ok(check, `missing ${id}`);
      assert.equal(check?.ok, true, check?.summary);
    }
  });
});
