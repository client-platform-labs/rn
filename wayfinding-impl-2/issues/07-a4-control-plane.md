# A4 Control Plane：Node API + Web 控制台（可演示）

Type: task
Mode: AFK
Status: open
GitHub: #7
Triage: ready-for-agent
Blocked by: 01, 02, [06-a3-delivery-candidate](./06-a3-delivery-candidate.md)（制品元数据）, [08-a5-client-fallback](./08-a5-client-fallback.md)（客户端兜底演示）
Priority: **P1**
Related: [blueprint/04-control-plane](../../blueprint/04-control-plane.md), [research/04 §6](../research/04-industrial-full-lifecycle-scheme.md), HITL §12.2

## Question

落地 **Node 控制面服务 + Web 控制台**，使全状态机、分列车回滚语义、阶梯 `rollout_steps`、Paused/RolledBack（JS）与宿主 FORWARD_FIX **可演示**，满足地图 A4？

**地图 A Goals**：`release_unit = app × module × train × channel`；Kill/灰度 **按 module**（G1.2 / G2.4）；非新切片。

## HITL 形态（2026-08-25）

- **API 为权威**；Web 做人机；`rn-delivery` / CLI 调同一 HTTP API（内网默认可本地）
- **不是**「仅 CLI」；**不是**把业务规则写死在前端

## Architecture（建议 monorepo 包）

```text
packages/control-plane-api/   # Node：状态机、发布单、策略、审计
packages/control-plane-web/   # Web：发布/灰度/Kill/制品浏览
```

执行后端（构建 runner、CDN）仍为 **adapter**；控制面只存事实与策略。

## Scope（地图 A 最小可演示）

### API

- `release_unit` CRUD（app × module × train × channel）
- 状态转移：Draft → … → Canary → Rolling → Full | Paused | RolledBack | Retired
- JS vs 宿主：**回滚文案分岔**（P2）；宿主 RolledBack 语义 = FORWARD_FIX 提示
- `rollout_steps[]`：cohort、percent、min_soak（P10）；js-gated 进 Full 需人工 flag
- Kill Switch：按 `business_module`（P12）
- 制品绑定：`release_id` + `artifact_digest`（来自 A3）
- 离线包策略：JS 列车 + baseline/N/N-1 字段（ADR-004）；content 通道 schema 预留

### Web

- 发布单列表/详情、状态操作、审计时间线
- 灰度步进可视化、一键 Paused
- 制品/符号 digest 浏览（链接 delivery 产出）

### 演示脚本（验收）

1. 绑定 A3 候选 host + js-update  
2. Staged → Canary 1% → 模拟 SLO breach → **Paused**  
3. JS **RolledBack** 到上一 `update_id`（选择器 mock 或 A5 联调）  
4. 宿主事故操作展示 **FORWARD_FIX**（非「撤回商店包」）

## Out of scope（A4 v1）

- 完整 AB 实验 UI（P3；契约托管即可）
- 大陆七渠商店自动提交
- 多租户 SaaS 级隔离（单企业内网演示即可）

## Acceptance

- [ ] API OpenAPI/JSON schema 版本化；`CI=1` 非交互
- [ ] Web 可完成上述演示脚本无手工改 DB
- [ ] 审计：每次状态转移有 actor + timestamp + 前/后状态
- [ ] `pnpm test` 覆盖状态机非法转移拒绝

## 辐射

- 票 14 装包台可调 CP API 取候选包列表
- A6 quality_signal 可挡 promote（P7）
