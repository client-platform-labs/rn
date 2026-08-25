import { Image, StyleSheet, Text, View } from "react-native";

import { colors, radius, spacing, typography } from "../theme";
import type { TicketAttachment } from "../../data/types";

type Props = {
  attachment: TicketAttachment;
};

export function AttachmentThumb({ attachment }: Props) {
  const isVideo = attachment.mimeType.startsWith("video/");
  return (
    <View style={styles.wrap}>
      {isVideo ? (
        <View style={[styles.thumb, styles.videoThumb]}>
          <Text style={styles.playIcon}>▶</Text>
        </View>
      ) : (
        <Image source={{ uri: attachment.uri }} style={styles.thumb} />
      )}
      <Text style={styles.meta} numberOfLines={1}>
        {isVideo ? "视频" : "图片"} · {attachment.uploadedAt.slice(0, 10)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: spacing.sm },
  thumb: {
    width: "100%",
    height: 160,
    borderRadius: radius.sm,
    backgroundColor: colors.border,
  },
  videoThumb: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.ink,
  },
  playIcon: { color: "#fff", fontSize: 28 },
  meta: { ...typography.caption, color: colors.inkMuted, marginTop: spacing.xs },
});
