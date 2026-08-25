import { StyleSheet, View } from "react-native";

import { Card, Screen, Typography, colors, spacing } from "../../ui";

export function AboutScreen() {
  return (
    <Screen>
      <Typography variant="display">关于样板</Typography>
      <Typography variant="muted" style={styles.lead}>
        Client Platform Labs · pure-RN 教学示例
      </Typography>

      <Card>
        <Typography variant="headline">用途</Typography>
        <Typography variant="body" style={styles.body}>
          演示工单 CRUD、真实相册/相机附件、H5 与 Deep Link。数据保存在内存中，重启恢复种子数据。
        </Typography>
      </Card>

      <Card>
        <Typography variant="headline">媒体能力</Typography>
        <Typography variant="body" style={styles.body}>
          当前通过 Sample Media Adapter（react-native-image-picker）实现；未来将替换为官方 L1
          Camera/MediaLibrary 能力包。
        </Typography>
      </Card>

      <Card>
        <Typography variant="headline">开发调试</Typography>
        <Typography variant="body" style={styles.body}>
          Debug 构建可运行 rn dev-support add 安装悬浮调试入口（与样板解耦，仅 __DEV__ 显示）。
          {"\n\n"}
          或摇一摇手机 / adb shell input keyevent 82 打开 RN Dev Menu。
        </Typography>
      </Card>

      <Card>
        <Typography variant="headline">移除样板</Typography>
        <Typography variant="body" style={styles.body}>
          在项目根目录运行 rn demo remove，将恢复上游 Hello 入口并卸载样板依赖。
        </Typography>
      </Card>

      <View style={styles.footer}>
        <Typography variant="caption">scheme: cpl-sample:// · 非系统族正式合同</Typography>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  lead: { marginTop: spacing.xs, marginBottom: spacing.lg },
  body: { marginTop: spacing.sm, lineHeight: 22 },
  footer: { marginTop: spacing.xl, alignItems: "center" },
});
