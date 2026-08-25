import type { ReactNode } from "react";
import { StyleSheet, Text, type TextStyle } from "react-native";

import { colors, typography } from "../theme";

type Variant = "display" | "title" | "headline" | "body" | "caption" | "muted";

type Props = {
  variant?: Variant;
  children: ReactNode;
  style?: TextStyle;
};

export function Typography({ variant = "body", children, style }: Props) {
  return <Text style={[styles[variant], style]}>{children}</Text>;
}

const styles = StyleSheet.create({
  display: { ...typography.display, color: colors.ink },
  title: { ...typography.title, color: colors.ink },
  headline: { ...typography.headline, color: colors.ink },
  body: { ...typography.body, color: colors.ink },
  caption: { ...typography.caption, color: colors.inkMuted },
  muted: { ...typography.body, color: colors.inkMuted },
});
