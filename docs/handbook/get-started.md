# 实施引导 · 绿地钢线（Android）

| 字段 | 内容 |
|------|------|
| **文档类型** | 操作摘要（编排层） |
| **完整规程** | [SOP-GF-STEEL-01](./operations/sop-greenfield-steel-thread.md) |
| **后续文档** | 钢线关闭后 → [日常运维](./daily.md) |
| **范围** | 绿地 · Android · 单模块 `main` · 口径 L4 |
| **命令真源** | `ship --help` / `rn --help`；字段与 HTTP 见 [参考手册](./reference/index.md) |

本页给出分阶段最小操作序列。场地拓扑、证据模板、中止回滚与附录以 SOP-GF-STEEL-01 为准；步骤编号与 SOP §9 对齐。

---

## 0. 责任与环境

### 0.1 阶段责任（RACI 摘要）

| 阶段 | 平台运维 | 壳运维 | 离线包运维 |
|------|:--------:|:------:|:----------:|
| A 信任与工程落地 | **R** | C / **R**（A3–A5） | I |
| B 控制面最小可用 | **R** | I | I |
| C 宿主首发 | C | **R** | I |
| D 业务首更 | I | C | **R** |
| E 验收关闭 | I | I | **R**；架构师 **A** |

完整 RACI 见 SOP §4。

### 0.2 环境约定（POC）

| 符号 | 含义 |
|------|------|
| `$STEEL_ROOT` | 练习 / 交付工作根目录 |
| `$APP` | `rn` 工程根目录 |
| `$CP` | 控制面 Base URL，POC 默认 `http://127.0.0.1:4040` |

POC 可将工程机、签名机、控制面主机、装包台合并为同一工作站 + USB 真机。生产环境须按 SOP §5 拆分密钥机与签名机。

### 0.3 闭环验收标准

1. 真机由 baseline 热更新至含**业务可见变更**的 `main`，进程稳定  
2. 控制面访问顺序为 **CRL → check → artifacts**  
3. 完成 OTA / baseline **消歧**（证明非重打 APK）  
4. 对外仅宣称 **L4**  

---

## 1. 阶段 A · 信任与工程落地

**阶段出口**：RCA 公钥已交接壳运维；leaf 可用于签名；`rn doctor` 通过；`cpBaseUrl` 非空。

### 1.1 平台运维

<a id="平台运维"></a>

**A1 · 生成 RCA 与 leaf**

```bash
mkdir -p "$STEEL_ROOT/keys" && cd "$STEEL_ROOT"
ship keygen --dir ./keys --label steel
```

| 项 | 要求 |
|----|------|
| 交接物 | 仅 `root_ca_public_key_hex`（64 hex）交壳运维 |
| 禁止 | 根私钥、leaf 私钥进入 git 或 APK |
| 闸门 | hex 长度 = 64；`keys/steel.key` 权限 ≤ 0600 |

详见 SOP §9 A1。

**A2 · 配置 leaf 运行环境**

部署并 `source` SOP 附录 A 脚本；终端输出 `leaf-env OK … (64 hex)`。详见 SOP §9 A2。

### 1.2 壳运维

<a id="壳运维"></a>

**A3 · 初始化工程并烘焙 RCA**

```bash
cd "$APP"
rn init --rca-pubkey-hex <RCA_HEX> .
```

验收：初始化日志含 root-CA 烘焙记录；工程源码可检索到该公钥 hex。详见 SOP §9 A3。

**A4 · 声明控制面地址**

在 `.rn/runtime.jsonc` 写入 `cpBaseUrl`（POC：`http://127.0.0.1:4040`），执行 `rn shell refresh`。**禁止**直接修改 generated 文件。

闸门：`grep cpBaseUrl shell/generated-runtime.ts` 结果非空。详见 SOP §9 A4。

**A5 · 工程体检**

```bash
rn doctor
```

须通过，且具备原生 OTA 适配。详见 SOP §9 A5。

---

## 2. 阶段 B · 控制面最小可用

**阶段出口**：`/health` 标识为 control-plane；`/v1/crl` 含 `seal` 与 `cert_chain` 且验签通过。

### 平台运维

**B1 · 启动控制面**（先 `source` leaf-env；配置 `RN_CP_TOKEN`、`RN_CP_PROJECT=$APP`）

```bash
ship cp-serve --port 4040 --host 127.0.0.1
```

守护化部署见 SOP 附录 B。

**B2 · 健康检查**

```bash
curl -s "$CP/health"
```

响应身份须为 control-plane。

**B3 · CRL 正向验收（强制）**

`GET $CP/v1/crl` 必须包含 `seal`、`cert_chain`；建议按 SOP 附录 C 做密码学校验。

**缺 seal / chain 或验签失败 → 中止，不得进入阶段 C / D。**

控制面可用后，向壳运维与离线包运维广播 Base URL，进入阶段 C。详见 SOP §9 B。

---

## 3. 阶段 C · 宿主首发

**阶段出口**：真机已安装 release 宿主；可访问控制面；冷启动可见 CRL→check（尚无制品时 `no_update` 可接受）。

### 壳运维

**C1 · 构建 release 宿主**

```bash
cd "$APP"
ship build --platform android --profile release
```

**C2 · 真机安装**

使用 `adb install` 或平台装包流程（部分机型弹窗见 SOP 附录 D）。闸门：`pm path <pkg>` 返回有效路径。

**C3 · 连通与冷启动冒烟**

```bash
adb reverse tcp:4040 tcp:4040
adb shell pm clear <pkg>
# 启动应用，确认进程存活；控制面日志须先见 CRL，再见 check
```

失败即中止（无进程、`cpBaseUrl` 未配置、无 CRL 请求）。向离线包运维交接：包名、host digest、设备可达控制面。详见 SOP §9 C。

---

## 4. 阶段 D · 业务首更

**阶段出口**：production 存在新 digest；真机更新顺序正确且稳定；完成 OTA / baseline 消歧。

### 离线包运维

<a id="离线包运维"></a>

**D1 · 业务可见变更**

修改 `modules/main` 中运行时可见的 UI 文案或等价可观测点（不得仅改注释）。多 Metro 开发工业环见 [进阶主题](./deepen/index.md)。

**D2 · 编译并摄入 HBC**

```bash
cd "$APP"
ship update --module main
# 使用与工程匹配的 hermesc 生成 HBC 后：
ship ingest-pack --hbc <path-to.hbc>
```

闸门：制品中可扫描到 D1 标记。

**D3 · 签名、校验与晋升**（`source` leaf-env）

```bash
ship sign
ship validate
ship release --kind js-update
ship promote --digest <digest>
```

闸门：`check` 返回目标 digest；签名形态为 `pem:ed25519:`。质量信号清理按现行 CLI 执行。

**D4 · 真机热更新验收**

确认网络 / `adb reverse` → 必要时 `pm clear` → 冷启动 → 控制面顺序为 **crl → check → artifacts**；进程稳定。异常按 SOP §11 止血。

**D5 · OTA / Baseline 消歧（强制）**

**不得**通过重建 APK 证明成功。应在不更换宿主 APK 的前提下，仅更新 HBC / 可见标记并重复 D2–D4，证明：APK baseline 不含新标记，而 UI / HBC 含新标记。

无法消歧 → 不得进入阶段 E。详见 SOP §9 D。

---

## 5. 阶段 E · 验收关闭

<a id="阶段-e--口径关闭"></a>

1. 完成 SOP §10 验收清单  
2. 归档 SOP §12 规定的最低证据集（建议目录 `$STEEL_ROOT/records/YYYYMMDD-steel/`）  
3. **可对外说明**：可信宿主；可验签的 JS 热更新已在真机生效；CRL / check / 制品路径 fail-closed  
4. **不可对外说明**：多模块隔离、灰度档位、SLO、密钥吊销、DR  
5. 钢线关闭后的变更操作 → [日常运维](./daily.md)

---

## 6. 本引导不覆盖的内容

灰度、SLO、DR、密钥吊销、AB 实验、商店提审等见 [进阶主题](./deepen/index.md) 或操作手册相应章节；未实现能力不得按可执行 runbook 执行。
