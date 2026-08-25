import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useCallback, useState } from "react";
import { FlatList, StyleSheet, View } from "react-native";

import type { TicketsStackParamList } from "../../app/navigation";
import { listTickets } from "../../data/ticketStore";
import type { WorkOrder } from "../../data/types";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Screen,
  Typography,
  colors,
  spacing,
} from "../../ui";

type Props = NativeStackScreenProps<TicketsStackParamList, "TicketList">;

export function TicketListScreen({ navigation }: Props) {
  const [items, setItems] = useState(() => listTickets());

  const refresh = useCallback(() => {
    setItems(listTickets());
  }, []);

  return (
    <Screen scroll={false} padded={false}>
      <View style={styles.header}>
        <Typography variant="display">工单</Typography>
        <Typography variant="muted" style={styles.subtitle}>
          报修单示例 · 内存数据
        </Typography>
        <Button
          label="新建工单"
          onPress={() => navigation.navigate("TicketForm", { mode: "create" })}
          style={styles.createBtn}
        />
      </View>
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        onRefresh={refresh}
        refreshing={false}
        ListEmptyComponent={
          <EmptyState title="暂无工单" message="点击上方按钮创建第一条报修单" />
        }
        renderItem={({ item }) => (
          <TicketRow
            item={item}
            onPress={() => navigation.navigate("TicketDetail", { id: item.id })}
          />
        )}
      />
    </Screen>
  );
}

function TicketRow({ item, onPress }: { item: WorkOrder; onPress: () => void }) {
  return (
    <Card onPress={onPress} style={styles.card}>
      <View style={styles.rowTop}>
        <Typography variant="headline" style={styles.cardTitle}>
          {item.title}
        </Typography>
        <Badge kind="status" value={item.status} />
      </View>
      <Typography variant="caption" style={styles.cardMeta}>
        #{item.id} · {item.contactPhone}
      </Typography>
      <View style={styles.rowBottom}>
        <Badge kind="priority" value={item.priority} />
        {item.attachments.length > 0 ? (
          <Typography variant="caption">{item.attachments.length} 个附件</Typography>
        ) : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    backgroundColor: colors.paper,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  subtitle: { marginTop: spacing.xs },
  createBtn: { marginTop: spacing.md },
  list: { padding: spacing.md, paddingBottom: spacing.xxl },
  card: { marginHorizontal: 0 },
  rowTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  cardTitle: { flex: 1 },
  cardMeta: { marginTop: spacing.xs },
  rowBottom: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
});
