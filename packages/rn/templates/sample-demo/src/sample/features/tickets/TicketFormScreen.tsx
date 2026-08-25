import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useMemo, useState } from "react";
import { Alert, StyleSheet, View } from "react-native";

import type { TicketsStackParamList } from "../../app/navigation";
import {
  mockUpload,
  pickPhotoFromLibrary,
  pickVideoFromLibrary,
  recordVideo,
  takePhoto,
} from "../../capabilities";
import {
  addAttachment,
  createTicket,
  getTicket,
  updateTicket,
} from "../../data/ticketStore";
import type { TicketFormInput } from "../../data/types";
import {
  AttachmentThumb,
  Button,
  Input,
  Screen,
  Typography,
  colors,
  spacing,
} from "../../ui";

type Props = NativeStackScreenProps<TicketsStackParamList, "TicketForm">;

export function TicketFormScreen({ route, navigation }: Props) {
  const editing = route.params.mode === "edit";
  const existing = useMemo(
    () => (editing && route.params.id ? getTicket(route.params.id) : undefined),
    [editing, route.params.id],
  );

  const [title, setTitle] = useState(existing?.title ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [contactPhone, setContactPhone] = useState(existing?.contactPhone ?? "");
  const [priority, setPriority] = useState(existing?.priority ?? "medium");
  const [status, setStatus] = useState(existing?.status ?? "open");
  const [uploading, setUploading] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);

  const save = () => {
    if (!title.trim()) {
      Alert.alert("校验失败", "请填写标题");
      return;
    }
    const input: TicketFormInput = {
      title: title.trim(),
      description: description.trim(),
      contactPhone: contactPhone.trim(),
      priority,
      status,
      attachments: existing?.attachments,
    };
    if (editing && route.params.id) {
      updateTicket(route.params.id, input);
    } else {
      createTicket(input);
    }
    navigation.navigate("TicketList");
  };

  const attachMedia = async (
    kind: "library-photo" | "camera-photo" | "library-video" | "camera-video",
  ) => {
    if (!editing || !route.params.id) {
      Alert.alert("提示", "请先保存工单，再添加附件");
      return;
    }
    let picked;
    switch (kind) {
      case "library-photo":
        picked = await pickPhotoFromLibrary();
        break;
      case "camera-photo":
        picked = await takePhoto();
        break;
      case "library-video":
        picked = await pickVideoFromLibrary();
        break;
      case "camera-video":
        picked = await recordVideo();
        break;
    }
    if (!picked) {
      return;
    }
    setUploading(true);
    setUploadPct(0);
    try {
      const uploaded = await mockUpload(picked.uri, setUploadPct);
      addAttachment(route.params.id, {
        id: `${Date.now()}`,
        uri: uploaded.remoteUri,
        mimeType: picked.mimeType,
        uploadedAt: new Date().toISOString(),
      });
      Alert.alert("上传完成", "附件已写入工单（模拟上传）");
    } catch (e) {
      Alert.alert("失败", e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
      setUploadPct(0);
    }
  };

  const ticket =
    editing && route.params.id ? getTicket(route.params.id) : undefined;

  return (
    <Screen>
      <Typography variant="display">{editing ? "编辑工单" : "新建工单"}</Typography>
      <Typography variant="muted" style={styles.lead}>
        填写报修信息；附件需先保存工单
      </Typography>

      <Input label="标题" value={title} onChangeText={setTitle} placeholder="简要描述问题" />
      <Input
        label="描述"
        value={description}
        onChangeText={setDescription}
        placeholder="详细说明"
        multiline
        style={styles.multiline}
      />
      <Input
        label="联系电话"
        value={contactPhone}
        onChangeText={setContactPhone}
        keyboardType="phone-pad"
        placeholder="13800138000"
      />
      <Input
        label="优先级"
        value={priority}
        onChangeText={(v) => setPriority(v as typeof priority)}
        hint="low / medium / high"
      />
      <Input
        label="状态"
        value={status}
        onChangeText={(v) => setStatus(v as typeof status)}
        hint="open / in_progress / done"
      />

      {editing && ticket ? (
        <View style={styles.attachSection}>
          <Typography variant="headline" style={styles.attachTitle}>
            附件
          </Typography>
          {ticket.attachments.map((a) => (
            <AttachmentThumb key={a.id} attachment={a} />
          ))}
          <View style={styles.attachGrid}>
            <Button
              label="相册选图"
              variant="secondary"
              disabled={uploading}
              onPress={() => attachMedia("library-photo")}
              style={styles.gridBtn}
            />
            <Button
              label="拍照"
              variant="secondary"
              disabled={uploading}
              onPress={() => attachMedia("camera-photo")}
              style={styles.gridBtn}
            />
            <Button
              label="相册选视频"
              variant="secondary"
              disabled={uploading}
              onPress={() => attachMedia("library-video")}
              style={styles.gridBtn}
            />
            <Button
              label="录视频"
              variant="secondary"
              disabled={uploading}
              onPress={() => attachMedia("camera-video")}
              style={styles.gridBtn}
            />
          </View>
          {uploading ? (
            <Typography variant="caption">上传中… {uploadPct}%</Typography>
          ) : null}
        </View>
      ) : null}

      <Button label="保存" onPress={save} style={styles.saveBtn} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  lead: { marginTop: spacing.xs, marginBottom: spacing.md },
  multiline: { minHeight: 100, textAlignVertical: "top" },
  attachSection: {
    marginTop: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  attachTitle: { marginBottom: spacing.sm },
  attachGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.sm },
  gridBtn: { flexBasis: "47%", flexGrow: 1 },
  saveBtn: { marginTop: spacing.xl },
});
