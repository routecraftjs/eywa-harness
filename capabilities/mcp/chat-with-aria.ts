import { agent, mcp } from "@routecraft/ai";
import { craft } from "@routecraft/routecraft";
import { z } from "zod";

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
 * Connect Claude Desktop, Cursor, or any MCP client to the harness on
 * `http://localhost:3001/mcp` and invoke this tool to talk to Aria. The
 * input flows through the same agent that handles email and ticket events.
 */
export default craft()
  .id("chat-with-aria")
  .description(
    "Chat with Aria, the demo Craft Harness assistant. She can read the knowledge base, file tickets, and update the board.",
  )
  .input({ body: InputSchema })
  .from(mcp({ annotations: { readOnlyHint: false, destructiveHint: false } }))
  .transform((body) => ({
    channel: "mcp" as const,
    text: body.text,
  }))
  .to(agent("aria"));
