/* @refresh reset — seed edits must remount screens that cache list state */
import type { TicketFormInput, WorkOrder } from "./types";

const seed: WorkOrder[] = [
  {
    id: "1",
    title: "空调不制冷",
    description: "客厅空调开启后只有风，没有冷气。",
    priority: "high",
    status: "open",
    contactPhone: "13800138000",
    attachments: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "2",
    title: "门锁电池低",
    description: "智能门锁提示电量不足，需要更换电池。",
    priority: "medium",
    status: "in_progress",
    contactPhone: "13900139000",
    attachments: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

let tickets: WorkOrder[] = [...seed];
/** Stable snapshot for useSyncExternalStore — must not allocate on every getSnapshot. */
let snapshot: WorkOrder[] = sortedCopy(tickets);
const listeners = new Set<() => void>();

function sortedCopy(list: WorkOrder[]): WorkOrder[] {
  return [...list].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function emit(): void {
  snapshot = sortedCopy(tickets);
  for (const listener of listeners) {
    listener();
  }
}

/** For `useSyncExternalStore` — Fast Refresh / mutations both refresh UI. */
export function subscribeTickets(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Stable reference until store mutates (required by useSyncExternalStore). */
export function getTicketsSnapshot(): WorkOrder[] {
  return snapshot;
}

function nextId(): string {
  const max = tickets.reduce((n, t) => Math.max(n, Number(t.id) || 0), 0);
  return String(max + 1);
}

export function listTickets(): WorkOrder[] {
  return getTicketsSnapshot();
}

export function getTicket(id: string): WorkOrder | undefined {
  return tickets.find((t) => t.id === id);
}

export function createTicket(input: TicketFormInput): WorkOrder {
  const now = new Date().toISOString();
  const ticket: WorkOrder = {
    id: nextId(),
    attachments: input.attachments ?? [],
    createdAt: now,
    updatedAt: now,
    ...input,
  };
  tickets = [ticket, ...tickets];
  emit();
  return ticket;
}

export function updateTicket(
  id: string,
  input: TicketFormInput,
): WorkOrder | undefined {
  const idx = tickets.findIndex((t) => t.id === id);
  if (idx < 0) {
    return undefined;
  }
  const updated: WorkOrder = {
    ...tickets[idx],
    ...input,
    attachments: input.attachments ?? tickets[idx].attachments,
    updatedAt: new Date().toISOString(),
  };
  tickets = tickets.map((t) => (t.id === id ? updated : t));
  emit();
  return updated;
}

export function addAttachment(
  ticketId: string,
  attachment: WorkOrder["attachments"][number],
): WorkOrder | undefined {
  const ticket = getTicket(ticketId);
  if (!ticket) {
    return undefined;
  }
  return updateTicket(ticketId, {
    title: ticket.title,
    description: ticket.description,
    priority: ticket.priority,
    status: ticket.status,
    contactPhone: ticket.contactPhone,
    attachments: [...ticket.attachments, attachment],
  });
}

export function resetTicketsForDev(): void {
  tickets = [...seed];
  emit();
}

/** Pull-to-refresh / manual UI sync without mutating data. */
export function notifyTicketsChanged(): void {
  emit();
}
