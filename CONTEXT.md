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

**契约面（module seam）**:
壳与业务模块之间、类型被强制的最小边界（宿主契约在此消费，如 getModuleApp / host-surface）；接缝之后的业务实现自由，不强推 TS。
_Avoid_: 把类型契约铺满整个业务 UI；强制业务开发用 TS

**模块清单（module manifest）**:
业务模块的自描述文件（client-platform.module.jsonc），声明 moduleId / productApp / 端口等；是「生成式注册表」的生成输入。
_Avoid_: 在壳源码里硬编码业务模块的 import 与注册

**生成式注册表（generated registry）**:
平台从模块清单生成、内含「import + registerModule」的胶水文件；壳源码里唯一允许引用具体业务模块的位置，随 rn module register 重写。
_Avoid_: 壳手写 import 具体业务模块

**引擎适配器（engine adapter）**:
把引擎专属知识（指纹维度 / 版本常量 / 产物格式 / 工具链）收敛进一个包或子对象（如 rn-engine），宿主与契约层只认通用契约；换引擎 = 换适配器实现。
_Avoid_: 引擎专属字段散落在核心契约里；宿主静态依赖具体引擎

**插件（plugin）**:
运行时经 clientPlatform 字段发现的可选扩展（cli-command / dev-session 等），带 apiVersion 协商；与「包」（编译期契约、在依赖 DAG 内，如 core / rn-engine / shell-core）互不混用。
_Avoid_: 把必选契约/引擎适配器做成插件 kind；把可选扩展做成硬依赖

**宿主适配器（host adapter）**:
壳依赖的引擎无关原生桥接口（mountRoot / hostSurface / callNative / runtimeIdentity），由各引擎提供实现；壳的启动/OTA 流程只认此接口，不直接碰 AppRegistry / NativeModules。
_Avoid_: 壳源码直接 import react-native 生命周期与 NativeModules；把某引擎的桥细节散落在壳里