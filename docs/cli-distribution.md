# CLI 分发与生命周期（工业级）

对齐 rustup / pnpm / bun / Homebrew 的常见用户旅程：**任意目录复制一条命令即可安装**，并具备预检、升级、卸载。

## 用户命令面

| 动作 | 命令 |
|------|------|
| 一键安装 | `curl -fsSL https://raw.githubusercontent.com/client-platform-labs/rn/main/scripts/get-rn.sh \| bash` |
| 安装前预检 | `curl -fsSL https://raw.githubusercontent.com/client-platform-labs/rn/main/scripts/get-rn.sh \| bash -s -- --preflight` |
| 安装后预检 | `rn preflight` |
| 升级 | `rn self update` |
| 卸载 | `rn self uninstall` |
| 应急卸载（CLI 损坏时） | `curl -fsSL …/get-rn.sh \| bash -s -- --uninstall` |

可选钉分支/标签：

```bash
curl -fsSL …/get-rn.sh | bash -s -- --ref main
CLIENT_PLATFORM_RN_REF=v0.1.0 curl -fsSL …/get-rn.sh | bash
```

## 布局约定

| 路径 | 用途 |
|------|------|
| `$CLIENT_PLATFORM_RN_HOME`（默认 `~/.client-platform/rn`） | 工具源码与 build 产物（git checkout） |
| `~/.local/bin/rn`、`rn-delivery` | 用户 PATH 入口（symlink → HOME/packages/…/bin） |
| `~/.config/client-platform/rn-env.sh` | PATH 片段 |
| shell profile 中 `# client-platform-rn-cli` 标记段 | 持久 PATH |

开发者在 git worktree 内工作仍可用 `pnpm exec rn`；**终端用户**只使用 get-rn + `rn`。

## 与「先 clone 再 ./scripts/install.sh」的区别

| 方式 | 定位 |
|------|------|
| `curl \| bash`（get-rn.sh） | **产品安装**（工业默认） |
| 仓库内 `./scripts/install.sh` | 贡献者/已有 checkout 的快捷封装（内部调用同一套 link 逻辑） |

## 未发布 npm 时的策略

MVP 未发 npm registry：安装器 **git clone** 官方仓到 `~/.client-platform/rn` 再 build。  
首发 npm 后可演进为 `npm i -g @client-platform/rn` 而不改用户命令面（get-rn.sh 内切换实现）。
