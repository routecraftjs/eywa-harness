/**
 * Who the harness attributes knowledge writes to.
 *
 * Every capability in this harness is invoked as a tool by the agent, so the
 * author is always the agent. The channel the request arrived on (email,
 * ticket, MCP) is deliberately not recorded: a `direct()` tool call does not
 * carry the originating exchange's headers, and a guessed channel is worse
 * than an absent one.
 */
export const AGENT_NAME = "aria";
