import type { ReactNode } from "react";
import { useEffect, useState, useSyncExternalStore } from "react";
import {
  Alert,
  DevMenu,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

type Props = {
  children: ReactNode;
};

type ModuleProbe = {
  id: string;
  metroPort: number;
  effective: Record<string, unknown>;
};

type SampleModuleId = "main" | "support";

type EnvProbeModule = {
  SAMPLE_DEV_SESSION: {
    modules: Record<string, { metroPort: number }>;
  };
  probeModuleEnv: (id: SampleModuleId) => Record<string, unknown>;
  listSampleProfiles: () => string[];
  getActiveProfileId: () => string;
  setActiveProfile: (id: string) => void;
  setModuleOverride: (
    id: SampleModuleId,
    overlay: Record<string, unknown>,
  ) => void;
  resetModuleOverrides: (id?: SampleModuleId) => void;
  subscribeSampleEnv: (cb: () => void) => () => void;
  getSampleEnvSnapshot: () => unknown;
};

type MenuContribution = {
  id: string;
  pluginId: string;
  label: string;
  moduleId?: string;
  action: string;
  payload?: Record<string, unknown>;
};

type ContributionsFile = {
  menuItems?: MenuContribution[];
};

/**
 * Debug-only: tap DEV → system Dev Menu; long-press → L-C panel (C5+C8).
 * C5: switch profile · per-module apiBaseUrl override · reset.
 * Plugin menu rows from `contributions.json` (`kind: "dev-session"`).
 * Do **not** call DevMenu.addItem — undefined on many Android / RN builds.
 */
export function DevSupportRoot({ children }: Props) {
  const [panel, setPanel] = useState(false);
  const [envMod, setEnvMod] = useState<EnvProbeModule | null>(null);
  const [menuItems, setMenuItems] = useState<MenuContribution[]>([]);
  const [draftUrls, setDraftUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!__DEV__) {
      return;
    }
    let cancelled = false;
    void import("../sample/modules/envProbe")
      .then((mod: EnvProbeModule) => {
        if (cancelled || !mod?.SAMPLE_DEV_SESSION || !mod.probeModuleEnv) {
          return;
        }
        setEnvMod(mod);
      })
      .catch(() => {
        // sample not installed
      });

    void import("./contributions.json")
      .then((mod: ContributionsFile & { default?: ContributionsFile }) => {
        if (cancelled) return;
        const file = mod.default ?? mod;
        setMenuItems(Array.isArray(file.menuItems) ? file.menuItems : []);
      })
      .catch(() => {
        // no contributions written yet
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const snapshot = useSyncExternalStore(
    envMod?.subscribeSampleEnv ?? (() => () => {}),
    envMod?.getSampleEnvSnapshot ?? (() => null),
  );

  const probes: ModuleProbe[] = (() => {
    if (!envMod) return [];
    void snapshot;
    const session = envMod.SAMPLE_DEV_SESSION;
    const ids = Object.keys(session.modules).filter(
      (id): id is SampleModuleId => id === "main" || id === "support",
    );
    return ids.map((id) => ({
      id,
      metroPort: session.modules[id].metroPort,
      effective: envMod.probeModuleEnv(id),
    }));
  })();

  const profiles = envMod?.listSampleProfiles() ?? [];
  const activeProfile = envMod?.getActiveProfileId() ?? "";

  useEffect(() => {
    if (!panel || probes.length === 0) return;
    const next: Record<string, string> = {};
    for (const p of probes) {
      const url = p.effective.apiBaseUrl;
      next[p.id] = typeof url === "string" ? url : "";
    }
    setDraftUrls(next);
  }, [panel, snapshot, probes]);

  if (!__DEV__) {
    return <>{children}</>;
  }

  const openPanel = () => {
    setPanel(true);
  };

  const onMenuItem = (item: MenuContribution) => {
    if (item.action === "show-effective") {
      const probe = probes.find((p) => p.id === (item.moduleId ?? "main"));
      Alert.alert(
        item.label,
        probe
          ? JSON.stringify(probe.effective, null, 2)
          : `no probe for module ${item.moduleId ?? "main"}`,
      );
      return;
    }
    if (item.action === "custom") {
      const message =
        typeof item.payload?.message === "string"
          ? item.payload.message
          : JSON.stringify(item.payload ?? {}, null, 2);
      Alert.alert(item.label, message);
      return;
    }
    if (item.action === "reset-overrides") {
      envMod?.resetModuleOverrides(
        item.moduleId === "main" || item.moduleId === "support"
          ? item.moduleId
          : undefined,
      );
      return;
    }
    Alert.alert(item.label, `action=${item.action}`);
  };

  return (
    <View style={styles.root}>
      {children}
      <Pressable
        style={({ pressed }) => [styles.fab, pressed && styles.fabPressed]}
        onPress={() => {
          if (typeof DevMenu?.show === "function") {
            DevMenu.show();
          } else {
            openPanel();
          }
        }}
        onLongPress={openPanel}
        accessibilityLabel="Open developer menu"
        accessibilityRole="button"
      >
        <Text style={styles.fabText}>DEV</Text>
      </Pressable>

      <Modal visible={panel} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>L-C · Effective + override</Text>
            <Text style={styles.modalHint}>
              C5：切 profile · 改 apiBaseUrl · 重置 · 短按 DEV = 系统菜单
            </Text>
            <ScrollView style={styles.modalScroll}>
              {envMod ? (
                <View style={styles.probeBlock}>
                  <Text style={styles.probeTitle}>Env profile</Text>
                  <View style={styles.chipRow}>
                    {profiles.map((id) => (
                      <Pressable
                        key={id}
                        style={[
                          styles.chip,
                          id === activeProfile && styles.chipActive,
                        ]}
                        onPress={() => envMod.setActiveProfile(id)}
                      >
                        <Text
                          style={[
                            styles.chipText,
                            id === activeProfile && styles.chipTextActive,
                          ]}
                        >
                          {id}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              ) : null}

              {probes.length === 0 ? (
                <Text style={styles.mono}>
                  无 sample probe。rn demo add 后可见 main/support。
                </Text>
              ) : (
                probes.map((p) => (
                  <View key={p.id} style={styles.probeBlock}>
                    <Text style={styles.probeTitle}>
                      {p.id} · Metro :{p.metroPort}
                    </Text>
                    <Text style={styles.mono}>
                      {JSON.stringify(p.effective, null, 2)}
                    </Text>
                    <Text style={styles.fieldLabel}>override apiBaseUrl</Text>
                    <TextInput
                      style={styles.input}
                      autoCapitalize="none"
                      autoCorrect={false}
                      value={draftUrls[p.id] ?? ""}
                      onChangeText={(text) =>
                        setDraftUrls((prev) => ({ ...prev, [p.id]: text }))
                      }
                      placeholder="http://…"
                      placeholderTextColor="#9A978E"
                    />
                    <View style={styles.rowActions}>
                      <Pressable
                        style={styles.secondaryBtn}
                        onPress={() => {
                          const url = (draftUrls[p.id] ?? "").trim();
                          if (!url) {
                            Alert.alert("apiBaseUrl", "不能为空");
                            return;
                          }
                          envMod?.setModuleOverride(p.id as SampleModuleId, {
                            apiBaseUrl: url,
                          });
                        }}
                      >
                        <Text style={styles.secondaryBtnText}>Apply</Text>
                      </Pressable>
                      <Pressable
                        style={styles.secondaryBtn}
                        onPress={() =>
                          envMod?.resetModuleOverrides(p.id as SampleModuleId)
                        }
                      >
                        <Text style={styles.secondaryBtnText}>Reset module</Text>
                      </Pressable>
                    </View>
                  </View>
                ))
              )}

              {envMod && probes.length > 0 ? (
                <Pressable
                  style={styles.resetAllBtn}
                  onPress={() => {
                    envMod.resetModuleOverrides();
                  }}
                >
                  <Text style={styles.resetAllText}>Reset all overrides</Text>
                </Pressable>
              ) : null}

              {menuItems.length > 0 ? (
                <View style={styles.probeBlock}>
                  <Text style={styles.probeTitle}>Plugin menu (dev-session)</Text>
                  {menuItems.map((item) => (
                    <Pressable
                      key={item.id}
                      style={({ pressed }) => [
                        styles.menuRow,
                        pressed && styles.menuRowPressed,
                      ]}
                      onPress={() => onMenuItem(item)}
                    >
                      <Text style={styles.menuLabel}>{item.label}</Text>
                      <Text style={styles.menuMeta}>
                        {item.pluginId} · {item.action}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </ScrollView>
            <Pressable style={styles.closeBtn} onPress={() => setPanel(false)}>
              <Text style={styles.closeText}>关闭</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  fab: {
    position: "absolute",
    right: 16,
    bottom: 88,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#C15F3C",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#1F1E1C",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
    zIndex: 9999,
  },
  fabPressed: { opacity: 0.88, transform: [{ scale: 0.96 }] },
  fabText: { color: "#fff", fontSize: 11, fontWeight: "700", letterSpacing: 0.5 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  modalCard: {
    maxHeight: "78%",
    backgroundColor: "#FAF9F5",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 16,
  },
  modalTitle: { fontSize: 18, fontWeight: "700", color: "#1F1E1C" },
  modalHint: { fontSize: 12, color: "#6B6962", marginTop: 4, marginBottom: 12 },
  modalScroll: { marginBottom: 12 },
  probeBlock: {
    marginBottom: 14,
    padding: 12,
    borderRadius: 10,
    backgroundColor: "#fff",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E8E6DF",
  },
  probeTitle: { fontSize: 15, fontWeight: "600", marginBottom: 6, color: "#1F1E1C" },
  mono: { fontFamily: "Menlo", fontSize: 11, color: "#1F1E1C", lineHeight: 16 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: "#F0EEE7",
  },
  chipActive: { backgroundColor: "#C15F3C" },
  chipText: { fontSize: 13, fontWeight: "600", color: "#1F1E1C" },
  chipTextActive: { color: "#fff" },
  fieldLabel: { marginTop: 10, fontSize: 12, color: "#6B6962", marginBottom: 4 },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#D6D3C9",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    color: "#1F1E1C",
    backgroundColor: "#FAF9F5",
  },
  rowActions: { flexDirection: "row", gap: 8, marginTop: 8 },
  secondaryBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: "#F0EEE7",
    alignItems: "center",
  },
  secondaryBtnText: { fontSize: 13, fontWeight: "600", color: "#C15F3C" },
  resetAllBtn: {
    marginBottom: 14,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#C15F3C",
    alignItems: "center",
  },
  resetAllText: { color: "#C15F3C", fontWeight: "700" },
  menuRow: {
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E8E6DF",
  },
  menuRowPressed: { opacity: 0.7 },
  menuLabel: { fontSize: 14, fontWeight: "600", color: "#C15F3C" },
  menuMeta: { fontSize: 11, color: "#6B6962", marginTop: 2 },
  closeBtn: {
    alignSelf: "stretch",
    backgroundColor: "#C15F3C",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  closeText: { color: "#fff", fontWeight: "700" },
});
