# scripts/release-readiness · 上市前质量验收套件

> **目的：** 把"平台产物是否达到上市前质量标准"做成可自动跑、可机读、可人读的验收套件。
> **设计原则：**
> - **平台能自测的部分**（合同 / 运行时 / 交付 / CP / 治理）→ 脚本自动跑，exit 0/非 0
> - **企业侧必做动作**（开发者账号 / 资质 / 法务）→ 清单手册，发布者照着做
> - **跑完输出** `release-readiness-report.md`：可拿给商店审核员 / 内部审批 看
>
> **不重做已有 `verify-*.mjs` / `bench-*.sh` / `run-*-loop.mjs`**——本套件只做编排 + 上市前补缺。

---

## 文件清单

| # | 文件 | 类型 | 状态 | 用途 |
|---|------|------|------|------|
| 00 | `pre-flight.sh` | shell | ✅ | 工具链 / 权限 / 网络预检 |
| 01 | `01-platform-contract.sh` | shell | ✅ | 平台合同 L0（doctor / governance） |
| 02 | `02-runtime-host.sh` | shell | ✅ | 主机三层 + 业务模块加载（A5 兜底） |
| 03 | `03-delivery.sh` | shell | ✅ | 七阶段合同 + 候选包晋升 |
| 04 | `04-control-plane.sh` | shell | ✅ | CP 状态机 + Bearer + RBAC |
| 05 | `05-governance.sh` | shell | ✅ | ADR-008 P0 + compliance_profile |
| 06 | `06-ios.sh` | shell | ✅ | iOS Xcode / TestFlight / 商店提审预检 |
| 07 | `07-android.sh` | shell | ✅ | Android Gradle / 内测分发 / Play 提审预检 |
| 08 | `08-harmony.sh` | shell | 🟡 | Harmony DevEco / AGC（如启用；shelved 默认 SKIP） |
| 09 | `09-7channel.sh` | shell | 🟡 | 七渠 submit 预检（合同检查；适配器 deferred） |
| 10 | `10-store-submit-checklist.md` | markdown | ✅ | **发布者侧动作清单**（开发者账号 / 资质 / 法务 / 商店 API 凭证 / 隐私 / 提审） |
| — | `run-all.sh` | shell | ✅ | 串行所有 + 输出报告 |
| — | `README.md` | markdown | ✅ | 本文件 |

---

## 用法

```bash
# 1. 跑全量（推荐先跑，看整体状态）
bash scripts/release-readiness/run-all.sh

# 2. 跑单个阶段
bash scripts/release-readiness/02-runtime-host.sh

# 3. 跑前 N 个（CI gate）
bash scripts/release-readiness/run-all.sh --stop-on-fail --max 05

# 4. 输出 release-readiness-report.md
bash scripts/release-readiness/run-all.sh --report > docs/hitl/release-readiness-$(date +%F).md
```

## 退出码约定

| 退出码 | 含义 | 建议动作 |
|--------|------|----------|
| 0 | 该阶段已达"上市前"标准 | 进入下一阶段 |
| 2 | 工具链缺失 / 凭证缺失 | 装工具 / 申请凭证，重跑 |
| 3 | 平台合同 / 门禁失败 | 修代码 / 修配置，commit 重跑 |
| 4 | 观测 / 提审预检失败 | 修产物，重跑 |
| 5 | shelved / deferred 段 | 默认 SKIP；如启用须先开 issue |

## 不在范围内

- **真生产上市动作**（开发者账号开通 / ICP 备案 / 软件著作权 / 等保认证）—— 见 [10-store-submit-checklist.md](./10-store-submit-checklist.md)
- **法务审核 / 隐私政策撰写**——合规叠加档（[compliance_profile](../../blueprint/05-governance.md)）只提供技术框架
- **商店商务接入**（七渠店侧 submit 适配器）—— #89 deferred

## 维护

- 平台迭代 → 改对应 `*.sh` 阈值 / 增删 verify 步骤
- 新增验证阶段 → 增 `NN-*.sh` + 改 `run-all.sh` 序列
- 商店政策变化 → 改 [10-store-submit-checklist.md](./10-store-submit-checklist.md)
- 报告模板 → 改 `run-all.sh` 中 report section
