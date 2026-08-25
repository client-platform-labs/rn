const SCHEME = "cpl-sample";

export function ticketDeepLink(id: string): string {
  return `${SCHEME}://ticket/${id}`;
}

export function parseTicketDeepLink(
  url: string | null | undefined,
): string | undefined {
  if (!url) {
    return undefined;
  }
  const match = url.match(new RegExp(`^${SCHEME}://ticket/([^/?#]+)`));
  return match?.[1];
}

export async function openExternalTicketLink(
  id: string,
): Promise<{ opened: boolean; message: string }> {
  const { Linking } = await import("react-native");
  const url = ticketDeepLink(id);
  const can = await Linking.canOpenURL(url);
  if (can) {
    await Linking.openURL(url);
    return { opened: true, message: `已尝试外跳：${url}` };
  }
  return {
    opened: false,
    message: `无外部 handler，将应用内打开工单 #${id}`,
  };
}
