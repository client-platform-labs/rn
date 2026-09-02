# Map E — 产品门户（装包台 / JS 发版台）

高保真 UX 接 **Distribution Service OpenAPI**，与运维验证页（`/`）分离。

## 入口

| URL | 说明 |
|-----|------|
| `/portal/host` | 宿主装包台 — `GET /v1/candidates` |
| `/portal/js` | JS 离线包发版台 — `GET /v1/js-updates` |
| `/portal/portal-live.js` | API 桥接脚本 |

启动服务（cwd = 壳工程，如 tiangong-host）：

```bash
cd /Users/xuwei/code/tiangong-host
RN_CP_TOKEN=dev node …/rn-delivery.mjs cp-serve --port 4040 --host 0.0.0.0
```

- 装包台：http://127.0.0.1:4040/portal/host  
- JS 发版台：http://127.0.0.1:4040/portal/js  

## 数据来源

- **真实：** 注册表中的 app-host / js-update 行 + `/v1/artifacts/:digest` 下载
- **模拟：** 装机量、下载量、check 次数、灰度阶梯内的设备行为（本地 state）

需先有制品：见 [`map-e-tiangong-steel-thread.md`](./map-e-tiangong-steel-thread.md)。

## 验证

```bash
node scripts/verify-map-e-portal-prototypes.mjs /Users/xuwei/code/tiangong-host
```

## 与 wayfinding 原型关系

- 设计稿：`wayfinding-map-e/prototypes/*.html`（静态 mock，可离线演示）
- 运行态：`packages/rn-delivery/static/portal/*.html`（接 API 的部署副本）

`RN_CP_DISABLE_CONSOLE=1` 时门户一并关闭（与运维页同开关）。
