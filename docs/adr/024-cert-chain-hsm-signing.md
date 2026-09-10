# ADR-024: 签名模型迁移 —— 自研双钥 → 证书链 + HSM（行业主流）

Status: **accepted** (2026-09-10, approved)
Related: ADR-017（设备验签）· ADR-018（双钥轮换）· ADR-023（指纹权威）· 0→1 演练 F04/F05/F06 · SEAM-1 #247 · 决策 D3
Supercedes: ADR-018 的"双烘焙钥 + 吊销清单"自研模型

## Context

0→1 真机演练（2026-09）暴露信任根模型的三个问题：

1. **F06 设计未实现且非行业主流**：ADR-018 承诺"双烘焙钥支持 1 次 OTA 应急轮换"，但代码只有单钥（keygen 出一对、模板烘焙一把、吊销清单无接线）；且"双烘焙钥"不是行业通行做法（主流是 PKI：单签名钥 + HSM + 证书链 + CRL/OCSP）。
2. **F05 托管/连续性只是文档建议**：私钥在发布负责人本地，无 HSM/托管，人走即信任根风险。
3. **F04 吊销无接线**：shell-core 有 fetchRevocations 契约 + verifyRevocationSeal 实现，但生成壳不调用 → 应急轮换在真机不可达。

决策 **D3（2026-09-09）**：弃用自研双钥，对齐行业主流——单签名钥 + HSM 托管 + 证书链（根 CA 签发）+ CRL/OCSP 吊销。本 ADR 固化该决策的设计与迁移路径。

## Decision

### 目标模型（PKI + HSM）

| 层 | 职责 | 持有 |
|----|------|------|
| **根 CA（RCA）** | 签发业务签名证书（leaf）；信任锚 | RCA 私钥离线/HSM 保管，**公钥烘焙进 APK**（一次） |
| **业务签名钥（leaf）** | 签署 js-update / app-host 制品（`pem:ed25519:` seal 保留） | **HSM/KMS 保管**，私钥不出 HSM，签名在 HSM 内完成 |
| **证书链** | 设备端验 leaf 证书 → RCA（可信锚）；**业务钥轮换 = 换 leaf 证书，仍被 RCA 信任，不动设备** | — |
| **吊销** | CRL（证书吊销名单）/ OCSP（在线状态）——行业标准 | CP 提供端点；设备按需拉取 |

### 关键收益（对比 ADR-018 双钥）

1. **轮换不动设备**：业务签名钥可**多次**轮换（新 leaf 证书由 RCA 签发，旧 RCA 仍在设备端烘焙 → 新证书天然被信任）。ADR-018 只够 1 次，且需双钥烘焙。
2. **吊销走行业标准**：CRL/OCSP 替代自研"吊销清单"，生态/审计兼容。
3. **私钥不出 HSM**：F05 托管问题由 HSM/KMS 结构性解决（密钥在硬件里，人走钥不走、人走权即失——通过 HSM 访问控制）。
4. **行业可信**：与商店签名/PKI 生态对齐，企业采购第一道门（安全模型）可对标 Sigstore/商店签名。

### 验签链设计（设备端）

```
制品 seal (pem:ed25519:…) + leaf 证书链
  → 验 RCA 公钥（烘焙）签发 leaf 证书（X.509）
  → 验 leaf 公钥与 seal 匹配（Ed25519 verify 内容，保留 ADR-017 的 seal 上下文）
  → CRL/OCSP 检查 leaf 未吊销
  → 通过才执行（fail-closed，继承 ADR-017）
```

- 签名内容契约（`release_id:artifact_kind:digest`）**不变**（ADR-017 seal 层保留）。
- RCA 烘焙 = 信任根的一次性锚点；**业务钥轮换不触碰 RCA**。

### 各平面落地范围（D3 工作分解）

| 平面 | 工作项 |
|------|--------|
| **core** | `verifyEd25519Seal` 之上新增证书链验证（X.509 leaf→RCA）+ CRL/OCSP 检查；`gateBundleLoad` 输入扩展（证书链、吊销状态） |
| **ship** | `sign` 对接 HSM/PKCS#11/KMS（签名在 HSM 内）；`keygen` 扩展为 `keygen`（生成 leaf CSR → RCA 签发）+ RCA 初始化；CP 增加 `/v1/crl` 或 OCSP 端点 |
| **模板/壳** | 烘焙 RCA 公钥（替换单叶钥烘焙）；`fetchRevocations` 接通（拉 CRL/OCSP + 验链）——补 F04 |
| **shell-core** | `pullOtaUpdate` 吊销拉取接通 + 验链调用 |
| **运维/治理** | RCA 离线生成 + HSM 保管 + 审计；leaf 轮换 runbook；ADR-017/018 修订 |

### 迁移路径（兼容期）

1. **阶段 0（当前）**：单叶钥 + `pem:ed25519:` seal；RCA/证书链未上线。
2. **阶段 1（并行）**：签名 seal 附加证书链字段（`signature` 侧）；旧设备按旧逻辑（烘焙单钥）验，新设备按证书链验；CP 同时服务双格式。
3. **阶段 2（切换）**：设备端以 RCA 烘焙为主；CRL/OCSP 生效；旧单钥路径下线。
4. **阶段 3（收尾）**：ADR-018 双钥字段废弃；文档/探针更新。

> 迁移原则：**新信任根只能烘焙进 APK**（ADR-018 不变），不 OTA 自举。

## Consequences

- **正面**：轮换多次不动设备；吊销走行业标准；私钥出不了 HSM（F05 结构解决）；企业安全模型可对标主流。
- **代价**：需要 HSM/KMS 基础设施（或云 KMS 如 AWS KMS / Alibaba KMS）；证书生命周期管理（签发/轮换/吊销）成为新运维面；设备端验签链复杂度上升（X.509 解析 + CRL/OCSP）。
- **废弃**：ADR-018 双烘焙钥 + 自研吊销清单（代码未实现，废弃成本低）。
- **兼容**：`pem:ed25519:` seal + 内容契约不变；ADR-017 设备信任模型保留，修订引用 024。

## Verification

- **单测**：证书链验签（leaf→RCA）、CRL/OCSP 拒绝已吊销 leaf、轮换后新 leaf 被旧 RCA 信任、fail-closed（缺链/吊销）。
- **真机**：HSM 签名包设备端验链通过；轮换后设备不重装拉到新 leaf 包；吊销后设备拒绝。
- **e2e**：0→1 全链（新 keygen→CSR→RCA 签发→sign(HSM)→promote→设备验链→轮换→吊销）探针。

## Principles compliance

| Check | Answer |
|-------|--------|
| **Plane** | 信任根（RCA/HSM）+ 签名（ship）+ 验签链（core/shell-core）+ 吊销端点（CP）——平面清晰 |
| **YAGNI** | 复用行业标准（X.509/CRL/OCSP/HSM），不新造轮换协议 |
| **Door** | 信任根迁移单向（新 RCA 只能烘焙进 APK，不 OTA 自举） |
| **Dev vs delivery** | lab 用 `ship keygen`（HSM 模拟/软钥），生产用真 HSM/KMS |
| **GF/BF** | 同一验签链契约，GF/BF 共用 |
| **Blast radius** | 信任根迁移 P0；分阶段并行（阶段 1 兼容期），逐阶段验证 |
| **Evidence** | 单测 + 真机验链/轮换/吊销探针 + 0→1 e2e |
