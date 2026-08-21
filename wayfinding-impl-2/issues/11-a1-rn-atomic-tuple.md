Type: grilling
Mode: HITL
Status: resolved
Triage: ready-for-human
Assignee: cursor-agent
Blocked by: 01, 03

# A1 RN 原子元组与 New Arch 钉死

## Question

Greenfield（地图 A1）默认锁定的 React Native / Hermes / New Arch 原子元组与工具链基线是什么，才能作为 `rnExactTuple` 与 doctor 门禁的权威，并服务企业可推广路径？

## Answer

（2026-08-21 全推荐）

1. **默认 RN 列车**  
   Greenfield `init` 钉 **React Native 0.87.x**（2026-08 稳定线）：New Architecture **唯一**；Hermes V1 **默认**；Node 与仓库一致（doctor 要求 24.x；满足 RN ≥22）。

2. **`rnExactTuple` 约定**  
   机读形如 `0.87.<patch>+hermes-v1+newarch+codegen-locked`；精确 patch 在 lock/模板生成时写入；doctor 校验 major.minor 列车 + New Arch/Hermes 标志。

3. **升级策略**  
   平台维护 `production` / `next` 列车；业务跟 `production`；minor 升级走 `migrate` + 兼容窗；禁止 init 默认进实验旗标轨。

4. **Harmony**  
   A1 模板仍默认 ios+android；Harmony 独立 `artifact_line`/元组合同预留；真机钉版本挂地图 B。
