export type CapabilityProbe = "SUPPORTED" | "ADAPTER_REQUIRED" | "UNSUPPORTED";

export interface CapabilityProbeResult {
  status: CapabilityProbe;
  message: string;
}

export type TicketPriority = "low" | "medium" | "high";
export type TicketStatus = "open" | "in_progress" | "done";

export interface TicketAttachment {
  id: string;
  uri: string;
  mimeType: string;
  uploadedAt: string;
}

export interface WorkOrder {
  id: string;
  title: string;
  description: string;
  priority: TicketPriority;
  status: TicketStatus;
  contactPhone: string;
  attachments: TicketAttachment[];
  createdAt: string;
  updatedAt: string;
}

export type TicketFormInput = Omit<
  WorkOrder,
  "id" | "attachments" | "createdAt" | "updatedAt"
> & { attachments?: TicketAttachment[] };
