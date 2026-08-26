# Engineering principles (Map A)

**Purpose:** constrain design so the platform stays **industrial-grade without becoming industrial-complex**. These rules are **not** ad-hoc slogans — they synthesize (a) established software architecture practice, (b) Map A multi-plane contracts, and (c) lessons from this repo’s PoCs (e.g. withdrawn `rn module seal`, topology B vs teaching demos).

**How to use:** before adding a CLI command, package, ADR field, or cross-plane type, walk the **checklist** at the end. When two principles conflict, use **§6 Dialectics** — don’t pick the one that excuses more code.

---

## 0. Complexity budget (meta)

Industrial systems fail less from missing features than from **unpaid complexity interest**.

| Signal | Interpretation |
|--------|----------------|
| New concept needs a paragraph to explain | Probably a new entity you shouldn’t ship yet |
| Same workflow reachable two ways | Orthogonality violation — pick one owner |
| Demo/sample code imported by product path | Boundary leak |
| “We’ll clean up after the PoC” without an ADR + removal ticket | Will become permanent |

**Rule:** every abstraction must earn its keep in **reduced cognitive load** or **contained blast radius**. Otherwise it’s noise.

---

## 1. Foundational principles (industry canon → Map A)

| Principle | Industry source (informal) | In this repo |
|-----------|---------------------------|--------------|
| **YAGNI / Occam** | XP, Lean | **如无必要，勿增实体** — no CLI/types/packages for hypothetical futures |
| **Separation of concerns** | Dijkstra, layered architecture | **Multi-plane model**: local dev · CI artifact · control plane · runtime governance — each plane has a **must not** list (see blueprint + [research/01](../../wayfinding-impl-2/research/01-multi-plane-industrial-remediation.md)) |
| **Dependency rule** | Clean Architecture | Dependencies point **inward**: `rn-core` (contracts) ← `rn` / native / `rn-delivery`. Core never imports Metro, Gradle, or store APIs |
| **Stable abstractions** | Parnas, “on the criteria…” | Cross-host vocabulary (`runtime_fingerprint`, `update_id`, `ModuleBundleArtifact`) lives in **rn-core** early; volatile tooling stays at the edge |
| **Single responsibility** | SOLID (S) | One command ≈ one **user-visible job** (`dev`, `doctor`, `module link`) — not one internal class |
| **Interface segregation** | SOLID (I) | Small contract surfaces: event bus schemas, dispose hooks — not god-objects on `RuntimeHost` |
| **Explicit > implicit** | Zen of Python, “make illegal states unrepresentable” | Doctor gates, typed manifests, ADR decisions — not wiki-only “conventions” |
| **Orthogonality** | Pragmatic Programmer | Changing module Metro port must not require Gradle; changing OTA channel must not rewrite dev-session transport |
| **Deep module, narrow API** | Ousterhout (*A Philosophy of Software Design*) | `rn dev` orchestrates Metro/adb/LAN internally; callers don’t assemble 6 flags every time |
| **Fail closed** | Security engineering | `gateBundleLoad`, doctor P0, signature checks — ambiguous artifact → **reject**, not best-effort load |
| **Reversible vs irreversible** | Amazon one-way/two-way doors | PoCs and scripts = two-way; public CLI names and manifest fields = one-way — need ADR before shipping |
| **Tracer bullets** | Pragmatic Programmer | Prove multi-Metro / dispose on **device + script** before productizing a command |
| **Design for deletion** | Fowler | Sample probes (`disposeProbe`) and dev headers must be removable without breaking delivery |

**Your two principles sit here:**

1. **如无必要，勿增实体** = YAGNI + interface segregation applied to **product surface area**.
2. **中间临时产物不要污染最终交付产物** = separation of concerns across **dev vs delivery planes** + fail closed on artifact identity.

They are **necessary but not sufficient** — industrial RN also needs identity discipline, blast-radius control, and CLI predictability (below).

---

## 2. Architectural principles (large-scale / multi-bundle)

From Map A ADRs and multi-plane research — these prevent “another architecture” every quarter.

### 2.1 Contract once, implement in stages

[`CONTEXT.md` §工业级分期](../../wayfinding-impl-2/CONTEXT.md): **interfaces and identity spine designed for evolution; implementations filled incrementally**.

| Do early (one-way door) | Do late (two-way door) |
|-------------------------|------------------------|
| Field names, state machines, compatibility windows | Concrete CDN, store submit, org-specific policy |
| `rn-core` types + validation | Control-plane UI |
| Doctor checks that encode P0 risks | Full E2E promotion automation |

**Dialectic with YAGNI:** early **types and invariants**, not early **commands and folders**.

### 2.2 Identity is a spine, not a version string

`release_id` · `artifact_line` · `runtime_fingerprint` · `update_id` · `channel` — **never** collapse to one `version` field in contracts or CLI output. Industrial OTA (Expo Updates, CodePush, custom CP) all separate these concerns; we align with that practice.

### 2.3 Blast radius and shared fate

ADR-005/008: **single `RuntimeHost`, multiple bundles** → modules share memory, globals, and RN version. Architecture must assume **soft isolation** (dispose, bus, namespaced storage), not pretend separate apps.

Implications:

- P0 gates (dispose, pollution scan, load gate) are **architecture**, not “nice tests”.
- “Each module picks its RN version” is **out of default contract** — multi-runtime is S2 escape hatch only.

### 2.4 One protocol, two hosts

Greenfield and Brownfield share **DevSession / DevTransport / multi-Metro** (ADR-006). Duplicating debug stacks is how CLI and native code **double** maintenance cost.

**Canonical split:** [gf-bf-unified-model.md](./gf-bf-unified-model.md) — shared plane vs `SurfaceHost` adapter only.

### 2.5 Topology B is default, A is onboarding

Shell workspace + linked module workspaces (ADR-005 B). Inline single-tree (A) is a shortcut, not the evolutionary target — Runtime/CP must not hardcode `modules.length === 1`.

### 2.6 No second architecture in references

Absorb patterns from Expo/EAS, CodePush, brownfield hosts — **translate into blueprint fields**, don’t fork a parallel spec (see research/01 §1).

---

## 3. CLI principles (industrial developer tools)

CLIs for platform teams differ from app CRUD: they are **APIs with ergonomics**. Borrow from Unix + modern DX (Expo, Flutter, `gh`, `kubectl`).

| Principle | Practice here |
|-----------|---------------|
| **Do one thing well** (Unix) | `doctor` diagnoses; `dev` runs session; don’t add `doctor --also-build-release` |
| **Composition over monolith flags** | Scripts chain acceptance; CLI exposes stable verbs |
| **Least astonishment (POLA)** | Defaults match industrial path (`init` → topology B). Dangerous ops need explicit flags, not silent side effects |
| **Consistent grammar** | `rn <noun> <verb>` only when the noun is a **stable domain object** (`module`), not every internal module |
| **Idempotency where possible** | `module link`, `doctor` re-runs should be safe; document when not |
| **Structured + human output** | Machine-readable doctor results for CI; human summary for local — same underlying checks |
| **Config hierarchy, single source of truth** | `.rn/dev-session.jsonc` + env — avoid duplicating ports/modules in three places |
| **Discoverability without sprawl** | `doctor` and `--help` teach; don’t add commands “for discoverability” alone |
| **Exit codes matter** | CI gates on doctor P0 — non-zero must mean **actionable failure** |

**Anti-patterns:**

- CLI that **curls dev Metro** and writes “release bundles” → delivery plane violation.
- Per-slice `adb reverse` copy-paste → violates DevTransport unification.
- Hidden env vars that change behavior without appearing in session config.

---

## 4. Dev vs delivery boundary (plane hygiene)

**中间临时产物不要污染最终交付产物** — expanded.

| Plane | Owns | Must not |
|-------|------|----------|
| **`rn` + dev-session** | Multi-Metro, doctor, topology scaffold, L-C debug | Sign, seal, promote, pretend Metro output is HBC release |
| **`rn-core`** | Contracts + pure validation | I/O to bundler, disk artifact stores, store APIs |
| **`rn-delivery` + control plane** | Release HBC, signed manifests, channels, promotion | Dev `?dev=true` bundles as production artifacts |
| **Sample / demo** | Teaching UI, probes | Imported by delivery, native shell, or rn-delivery |

Concrete:

- HTTP headers like `X-RN-Business-Module` = **dev labeling** for multi-Metro identity, not shipping manifest.
- `ModuleBundleArtifact` in core = **vocabulary + validate**; pack/sign/promote in **rn-delivery**.
- PoC commands **removed** once contract captured — don’t leave “temporary” in public `--help`.

---

## 5. Quality and governance (industrial closure)

Large systems need **gates**, not hope.

| Practice | Map A anchor |
|----------|--------------|
| **Definition of done = evidence** | Device HITL, scripts (`verify-*`), doctor tiers — not “implemented” |
| **P0 before “enterprise promotable”** | ADR-008 checklist |
| **Observability attribution** | `business_module` + `update_id` on quality signals |
| **Change matrix** | Shell native change → which JS must revalidate |
| **Governance is horizontal** | Security, SBOM, promotion — not a fifth ad-hoc CLI |

Avoid: wiki wishlists, “teams will remember to dispose”, demo behavior documented as production guarantee.

---

## 6. Dialectics (when principles collide)

| Tension | Resolution |
|---------|------------|
| **YAGNI** vs **contract once** | Ship **types + doctor + ADR** early; ship **automation/UI** when pain is proven |
| **Minimal CLI** vs **industrial gates** | Gates live in **`doctor` + CI** — don’t multiply verbs |
| **Flexibility** vs **guardrails** | Escape hatches explicit (topology A, S2 multi-runtime), never silent defaults |
| **Speed of PoC** vs **clean delivery** | PoC in `scripts/` or branch; merge only contracts + acceptance, not fake delivery |
| **Sample richness** vs **product purity** | Demo may **couple** modules in shell tree for teaching; document as **non-default** (ADR-005) |
| **Expo parity** vs **entity sprawl** | Match **outcomes** (dev session SLA), not **surface area** (clone every `eas` subcommand) |

When stuck: ask **which plane owns the pain** — if unclear, the design isn’t ready for a new command.

---

## 7. PR / design review checklist

1. **Plane:** Which plane is this? Does it import from a forbidden plane?
2. **Entity:** Can an existing command, doctor check, or script absorb it?
3. **Door:** One-way (public API, manifest field) → ADR referenced?
4. **Identity:** Does it respect the identity spine (no fake single `version`)?
5. **Blast radius:** Does multi-bundle shared runtime make this riskier? P0 needed?
6. **Deletion:** If we delete the PoC tomorrow, what breaks?
7. **Duplication:** GF/BF or dev/delivery doing the same thing twice?
8. **Evidence:** What test, doctor rule, or HITL step proves it?

**Smell → likely reject:**

- New CLI verb + no ADR + “we’ll document later”
- Dev Metro fetch presented as release path
- `rn-core` importing Node fs/network for convenience
- Second state machine names alongside blueprint (research/01 §1)

---

## 8. Governance enforcement (current + future)

| Mechanism | What it enforces |
|-----------|------------------|
| [ADR-009](../../wayfinding-impl-2/docs/adr/009-architecture-principles-governance.md) | When ADR required; retroactive ADR-001–008 assessment |
| [000-template](../../wayfinding-impl-2/docs/adr/000-template.md) | Mandatory `## Principles compliance` on every ADR |
| [architecture-governance.md](./architecture-governance.md) | Design → implement → review workflow |
| `scripts/check-architecture-governance.mjs` | CI: ADR sections + forbidden product anti-patterns |
| [.github/pull_request_template.md](../../.github/pull_request_template.md) | Human checklist on architecture-touching PRs |
| `rn doctor` L3e | Runtime P0 (ADR-008) — complements ADR-009 process gates |

**Rule:** process gates (ADR-009) and runtime gates (ADR-008) stack; neither replaces the other.

---

## Related

- [architecture-governance.md](./architecture-governance.md) — operational workflow
- [wayfinding-impl-2/CONTEXT.md](../../wayfinding-impl-2/CONTEXT.md) — glossary + Avoid lists
- [research/01-multi-plane-industrial-remediation.md](../../wayfinding-impl-2/research/01-multi-plane-industrial-remediation.md) — P1–P17 patches
- [ADR-005](../../wayfinding-impl-2/docs/adr/005-multi-bundle-shell.md) · [ADR-006](../../wayfinding-impl-2/docs/adr/006-unified-multi-metro-debug.md) · [ADR-008](../../wayfinding-impl-2/docs/adr/008-multi-bundle-runtime-risks.md) · [ADR-009](../../wayfinding-impl-2/docs/adr/009-architecture-principles-governance.md)
- [domain.md](./domain.md) — how agents consume ADRs
