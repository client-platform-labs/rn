import { StyleSheet, Text, View } from "react-native";

import { colors, radius, spacing, typography } from "../theme";
import type { TicketPriority, TicketStatus } from "../../data/types";

const statusMap: Record<TicketStatus, { label: string; bg: string; fg: string }> = {
  open: { label: "待处理", bg: colors.accentSoft, fg: colors.accent },
  in_progress: { label: "处理中", bg: "#FEF3C7", fg: colors.warning },
  done: { label: "已完成", bg: colors.successSoft, fg: colors.success },
};

const priorityMap: Record<TicketPriority, string> = {
  low: "低",
  medium: "中",
  high: "高",
};

type Props =
  | { kind: "status"; value: TicketStatus }
  | { kind: "priority"; value: TicketPriority };

export function Badge(props: Props) {
  if (props.kind === "status") {
    const s = statusMap[props.value];
    return (
      <View style={[styles.badge, { backgroundColor: s.bg }]}>
        <Text style={[styles.text, { color: s.fg }]}>{s.label}</Text>
      </View>
    );
  }
  return (
    <View style={[styles.badge, styles.priority]}>
      <Text style={[styles.text, styles.priorityText]}>优先级 {priorityMap[props.value]}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: "flex-start",
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
  },
  priority: { backgroundColor: colors.border },
  text: { ...typography.caption, fontWeight: "600" },
  priorityText: { color: colors.inkMuted },
});
