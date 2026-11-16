# 同机主备中间证据（不算 #372）

本目录只收 **同机** 两个目录 / 两个 `cp-serve` 进程的切换记录。

- 已有：`same-host-2026-11-16T15-19-32Z.json`（`kind: same-host-two-process`）
- **不能**关闭 [#372](https://github.com/client-platform-labs/rn/issues/372)

两台不同主机的演练步骤见 [`docs/handbook/operations/sop-cp-ha-two-machine.md`](../../docs/handbook/operations/sop-cp-ha-two-machine.md)（SOP-CP-HA-02）与 `deploy/distribution-service/ha-two-machine-drill.sh`。真两机证据应写入 `evidence/cp-ha-failover-two-machine/`，且 `kind` 必须为 `two-machine`、`active.host` ≠ `standby.host`。
