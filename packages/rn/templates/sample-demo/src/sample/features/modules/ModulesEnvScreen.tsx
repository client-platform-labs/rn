import { useSyncExternalStore } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { colors, typography } from "../../ui";
import {
  getDisposeProbeSnapshot,
  mountDevSupportInterval,
  resetDisposeProbe,
  simulateModuleDestroy,
  subscribeDisposeProbe,
  unmountDevSupportInterval,
} from "../../modules/disposeProbe";
import {
  getActiveProfileId,
  getSampleEnvSnapshot,
  probeModuleEnv,
  SAMPLE_DEV_SESSION,
  subscribeSampleEnv,
} from "../../modules/envProbe";

/**
 * Dual-module L-C / port table surface for map-a/#17 sample.
 * Includes P0.1 dispose probe sampling (dev).
 */
export function ModulesEnvScreen() {
  useSyncExternalStore(subscribeSampleEnv, getSampleEnvSnapshot);
  const dispose = useSyncExternalStore(
    subscribeDisposeProbe,
    getDisposeProbeSnapshot,
  );
  const profileId = getActiveProfileId();
  const main = probeModuleEnv("main");
  const support = probeModuleEnv("support");

  const runDestroySample = async (moduleId: "main" | "support") => {
    const result = await simulateModuleDestroy(moduleId);
    if (result.ok) {
      Alert.alert("dispose OK", `${moduleId}: no active handles after destroy`);
    } else {
      Alert.alert("dispose FAIL", result.reason);
    }
  };

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Text style={styles.title}>多 Module · L-C / Metro</Text>
      <Text style={styles.sub}>
        profile={profileId} · main→:{SAMPLE_DEV_SESSION.modules.main.metroPort} ·
        support→:{SAMPLE_DEV_SESSION.modules.support.metroPort}
      </Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>P0.1 dispose probe</Text>
        <Text style={styles.mono}>{JSON.stringify(dispose, null, 2)}</Text>
        <View style={styles.row}>
          <Pressable
            style={styles.btnSecondary}
            onPress={() => mountDevSupportInterval()}
          >
            <Text style={styles.btnText}>mount support interval</Text>
          </Pressable>
          <Pressable
            style={styles.btnSecondary}
            onPress={() => unmountDevSupportInterval()}
          >
            <Text style={styles.btnText}>unmount support interval</Text>
          </Pressable>
        </View>
        <View style={styles.row}>
          <Pressable
            style={styles.btn}
            onPress={() => void runDestroySample("support")}
          >
            <Text style={styles.btnText}>simulate destroy support</Text>
          </Pressable>
          <Pressable style={styles.btnSecondary} onPress={() => resetDisposeProbe()}>
            <Text style={styles.btnText}>reset probes</Text>
          </Pressable>
        </View>
        <Text style={styles.hint}>
          HITL: mount → simulate destroy (expect FAIL) → unmount → reset → simulate (OK)
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>main（壳 profile + overlay + override）</Text>
        <Text style={styles.mono}>{JSON.stringify(main, null, 2)}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>support（独立 apiBaseUrl · 不串 main）</Text>
        <Text style={styles.mono}>{JSON.stringify(support, null, 2)}</Text>
      </View>

      <Text style={styles.hint}>
        长按 DEV → C5 切 profile / 改 apiBaseUrl / 重置 · CLI：rn dev --modules
        main,support
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
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 },
  btn: {
    backgroundColor: colors.accent,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  btnSecondary: {
    backgroundColor: colors.inkMuted,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  btnText: { ...typography.caption, color: "#fff", fontWeight: "600" },
});
