# 单地域主备：注册库与制品怎么切

GitHub: [#348](https://github.com/client-platform-labs/rn/issues/348)，父图 [#319](https://github.com/client-platform-labs/rn/issues/319)。现状差距见 [#321](https://github.com/client-platform-labs/rn/issues/321) 的笔记（工作树 `research/cp-ha-gap-321`，未并入主干）。本文只定切换，不改代码，不构成「企业闭环完成」。

## 锁定

| 选择 | 决定 | 依据 |
|------|------|------|
| 仍用 SQLite | 不接 Postgres | ADR-013；`registry-postgres.ts` 未接线 |
| 不共享一块盘上的同一个库文件 | 备机拿的是快照，不是第二个写者 | SQLite WAL 单写；文件适配器 `multiInstanceSafe: false` |
| 制品按 digest 增量拷 | 不每分钟打整包 tar | 制品是内容寻址，写后不变（ADR-020，本地目录） |
| 备机事先持有运行密钥 | 切换时不再等人送 age 私钥 | 自动切换做不到「切换当天才解密」；每日 age 归档仍只服务丢整地域后的冷重建（ADR-014） |
| 流量只认一个地址 | 备机平时不听设备端口 | 今天 Caddy 与两个域名都指到同一个 `cp-serve` |

多地域、托管 RDS、对象存储适配器不在这一步。

## 两台机器

同一地域两台，跑同一份 `deploy/distribution-service` Compose。主写注册库、收制品、对设备服务。备不绑服务端口，只收快照。

主每分钟做两件事，写到备机能读到的目录（同地域第二块盘或主推到备的目录，不要只留在主的本地）：

1. 注册库：沿用 `deploy/distribution-service/backup.mjs` 里的 `VACUUM INTO`，得到一份一致的 `registry.sqlite`。不要在 WAL 打开时直接 `cp` 主库文件。
2. 制品：只拷 `.rn/delivery/artifacts/` 里备机还没有的 digest 文件。已有文件按 digest 跳过。

快照目录里留时间戳。备机只保留最近若干份注册库快照；制品目录本身就是累积的。

恢复点：切换用的那份注册库快照，年龄不超过 2 分钟。超过则不要把更旧的日备当作这次自动切换的成功。日备仍按 ADR-014 走冷重建。

## 切换

探测打主的 `GET /ready`，不打 `/health`。`/health` 不看注册库和制品目录（`serve.ts`）。连续 3 次失败（间隔数秒）视为主失效。

备机在启动前再探一次主的 `/ready`。主仍通，备机保持不听端口。主不通，备机：

1. 取最新一份年龄 ≤ 2 分钟的注册库快照，放到自己的 `.rn/delivery/registry.sqlite`。
2. 制品目录已经是增量拷贝，缺的 digest 不会在这一步重下。
3. 用事先放好的同一份 `RN_DELIVERY_SIGN_KEY*` 与 `.env` 拉起 `ship cp-serve`。
4. 把那一个服务地址指到备机（本机反代改上游，或云上的地址改到备机）。设备仍访问原来的 URL。

主恢复后先以备的身份同步，不自动抢回写者。抢回要另一次把地址指回去，并且那时它持有的库不得比在任主更旧。

## 不算完成的情况

- 只把进程 `restart` 在同一块盘上。盘还在，这不是切换。
- 人到场跑 `restore.mjs` 再起容器。那是 ADR-014 的冷重建。
- 备机库快照旧于 2 分钟仍对外服务，并把它叫作分钟级恢复点。
- 两台同时写同一个 `registry.sqlite`。

## 下一张实现票

「备机按分钟接收注册库与制品，并在主 /ready 失败时接过流量」。

落在 `deploy/distribution-service/` 的脚本里，不新增 `ship` 子命令，不接 Postgres。测试在本机用两个目录模拟主备：分钟快照之后杀掉主，备能用 ≤ 2 分钟的库提供同一 digest 的制品。手册 `backend-services.md` 写明：这条路径是同地域主备；丢整地域仍是冷重建。
