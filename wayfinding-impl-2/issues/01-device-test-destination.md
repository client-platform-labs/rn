Type: grilling
Mode: HITL
Status: resolved
Triage: ready-for-human
Assignee: cursor-agent
Depends on research: 01, 02

# 真机可装包 Destination 与企业闭环抽象

## Question

在「可企业推广、覆盖大型 C/B 端复杂场景」北极星下：全链路如何抽象、缺口如何消解，以及 `wayfinding-impl-2`（地图 A）Destination 如何钉死？

## Answer

（2026-08-20 全推荐）产品姿态与本图 Destination 锁定如下。

### 姿态与权威
- 北极星：**可企业推广、全链路工业级成熟可落地**；可拆地图，**不过早结束产品**；拒绝 demo / 线性五段偷换架构。
- 权威：蓝图多平面 + [research/01](../research/01-multi-plane-industrial-remediation.md) **P1–P17 全部**为产品合同补丁（**实现可分期，合同不砍**）。
- 用户「职责边界 + Phase Roadmap」仅参考吸收，不全盘照用、不改写蓝图（research/02）。
- 缺陷分析中的工业坑**切实存在**；以 P1–P17 与「缺口→补丁对照」表消解。

### Q1 — P1–P17
采纳全部为权威补丁。

### Q2 — 地图 A Destination（六切片）
`wayfinding-impl-2` Done = 下列切片合同落地且可验证（真机 ios+android；Harmony 合同一等、真机可挂地图 B）：

1. **A1** Greenfield：工业 `init`/`dev`/`doctor`；真机候选包  
2. **A2** Brownfield：三层宿主参考实现 + `rn-module` 制品行 + 棕地 doctor  
3. **A3** Delivery：七阶段编排到候选包；硬门禁分轨；双 SBOM/attest 接口；同物晋级  
4. **A4** Control Plane 合同 + 本地/内网执行后端：全状态机；分列车回滚语义；阶梯 `rollout_steps`；Paused/RolledBack 可演示  
5. **A5** Client fallback 基线槽位；指纹/能力门禁  
6. **A6** 质量信号总线（E2E→可阻断 promote）接口  

结图须挂出地图 B/C/D；**本图 Done ≠ 产品完成**。

### Q3 — 宿主回滚
`FORWARD_FIX` 发版止损；与 JS `RolledBack` **分岔展示**（P2）。

### Q4 — JS 多宿主
`support window` + 每发矩阵上限 + 退役；禁止无限 N（P1）。

### Q5 — E2E
不挡构建；可挡晋级（P7）。
