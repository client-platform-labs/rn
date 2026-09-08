#!/usr/bin/env bash
# 自动安装 APK：adb install 触发 vivo 确认弹窗后，uiautomator 自动勾选选框 + 点「继续安装」。
# 用法：auto-install.sh <apk-path>
set -u
APK="$1"
adb install "$APK" &
INST_PID=$!

for i in $(seq 1 60); do
  if ! kill -0 "$INST_PID" 2>/dev/null; then break; fi
  UI=$(adb shell uiautomator dump /sdcard/auto-install.xml >/dev/null 2>&1 && adb shell cat /sdcard/auto-install.xml 2>/dev/null)
  [ -z "$UI" ] && sleep 2 && continue
  TAPPED=0
  # 选框（已了解/风险检测/同意）
  while read -r TAP; do adb shell input tap $TAP >/dev/null 2>&1; TAPPED=1; sleep 1; done < <(
    echo "$UI" | python3 -c "
import sys, re
xml = sys.stdin.read()
for m in re.finditer(r'text=\"([^\"]*)\"[^>]*checked=\"false\"[^>]*bounds=\"\[(\d+),(\d+)\]\[(\d+),(\d+)\]\"', xml):
    if any(k in m.group(1) for k in ['已了解','风险检测','信任','同意']):
        x1,y1,x2,y2 = map(int, m.groups()[1:]); print((x1+x2)//2, (y1+y2)//2)
" 2>/dev/null)
  # 按钮（继续安装等，限定避免匹配 app 信息行）
  while read -r TAP; do adb shell input tap $TAP >/dev/null 2>&1; TAPPED=1; sleep 1; done < <(
    echo "$UI" | python3 -c "
import sys, re
xml = sys.stdin.read()
for m in re.finditer(r'text=\"([^\"]+)\"[^>]*bounds=\"\[(\d+),(\d+)\]\[(\d+),(\d+)\]\"', xml):
    t = m.group(1)
    if '继续安装' in t or t in ('Install','允许安装','完成'):
        x1,y1,x2,y2 = map(int, m.groups()[1:]); print((x1+x2)//2, (y1+y2)//2)
" 2>/dev/null)
  [ "$TAPPED" = "0" ] && sleep 2
done

wait "$INST_PID"
RC=$?
echo "install exit=$RC"
exit $RC
