export type TicketsStackParamList = {
  TicketList: undefined;
  TicketDetail: { id: string };
  TicketForm: { mode: "create" } | { mode: "edit"; id: string };
};

export type CapabilitiesStackParamList = {
  CapabilitiesHome: undefined;
  WebViewDemo: undefined;
};

export type RootTabParamList = {
  TicketsTab: undefined;
  CapabilitiesTab: undefined;
  AboutTab: undefined;
};

export type RootLinking = {
  navigateToTicket: (id: string) => void;
};
