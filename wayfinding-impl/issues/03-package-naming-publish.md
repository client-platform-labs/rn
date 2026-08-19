Type: grilling
Mode: HITL
Status: open
Triage: ready-for-human
Blocked by: 01, 02

# 包命名、版本与发布策略

## Question

`@client-platform/*` 包如何命名、版本化与（若）发布，才能与 kernel 伞形 CLI 共存且不把交付 CLI 塞进 app dependencies？

必须确定：core/cli/delivery-cli 包名、plugins 命名约定、semver 与 changeset 与否、MVP 阶段仅 workspace 链接还是也发 npm。
