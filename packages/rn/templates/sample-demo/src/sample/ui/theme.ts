/** Claude-inspired design tokens for the sample demo. */
export const colors = {
  paper: "#FAF9F5",
  paperElevated: "#FFFFFF",
  ink: "#1F1E1C",
  inkMuted: "#6B6962",
  inkSubtle: "#9C9890",
  border: "#E8E6DF",
  borderStrong: "#D4D1C8",
  accent: "#C15F3C",
  accentPressed: "#A84E30",
  accentSoft: "#F5E8E3",
  success: "#2D6A4F",
  successSoft: "#E8F3ED",
  warning: "#B45309",
  danger: "#B42318",
  tabBar: "#FFFFFF",
  shadow: "rgba(31, 30, 28, 0.08)",
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  pill: 999,
} as const;

export const typography = {
  display: { fontSize: 28, fontWeight: "600" as const, lineHeight: 34, letterSpacing: -0.5 },
  title: { fontSize: 20, fontWeight: "600" as const, lineHeight: 26 },
  headline: { fontSize: 17, fontWeight: "600" as const, lineHeight: 22 },
  body: { fontSize: 15, fontWeight: "400" as const, lineHeight: 22 },
  caption: { fontSize: 13, fontWeight: "400" as const, lineHeight: 18 },
  label: { fontSize: 12, fontWeight: "600" as const, lineHeight: 16, letterSpacing: 0.4 },
} as const;
