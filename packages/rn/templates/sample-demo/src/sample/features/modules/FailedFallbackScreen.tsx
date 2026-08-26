import { ScrollView, StyleSheet, Text, View } from "react-native";

import { colors, typography } from "../../ui";

export type FailedFallbackSkipped = {
  slot: string;
  reason: string;
  detail: string;
};

type Props = {
  /** When mode is failed — A5 presentFallbackUi output. */
  detail: string;
  businessModule?: string;
  skipped?: readonly FailedFallbackSkipped[];
};

/**
 * Sample Failed / degradation surface for A5 (#8).
 * Hosts bind `presentFallbackUi` when selectFallbackSlot returns FAILED.
 * Brownfield may replace this with a native Activity using the same fields.
 */
export function FailedFallbackScreen({
  detail,
  businessModule,
  skipped = [],
}: Props) {
  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Module unavailable</Text>
      {businessModule ? (
        <Text style={styles.sub}>module={businessModule}</Text>
      ) : null}
      <Text style={styles.detail}>{detail}</Text>
      {skipped.length > 0 ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Skipped slots</Text>
          {skipped.map((s) => (
            <Text key={`${s.slot}-${s.reason}`} style={styles.mono}>
              {s.slot}: {s.reason} — {s.detail}
            </Text>
          ))}
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.paper },
  content: { padding: 20, gap: 12 },
  title: { ...typography.title, color: colors.danger },
  sub: { ...typography.caption, color: colors.inkMuted },
  detail: { ...typography.body, color: colors.ink },
  card: {
    marginTop: 8,
    padding: 12,
    borderRadius: 8,
    backgroundColor: colors.paperElevated,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    gap: 6,
  },
  cardTitle: { ...typography.caption, color: colors.inkMuted },
  mono: {
    fontFamily: "Menlo",
    fontSize: 12,
    color: colors.ink,
  },
});