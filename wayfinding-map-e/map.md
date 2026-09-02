# Map E — 壳/离线包发布面 + 装包台（Distribution）

GitHub: [#94](https://github.com/client-platform-labs/rn/issues/94) (`wayfinder:map`) — **OPEN**

**Parents:** Map A [#18](https://github.com/client-platform-labs/rn/issues/18) CLOSED · Map B [#23](https://github.com/client-platform-labs/rn/issues/23) CLOSED · Map C [#73](https://github.com/client-platform-labs/rn/issues/73) · Map D [#80](https://github.com/client-platform-labs/rn/issues/80). Harmony 另轨 [#93](https://github.com/client-platform-labs/rn/issues/93)。

## Destination

双执行面、**单一 Distribution Service（Node 参考实现）** + **依赖合同三道门**。

- **Contract：** OpenAPI + `cp_*` 表 — 可迁企业云
- **Service：** 一个 HTTP 进程（装包 + JS + 共享 CP）；非两个 App
- **Reference Console：** 官方一版，可关；企业可自建 Portal 只吃 API
- **交付：** L1 Compose · L2 Helm · L3 API-only 镜像 · L4 SaaS（远期）

到达态：企业可自托管跑通「壳发版 + 离线包列车」；亦可同一合同接入自有云门户。

## 进度板

| ID | GH | 标题 | Status |
|----|-----|------|--------|
| E-R1 | [#95](https://github.com/client-platform-labs/rn/issues/95) | Research: JS/OTA | **CLOSED** |
| E-R2 | [#96](https://github.com/client-platform-labs/rn/issues/96) | Research: 装包台 | **CLOSED** |
| E-G1 | [#97](https://github.com/client-platform-labs/rn/issues/97) | Grill: 双执行面 | **CLOSED** |
| E-G2 | [#98](https://github.com/client-platform-labs/rn/issues/98) | Grill: Build vs Adapt | **CLOSED** |
| E-P1 | [#99](https://github.com/client-platform-labs/rn/issues/99) | Prototype: JS/离线包 | **landed** |
| E-P2 | [#100](https://github.com/client-platform-labs/rn/issues/100) | Prototype: 装包台 | **landed** |
| E-T1 | [#101](https://github.com/client-platform-labs/rn/issues/101) | 依赖清单 + 三道门禁合同 | **CLOSED** · `dependency-manifest` · `verify-dependency-gates.mjs` |
| E-T2 | [#102](https://github.com/client-platform-labs/rn/issues/102) | CP/delivery 接入依赖门禁 | **CLOSED** · `dependency-gate` · `verify-cp-dependency-gates.mjs` |
| E-T3 | [#103](https://github.com/client-platform-labs/rn/issues/103) | runtime 组合门 + CP manifest API | **CLOSED** · `gateBundleLoad` composition · `GET|PUT /v1/dependency-manifest` · `verify-cp-dependency-manifest-api.mjs` |
| E-T4 | [#104](https://github.com/client-platform-labs/rn/issues/104) | thin CP console 投影依赖 | **CLOSED** · `cp-console.html` Dependencies · PUT JSON |
| E-T5 | [#105](https://github.com/client-platform-labs/rn/issues/105) | 装包台薄接线 | **CLOSED** · `/v1/candidates`+`download_url` · `/v1/artifacts/:digest` · Host builds |
| E-T6 | [#106](https://github.com/client-platform-labs/rn/issues/106) | JS/离线包列车薄接线 | **CLOSED** · `GET /v1/js-updates` · console JS train |
| E-R3 | [#107](https://github.com/client-platform-labs/rn/issues/107) | Research: 分层工业实践 | **CLOSED** · `research/E-R3-distribution-layering-industry.md` |
| E-G3 | [#108](https://github.com/client-platform-labs/rn/issues/108) | Grill: Distribution Service 分层·部署 | **CLOSED** · 单一 Node 服务 · L1–L4 交付 · v1 服务目录 |
| E-T7 | [#109](https://github.com/client-platform-labs/rn/issues/109) | OpenAPI + 表合同草案 | **CLOSED** · `docs/specs/distribution-service.openapi.yaml` · `distribution-service-storage.md` |
| E-T8 | [#110](https://github.com/client-platform-labs/rn/issues/110) | L1 Docker Compose + 镜像 | **CLOSED** · `deploy/distribution-service/` · `verify-distribution-compose.mjs` · ECS runbook |
| E-T9 | [#111](https://github.com/client-platform-labs/rn/issues/111) | tiangong 钢线 | **CLOSED** · `ingest-pack`/`ingest-host` · `verify-map-e-tiangong-steel-thread.mjs` |
| E-T10 | [#112](https://github.com/client-platform-labs/rn/issues/112) | 装包台/JS 发版台接 API | **CLOSED** · `/portal/host` `/portal/js` · `verify-map-e-portal-prototypes.mjs` |
| E-T11 | [#113](https://github.com/client-platform-labs/rn/issues/113) | 设备 checkUpdate + ECS 常驻 + 门户 mutating | **landed** · `GET /v1/js-updates/check` · `push-distribution-image-ecs.sh` · tiangong `pullOtaUpdate` |
| E-T12 | [#114](https://github.com/client-platform-labs/rn/issues/114) | 本机双域名完整服务 | **landed** · `setup-local-distribution-server.sh` · `verify-local-distribution-chain.mjs` PASS |

## Decisions

- 双执行面；Catalog 投影 candidates；混合 C
- 依赖：架构级合同 + publish/promote/runtime 门禁；全图仅审计
- 包↔包：hard→合同包；peer→同壳版本域；禁业务 digest 硬绑默认
- [Distribution Service 分层·部署](https://github.com/client-platform-labs/rn/issues/108) — 单一 Node · API-first · Reference UI 可换 · `cp_candidates`+blob · v1 服务目录
- [行业分层对照](https://github.com/client-platform-labs/rn/issues/107) — API-first + 可选 Console

## Out

Harmony · 七渠 submit · EAS/Firebase 真相 · Shorebird · 宿主/JS 双 registry 双部署单元
