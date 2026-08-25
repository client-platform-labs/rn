Type: grilling
Mode: HITL
Status: resolved
GitHub: #2
Triage: ready-for-human
Assignee: cursor-agent
Blocked by: 01

# 地图 A 切片序与首批验收

## Question

地图 A 六切片的实施顺序、首批 HITL/AFK 拆票边界，以及第一条可复现验收命令串如何定，才能在不砍 P1–P17 合同的前提下尽快形成可推广闭环增量？

## Answer

（2026-08-20 全推荐）

1. **实施顺序**
   - 契约/身份（票 03）→ **A1** Greenfield 真机 → **A3** 候选构建（可与 A1 后半并行）→ **A5** 兜底接口并行 → **A2** Brownfield → **A4** 控制面演示 → **A6** 质量信号
   - 允许并行 AFK；禁止无序六切片同时无契约开工

2. **首条人工验收串**
   - Greenfield（文档化）：`doctor` → `init` → `dev` 真机 → `rn-delivery` 出候选包 → 安装打开 RN 界面
   - Android 可先过；iOS 同等要求
   - Brownfield 另写独立验收串（票 A2）

3. **票 03 与 A1**
   - 票 03（身份/fingerprint 机读合同）HITL **关后**才能 AFK A1（契约左移）
   - 禁止 A1 先写死魔法字符串再补契约
