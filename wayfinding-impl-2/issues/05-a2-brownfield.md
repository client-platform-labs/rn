# A2 Brownfield：参考宿主 + rn-module + 棕地 doctor

Type: task
Mode: AFK
Status: **in-progress** — protocol embed slice landed (TS reference host); native shell / rn-module AAR still open
GitHub: #5
Triage: ready-for-agent
Blocked by: 01, 02, 03
Related: [ADR-006](../docs/adr/006-unified-multi-metro-debug.md), [16-multi-bundle-shell-dev](./16-multi-bundle-shell-dev.md)

## Question

实现 Brownfield 一等路径：三层宿主参考实现、`rn-module` 制品行、棕地 doctor，并真机可装可跑 RN Surface，满足地图 A2（P4–P6）？

## Debug 合同（HITL 2026-08-25）

Brownfield **必须**实现与 Greenfield 相同的 **`DevSessionController` / BundlerResolver 协议**：

- 多 Metro 端口表
- 多 bundler **同时**调试
- 壳内切换焦点 / override

差异仅限 `SurfaceHost` 由原生导航打开。**禁止**「棕地只支持单 8081」分支。协议版本与 GF Debug Host 协商（`devSessionProtocolVersion`）。

## AFK 进度

- [x] `createBrownfieldReferenceHost` + `createBundlerResolver` in `rn-core`（与 GF 同协议）
- [x] GF↔BF 同协议测试套件（`runtime-host.test.ts`）
- [x] 参考文档：`prototype/reference-skeleton/examples/hosts/brownfield/README.md`
- [x] `examples/brownfield-host`：TS demo + Android `SurfaceHostAdapter.kt` stub + host-profile
- [x] `rn doctor --profile brownfield`
- [x] 原生 RCT / Gradle 薄切片（`verify-bf-gradle` · `verify-bf-rct-host` · bundlerUrl HITL）
- [x] `rn-module` Android AAR 制品行薄切片（`findNewestAar` · `verify-bf-rn-module` · [HITL](../../docs/hitl/bf-rn-module-aar-2026-08-26.md)）
- [x] 宿主 BOM 消费 AAR 薄切片（`:consumer` → `project(":stub")` · [HITL](../../docs/hitl/bf-bom-consume-2026-08-26.md)）
- [ ] iOS XCFramework · 生产级 Maven/flatDir 发布
- [ ] 真机 consumer 宿主集成 DoD（深度）
- [ ] P4 全量 AGP/NDK doctor · P6 ABI 硬门禁
