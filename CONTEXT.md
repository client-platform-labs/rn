# 交付平台 · 系统级术语表（Map G 起）

生产硬化与部署的活体术语表。平台整体术语见 [wayfinding/CONTEXT.md](./wayfinding/CONTEXT.md)；历史 era 索引见 [CONTEXT-MAP.md](./CONTEXT-MAP.md)。

「可执行 OTA / 静态资源 OTA / 原生更新」的规范定义以 wayfinding/CONTEXT.md 为准，此处不重复。

## Language

**每业务独立部署**:
每个业务 App 拥有一套独立的 Compose 栈（独立数据卷 / 域名 / 签名密钥 / 反代 vhost / 数据库），仅在物理机上与他人共宿主；不做共享行级多租户。
_Avoid_: 共享行级多租户、把所有业务塞进同一个库和同一套栈

**冷重建（DR 契约）**:
灾难恢复 = 每日加密异地备份 + 在任意装 Docker 的机器上十几分钟重建后恢复服务；不承诺常驻可热切的 standby。
_Avoid_: 温备、热备、常驻 standby、秒级切换

**部署栈**:
一个业务 App 的一套 Compose 实例及其卷 / 密钥 / 域名 / 反代路由，是「每业务独立部署」的隔离与迁移单元。
_Avoid_: 与「安装包」「宿主 App」混用