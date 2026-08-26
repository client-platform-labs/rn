import { useEffect, useSyncExternalStore } from "react";
import { AppRegistry, StyleSheet, Text, View } from "react-native";

import { trackInterval } from "./disposeProbe";
import {
  getSampleEnvSnapshot,
  probeModuleEnv,
  subscribeSampleEnv,
} from "./envProbe";

/**
 * Minimal second-module surface for multi-Metro isolation (map-a/#17).
 * Registers an interval tied to Surface lifecycle — must clean on unmount (P0.1).
 */
export function SupportModuleApp() {
  useSyncExternalStore(subscribeSampleEnv, getSampleEnvSnapshot);
  const env = probeModuleEnv("support");

  useEffect(() => {
    const stop = trackInterval("support", 30_000, () => {
      // heartbeat — proves dispose probe tracks active handles
    });
    return stop;
  }, []);

  return (
    <View style={styles.root}>
      <Text style={styles.title}>support module</Text>
      <Text style={styles.sub}>Metro :8082 · entry index.support</Text>
      <Text style={styles.sub}>dispose: interval registered (clears on unmount)</Text>
      <Text style={styles.mono}>{JSON.stringify(env, null, 2)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: 24, backgroundColor: "#FAF9F5", justifyContent: "center" },
  title: { fontSize: 22, fontWeight: "700", color: "#1F1E1C" },
  sub: { marginTop: 8, color: "#6B6962", marginBottom: 16 },
  mono: { fontFamily: "Menlo", fontSize: 12, color: "#1F1E1C" },
});

export function registerSupportModule(appKey: string): void {
  AppRegistry.registerComponent(appKey, () => SupportModuleApp);
}
