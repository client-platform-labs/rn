# A2 Brownfield：参考宿主 + rn-module + 棕地 doctor

Type: task
Mode: AFK
Status: open
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
