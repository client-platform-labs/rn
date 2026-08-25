import { ScrollView, StyleSheet, Text, View } from "react-native";

import { colors, typography } from "../../ui";
import { probeModuleEnv, SAMPLE_DEV_SESSION } from "../../modules/envProbe";

/**
 * Dual-module L-C / port table surface for map-a/#17 sample.
 * Removed with `rn demo remove`.
 */
export function ModulesEnvScreen() {
  const main = probeModuleEnv("main");
  const support = probeModuleEnv("support");

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Text style={styles.title}>多 Module · L-C / Metro</Text>
      <Text style={styles.sub}>
        合同：main→:{SAMPLE_DEV_SESSION.modules.main.metroPort} · support→:
        {SAMPLE_DEV_SESSION.modules.support.metroPort}（见 .rn/dev-session.jsonc）
      </Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>main（壳 profile + overlay）</Text>
        <Text style={styles.mono}>{JSON.stringify(main, null, 2)}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>support（独立 apiBaseUrl · 不串 main）</Text>
        <Text style={styles.mono}>{JSON.stringify(support, null, 2)}</Text>
      </View>

      <Text style={styles.hint}>
        CLI：rn dev --modules main,support · 卸载：rn demo remove
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.paper },
  content: { padding: 20, gap: 16 },
  title: { ...typography.title, color: colors.ink },
  sub: { ...typography.body, color: colors.inkMuted, marginBottom: 8 },
  card: {
    backgroundColor: colors.paperElevated,
    borderRadius: 12,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  cardTitle: { ...typography.headline, color: colors.ink, marginBottom: 8 },
  mono: {
    fontFamily: "Menlo",
    fontSize: 12,
    color: colors.ink,
    lineHeight: 18,
  },
  hint: { ...typography.caption, color: colors.inkSubtle, marginTop: 8 },
});
