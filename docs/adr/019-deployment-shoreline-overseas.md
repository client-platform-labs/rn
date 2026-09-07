# ADR-019: 部署岸线 = 阿里云海外区（香港/新加坡）+ 公共域名 + Caddy TLS，免 ICP 备案

Status: **accepted** (2026-09-06)
Related: Map G #192（D3）、#196（G4）、#198（G6）、#201（G9）、ADR-012

## Context

Map G 以「单台阿里云 ECS、零额外托管费」为约束。但 research 02 要求境内对外 HTTPS/OTA 域名做 APP/ICP 备案（Apple A4 还要求备案号与工信部信息匹配）。现有 ECS 为大陆区 **cn-beijing**（`i-2ze9xgfxcnfcaizisv7o`，47.93.214.189，2c2GiB / Ubuntu 26.04），地域创建即定死、不可原地迁移，不能作「免备案海外岸线」。

## Decision

- 生产岸线 = 阿里云**海外区**（香港 cn-hongkong / 新加坡 ap-southeast-1）+ 公共域名 + Caddy(Let's Encrypt)，**免 ICP 备案**；不做大陆备案。
- 同账号新开一台小规格（1c2G 起）海外实例跑生产 OTA（cp-serve + SQLite + Caddy），流量极小，够用。
- 现有北京机改作 dev/预发（大陆区裸 IP / localhost 做内部 dev，无需备案，不浪费）。
- 「大陆 + ICP 备案」列为备选路径，登记 G9，本图不执行。

## Consequences（如实记录 trade-off）

- 与「零额外托管费」的张力：多一台每月小实例的新增成本，换取免备案（几周返工级前置 + 法务/分发平台判定）与设备侧可自主控制的低延迟。
- 数据跨境：registry 只存设备 serial 等标识 + 自有代码，仍须法务确认不触发个人信息出境（并入 ADR-012 的 P0 前置门）。
- 翻转条件（未来）：设备侧实测跨境延迟/GFW 不可接受，或法务判定必须境内备案 → 切回大陆 + ICP 备案（届时升级为 P0 前置门，G9 登记）。

## Verification

- 海外实例 `curl https://<域名>/health` 通过 + Caddy TLS 证书有效；北京机 dev/预发可本地跑通。

## Principles compliance

| Check | Answer |
|-------|--------|
| **Plane** | Deployment / Control Plane；无跨平面 I/O 违规。 |
| **YAGNI** | 复用现有 compose + Caddy，不引新托管组件；北京机复用为 dev/预发。 |
| **Door** | 岸线两向可迁移（换区/备案是配置+流程，非重写）。 |
| **Dev vs delivery** | 北京机=dev/预发，海外机=production，明确分离不冒充。 |
| **GF/BF / topology** | 无影响。 |
| **Blast radius** | 单节点，DR 由冷重建覆盖（ADR-014）。 |
| **Evidence** | 海外实例 health + TLS 证书 + G9 备案备选登记。 |