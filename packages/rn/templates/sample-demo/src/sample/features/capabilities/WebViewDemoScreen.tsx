import { StyleSheet, View } from "react-native";
import { WebView } from "react-native-webview";

import { Typography, colors, spacing } from "../../ui";

const SAMPLE_HTML = `<!doctype html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>样板 H5</title>
<style>
  body { font-family: Georgia, serif; background: #FAF9F5; color: #1F1E1C; padding: 24px; margin: 0; }
  h1 { font-size: 1.5rem; font-weight: 600; }
  p { line-height: 1.6; color: #6B6962; }
</style></head>
<body>
<h1>Client Platform 样板 H5</h1>
<p>这是 WebView 内嵌页。正式产品可在此桥接 postMessage。</p>
<script>
  setTimeout(function() {
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ready' }));
    }
  }, 300);
</script>
</body></html>`;

export function WebViewDemoScreen() {
  return (
    <View style={styles.container}>
      <View style={styles.banner}>
        <Typography variant="caption">内嵌 H5 · Claude 暖色示例页</Typography>
      </View>
      <WebView
        originWhitelist={["*"]}
        source={{ html: SAMPLE_HTML }}
        onMessage={(e) => {
          console.log("webview message", e.nativeEvent.data);
        }}
        style={styles.webview}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },
  banner: {
    padding: spacing.sm,
    backgroundColor: colors.accentSoft,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  webview: { flex: 1 },
});
