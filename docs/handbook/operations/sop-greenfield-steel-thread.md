# SOP-GF-STEEL-01 · 绿地钢线 0→1（工业交付）

| 字段 | 内容 |
|------|------|
| **文档编号** | SOP-GF-STEEL-01 |
| **版本** | 2.0 |
| **状态** | 生效（BD 对外交付以本版为准） |
| **密级** | 内部 · 可交企业运维（不含私钥） |
| **能力口径** | **L4**（单 module 可企业推广）· **不宣称 L5** |
| **读者** | 企业：平台运维 / 壳运维 / 离线包运维 / 架构师；我方：平台 BD |
| **执行原则** | 企业按 RACI 与场地自执行；BD 交付本 SOP 与答疑，**不代跑、不代装机、不代保管私钥** |
| **关联** | `roles-matrix.md` · `enterprise-promotion-gates.md` L4 · ADR-008/017/024 · `ship`/`rn` CLI |

---

## 1. 目的

在**可控、可审计、可交接**的前提下，使企业完成绿地最小垂直切面（钢线）：

1. 建立设备信任根（RCA）与签发叶密钥（leaf）  
2. 落地可发布宿主（release APK，含 OTA 适配与 CP 地址）  
3. 提供可验签的控制面（CRL / check / 制品）  
4. 完成单 `business_module=main` 的签名 JS 更新并在真机稳定生效  

**成功一句话**：真机从 baseline 热更到**已改业务可见状态**的 `main`，进程稳定；控制面访问顺序为 **CRL → check → artifacts**。

---

## 2. 范围

### 2.1 在范围内

| 项 | 说明 |
|----|------|
| 密钥 | lab/POC 用 `ship keygen`（Ed25519 RCA+leaf）；生产密钥策略见 §7 |
| 工程 | `rn init --rca-pubkey-hex` 拓扑 B + 工业壳 + 原生 OTA |
| 控制面 | `ship cp-serve` 文件 registry（POC）；生产 CP 仅替换**场地与 URL**，本 SOP 契约不变 |
| 宿主列车 | `ship build --profile release` → 装机 |
| JS 列车 | `update` → HBC → `ingest-pack` → `sign` → `validate` → `release` → `promote` |
| 验收 | 真机顺序 + 稳定 + **OTA/baseline 消歧** |

### 2.2 明确不在范围（禁止在钢线未关闭时开做）

多模块 kill 隔离 · 灰度 1/10/50/100 · SLO/`paused_slo` · 密钥吊销演练 · DR 冷重建 · 商店/`ship submit` · 业务功能验收。

扩面入口：钢线关闭后见本总章 §5（七天样本）与交接包 `PHASE-F.md`；本 SOP 不展开。

---

## 3. 术语与缩写

| 术语 | 定义 |
|------|------|
| RCA | Root CA 公钥（64 hex），**仅烘焙进 APK**，为设备信任锚 |
| leaf | 日常签发 JS/CRL 的叶证书与私钥；可轮换 |
| CP | 控制面（本 SOP POC：`ship cp-serve`） |
| HBC | Hermes 字节码；设备加载对象；由工程机 Hermes 工具链产出，`ship` 只消费 |
| 钢线 | 单 module 端到端可信 OTA 闭环，对应推广口径 **L4** |
| `ship` | 交付 CLI（文档旧名 `rn-delivery` 以 `ship --help` 为准） |

---

## 4. 角色与 RACI

三角色定义以 [`roles-matrix.md`](./roles-matrix.md) 为准。

| 角色 | 本 SOP 中的职责边界 |
|------|---------------------|
| **平台运维** | 信任根与 leaf 保管策略；CP 可用性；CRL 正向；写路由 token；场地「控制面主机 / 密钥机」 |
| **壳运维** | 工程初始化与烤 RCA；`cpBaseUrl` 声明；release 宿主构建与装包台；冷启冒烟证据 |
| **离线包运维** | `main` 可见变更；HBC 候选；签名与 promote；真机 OTA 主验收与消歧证据包 |
| **架构师 / 负责人** | L4 口径签字；拒绝超范围宣称 |
| **平台 BD** | 交付本 SOP、对齐闸门、答疑；不持有企业生产私钥、不代操作 |

### 4.1 RACI 总表（R=执行 A=问责 C=协商 I=知会）

| 步骤 | 平台运维 | 壳运维 | 离线包运维 | 架构师 | BD |
|------|:--------:|:------:|:----------:|:------:|:--:|
| A1 keygen | **R/A** | I | I | C | I |
| A2 leaf-env | **A** | I | **R**（签名机使用） | I | I |
| A3–A5 工程/doctor | C（供 RCA/URL） | **R/A** | I | I | I |
| B1–B3 CP/CRL | **R/A** | I | I | I | I |
| C1–C3 宿主/装机 | C（CP 存活） | **R/A** | I | I | I |
| D1–D5 JS OTA | C（CP/CRL） | C（设备协助） | **R/A** | I | I |
| E 口径 | C | C | C | **A** | **R**（起草） |

POC 允许一人兼多角：**必须按行切换帽子**，复盘以本表问责列为准。

---

## 5. 环境与拓扑

### 5.1 逻辑场地（与硬件是否合并无关）

| 场地 | 职责 | POC 默认落点 | 生产落点 |
|------|------|--------------|----------|
| **密钥机** | 生成/存放 RCA·leaf 私钥 | 平台运维指定目录 `keys/`（可与工作站同机，逻辑独立） | HSM / 隔离主机 |
| **工程机** | `rn` / `ship build\|update`、源码与 `.rn/delivery` 构建侧 | 运维/开发工作站或 CI | CI 为主 |
| **签名机** | `source leaf-env` + `ship sign` | 常与工程机合并 | CI secrets 或专用签名节点 |
| **控制面主机** | `cp-serve` 或生产 CP、registry、制品服务 | POC：`127.0.0.1:4040` 于工作站 | 机房/云 CP |
| **装包台** | `adb` 装包、冷启、（POC）`adb reverse` | USB 真机工位 | 装包台或 MDM |
| **设备** | 运行宿主、拉 OTA | USB 调试真机 | 目标机群 |

### 5.2 POC 参考拓扑（本 SOP 默认）

```text
                    ┌─────────────────────────────┐
                    │ 工作站（工程机∪控制面∪装包台）│
                    │  keys/  app/  cp-serve:4040 │
                    └─────────────┬───────────────┘
                                  │ USB adb reverse :4040
                                  ▼
                             ┌─────────┐
                             │  真机   │  cpBaseUrl=http://127.0.0.1:4040
                             └─────────┘
```

### 5.3 生产参考拓扑（钢线不部署，交接必述）

```text
[密钥机]──RCA hex──►[工程机/CI]──APK──►[装包台/MDM]──►[设备]
[密钥机]──leaf────►[签名机/CI]──promote──►[远程 CP]◄──HTTPS──[设备]
```

**约束**：`adb reverse` 仅装包台↔USB 设备。远程 CP 必须改 `cpBaseUrl` 为可达 URL，禁止假设「在服务器上 reverse 到办公室手机」。

---

## 6. 信任与安全约束

1. **RCA 只进 APK**，禁止进入 OTA JS 载荷。  
2. **leaf 私钥**最小权限；禁止即时通讯传递；POC 亦禁止提交 git。  
3. **CRL 无 `seal` / 无 `cert_chain` → 全线 STOP**（设备 fail-closed）。  
4. 写路由（promote/block/kill/…）仅经 **`ship` + CP**，禁用 `rn` 发版。  
5. promote **同制品**（staging 与 production digest 一致）。  
6. 生产 keygen/轮换按企业密钥制度；本 SOP 的 `ship keygen` 默认 **lab**。

---

## 7. 前置条件

| # | 条件 | 验证 |
|---|------|------|
| P1 | `rn`、`ship`、`adb`、`openssl`、`xxd` 可用 | `command -v …` |
| P2 | Android 真机 `adb devices` 为 `device` | 序列号记入记录单 |
| P3 | 工作目录约定已创建 | §8 |
| P4 | 角色已指定（或 POC 兼角声明已签字） | RACI §4.1 |
| P5 | 本 SOP 版本与能力口径（L4）已宣贯 | 会议纪要 / 邮件 |

**工作目录（工程机）：**

```text
$STEEL_ROOT/                 # 例：~/code/rn-steel-demo
├── keys/                    # 逻辑：密钥机
├── leaf-env.sh
├── app/                     # rn 工程根
└── records/                 # 建议：本钢线证据与交接单
```

---

## 8. 标准步骤模板（全文统一）

每步均按下列字段书写（工业交付最小完备集）。字段不因「有人问过」才存在——**缺任一字段不得作为对外 SOP 交付**。

| 字段 | 含义 |
|------|------|
| **目标** | 本步在钢线中的工程目的 |
| **RACI** | R/A 为主；C/I 按需 |
| **场地** | 逻辑场地；并注明 POC/生产落点差异 |
| **前置** | 必须已关闭的步骤或条件 |
| **输入** | 制品/密钥/配置及其来源角色 |
| **程序** | 可重复执行的动作（命令或配置） |
| **输出** | 制品、配置、交接物 |
| **证据** | 须留存的日志/截图/哈希 |
| **验收闸门** | PASS 条件；失败 → STOP 与处置 |
| **接口** | 上游供应方 / 下游消费方 |

---

## 9. 程序

### 阶段 A · 信任与工程落地

**阶段出口**：RCA 已交接壳运维；leaf 可用于签名；工程 doctor 绿；`cpBaseUrl` 非空。

---

#### A1 · 生成 RCA 与 leaf

| 字段 | 内容 |
|------|------|
| **目标** | 建立设备信任锚（RCA）与可轮换签发身份（leaf） |
| **RACI** | R/A：平台运维 · I：壳运维、离线包运维 |
| **场地** | 密钥机 · POC：`$STEEL_ROOT/keys` · 生产：HSM/隔离机 |
| **前置** | P1–P5；密钥策略允许 lab keygen |
| **输入** | `ship` CLI；标签名（例 `steel`） |
| **程序** | 见下 |
| **输出** | `steel.rca.*`、`steel.leaf.crt`、`steel.key`(0600)、`root_ca_public_key_hex` |
| **证据** | keygen JSON；`ls -l keys/steel.key`；hex 长度记录 |
| **验收闸门** | hex 长度=64 且私钥权限≤0600；否则 **STOP** |
| **接口** | 上游：密钥审批 · 下游：A3（RCA hex）/ A2·B·D（leaf） |

```bash
mkdir -p "$STEEL_ROOT/keys" && cd "$STEEL_ROOT"
ship keygen --dir ./keys --label steel
# 交接壳运维：仅 root_ca_public_key_hex（书面/工单），禁止交接根私钥
```

---

#### A2 · 配置 leaf 运行时环境

| 字段 | 内容 |
|------|------|
| **目标** | 将 leaf 材料标准化为 `ship sign` / CRL 签名可读环境 |
| **RACI** | A：平台运维 · R：在签名机/CP 主机执行 source 的离线包运维或平台运维 |
| **场地** | 签名机（与 leaf 私钥同机）；起 CP 时控制面主机亦须可读 |
| **前置** | A1 PASS |
| **输入** | `steel.key`、`steel.leaf.crt` |
| **程序** | 部署附录 A 脚本并 `source` |
| **输出** | `RN_DELIVERY_SIGN_KEY_FILE` / `LEAF_CERT` / `LEAF_PUBKEY_HEX` |
| **证据** | `leaf-env OK … (64 hex)` 终端记录 |
| **验收闸门** | pubkey 长度≠64 → **STOP** |
| **接口** | 上游 A1 · 下游 B1、D3 |

---

#### A3 · 初始化工程并烘焙 RCA

| 字段 | 内容 |
|------|------|
| **目标** | 形成可发布宿主骨架，并将 RCA 写入原生 OTA 适配器 |
| **RACI** | R/A：壳运维 · C：平台运维（提供 hex） |
| **场地** | 工程机 |
| **前置** | A1 交接单含 RCA hex |
| **输入** | RCA 64 hex（平台运维）；空目录 `app/` |
| **程序** | `rn init --rca-pubkey-hex <RCA> .` |
| **输出** | 工程树；含 RCA 的 `OtaModule`；`modules/main` |
| **证据** | init 日志含 `bake root-CA`；源码 rg 命中 hex |
| **验收闸门** | 未烤入 → **STOP** |
| **接口** | 上游 A1 · 下游 A4/A5/C1 |

---

#### A4 · 声明控制面 Base URL

| 字段 | 内容 |
|------|------|
| **目标** | 宿主运行时知道 CRL/check/制品入口 |
| **RACI** | R/A：壳运维 · C：平台运维（给出 URL 口径） |
| **场地** | 工程机改声明；URL **指向**控制面主机 |
| **前置** | A3 PASS；平台运维确认 POC=`http://127.0.0.1:4040` 或生产 HTTPS URL |
| **输入** | CP Base URL |
| **程序** | 写 `.rn/runtime.jsonc` → `rn shell refresh`（禁止手改 generated） |
| **输出** | `shell/generated-runtime.ts` 中非空 `cpBaseUrl` |
| **证据** | `grep cpBaseUrl shell/generated-runtime.ts` |
| **验收闸门** | 空串 → **STOP** |
| **接口** | 上游平台运维 URL · 下游 C3/D4 |

---

#### A5 · 工程门禁体检

| 字段 | 内容 |
|------|------|
| **目标** | 确认 OTA 适配、拓扑 B、卫生门禁可进入构建 |
| **RACI** | R/A：壳运维 |
| **场地** | 工程机 |
| **前置** | A3–A4 |
| **输入** | 工程树 |
| **程序** | `rn doctor` |
| **输出** | PASS 记录 |
| **证据** | doctor 全文或关键段归档至 `records/` |
| **验收闸门** | 非 PASS / 无 native OTA adapter → **STOP** |
| **接口** | 下游 C1 |

**阶段 A 关闭**：A1–A5 PASS + RCA 交接单归档 → 进入 B。

---

### 阶段 B · 控制面最小可用

**阶段出口**：`/health` 身份正确；`/v1/crl` 含 `seal`+`cert_chain` 且可验签。

---

#### B1 · 启动控制面

| 字段 | 内容 |
|------|------|
| **目标** | 提供设备可访问的 CP 进程 |
| **RACI** | R/A：平台运维 |
| **场地** | 控制面主机 · POC：工作站 `:4040` |
| **前置** | A2 可 source；A4 URL 与监听一致 |
| **输入** | leaf 三件套；`RN_CP_TOKEN`；`RN_CP_PROJECT=$APP` |
| **程序** | `ship cp-serve --port 4040 --host 127.0.0.1`（守护化见附录 B） |
| **输出** | 监听进程；日志目录 |
| **证据** | pid / `lsof -iTCP:4040` |
| **验收闸门** | 无法保持监听 → **STOP** |
| **接口** | 下游 B2/B3、C3、D |

---

#### B2 · 健康检查

| 字段 | 内容 |
|------|------|
| **目标** | 确认服务身份为控制面 |
| **RACI** | R/A：平台运维 |
| **场地** | 能访问控制面主机的运维终端 |
| **前置** | B1 |
| **程序** | `curl -s $CP/health` |
| **验收闸门** | 非 control-plane 身份 → **STOP** |

---

#### B3 · CRL 正向验收（强制门）

| 字段 | 内容 |
|------|------|
| **目标** | 证明吊销文档可被设备按 RCA→leaf→seal 验证 |
| **RACI** | R/A：平台运维 · I：离线包运维 |
| **场地** | 同 B2 |
| **前置** | B1 启动时已注入 leaf |
| **程序** | `GET /v1/crl`；推荐附录 C 密码学校验 |
| **输出** | 含 `seal`、`cert_chain` 的 CRL |
| **证据** | CRL JSON 摘要；验签 PASS 记录 |
| **验收闸门** | 缺 seal/chain 或验签失败 → **STOP，禁止进入 C/D** |
| **接口** | 下游全体设备 OTA |

**阶段 B 关闭**：平台运维广播「CP 可用 + Base URL」→ 进入 C。

---

### 阶段 C · 宿主首发（低频列车）

**阶段出口**：真机已装 release 宿主；可达 CP；冷启出现 CRL→check（无制品时 `no_update` 可接受）。

---

#### C1 · 构建 release 宿主

| 字段 | 内容 |
|------|------|
| **目标** | 产出低频列车候选 APK |
| **RACI** | R/A：壳运维 |
| **场地** | 工程机或 CI |
| **前置** | A5、B 关闭 |
| **程序** | `ship build --platform android --profile release` |
| **输出** | `app-release.apk`；host digest |
| **验收闸门** | 无 APK 或非 release → **STOP** |

---

#### C2 · 真机安装

| 字段 | 内容 |
|------|------|
| **目标** | 宿主进入设备 |
| **RACI** | R/A：壳运维 |
| **场地** | 装包台（或 MDM） |
| **前置** | C1 |
| **程序** | `adb install` 或平台 `safe_install`（Vivo 弹窗，附录 D） |
| **输出** | `pm path <pkg>` |
| **验收闸门** | 未安装 → **STOP** |

---

#### C3 · 连通与冷启冒烟

| 字段 | 内容 |
|------|------|
| **目标** | 验证设备→CP 路径与壳 OTA 启动序 |
| **RACI** | R：壳运维 · A：壳运维 · C：平台运维（CP 存活） |
| **场地** | 装包台 + 控制面主机 |
| **前置** | C2、B3 |
| **程序** | POC：`adb reverse tcp:4040 tcp:4040` → `pm clear` → 启动 → 查 pid/CP 日志 |
| **输出** | reverse 证据；pid；CRL→check 序 |
| **验收闸门** | 无 pid / 报 cpBaseUrl 未配置 / 无 CRL → **STOP** |
| **接口** | 下游离线包运维（可开始 D） |

**阶段 C 关闭**：交接「pkg、host digest、设备可达 CP」→ 进入 D。

---

### 阶段 D · 业务首更（高频列车）

**阶段出口**：production 新 digest；真机顺序正确且稳定；**消歧证明 OTA 而非重打 APK**。

---

#### D1 · 业务可见变更

| 字段 | 内容 |
|------|------|
| **目标** | 产生可观测的 OTA 前后差异 |
| **RACI** | R/A：离线包运维（前端可改码，运维验收可观测性） |
| **场地** | 工程机 `modules/main` |
| **程序** | 修改运行时 UI 字符串（禁止仅注释） |
| **验收闸门** | 无运行时可见点 → **STOP** |

---

#### D2 · 编译并摄入 HBC 候选

| 字段 | 内容 |
|------|------|
| **目标** | 产出设备可加载的签名前候选 |
| **RACI** | R/A：离线包运维 |
| **场地** | 工程机（含匹配的 `hermesc`） |
| **程序** | `ship update --module main` → `hermesc …` → `ship ingest-pack --hbc …` |
| **输出** | digest、update_id、HBC 路径 |
| **验收闸门** | bundle/HBC 扫描不到标记 → **STOP** |

---

#### D3 · 签名、门禁、同制品晋升

| 字段 | 内容 |
|------|------|
| **目标** | 候选成为设备可拉取的 production 制品 |
| **RACI** | R/A：离线包运维 · C：平台运维（token/CRL） |
| **场地** | 签名机/工程机；registry 在控制面主机存储视图 |
| **程序** | `ship sign` → `validate` → `release --kind js-update` → `signal clear` → `promote --digest …` |
| **输出** | production 目标 digest；check=200 |
| **验收闸门** | check 204/无 `pem:ed25519:`/digest 不符 → **STOP** |

---

#### D4 · 真机 OTA 与顺序验收

| 字段 | 内容 |
|------|------|
| **目标** | 闭环安装并保持稳定 |
| **RACI** | R/A：离线包运维 · C：壳运维（设备）、平台运维（日志） |
| **场地** | 装包台 + 控制面主机日志 |
| **程序** | 确认 reverse/网络 → clear → 启动 → 解析 CP 顺序与 pid/UI |
| **验收闸门** | 非 `crl→check→artifacts`（约一次下载）或 crash-loop → **STOP**，执行 §11 止血 |

---

#### D5 · OTA/Baseline 消歧（强制）

| 字段 | 内容 |
|------|------|
| **目标** | 排除「重打 APK 烤串」假阳性 |
| **RACI** | R/A：离线包运维 |
| **场地** | 工程机字节比对 + 装包台 UI |
| **程序** | **不重建 APK**；仅新 HBC 新标记 → 再 D2–D4；证明 APK baseline 无新串、UI/HBC 有 |
| **验收闸门** | 无法消歧 → **不得关闭 D，不得进入 E 宣称** |

**阶段 D 关闭**：D1–D5 PASS + 证据包 → 进入 E。

---

### 阶段 E · 口径关闭

| 字段 | 内容 |
|------|------|
| **目标** | 形成可对外的 L4 陈述并签字 |
| **RACI** | R：BD 起草 · A：企业架构师/负责人 · C：三角色 |
| **场地** | 文档/评审会（非构建机） |
| **输入** | D 证据包 |
| **输出** | 签字口径页 |
| **可宣称** | 可信宿主；可验签 JS OTA 真机生效；CRL/check/制品 fail-closed |
| **不可宣称** | 多模块隔离、灰度档位、SLO、吊销、DR |

---

## 10. 钢线验收清单（Exit Criteria）

关闭本 SOP 前全部勾选：

- [ ] A：RCA 交接单 + doctor PASS + `cpBaseUrl` 非空  
- [ ] B：CRL seal+cert_chain（推荐密码学 PASS）  
- [ ] C：真机已装；CRL→check 冒烟  
- [ ] D：production 新 digest；`crl→check→artifacts`；进程稳定；**D5 消歧 PASS**  
- [ ] E：L4 口径已签字；未夹带 L5 表述  
- [ ] `records/` 证据齐全（§12）

---

## 11. 中止与回滚

| 场景 | 责任 | 动作 |
|------|------|------|
| CRL 异常 | 平台运维 | 停 C/D；修复 leaf/CP；重做 B3 |
| 坏 JS digest 导致不稳定 | 离线包运维 | `POST /v1/block {"digest":"…"}`（**勿** `ship block --platform android` 误伤宿主）→ `pm clear` 回 baseline → 再诊断 |
| 宿主错误 | 壳运维 | 停装机；修工程后重走 C；已装设备卸载或覆盖安装 |
| 私钥疑似泄露 | 平台运维 | 立即停 promote；启动密钥制度（超出本 SOP，见 ota 吊销专章） |

原则：**先止血、再诊断、钢线红灯时不扩面。**

---

## 12. 证据与审计（最低集）

建议路径：`$STEEL_ROOT/records/YYYYMMDD-steel/`

| 证据 | 来源步骤 |
|------|----------|
| keygen JSON + RCA hex 交接单 | A1 |
| doctor 输出 | A5 |
| CRL JSON / 验签记录 | B3 |
| host digest + `pm path` | C1/C2 |
| CP access 序（标记后日志） | C3/D4 |
| js digest + check 响应 | D3 |
| UI 截图/层级文本 + APK/HBC 消歧命令输出 | D4/D5 |
| E 签字页 | E |

保留周期按企业审计要求；POC 不少于钢线关闭后 90 天。

---

## 13. 交接包（BD → 企业）

交付必须包含：

1. 本文件 **SOP-GF-STEEL-01**（现行版）  
2. RACI 已填人名的副本  
3. 场地映射表（企业 POC/生产落点）  
4. 空目录约定或初始化说明  
5. Demo Day 口径页模板（E）  

**不得**作为 BD「交付成功」替代物：代跑完成的工程树、代装机录像、含私钥的压缩包。

---

## 14. 升级与升级路径

| 情况 | 动作 |
|------|------|
| CLI/模板行为变更 | 升本 SOP 版本；注明破坏性变更 |
| 需灰度/多模块/SLO | 钢线关闭后启用 Phase F / 操作手册 §3–§5 |
| 宣称升至 L5 | 另走 `enterprise-promotion-gates` L5 证据，不在本 SOP 内口头升级 |

---

## 附录 A · leaf-env.sh

```bash
#!/usr/bin/env bash
unset RN_DELIVERY_LEAF_CERT RN_DELIVERY_LEAF_PUBKEY_HEX
unset RN_DELIVERY_SIGN_KEY_FILE RN_DELIVERY_SIGN_KEY_PEM RN_DELIVERY_SIGN_KEY RN_DELIVERY_LEGACY_SIGN
STEEL_DIR="${STEEL_DEMO_DIR:-$HOME/code/rn-steel-demo}"
STEEL_KEYS="$STEEL_DIR/keys"
export RN_DELIVERY_SIGN_KEY_FILE="$STEEL_KEYS/steel.key"
export RN_DELIVERY_LEAF_CERT="$(cat "$STEEL_KEYS/steel.leaf.crt")"
export RN_DELIVERY_LEAF_PUBKEY_HEX="$(
  openssl x509 -in "$STEEL_KEYS/steel.leaf.crt" -pubkey -noout \
    | openssl pkey -pubin -outform DER 2>/dev/null \
    | tail -c 32 | xxd -p -c 64 | tr -d '\n'
)"
[ "${#RN_DELIVERY_LEAF_PUBKEY_HEX}" -eq 64 ] || { echo "leaf-env FAIL" >&2; return 1 2>/dev/null || exit 1; }
echo "leaf-env OK pubkey=${RN_DELIVERY_LEAF_PUBKEY_HEX:0:12}… (64 hex)"
```

## 附录 B · macOS 守护化 cp-serve

在**控制面主机**、已 `source leaf-env` 且 `RN_CP_PROJECT` 指向 `app/` 时：

```bash
python3 - <<'PY'
import os, sys, time
app=os.environ["RN_CP_PROJECT"]
log=os.path.join(app,".rn/distribution-lab/logs/cp-serve.log")
os.makedirs(os.path.dirname(log), exist_ok=True)
if os.fork()!=0:
    time.sleep(1.5); sys.exit(0)
os.setsid()
if os.fork()!=0: sys.exit(0)
fd=os.open(log, os.O_WRONLY|os.O_CREAT|os.O_APPEND)
os.dup2(fd,1); os.dup2(fd,2); os.close(fd)
open(os.path.join(app,".rn/distribution-lab/cp-serve.pid"),"w").write(f"{os.getpid()}\n")
os.execvpe("ship",["ship","cp-serve","--port","4040","--host","127.0.0.1"],os.environ)
PY
```

## 附录 C · CRL 密码学校验

```bash
curl -s "$CP/v1/crl" > /tmp/crl.json
node -e '
const fs=require("fs"),c=require("crypto");
const d=JSON.parse(fs.readFileSync("/tmp/crl.json","utf8"));
if(!d.seal?.startsWith("pem:ed25519:")) throw new Error("no seal");
const sig=Buffer.from(d.seal.slice(12),"base64");
if(!c.verify(null,Buffer.from(d.payload),c.createPublicKey(d.cert_chain.leafCertPem),sig))
  throw new Error("verify fail");
console.log("CRL seal under leaf: PASS");
'
```

## 附录 D · Vivo 装包自动确认

装包台设置 `E2E_REPO` 为平台仓根后：`source "$E2E_REPO/scripts/e2e/lib.sh"` → `safe_install <apk> <pkg>`。

## 附录 E · 已知缺陷与标准处置（摘要）

| 缺陷 | 标准处置 |
|------|----------|
| SharedPreferences `apply` + `exit` 竞态致假 crash-loop | OtaModule 跨 reload 字段使用 `commit`；工业模板 ≥ v5 |
| 工业壳未 `asRoot: true` | ShellHost 与绿地 ReleaseOtaBoot 对齐 |
| `ship block --platform android` 误伤宿主 | JS 停投递用 `POST /v1/block {digest}` |

---

**文档结束 · SOP-GF-STEEL-01 v2.0**
