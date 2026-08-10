/**
 * Who wrote a piece of knowledge, and when.
 *
 * Ranking memory by trust needs to know where a fact came from, so every
 * write stamps the file and every appended entry carries its own inline
 * attribution. The timestamp is always taken by the harness rather than asked
 * of the model: an agent asked for the current date will confidently invent
 * one.
 */
export interface Provenance {
  author: string;
  channel?: string;
}

/**
 * Every capability in this harness is invoked as a tool by the agent, so the
 * author is always the agent. The channel the request arrived on (email,
 * ticket, MCP) is deliberately not recorded: a `direct()` tool call does not
 * carry the originating exchange's headers, and a guessed channel is worse
 * than an absent one.
 */
export const AGENT_NAME = "aria";

export const AGENT_PROVENANCE: Provenance = { author: AGENT_NAME };
