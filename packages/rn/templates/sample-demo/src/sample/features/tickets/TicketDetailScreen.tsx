import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useMemo } from "react";
import { Alert, StyleSheet, View } from "react-native";

import type { TicketsStackParamList } from "../../app/navigation";
import { openTel } from "../../capabilities";
import { getTicket } from "../../data/ticketStore";
import {
  AttachmentThumb,
  Button,
  EmptyState,
  Screen,
  Typography,
  Badge,
  colors,
  spacing,
} from "../../ui";

type Props = NativeStackScreenProps<TicketsStackParamList, "TicketDetail">;

export function TicketDetailScreen({ route, navigation }: Props) {
  const ticket = useMemo(() => getTicket(route.params.id), [route.params.id]);

  if (!ticket) {
    return (
      <Screen>
        <EmptyState title="工单不存在" message={`未找到 #${route.params.id}`} />
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={styles.header}>
        <Typography variant="display">{ticket.title}</Typography>
        <View style={styles.badges}>
          <Badge kind="status" value={ticket.status} />
          <Badge kind="priority" value={ticket.priority} />
        </View>
        <Typography variant="caption">#{ticket.id}</Typography>
      </View>

      <Typography variant="label" style={styles.sectionLabel}>
        描述
      </Typography>
      <Typography variant="body" style={styles.body}>
        {ticket.description || "（无描述）"}
      </Typography>

      <Typography variant="label" style={styles.sectionLabel}>
        联系电话
      </Typography>
      <Typography variant="body">{ticket.contactPhone}</Typography>
      <Button
        label="拨打电话"
        variant="secondary"
        onPress={async () => {
          const r = await openTel(ticket.contactPhone);
          Alert.alert(r.ok ? "已调起" : "失败", r.message);
        }}
        style={styles.actionBtn}
      />

      <Typography variant="label" style={styles.sectionLabel}>
        附件 ({ticket.attachments.length})
      </Typography>
      {ticket.attachments.length === 0 ? (
        <Typography variant="muted">暂无附件 — 在编辑页可拍照或从相册选择</Typography>
      ) : (
        ticket.attachments.map((a) => <AttachmentThumb key={a.id} attachment={a} />)
      )}

      <Button
        label="编辑工单"
        onPress={() =>
          navigation.navigate("TicketForm", { mode: "edit", id: ticket.id })
        }
        style={styles.editBtn}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { marginBottom: spacing.lg },
  badges: { flexDirection: "row", gap: spacing.sm, marginVertical: spacing.sm },
  sectionLabel: {
    color: colors.inkMuted,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    fontSize: 12,
    fontWeight: "600",
  },
  body: { marginBottom: spacing.sm },
  actionBtn: { marginTop: spacing.sm },
  editBtn: { marginTop: spacing.xl },
});
