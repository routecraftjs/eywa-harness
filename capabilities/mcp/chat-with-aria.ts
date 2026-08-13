import { agent, mcp } from "@routecraft/ai";
import { craft } from "@routecraft/routecraft";
import { z } from "zod";
import {
  ANONYMOUS_FALLBACK,
  ARIA,
  authEnforced,
  ceilingFor,
} from "../../lib/identity.js";

const InputSchema = z.object({
  text: z
    .string()
    .min(1)
    .describe(
      "Your message to Aria. She can answer questions, file tickets, and update the knowledge base.",
    ),
});

/**
 * Chat surface exposed via MCP.
 *
 * Connect Claude Desktop, Cursor, or any MCP client to the showcase on
 * `http://localhost:3001/mcp` and invoke this tool to talk to Aria. The
 * input flows through the same agent that handles email and ticket events.
 *
 * This is the one channel that carries a real person's authority. The MCP
 * server verifies the bearer token against Dex's JWKS before the route runs,
 * so by the time `.delegate()` executes the caller is known, and Aria acts
 * as their delegate rather than as herself. What she can then do differs per
 * caller: `demo@showcase.local` has no `mail:send`, so asking her to send an
 * email gets a draft on the board, while `admin@showcase.local` gets a send.
 * Neither outcome is the model's choice.
 */
export default craft()
  .id("chat-with-aria")
  .description(
    "Chat with Aria, the demo Craft Showcase assistant. She can read the knowledge base, file tickets, and update the board.",
  )
  .input({ body: InputSchema })
  .from(mcp({ annotations: { readOnlyHint: false, destructiveHint: false } }))
  // Without a verified token there is nobody to act for, so the fallback is
  // an identity the showcase owns and has kept weak, not the caller's word.
  // eslint-disable-next-line @routecraft/routecraft/restrict-principal-minting -- the sanctioned MCP channel boundary. Mints only the weak demo identity, and only when AUTH_DISABLED has switched enforcement off
  .authenticate((ex) =>
    authEnforced && ex.principal ? undefined : ANONYMOUS_FALLBACK,
  )
  .delegate((ex) => ({
    actor: ARIA,
    scopes: ceilingFor(ex.principal?.claims ?? { email: ex.principal?.email }),
  }))
  .transform((body) => ({
    channel: "mcp" as const,
    text: body.text,
  }))
  .to(agent("aria"));
