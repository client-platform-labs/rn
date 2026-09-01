# HITL · hermes GF · M-H4 JS 列车 + gateBundleLoad

**Date:** 2026-08-31  
**Map:** [#29](https://github.com/client-platform-labs/rn/issues/29)  
**App:** `~/code/hermes-gf-app` · module `hermes-market`  
**Device:** `10CEC62C7R000E3`

## Commands

```bash
cd ~/code/hermes-gf-app
rn-delivery update --module hermes-market --platform android
rn-delivery sign && rn-delivery validate && rn-delivery release && rn-delivery promote
node ~/Work/client-platform-labs/rn/scripts/verify-js-update-load.mjs . --production
node ~/Work/client-platform-labs/rn/scripts/verify-l4-steel-thread.mjs .
```

## Evidence

| Check | Result |
|-------|--------|
| js-update `update_id` | `hermes-market-572677d3f275` |
| digest / signature (stub) | `572677d3f275…` |
| `gateJsCandidate` + `gateBundleLoad` | **PASS** (production sidecar) |
| `verify-l4-steel-thread` | **PASS** (hygiene · APK · M7 gate · CP · block · M9) |
| prior `block` drill | registry.blocked ≥ 1 |
| 真机一屏（Release · 无 Metro） | Overview Macro **59.9** · Sentiment **61** · Health OK |

## Scope note

与 Map A M7/M8 同口径：`gateBundleLoad` 对 **promoted sidecar** 验签+指纹；壳内业务屏由 app-host 内嵌 `hermes-market` 渲染。  
**Depth（不挡 M-H4）：** 运行时从 CDN/本地文件热换 HBC（真·OTA Hermes execute）— 见 DESTINATION M-H5+ / Map A M8 note。

## Prior

- M-H2/H3: [`hermes-mh2-release-2026-08-31.md`](./hermes-mh2-release-2026-08-31.md)
