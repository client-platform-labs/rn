import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { DiagnosticCheck } from "@client-platform/core";

import type { DeliveryValidateCheck } from "../dist/validate.js";

/**
 * #260: `ship`'s candidate-readiness checks and `rn doctor`'s checks are the
 * SAME record, declared once in core (`DiagnosticCheck`). `DeliveryValidateCheck`
 * is an alias, not a twin.
 *
 * This guard lives here rather than in `packages/rn/test/` because ADR-021's
 * dependency DAG forbids `rn` importing `ship`; `ship` may import `core`, and
 * `rn` may import `core`, so both planes are pinned against the same record from
 * their own side.
 */
describe("ship validate check record (#260)", () => {
  it("is the shared core record, in both directions (compile-time)", () => {
    // If ship re-declares {id, ok, summary, blocking}, these stop compiling —
    // which is the point: TypeScript accepted structural twins silently before,
    // so drift was invisible.
    const shipIsCore: DiagnosticCheck[] = [] as DeliveryValidateCheck[];
    const coreIsShip: DeliveryValidateCheck[] = [] as DiagnosticCheck[];
    assert.deepEqual([shipIsCore, coreIsShip], [[], []]);
  });
});
