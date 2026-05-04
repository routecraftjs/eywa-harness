import { z } from "zod";

export const TicketStatusEnum = z.enum([
  "backlog",
  "in progress",
  "blocked",
  "done",
]);
export type TicketStatus = z.infer<typeof TicketStatusEnum>;

export const TicketSchema = z.object({
  id: z.string(),
  title: z.string(),
  body: z.string(),
  status: z.string(),
  url: z.string(),
  createdAt: z.string(),
});
export type Ticket = z.infer<typeof TicketSchema>;
