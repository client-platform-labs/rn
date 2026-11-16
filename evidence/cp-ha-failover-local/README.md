# 同机主备中间证据（不算 #372）

本目录只收 **同机** 演练记录（两进程 / 两 Docker container）。**不能**关闭 [#372](https://github.com/client-platform-labs/rn/issues/372)。

| 文件 | kind | 说明 |
|------|------|------|
| `same-host-2026-11-16T15-19-32Z.json` | `same-host-two-process` | 两目录两进程；备 `/ready` 曾 503 |
| `docker-two-container-2026-11-16T15-40-17Z.json` | `docker-two-container` | 两独立 container + 不同数据卷；主备 `/ready=200`、制品 200、`bound=true` |

两台不同主机见 [`sop-cp-ha-two-machine.md`](../../docs/handbook/operations/sop-cp-ha-two-machine.md)（SOP-CP-HA-02）与 `ha-two-machine-drill.sh`。真两机证据写入 `evidence/cp-ha-failover-two-machine/`（`kind: two-machine`，`active.host` ≠ `standby.host`）。
