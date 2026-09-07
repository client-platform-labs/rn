# ADR-018: 双公钥烘焙与 1 次 OTA 应急轮换（信任根耗尽/双失陷 = 全量重装）

Status: **accepted** (2026-09-06)
Related: Map G #193（G1）、G0、ADR-017

## Context

企业 sideload 无商店更新路径；新信任根不能经 OTA 自举。必须有私钥泄露后的恢复路径，且不能写成「一泄露就全量重装」。

## Decision

- App 烘焙两把公钥 **K1（当前签名）+ K2（备用）**，原生侧。
- **K1 泄露**：服务端用 K2 私钥签一份「K1 吊销」清单，并改用 K2 签名；设备用烘焙的 K2 验证这份吊销（攻击者无 K2 私钥，伪造不了）→ **无需重装完成 1 次应急轮换/吊销**。
- **新信任根只能烘焙进 APK**，经重打 + 重分发（MDM/sideload）下发；绝不走 OTA 自举（否则旧私钥持有者可签「新公钥」包自提权）。
- K1、K2 都用完或双失陷 → 重打 APK + 全量重装（烘焙新一对）。
- 吊销 / 轮换状态机写进 G8 runbook；措辞：「**双烘焙密钥支持 1 次 OTA 应急轮换；信任根耗尽/双失陷 = 全量重装**」。

## Consequences

- 泄露恢复从「一泄露全量重装」降为「1 次免重装轮换 + 之后才全量重装」。
- 服务端需维护双私钥与「吊销清单」签名产物；K2 签名生效后 K1 公钥在设备上的地位从「验签」退为「仅验历史或吊销」。

## Verification

- verify-* 覆盖「K1 签名被 K1 验过」「K2 注销 K1 被 K2 验过」「双失陷 → 拒绝」。

## Principles compliance

| Check | Answer |
|-------|--------|
| **Plane** | Runtime SDK 信任根 + Control Plane 签名侧；契约单一。 |
| **YAGNI** | 复用双公钥字段（现有 schema 已留），不新造轮换协议面。 |
| **Door** | 单向：信任根耗尽只能重打包，不可 OTA 自举（本 ADR 记录）。 |
| **Dev vs delivery** | 无。 |
| **GF/BF / topology** | 双公钥烘焙在嵌入原生侧，GF/BF 同机制。 |
| **Blast radius** | P0 信任根；吊销状态机进 runbook + 真机探针。 |
| **Evidence** | G8 runbook 吊销状态机 + verify-* + 真机 e2e。 |