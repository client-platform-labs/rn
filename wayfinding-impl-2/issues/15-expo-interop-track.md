# Expo 互操作轨（官方支持 · 实现低优）

Type: task
Mode: AFK
Status: open
Triage: ready-for-agent
Blocked by: [12-expo-competitive-analysis](./12-expo-competitive-analysis.md)
Priority: **P3**
Related: [ADR-003](../docs/adr/003-expo-interop-track.md), [research/04 §8](../research/04-industrial-full-lifecycle-scheme.md)

## Question

在 **不默认绑定 Expo 运行时** 前提下，为轨 0/1 提供 **官方支持级** 扩展点（manifest、doctor、migrate 草案），使已有 Expo 项目可渐进叠加本平台？

## Scope（v1 — 合同与探测，非全量迁移工具）

1. **Manifest**：`interop.expo` 可选块 schema（runtimeVersion 映射提示）
2. **`rn doctor --profile expo`**：检测 `expo` 依赖、SDK↔RN drift、runtimeVersion 与 fingerprint 映射警告
3. **`rn migrate --from expo --dry-run`**：输出轨 0/1/2 建议与风险清单（不自动改工程）
4. **文档**：四轨迁移指南 + 不支持列表

## Out of scope（v1）

- 自动 prebuild / 自动脱 Expo
- Expo Dev Client 内嵌我方 FAB（除非 brownfield ADR 另开）

## Acceptance

- [ ] schema + doctor profile 单测
- [ ] dry-run 对 sample Expo 工程（fixture）输出稳定 JSON
- [ ] ADR-003 与文档交叉链接
