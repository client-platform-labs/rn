import { StyleSheet, Text, View } from "react-native";

import { colors, spacing, typography } from "../theme";

type Props = {
  title: string;
  message?: string;
};

export function EmptyState({ title, message }: Props) {
  return (
    <View style={styles.root}>
      <View style={styles.icon}>
        <Text style={styles.iconText}>◇</Text>
      </View>
      <Text style={styles.title}>{title}</Text>
      {message ? <Text style={styles.message}>{message}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { alignItems: "center", paddingVertical: spacing.xxl },
  icon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.accentSoft,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.md,
  },
  iconText: { fontSize: 24, color: colors.accent },
  title: { ...typography.title, color: colors.ink, textAlign: "center" },
  message: {
    ...typography.body,
    color: colors.inkMuted,
    textAlign: "center",
    marginTop: spacing.sm,
    maxWidth: 280,
  },
});
