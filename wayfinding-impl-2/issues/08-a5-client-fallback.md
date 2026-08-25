Type: task
Mode: AFK
Status: open
Triage: ready-for-agent
Blocked by: 01, 02, 03

# A5 客户端兜底与指纹/能力门禁

## Question

实现客户端多级 fallback（含内置基线）与 fingerprint/capability 门禁，满足地图 A5（P11/P14）？

## 与 Goals 的关系（非新切片）

- 槽位 **按 `business_module`**：每 module 独立 baseline / Active / Previous（ADR-004/005）
- 选择器输入含壳 fingerprint + module 声明 capabilities（地图 A Goals G1.2 / G2.5）
