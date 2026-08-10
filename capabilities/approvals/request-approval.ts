import { craft, direct } from "@routecraft/routecraft";
import { z } from "zod";
import {
  ApprovalActionSchema,
  renderApprovalCard,
} from "../../lib/approvals.js";
import { requires } from "../../lib/identity.js";
import { SCOPES } from "../../lib/scopes.js";

const InputSchema = z.object({
  reason: z
    .string()
    .min(1)
    .describe(
      "Why this needs sending, in one line. The human reads this before approving.",
    ),
  action: ApprovalActionSchema.describe(
    "The email to send once a human approves it.",
  ),
});

const ResultSchema = z.object({
  ticketId: z.string(),
  url: z.string(),
  status: z.literal("awaiting-approval"),
});

/**
 * Park an outbound email behind a human decision.
 *
 * Nothing is sent here. The draft becomes a card, and the approval route
 * sends it only when a person moves that card into the approval list.
 */
export default craft()
  .id("request-approval")
  .description(
    "Request human approval to send an email. Use this instead of send-email whenever the message goes to a real person, is a first contact, makes a commitment, or you are at all unsure. The draft is parked on the board until a human approves it.",
  )
  .input({ body: InputSchema })
  .output({ body: ResultSchema })
  .authorize(requires(SCOPES.MAIL_DRAFT))
  .from(direct())
  .transform((body) => ({
    title: `Approve email: ${body.action.subject}`,
    body: renderApprovalCard(body.action, body.reason),
    labels: ["approval"],
  }))
  // Composed with create-ticket: this route owns only what an approval card
  // says, not how a card gets onto the board.
  .to(direct<unknown, { id: string; url: string }>("create-ticket"))
  .transform((ticket) => ({
    ticketId: ticket.id,
    url: ticket.url,
    status: "awaiting-approval" as const,
  }));
