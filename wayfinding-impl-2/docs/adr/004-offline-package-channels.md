# ADR-004: 离线包通道（JS 列车 + content 预留）

Status: **accepted** (HITL 2026-08-25)  
Related: [research/04 §7.1](../../research/04-industrial-full-lifecycle-scheme.md), 蓝图 04, A5

## Context

「离线包」在业界混指可执行 bundle 与静态资源。大陆合规对二者边界不同（wayfinding/research/02）。

## Decision

### v1（必须实现路径）

- **一条可执行管道**：JS 列车（Hermes/HBC）
- **设备槽位**：`baseline`（壳内）+ `Active` + `Previous`（N/N-1）
- **选择器**：与 OTA 相同（fingerprint + capability + channel）；失败不加载
- **预置包**：MDM/装包台写入的同格式 JS 包，同一校验链

### v1（合同预留，可不实现下载器）

- **`content` 通道**：仅白名单静态资源；独立签名；`channel_profile` 字段预留
- 禁止：脚本、路由 DSL、改主功能/权限/隐私

### 禁止

- 第三套可执行离线协议
- 无限历史槽
- 无网静默执行未校验包

## Consequences

- A5 客户端兜底实现 P14 三级链 + 槽位
- A4 schema 含 `content` 通道枚举；地图 A 演示可仅 JS
- 装包台（票 14）可推送预置 JS 包到测试设备

## Verification

- 集成测试：不匹配 fingerprint 的 update 不加载
- 回滚：Previous 槽在 N 失败后可加载
