# Distribution Console：自建装包台（类 Ares）

Type: task
Mode: AFK
Status: open
GitHub: #15
Triage: ready-for-agent
Blocked by: 01, 02, [06-a3-delivery-candidate](./06-a3-delivery-candidate.md)（候选包元数据）
Priority: **P2**（不阻塞票 13 / A3 核心）
Related: [research/04 §5](../research/04-industrial-full-lifecycle-scheme.md), HITL §12.1 **自建**

## Question

实现企业 **自建** 测试包/预发包安装台（类似 adb 场景下的 Ares），消费 `release_id` + `artifact_digest`，**不**自创版本语义，满足回归与内测效率？

## 非目标

- 不做第二套发布真相源（策略仍在 Control Plane）
- v1 不要求替代全部 MDM/商店分发

## Scope（v1 最小）

### 服务端（Node）

- 包库 API：按环境（debug/staging/candidate）列出 `app-host` / `rn-module` 制品 + 符号引用
- RBAC + 安装/下载审计
- 与 `rn-delivery build` 产出对接（digest、release_id）

### Agent（可选 CLI + 本地 agent）

- USB / Wi‑Fi adb：拉取候选包 → `adb install` → 回传 `quality_signal`（挂 A6 接口）
- 与 DevTransport（票 13）共用 adb 探测

### Web（可与 A4 同仓或子模块）

- 扫码/链接安装页（Android 侧载；iOS 企业签流程文档化）
- 环境标签：测试包不可误标为 production 同物

## Acceptance

- [ ] 从 `rn-delivery build` 候选包上传/登记 → Web 可见 → agent 装到真机
- [ ] 安装结果写入 quality_signal 形状（mock 即可，A6 未全时）
- [ ] 审计日志含操作者、digest、设备 serial

## 辐射

- 迁移 §8：回归包一键装
- A6：E2E 触发入口
