# Get Started · 绿地钢线短轨（GF · Android）

> **状态**：`可执行` · 主路径零 TODO  
> **规程全文**：[SOP-GF-STEEL-01](./operations/sop-greenfield-steel-thread.md)（RACI 总表 · 场地拓扑 · 步骤模板 · 证据 · 交接 · 附录）  
> **钢线关闭后** → [日常再发 / 回滚](./daily.md)  
> **BF**：同级另轨，本版不写。  
> CLI 以 `ship --help` / `rn --help` 为准；字段与 HTTP 细节链 [参考手册](./reference/index.md)，本页不搬整表。

## 页首 · 谁做什么 / 在哪做

| 阶段 | 平台运维 | 壳运维 | 离线包运维 |
|------|:--------:|:------:|:----------:|
| A 信任与工程 | **R** | C / **R**(A3–A5) | I |
| B 控制面 | **R** | I | I |
| C 宿主首发 | C | **R** | I |
| D 业务首更 | I | C | **R** |
| E 口径关闭 | I | I | **R**；架构师 **A** |

**场地（POC 一行）**：工程机 ≈ 签名机 ≈ 控制面主机 ≈ 装包台（可同一 Mac）+ USB 真机；生产须拆分密钥机 / 签名机（SOP §5）。下文默认 `$STEEL_ROOT` 为练习根，`$APP` 为 `rn` 工程根，`$CP=http://127.0.0.1:4040`。

**闭环闸门**：真机从 baseline 热更到**已改业务可见态**的 `main`，进程稳定；CP 访问序 **CRL → check → artifacts**；对外只宣称 **L4**。

---

## 阶段 A · 信任与工程落地

**出口**：RCA 已交接壳运维；leaf 可签名；`rn doctor` 绿；`cpBaseUrl` 非空。

### 平台运维

<a id="平台运维"></a>

**A1 · keygen**

```bash
mkdir -p "$STEEL_ROOT/keys" && cd "$STEEL_ROOT"
ship keygen --dir ./keys --label steel
# 只交接 root_ca_public_key_hex（64 hex）给壳运维；根私钥与 leaf 私钥不进 git / 不进 APK
```

闸门：hex 长度 = 64；`keys/steel.key` 权限 ≤ 0600。详情 → SOP §9 A1。

**A2 · leaf-env**

部署并 `source` SOP 附录 A 脚本；终端出现 `leaf-env OK … (64 hex)`。详情 → SOP §9 A2。

### 壳运维

<a id="壳运维"></a>

**A3 · init + 烤 RCA**

```bash
cd "$APP"
rn init --rca-pubkey-hex <RCA_HEX> .
# 证据：init 日志含 bake root-CA；源码可 rg 到该 hex
```

**A4 · 声明 CP Base URL**

写 `.rn/runtime.jsonc` 中 `cpBaseUrl`（POC：`http://127.0.0.1:4040`）→ `rn shell refresh`（**禁止**手改 generated）。闸门：`grep cpBaseUrl shell/generated-runtime.ts` 非空。

**A5 · doctor**

```bash
rn doctor   # 须 PASS；须有 native OTA adapter
```

详情 → SOP §9 A3–A5。

---

## 阶段 B · 控制面最小可用

**出口**：`/health` 为 control-plane；`/v1/crl` 含 `seal` + `cert_chain` 且可验签。

### 平台运维

**B1 · 起 CP**（先 `source` leaf-env；配置 `RN_CP_TOKEN`、`RN_CP_PROJECT=$APP`）

```bash
ship cp-serve --port 4040 --host 127.0.0.1
# 守护化见 SOP 附录 B
```

**B2 · health**

```bash
curl -s "$CP/health"   # 身份须为 control-plane
```

**B3 · CRL 正向（强制）**

`GET $CP/v1/crl` 必须含 `seal`、`cert_chain`；推荐 SOP 附录 C 验签。**缺 seal/chain 或验签失败 → STOP，禁止进入 C/D。**

广播「CP 可用 + Base URL」后进入 C。详情 → SOP §9 B。

---

## 阶段 C · 宿主首发（低频列车）

**出口**：真机已装 release 宿主；可达 CP；冷启出现 CRL→check（无制品时 `no_update` 可接受）。

### 壳运维

**C1 · release 构建**

```bash
cd "$APP"
ship build --platform android --profile release
```

**C2 · 装机**

`adb install`（或平台 safe_install；Vivo 弹窗见 SOP 附录 D）。闸门：`pm path <pkg>` 有路径。

**C3 · 连通与冷启冒烟**

```bash
adb reverse tcp:4040 tcp:4040
adb shell pm clear <pkg>
# 启动 App → 查 pid；CP 日志应见 CRL 再 check
```

闸门：无 pid / 报 cpBaseUrl 未配置 / 无 CRL → STOP。交接 pkg、host digest、设备可达 CP → D。详情 → SOP §9 C。

---

## 阶段 D · 业务首更（高频列车）

**出口**：production 新 digest；真机顺序正确且稳定；**消歧证明 OTA 而非重打 APK**。

### 离线包运维

<a id="离线包运维"></a>

**D1 · 改可见态**  
改 `modules/main` 运行时 UI 字符串（禁止仅注释）。完整 multi-Metro 工业环 → [加深轨](./deepen/index.md)。

**D2 · HBC 候选**

```bash
cd "$APP"
ship update --module main
# 用匹配的 hermesc 产出 HBC →
ship ingest-pack --hbc <path-to.hbc>
```

闸门：bundle/HBC 能扫到 D1 标记。

**D3 · 签名并晋升**（`source` leaf-env）

```bash
ship sign
ship validate
ship release --kind js-update
# signal clear（清质量挡板，按当前 CLI）
ship promote --digest <digest>
```

闸门：check 返回目标 digest；seal 为 `pem:ed25519:`。

**D4 · 真机 OTA**  
确认 reverse/网络 → `pm clear` → 启动 → CP 序为 **crl → check → artifacts**（约一次下载）；进程稳定。否则按 SOP §11 止血。

**D5 · 消歧（强制）**  
**不重建 APK**；仅新 HBC / 新标记再走 D2–D4。证明：APK baseline **无**新串，UI/HBC **有**。无法消歧 → 不得进 E。

详情 → SOP §9 D。

---

## 阶段 E · 口径关闭

<a id="阶段-e--口径关闭"></a>

1. 勾选 SOP §10 验收清单  
2. 证据包最低集 → SOP §12（建议 `$STEEL_ROOT/records/YYYYMMDD-steel/`）  
3. **可宣称**：可信宿主；可验签 JS OTA 真机生效；CRL/check/制品 fail-closed  
4. **不可宣称**：多模块隔离、灰度、SLO、吊销、DR  
5. 下一动作 → [日常运维](./daily.md)

---

## 本页不写

灰度 / SLO / DR / 吊销 / AB / 商店 submit → [加深轨](./deepen/index.md) 或地图 Out of scope。
