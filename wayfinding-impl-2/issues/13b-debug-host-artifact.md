# A1 深化：Debug Host 制品线

Type: task
Mode: AFK
Status: open
GitHub: #14
Triage: ready-for-agent
Blocked by: [13-a1-dev-session-contract](./13-a1-dev-session-contract.md), [06-a3-delivery-candidate](./06-a3-delivery-candidate.md)
Priority: **P1**（票 13 之后）
Related: [ADR-002](../docs/adr/002-debug-host.md)

## Question

交付可审计的 **Debug Host** 安装包，使日常 dev 达到 `dev.warm.reinstall` ≤10s（仅推 bundle，不全量 Gradle）？

## Scope

- `rn-delivery build --profile debug-host`（或等价）
- `artifact_kind: app-host-debug` + fingerprint 进 manifest
- 与 release 候选包晋级链分离
- 文档：何时重装 Host vs 仅 reload

## Acceptance

- [ ] 已装 Debug Host 后，JS 变更无需 `run-android`
- [ ] `dev.warm.reinstall` 计入 bench 脚本结果
