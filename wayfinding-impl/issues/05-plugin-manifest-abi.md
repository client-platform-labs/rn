Type: grilling
Mode: HITL
Status: open
Triage: ready-for-human
Blocked by: 03, 04
Depends on research: 04 (resolved)

# 插件清单 ABI 落地字段

## Question

MVP 的插件发现合同具体字段与加载语义是什么（`package.json#clientPlatform` 或等价），才能热插拔命令/适配器且保持三 ABI 分离？

必须确定：清单 schema、惰性 import 入口、版本协商、无签名时的 MVP 策略（开发信任 vs 企业源校验预留）。
