#!/usr/bin/env bash
# 07-android.sh — Android Gradle / 内测分发 / Play 提审预检
# 验证: SDK / 签字 / AAB / Play Console service account
# 退出码: 0 / 2 / 4

set -uo pipefail

echo "── 07 Android ─────────────────────────────────────"

FAIL=0

# 1. Android SDK
echo "[1/5] Android SDK …"
if [[ -n "${ANDROID_HOME:-}" ]] || [[ -n "${ANDROID_SDK_ROOT:-}" ]]; then
  SDK="${ANDROID_HOME:-$ANDROID_SDK_ROOT}"
  echo "  ✓ ANDROID_HOME=${SDK}"
else
  echo "  ⚠ ANDROID_HOME 未设置"
  FAIL=1
fi

# 2. Gradle
echo "[2/5] Gradle …"
if command -v gradle >/dev/null 2>&1; then
  echo "  ✓ gradle $(gradle --version 2>/dev/null | grep ^Gradle | head -1)"
else
  echo "  ⚠ gradle 不可用（业务仓自带 wrapper 可）"
fi

# 3. 签字 keystore
echo "[3/5] Release 签字 keystore …"
if [[ -n "${RELEASE_KEYSTORE_PATH:-}" ]] && [[ -f "${RELEASE_KEYSTORE_PATH:-}" ]]; then
  echo "  ✓ RELEASE_KEYSTORE_PATH=${RELEASE_KEYSTORE_PATH}"
elif [[ -f "$HOME/.android/release.keystore" ]] || [[ -f "$HOME/.keystores/release.jks" ]]; then
  echo "  ✓ 默认 keystore 位置"
else
  echo "  ⚠ Release keystore 未配置（企业侧需申请）"
  echo "     生成：keytool -genkey -v -keystore release.jks -keyalg RSA -keysize 2048 -validity 10000 -alias release"
  FAIL=1
fi

# 4. Play Console service account
echo "[4/5] Play Console service account …"
if [[ -n "${GOOGLE_PLAY_JSON_KEY_PATH:-}" ]] && [[ -f "${GOOGLE_PLAY_JSON_KEY_PATH:-}" ]]; then
  echo "  ✓ GOOGLE_PLAY_JSON_KEY_PATH=${GOOGLE_PLAY_JSON_KEY_PATH}"
elif [[ -n "${GOOGLE_APPLICATION_CREDENTIALS:-}" ]]; then
  echo "  ✓ GOOGLE_APPLICATION_CREDENTIALS=${GOOGLE_APPLICATION_CREDENTIALS}"
else
  echo "  ⚠ Play Console service account 未配置"
  echo "     需在 https://play.google.com/console 创建 service account + 授权"
  FAIL=1
fi

# 5. AAB build 是否能跑
echo "[5/5] AAB build 预检 …"
if [[ -d "$HOME/code/host-android" ]] || [[ -d "$HOME/code/desk" ]]; then
  # 找 build.gradle / build.gradle.kts
  GRADLE=$(find "$HOME/code" -name "build.gradle*" -not -path "*/node_modules/*" 2>/dev/null | head -1)
  if [[ -n "$GRADLE" ]]; then
    echo "  ✓ 找到 build.gradle: $GRADLE"
  else
    echo "  ⚠ 未找到 build.gradle（业务仓结构异常）"
  fi
else
  echo "  ⚠ 业务实例未克隆"
fi

echo "───────────────────────────────────────────────────"
if [[ ${FAIL:-0} -ne 0 ]]; then
  echo "WARN：Android 预检缺项"
  echo "  详见 10-store-submit-checklist.md §Android"
  exit 4
fi
echo "PASS：Android 达上市前预检"
exit 0
