import { agent } from "@routecraft/ai";
import { craft, http } from "@routecraft/routecraft";
import { env } from "../env.js";
import { verifySignature } from "../lib/webhook-signature.js";

/**
 * Inbound ticket event from the Planka mock board.
 *
 * Planka POSTs to `/webhooks/planka` whenever a card is created or updated,
 * signed with `PLANKA_WEBHOOK_SECRET` via HMAC-SHA256 (hex). The route
 * verifies the signature, normalises the payload, and hands the change to
 * Aria for follow-up.
 */
interface PlankaWebhookPayload {
  event: string;
  data?: {
    item?: {
      id?: string;
      name?: string;
      description?: string | null;
    };
  };
}

export default craft()
  .id("process-ticket-event")
  .from(
    http({
      host: env.APP_HOST,
      port: env.APP_PORT,
      path: "/webhooks/planka",
      method: "POST",
    }),
  )
  .filter((ex) => {
    const raw = ex.headers["x-routecraft-http-raw-body"] as string | undefined;
    const signature = ex.headers["x-webhook-signature"] as string | undefined;
    if (!raw || !signature) return false;
    return verifySignature({
      body: raw,
      signature,
      secret: env.PLANKA_WEBHOOK_SECRET,
      scheme: "hmac-sha256-hex",
    });
  })
  .transform((body: PlankaWebhookPayload) => ({
    channel: "ticket" as const,
    event: body.event,
    ticketId: body.data?.item?.id,
    title: body.data?.item?.name,
    description: body.data?.item?.description ?? "",
  }))
  .to(agent("aria"));
