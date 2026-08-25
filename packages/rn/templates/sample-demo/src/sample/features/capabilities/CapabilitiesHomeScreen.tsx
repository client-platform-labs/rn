import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useState } from "react";
import { Alert, StyleSheet, View } from "react-native";

import type { CapabilitiesStackParamList } from "../../app/navigation";
import {
  openHttps,
  openTel,
  probeCamera,
  probeDeepLink,
  probeMediaLibrary,
} from "../../capabilities";
import {
  openExternalTicketLink,
  ticketDeepLink,
} from "../../linking/sampleScheme";
import {
  Button,
  Card,
  Input,
  Screen,
  Typography,
  colors,
  spacing,
} from "../../ui";

type Props = NativeStackScreenProps<CapabilitiesStackParamList, "CapabilitiesHome">;

export function CapabilitiesHomeScreen({ navigation }: Props) {
  const [phone, setPhone] = useState("13800138000");
  const [probeText, setProbeText] = useState("");

  const runProbes = async () => {
    const results = await Promise.all([
      probeCamera(),
      probeMediaLibrary(),
      probeDeepLink(),
    ]);
    setProbeText(results.map((r) => `${r.status}: ${r.message}`).join("\n\n"));
  };

  return (
    <Screen>
      <Typography variant="display">端能力</Typography>
      <Typography variant="muted" style={styles.lead}>
        演示电话、H5、Deep Link；相机/相册在工单附件中体验
      </Typography>

      <Card>
        <Typography variant="headline">能力探测</Typography>
        <Typography variant="caption" style={styles.cardHint}>
          SUPPORTED / ADAPTER_REQUIRED / UNSUPPORTED
        </Typography>
        <Button label="运行探测" variant="secondary" onPress={runProbes} style={styles.cardBtn} />
        {probeText ? (
          <Typography variant="caption" style={styles.probe}>
            {probeText}
          </Typography>
        ) : null}
      </Card>

      <Card>
        <Typography variant="headline">电话</Typography>
        <Input label="号码" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
        <Button
          label="拨打电话 (tel:)"
          onPress={async () => {
            const r = await openTel(phone);
            Alert.alert(r.ok ? "成功" : "失败", r.message);
          }}
        />
      </Card>

      <Card>
        <Typography variant="headline">H5</Typography>
        <Button
          label="内嵌 WebView"
          variant="secondary"
          onPress={() => navigation.navigate("WebViewDemo")}
          style={styles.cardBtn}
        />
        <Button
          label="外开系统浏览器"
          variant="secondary"
          onPress={async () => {
            const r = await openHttps("https://reactnative.dev");
            Alert.alert(r.ok ? "成功" : "失败", r.message);
          }}
        />
      </Card>

      <Card>
        <Typography variant="headline">跨 App Scheme</Typography>
        <Button
          label={ticketDeepLink("1")}
          variant="secondary"
          onPress={async () => {
            const r = await openExternalTicketLink("1");
            Alert.alert("跨 App scheme", r.message);
          }}
        />
        <Typography variant="caption" style={styles.footnote}>
          cpl-sample:// 为样板命名空间，非平台正式合同
        </Typography>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  lead: { marginTop: spacing.xs, marginBottom: spacing.lg },
  cardHint: { marginTop: spacing.xs },
  cardBtn: { marginTop: spacing.sm },
  probe: {
    marginTop: spacing.md,
    padding: spacing.sm,
    backgroundColor: colors.paper,
    borderRadius: 8,
    lineHeight: 18,
  },
  footnote: { marginTop: spacing.sm, lineHeight: 18 },
});
