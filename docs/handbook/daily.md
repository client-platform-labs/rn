# 日常运维 · 业务包再发布与回滚

| 字段 | 内容 |
|------|------|
| **文档类型** | 操作规程（主路径） |
| **前置条件** | 已按 [实施引导](./get-started.md) 完成绿地钢线并关闭验收（L4） |
| **主责角色** | 离线包运维（平台运维保障控制面与 CRL） |
| **命令 / 接口真源** | [参考手册](./reference/index.md) |

---

## 1. 再发布同一业务模块（`main`）

1. 完成可观测的业务变更（运行时可见，或约定的验收信号）。  
2. 按与钢线阶段 D 相同的制品链执行：

```bash
cd "$APP"
source <leaf-env>    # 见 SOP-GF-STEEL-01 附录 A
ship update --module main
# hermesc 产出 HBC 后：
ship ingest-pack --hbc <path-to.hbc>
ship sign && ship validate
ship release --kind js-update
ship promote --digest <digest>
```

3. 在真机确认新版本可见；保留 OTA / baseline 消歧习惯（不以重打宿主 APK 作为成功证明）。  
4. **验收**：`check` 指向新 digest；进程稳定；访问顺序仍为 CRL → check → artifacts。

---

## 2. 包级回滚（停止投递异常制品）

当已晋升的 JS 制品导致不稳定时（对齐 SOP-GF-STEEL-01 §11）：

1. **止血**：对异常 `digest` 执行包级 block（`POST /v1/block`，请求体包含目标 `digest`）。  
   - **禁止**使用会误伤宿主发布列车的 `ship block --platform android`。  
2. 若需设备立即脱离坏包：在装包台执行 `adb shell pm clear <pkg>` 回到 baseline；必要时将**上一良好** digest 重新 promote。  
3. 真机确认已回到预期可见状态。

槽位与回滚决策细节见 [`multi-bundle-version.md` §5](./operations/multi-bundle-version.md)、[`ota.md` §5](./operations/ota.md)。

---

## 3. 本规程边界

| 主题 | 去向 |
|------|------|
| 灰度放量、SLO 熔断、quality gate | [进阶主题](./deepen/index.md) |
| 密钥吊销演练、DR | [进阶主题](./deepen/index.md) |
| 生产故障快速定位 | [操作手册 · 紧急通道](./operations/index.md#0-紧急通道出事先看哪) |
