import { agent } from "@routecraft/ai";
import { craft, cron } from "@routecraft/routecraft";
import { scheduled } from "../lib/identity.js";

/**
 * Daily wake-up for Aria.
 *
 * Presence is composition, not a feature toggle: a heartbeat is just a cron
 * route whose destination happens to be the agent. Nothing here tells her
 * what to do beyond a standing instruction, so what actually happens is her
 * decision, made against the live board and knowledge base.
 *
 * Deliberately conservative in two ways. She is told to look and to leave a
 * comment, never to act on anyone's behalf without being asked; and the
 * authority she runs on is minted here, on a cron source, which is the only
 * place standing authority may come from. Authority an inbound message can
 * trigger is not standing authority, it is an open door.
 */
export default craft()
  .id("heartbeat")
  .from(cron("0 9 * * MON-FRI"))
  // eslint-disable-next-line @routecraft/routecraft/restrict-principal-minting -- an internal cron trigger, the only sanctioned source of standing authority. Nothing inbound can reach this line
  .authenticate(() => scheduled("heartbeat"))
  .transform(() => ({
    channel: "heartbeat" as const,
    text: [
      "This is your daily check-in. Nobody is waiting on a reply.",
      "",
      "Look over the board and decide whether anything needs a nudge:",
      "- Cards sitting in the same list for a long time.",
      "- Cards whose description asks a question nobody answered.",
      "- Anything you promised to follow up on, per the knowledge base.",
      "",
      "If something needs attention, comment on that card saying what you",
      "noticed and what you suggest. If nothing does, do nothing at all and",
      "simply say so. Do not send email and do not change card status.",
    ].join("\n"),
  }))
  .to(agent("aria"));
