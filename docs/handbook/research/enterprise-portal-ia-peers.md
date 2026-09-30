# Enterprise portal IA — OTA peer docs patterns

> Research scope: GitHub issue [#306](https://github.com/client-platform-labs/rn/issues/306), parent map [#305](https://github.com/client-platform-labs/rn/issues/305). Question: extract **low-cognitive-load full-chain onboarding** IA patterns from Expo EAS Update · Shorebird · CodePush/Revopush · (optional) Ionic Appflow Live Updates · Pushy（极速热更新）, and map each pattern to a proposed slot in our unified enterprise promotion handbook portal. **Does not write handbook body copy.** Access date for all primary URLs: **2026-09-30** unless noted.

---

## Summary (gist)

Peers converge on five IA moves that keep onboarding cheap:

1. **Steel-thread first** — intro or Quick Start shows the shortest path (install → configure → binary → publish once) before theory.
2. **Concepts are skippable** — Shorebird literally says “feel free to skip”; Expo parks “How it works / runtime / channels” under a Concepts subsection after Get started.
3. **CLI ≠ concepts ≠ SDK** — Revopush splits `intro/` · `cli/` · `sdk/`; Expo separates Get started / Deployment / Concepts / Troubleshooting / Reference; Shorebird home fans out Getting Started vs Code Push vs CI.
4. **Deepen tracks** sit after the steel thread: signing, self-host / standalone, rollouts, rollbacks, brownfield, CI.
5. **Incident / recovery is a first-class nav surface** — Expo has Debugging + Error recovery; Revopush has `troubleshooting/` + CLI rolling-back; Appflow + Pushy surface FAQ / 崩溃回滚 near the product intro. Our existing operations “紧急通道” already matches this slot.

---

## Per-peer IA (primary sources)

### Expo EAS Update

**Nav tree (from docs index):** Introduction → Get started → (preview / GitHub Actions) → **Deployment** (deploy, download, rollouts, rollbacks, …) → **Concepts** (how it works, branches/channels CLI, runtime versions) → **Troubleshooting** (debug, error recovery) → **Reference** (code signing, standalone-without-other-EAS, request proxy, migrate, brownfield). — <https://docs.expo.dev/llms.txt>

| Pattern observed | Evidence |
| --- | --- |
| Intro page carries an executable **Quick start** (2–3 commands) + link to full Get started | <https://docs.expo.dev/eas-update/introduction/> |
| Get started is a **numbered steel thread**: CLI → login → `eas update:configure` → channel → **create a build** → change JS → `eas update` → test | <https://docs.expo.dev/eas-update/getting-started/> |
| **When to use / when not** table on intro (JS/assets ✓ vs native ✗) — capability boundary without burying in concepts | same introduction URL |
| Concepts live under their own section; “How it works” is conceptual, not required before first publish | <https://docs.expo.dev/eas-update/how-it-works/> |
| Deepen: rollbacks (`eas update:rollback`), rollouts, **code signing** (plan-gated), standalone service, brownfield native | <https://docs.expo.dev/eas-update/rollbacks/> · <https://docs.expo.dev/eas-update/code-signing/> |
| Emergency-adjacent: dedicated Debugging + Error recovery pages | <https://docs.expo.dev/eas-update/debug/> · <https://docs.expo.dev/eas-update/error-recovery/> |

### Shorebird Code Push

**Home IA:** prerequisites → **Getting Started** | **Code Push** | **CI Integration**. — <https://docs.shorebird.dev/>

| Pattern observed | Evidence |
| --- | --- |
| Getting Started = install → doctor → login → init/create → **Next steps: Release · Patch · Preview** | <https://docs.shorebird.dev/getting-started/> |
| Code Push overview: workflow list (release → store → patch) + **patchable? flowchart** before glossary | <https://docs.shorebird.dev/code-push/> |
| Explicit skippable concepts: *“This section contains a high-level overview… Feel free to skip it now and come back later if you need.”* then glossary (Application / Release / Patch / Track / Artifact) | same Code Push URL |
| CLI verbs encode the product model: `shorebird release` vs `shorebird patch` (and rollback via patches rollback in agent/llms surface) | <https://docs.shorebird.dev/llms.txt> |
| Deepen called out in long-form guide: tracks, rollbacks, patch signing, CI — after “init → first patch” | <https://docs.shorebird.dev/code-push/guides/code-push-guide/> |

### CodePush lineage → Revopush

Microsoft App Center CodePush docs are under the App Center tree and sit behind **Retirement** of App Center; the live CodePush-*compatible* onboarding IA to study for new work is **Revopush**. — App Center hub: <https://learn.microsoft.com/en-us/appcenter/distribution/codepush/> · retirement referenced from Revopush home nav · Revopush: <https://docs.revopush.org/>

**Revopush nav (three planes):** `intro/` (5-minute user guide) · `cli/` (app / deployment / releasing / promoting / rolling-back / code-signing) · `sdk/` (platform setup + API) · plus `troubleshooting/` · `cicd/` · `migration/`.

| Pattern observed | Evidence |
| --- | --- |
| **5-minute steel thread** on intro: account → app → SDK install → keys → JS wrap → CLI login → `release-react` → Release-mode run | <https://docs.revopush.org/intro/getting-started> |
| **CLI getting-started is auth/session only** — release/promote/rollback are sibling CLI pages (CLI ≠ tutorial dump) | <https://docs.revopush.org/cli/getting-started> · sibling paths under `/cli/` |
| Default **Staging + Production** deployments at `app add` — environment surface before advanced tracks | <https://docs.revopush.org/cli/app-management> · <https://docs.revopush.org/cli/deployment-management> |
| Deepen: promoting updates, rolling back, code-signing as CLI chapters | `/cli/promoting-updates`, `/cli/rolling-back-updates`, `/cli/code-signing` |
| Optional agent Skills path **before** manual steps (same pattern emerging at Expo Get started / Shorebird install) | Revopush intro “Set up with an AI agent” |

### Ionic Appflow Live Updates (optional)

| Pattern observed | Evidence |
| --- | --- |
| Product intro = one-paragraph promise + **binary-compatible only** note + four outbound links: Install SDK · Deploy first · FAQ · Self-hosted | <https://ionic.io/docs/appflow/deploy/intro> |
| Quickstart deploy is a short chain; SDK setup page separates **config knobs** from **strategies** (background / always latest / force / dynamic) and points API to a reference page | <https://ionic.io/docs/appflow/quickstart/deploy> · <https://ionic.io/docs/appflow/deploy/setup/capacitor-sdk> |
| Self-hosted called out from intro as deepen for “strict security” (link present on intro; treat as deepen-track pattern even if path variants exist) | intro “Self-hosted Live Updates” |

### Pushy 极速热更新 (optional; `react-native-update`)

> Not pushy.me (push notifications). Target: <https://pushy.reactnative.cn/>.

| Pattern observed | Evidence |
| --- | --- |
| Intro sells outcomes, then a **numbered 开始使用**: Skill → 安装配置 → 代码集成 → 发布更新 | <https://pushy.reactnative.cn/docs/intro> |
| Manual install page is long but **ordered**: install CLI+SDK → native bundle URL → login/`createApp` → handoff to 代码集成 (steel continues across pages) | <https://pushy.reactnative.cn/docs/getting-started> |
| **API 参考** is a separate surface from onboarding; analytics / 崩溃回滚 called on intro as post-publish concerns | intro + <https://pushy.reactnative.cn/docs/api> |
| Explicit CodePush sunset migration CTA on intro — migration as deepen/adjacent, not blocking first publish | intro warning re App Center 2025-03-31 |

---

## Cross-cutting IA patterns (portable)

| # | Pattern | What it buys (cognitive load) |
|---|---|---|
| P1 | **Intro Quick start + full Get started** | First screen answers “can I ship today?” without a concept dump |
| P2 | **Steel thread includes a host binary** before OTA publish | Prevents the #1 dead-end (publish with nothing listening) |
| P3 | **Skippable Concepts / glossary** | Experts skip; novices return when stuck on vocabulary |
| P4 | **CLI reference ≠ tutorial** | Commands stay scannable; tutorials stay narrative |
| P5 | **SDK / native setup ≠ release operator path** | Matches our 壳 / 离线包 / 平台三角色 without merging surfaces |
| P6 | **Capability boundary table early** (what OTA can/can’t) | Stops wrong expectations before deepen tracks |
| P7 | **Deepen rails after first success**: signing · self-host/standalone · rollout% · rollback · CI · brownfield | Progressive disclosure for L5-class concerns |
| P8 | **Troubleshooting / rollback / error-recovery as peer nav**, not buried footnotes | Emergency path stays findable under stress |
| P9 | **Default two environments** (preview/production, Staging/Production, stable/beta tracks) | Staging habit without inventing full L5 |
| P10 | **Agent Skills / pasteable agent recipe as optional on-ramp** | Parallel to human Get Started; does not replace it |

---

## Mapping table → our portal slots

Portal slots assumed from map #305 Destination (single entry · Get Started steel · concepts skippable · CLI ≠ concepts · deepen · emergency). Exact file TOC still open on the map (*Not yet specified*).

| Pattern | Proposed portal slot | Suggested content posture (not body copy) |
|---|---|---|
| P1 Intro Quick start | **Get Started** (portal home above-the-fold) | 3–5 command “钢线速览” + link to full GF Android steel (SOP-GF-STEEL-01 absorb/link per #311) |
| P2 Binary-before-OTA | **Get Started** main path | Explicit step: 宿主发布 / preview 装机 **before** `rn-delivery` promote / OTA publish |
| P3 Skippable concepts | **concepts** | Channel/runtime（或本仓等价物：digest / 槽位 / K1 烘焙）glossary; banner: “可跳过，卡住再回” |
| P4 CLI ≠ tutorial | **CLI ref** | Command cheatsheet + flags; tutorials stay in Get Started / daily ops |
| P5 Role / surface split | Portal home + **Get Started** role chips | 壳运维 / 离线包运维 / 平台运维 entry tiles → role-filtered steps (SoT: `roles-matrix`) |
| P6 Capability boundary | **Get Started** or portal home callout | L0–L5 “主路径可执行 vs 加深” honesty table (feeds #308) |
| P7a Code signing / key rotation | **deepen** | Pointer into architecture/ops ota 信任模型；not on steel critical path beyond “keys exist” |
| P7b Self-host / standalone / proxy | **deepen** | Region / private delivery; keep off GF steel |
| P7c Rollout % / tracks / AB | **deepen** (L5) | Honest `TODO(实现)` boundary per #309 |
| P7d CI automation | **deepen** | After human steel works once |
| P7e Brownfield / existing native | **deepen** | BF out of v1 steel per map standing decision |
| P8 Debug / rollback / oncall | **emergency** | Keep/pointer to operations `index.md` §0 紧急通道; daily rollback also linked from Get Started “日常” |
| P9 Default staging+prod | **Get Started** + light **concepts** | Two named environments in steel; extra tracks = deepen |
| P10 Agent recipe | **Get Started** optional sidebar | Pasteable agent brief mirroring Expo/Shorebird/Revopush; BD 不代跑原则不变 |

### Slot → peer exemplars (quick index)

| Portal slot | Strongest peer exemplars |
|---|---|
| Get Started | Expo Get started; Shorebird Getting Started; Revopush intro 5-min; Pushy 开始使用 order |
| concepts | Shorebird “feel free to skip”; Expo Concepts subsection |
| CLI ref | Revopush `/cli/*` tree; Expo “Manage branches and channels with EAS CLI”; Shorebird CLI verbs |
| deepen | Expo Reference (signing, standalone); Shorebird tracks/signing/CI; Appflow Self-hosted; Revopush promote/signing |
| emergency | Expo debug + error-recovery; Revopush troubleshooting + rolling-back; our ops 紧急通道 |

---

## Implications for map #305 (research only)

1. Portal home should look more like **Expo introduction / Shorebird home** (quick path + fan-out) than like a merged three-book TOC.
2. **SOP-GF-STEEL-01** belongs in Get Started as the steel narrative (absorb vs link is #311); do not make signing/self-host/L5 the first scroll.
3. Preserve **operations 紧急通道** as the emergency slot; do not require operators to re-enter via concepts.
4. Split **每日发布/回滚** (Get Started “日常”) from **CLI 词典** (CLI ref) and from **验签/吊销深潜** (deepen + emergency pointer).

---

## Sources checklist

| Peer | Primary entry URLs |
|---|---|
| Expo EAS Update | <https://docs.expo.dev/eas-update/introduction/> · <https://docs.expo.dev/eas-update/getting-started/> · <https://docs.expo.dev/eas-update/how-it-works/> · <https://docs.expo.dev/eas-update/rollbacks/> · <https://docs.expo.dev/eas-update/code-signing/> · <https://docs.expo.dev/llms.txt> |
| Shorebird | <https://docs.shorebird.dev/> · <https://docs.shorebird.dev/getting-started/> · <https://docs.shorebird.dev/code-push/> · <https://docs.shorebird.dev/code-push/guides/code-push-guide/> · <https://docs.shorebird.dev/llms.txt> |
| CodePush / Revopush | <https://learn.microsoft.com/en-us/appcenter/distribution/codepush/> · <https://docs.revopush.org/> · <https://docs.revopush.org/intro/getting-started> · <https://docs.revopush.org/cli/getting-started> |
| Appflow Live Updates | <https://ionic.io/docs/appflow/deploy/intro> · <https://ionic.io/docs/appflow/quickstart/deploy> · <https://ionic.io/docs/appflow/deploy/setup/capacitor-sdk> |
| Pushy 极速热更新 | <https://pushy.reactnative.cn/docs/intro> · <https://pushy.reactnative.cn/docs/getting-started> · <https://pushy.reactnative.cn/docs/api> |
