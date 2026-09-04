# Map #149 — 多离线包本地联调工业加载闭环 (wayfinder:map)

**Map:** [#149](https://github.com/client-platform-labs/rn/issues/149) (`wayfinder:map`)
**Status:** OPEN · Path B thin-wrapper **landed** (issue #159 closed 2026-09-04)

完整平台术语见 [`wayfinding/CONTEXT.md`](../wayfinding/CONTEXT.md) · Map E 增量见 [`wayfinding-map-e/CONTEXT.md`](../wayfinding-map-e/CONTEXT.md) · Hermes 增量见 [`wayfinding-hermes/CONTEXT.md`](../wayfinding-hermes/CONTEXT.md)。

## Destination

工业级、可企业推广的「多离线包 / 多 Metro **本地联调加载闭环**」：Catalog 登记 × Broker Live × 面板 bindable × Host 真·执行业务包 JS × Fast Refresh 来自业务 Metro × Release 仍禁 http。Done = 钢线闭合 + 自动化证据 + 双 Metro 同开 + desk/fixture_second 真机可验收。**Phase-1 进程重载 host-surface = 里程碑**，不关本图；关图必须 ScriptManager / 二级加载（壳常驻）闭合。

## Anchor

- **Host** 启动不依赖 `@callstack/repack`（R9）；选用 Re.Pack 时按 dynamic import 装配。
- **Release** 仍只允许 `localPath`（已 `gateBundleLoad` 验证）；Dev Metro http 仅 Bind 路径。
- **iOS Debug Bind 钢线** = Out of scope（map #149 钉死 Android 优先）。
- **双 ReactHost** = 出图（#153 Grill 决定 C 路径出局）。

## Progress board (excerpt)

| ID | GH | 标题 | Status |
|----|-----|------|--------|
| R1 | [#151](https://github.com/client-platform-labs/rn/issues/151) | 业内加载 research | CLOSED |
| R2 | [#152](https://github.com/client-platform-labs/rn/issues/152) | execute 缺口 research | CLOSED |
| G1 | [#150](https://github.com/client-platform-labs/rn/issues/150) | Destination Done grill | CLOSED |
| G2 | [#153](https://github.com/client-platform-labs/rn/issues/153) | 工业加载路径选型 grill | CLOSED |
| P1 | [#154](https://github.com/client-platform-labs/rn/issues/154) | 操作员一页纸 prototype | CLOSED |
| T1 | [#158](https://github.com/client-platform-labs/rn/issues/158) | Metro 智能端口 | CLOSED |
| T2 | [#159](https://github.com/client-platform-labs/rn/issues/159) | **ScriptManager 二级加载 (Path B 薄封装)** | **CLOSED 2026-09-04** |
| T3 | [#155](https://github.com/client-platform-labs/rn/issues/155) | 落地真·Bind + 证据 | frontier（落地中） |

## Status note (2026-09-04, issue #159)

**Path B landed as `ScriptManagerAdapter`; Re.Pack preferred, native-evaluate shim as fallback; iOS out of scope for now.** The `createRePackAdapter()` factory in `packages/rn-core/src/secondary-script.ts` dynamic-imports `@callstack/repack` so the host boots without it (R9); on import failure it throws `ScriptManagerAdapterUnavailable { code: "no_repack" }`. The `createNativeEvaluateAdapter()` is a guarded shim that returns `{ ok: false, reason: "no_native_runner" }` unless a `runJsBundle` hook is supplied. `createDefaultAdapter()` resolves the import once and caches the winning kind. The host example at `examples/brownfield-host/src/script-manager-host.ts` picks an adapter, calls `loadSecondary({ kind: "devMetro", ... })`, and falls back to `phase1_reload` on `{ ok: false }`. The native-evaluate shim spike report lives at [`research/R10-native-evaluate-shim.md`](./research/R10-native-evaluate-shim.md).

## Research index

- [`research/R10-native-evaluate-shim.md`](./research/R10-native-evaluate-shim.md) — RN 0.87 bridgeless no-Re.Pack evaluation spike; concluded **needs Re.Pack** for full RN UI bundles.

## Anti-patterns

- Dev Metro fetch as "release" — forbidden.
- Hard dep on `@callstack/repack` — forbidden (R9).
- `eval(userBundleCode)` in production paths — forbidden; shim only fires `runJsBundle` if host supplies one.
- iOS Bind 钢线 — out of scope (map #149).
