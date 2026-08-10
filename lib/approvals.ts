/**
 * Human-in-the-loop approvals, carried on the kanban board.
 *
 * The agent never sends anything consequential on its own. It writes the
 * action it wants to take onto a card and stops. A human moving that card
 * into the approval list is the authorisation, and a deterministic route
 * executes it. The model is not in the trust path: it cannot approve its own
 * request, because approval is a board state it has no capability to set.
 *
 * The payload is a fenced block inside the card description, so the person
 * dragging the card can read exactly what they are authorising.
 */

import { z } from "zod";

export const ApprovalActionSchema = z.object({
  action: z.literal("send-email"),
  to: z.string().email(),
  subject: z.string().min(1),
  body: z.string().min(1),
});

export type ApprovalAction = z.infer<typeof ApprovalActionSchema>;

const FENCE = "routecraft-action";

/**
 * Named in the card text so the approver knows where to drag it. Kept as a
 * plain string rather than reading env here: this module is pure so it can be
 * tested without configuration.
 */
const APPROVAL_LIST_HINT = "Approved";

/**
 * Render a card description a human can read and this module can parse back.
 *
 * The action appears exactly once, inside the fenced block. An earlier draft
 * of this also printed a friendly summary of the recipient, subject, and body
 * above the block, which was actively dangerous: a human editing that prose
 * would change what they read but not what got sent. One copy, one source of
 * truth, and what you edit is what leaves.
 */
export function renderApprovalCard(
  action: ApprovalAction,
  reason: string,
): string {
  return [
    "Aria wants to send an email and needs approval first.",
    "",
    `**Why:** ${reason}`,
    "",
    "Everything that will be sent is in the block below, and nowhere else.",
    "Edit it if you want to change anything, then move this card to the",
    `"${APPROVAL_LIST_HINT}" list to send it exactly as it stands.`,
    "",
    "```" + FENCE,
    JSON.stringify(action, null, 2),
    "```",
  ].join("\n");
}

/**
 * Pull the action back out of a card description.
 *
 * Returns null for anything that is not a well-formed approval card, so an
 * ordinary card moved into the approval list is simply not an action.
 */
export function parseApprovalAction(
  description: string | null | undefined,
): ApprovalAction | null {
  if (!description) return null;
  const fenced = new RegExp("```" + FENCE + "\\s*([\\s\\S]*?)```").exec(
    description,
  );
  if (!fenced?.[1]) return null;
  try {
    const parsed = ApprovalActionSchema.safeParse(JSON.parse(fenced[1]));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
