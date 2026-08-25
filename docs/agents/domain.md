# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

This repo is **multi-context by wayfinding era** (not `src/<pkg>` contexts):

1. **Primary glossary:** [`wayfinding/CONTEXT.md`](../../wayfinding/CONTEXT.md) — platform-wide terms.
2. **Map increments:**
   - [`wayfinding-impl/CONTEXT.md`](../../wayfinding-impl/CONTEXT.md) — MVP terms
   - [`wayfinding-impl-2/CONTEXT.md`](../../wayfinding-impl-2/CONTEXT.md) — Map A / enterprise-loop terms + Expo reader dictionary
3. **ADRs (Map A):** [`wayfinding-impl-2/docs/adr/`](../../wayfinding-impl-2/docs/adr/)
4. **Blueprint (assembled contracts):** [`blueprint/`](../../blueprint/) — reader-facing; decisions originated in wayfinding tickets

There is no root `CONTEXT.md` / `CONTEXT-MAP.md` yet. Prefer the paths above over inventing new glossaries.

If a listed path is missing for your topic, **proceed silently** — don't block work to create empty CONTEXT files.

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `wayfinding/CONTEXT.md` (and map-local increments). Don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal — either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/domain-modeling`).

## Flag ADR conflicts

If your output contradicts an existing ADR under `wayfinding-impl-2/docs/adr/`, surface it explicitly rather than silently overriding:

> _Contradicts ADR-006 (unified multi-Metro debug) — but worth reopening because…_
