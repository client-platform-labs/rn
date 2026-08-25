import type { ReactNode } from "react";
import { DevMenu, Pressable, StyleSheet, Text, View } from "react-native";

type Props = {
  children: ReactNode;
};

/**
 * Debug-only dev affordance — opens RN Dev Menu (reload, debugger, etc.).
 * Installed by `rn dev-support add`; removed by `rn dev-support remove`.
 */
export function DevSupportRoot({ children }: Props) {
  if (!__DEV__) {
    return <>{children}</>;
  }
  return (
    <View style={styles.root}>
      {children}
      <Pressable
        style={({ pressed }) => [styles.fab, pressed && styles.fabPressed]}
        onPress={() => DevMenu.show()}
        accessibilityLabel="Open developer menu"
        accessibilityRole="button"
      >
        <Text style={styles.fabText}>DEV</Text>
      </Pressable>
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
});
