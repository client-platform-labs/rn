# A1 Greenfield acceptance

Industrial pure-RN path on **React Native 0.87.x** (Hermes V1 + New Architecture only).

## Install the CLI (any directory)

```bash
curl -fsSL https://raw.githubusercontent.com/client-platform-labs/rn/main/scripts/get-rn.sh | bash -s -- --preflight
curl -fsSL https://raw.githubusercontent.com/client-platform-labs/rn/main/scripts/get-rn.sh | bash
```

Installs into `~/.client-platform/rn`, links `rn` / `rn-delivery` onto PATH. See [cli-distribution.md](./cli-distribution.md).

```bash
rn doctor
rn self update
rn self uninstall --yes
```

## Create an app

```bash
mkdir ~/Work/my-rn-app && cd ~/Work/my-rn-app
rn init --demo          # init + sample work-order demo
# or: rn init && rn demo add
rn doctor
rn dev --android          # Metro + install; Metro stays up until Ctrl+C
```

See [sample demo spec](./specs/2026-08-24-sample-demo-design.md) for CRUD / capabilities / H5 / deep link coverage.

```bash
rn dev-support add      # optional: debug FAB → RN Dev Menu (__DEV__ only)
rn dev-support remove
```

Upgrade an existing demo implant after CLI/template updates:

```bash
rn demo remove && rn demo add
```

```bash
rn demo remove          # restore upstream Hello + remove src/sample/
```

Legacy one-liner without demo:

```bash
mkdir /tmp/pure-rn-app && cd /tmp/pure-rn-app
rn init
rn doctor
rn dev
rn-delivery build --platform android
```

### npm policy（init 拉模板）

默认 **inherit**（对齐主流脚手架）：沿用本机 `~/.npmrc` / 代理 / token / 公司源。

需要干净公网拉取（CI、本机 npm 配置过期吵闹）时显式隔离：

| 方式 | 示例 |
|------|------|
| 默认（继承本机） | `rn init` |
| 一次性隔离 | `rn init --isolated-npmrc` |
| 指定策略 | `rn init --npm-policy isolated` |
| 强制 registry（可与 inherit 叠用） | `rn init --npm-registry https://npm.corp.example/` |
| 环境变量 | `CLIENT_PLATFORM_NPM_POLICY=isolated` / `CLIENT_PLATFORM_NPM_REGISTRY=…` |
| 主机配置 | `~/.client-platform/rn/config.json`（见下） |

```json
{
  "npm": {
    "policy": "isolated",
    "registry": "https://registry.npmjs.org/"
  }
}
```

优先级：**CLI flag > env > host config > default(inherit)**。

## Contributors (already have a git clone)

```bash
./scripts/install.sh    # build + link *this* worktree
```

## Android / iOS device testing

`rn init` / `rn doctor` / `rn dev` (Metro only) **do not** require Android SDK.

**Real device / debug APK does:**

| Need | Why |
|------|-----|
| Android SDK (`ANDROID_HOME` / `ANDROID_SDK_ROOT`) | Gradle compile native app |
| `adb` (SDK `platform-tools`) | `rn dev --android`, `adb install`, device logs |
| USB debugging / emulator | Target runtime |
| JDK 17+ (typical for RN 0.87) | Android builds |

Without SDK/adb/JDK: `rn doctor` shows **L1 NEED**. Install via:

```bash
rn host android --check
rn host android --dry-run
rn host android --yes
rn doctor --strict
```

`rn host android --yes` writes `ANDROID_HOME` / `adb` into your shell profile (`~/.zshrc`). New terminals load it automatically. **`rn doctor` and `rn dev --android` probe the SDK on disk** — no manual `source` step.

L2 (USB trust / Xcode first-run / licenses GUI) remains manual.
