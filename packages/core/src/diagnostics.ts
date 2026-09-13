/**
 * The single diagnostic-check record (#260).
 *
 * One shape for "a named check with a verdict, a human summary and a
 * blocking-ness" — shared by every plane that reports checks:
 *
 *   - `rn doctor` families (brownfield delta / expo interop / enterprise P0
 *     gates / native adapter / shell template drift)
 *   - release source hygiene (`rn doctor` L3f *and* `ship build --profile release`)
 *   - ship's candidate validation (`ship validate`)
 *
 * WHY it lives in `core`: ADR-021's dependency DAG is
 * `core` ← `rn-engine` ← {`ship`, `rn`} with `shell-core` ← `core`, so `core` is
 * the lowest plane that BOTH `rn` and `ship` may import. Before #260 the record
 * was declared four times (once per plane plus structural twins in `core` and
 * `ship`); the planes only stayed compatible by structural luck — TypeScript
 * accepts them interchangeably, so nothing forced them to stay in step.
 *
 * Plane vocabulary is preserved by aliasing, not by re-declaring: `rn`'s doctor
 * plane calls it `DoctorCheck`, `core` exports `ReleaseHygieneCheck` (public
 * API, kept), `ship` uses `DeliveryValidateCheck`. Those are names for THIS
 * type, so they cannot drift.
 *
 * NOT the same concept — deliberately not folded here:
 * `ChannelProfileIssue` (`core/src/channel-profile.ts`) also carries a
 * `blocking` flag, but it is an *issue within a validation result*: it is
 * identified by a `code` union and a `message`, and it has no `id`/`ok`/`summary`
 * because a channel-profile issue is never "ok". Sharing the word `blocking`
 * does not make it a check; see `doctor-seam.test.ts` for the assertion that
 * pins that boundary.
 */
export type DiagnosticCheck = {
  /** Stable machine id (used by CI consumers and `--json` output). */
  id: string;
  ok: boolean;
  /** One-line human summary rendered in the doctor sections. */
  summary: string;
  /** When true, failure fails the gate even without `--strict`. */
  blocking: boolean;
};
