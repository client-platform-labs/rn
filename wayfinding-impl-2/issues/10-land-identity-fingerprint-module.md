Type: task
Mode: AFK
Status: resolved
GitHub: #10
Triage: ready-for-human
Assignee: cursor-agent
Blocked by: 03

# 落地 rn-core 身份/fingerprint 机读模块

## Question

按票 03 Answer，在 `@client-platform/rn-core` 落地 JSON Schema 与纯函数（`computeFingerprint` / `fingerprintsEqual` / `validateSupportWindow`）及单测，供 A1+ 消费？

## Answer

（2026-08-20）

在 `@client-platform/rn-core` 落地身份脊柱类型 + `runtime_fingerprint` 纯函数/Schema/单测，供 A1 消费。

### Files

- `packages/rn-core/src/types.ts` — `ArtifactKind`、`RuntimeFingerprint`、`IdentitySpine`、`JsArtifactMatrix`、`DEFAULT_JS_ARTIFACT_MAX_PROFILES`（默认 3）
- `packages/rn-core/src/fingerprint.ts` — `computeFingerprint` / `fingerprintsEqual` / `validateSupportWindow`（digest = sha256 hex of required fields, stable key order；P3：`officialCapabilityNativeLocks` 不进 digest）
- `packages/rn-core/src/schema.ts` + `packages/rn-core/schemas/runtime-fingerprint.schema.json` — JSON Schema 2020-12，`additionalProperties: false`
- `packages/rn-core/src/index.ts` — 导出类型与纯函数
- `packages/rn-core/test/fingerprint.test.ts` — equal / digest stable / support window reject（unknown label + over max）
