/**
 * Pure helpers for talking to Planka.
 *
 * Deliberately free of IO: every request the harness makes goes through the
 * `http()` adapter inside a route, so the pipeline owns retries, caching, and
 * error handling. What lives here is only shape, the mapping between Planka's
 * REST payloads and the harness's own ticket vocabulary.
 */

import { env } from "../env.js";

/** Bearer header for an authenticated Planka call. */
export const authHeader = (token: string): Record<string, string> => ({
  Authorization: `Bearer ${token}`,
});

/** Board context resolved once and cached: ids the capabilities need. */
export interface BoardContext {
  boardId: string;
  /** Lowercased list name to list id. */
  listIds: Record<string, string>;
}

interface NamedItem {
  id: string;
  name?: string;
}

/** Find a named entity in a Planka collection, case-sensitively as configured. */
export const findByName = <T extends NamedItem>(
  items: readonly T[] | undefined,
  name: string,
  what: string,
): T => {
  const found = (items ?? []).find((item) => item.name === name);
  if (!found) {
    throw new Error(
      `Planka ${what} "${name}" not found. Run docker compose up to seed it.`,
    );
  }
  return found;
};

/** Index a board's lists by lowercased name, so status lookups are stable. */
export const indexLists = (
  lists: ReadonlyArray<NamedItem> | undefined,
): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const list of lists ?? []) {
    if (list.name) out[list.name.toLowerCase()] = list.id;
  }
  return out;
};

/**
 * Which list a new card lands in. An explicit status wins; otherwise fall
 * back to a backlog-shaped list, then to whatever the board has first, so a
 * renamed board still works.
 */
export const pickListId = (
  listIds: Record<string, string>,
  status?: string,
): string => {
  const explicit = status ? listIds[status.toLowerCase()] : undefined;
  const fallback =
    listIds["backlog"] ??
    listIds["to do"] ??
    listIds["todo"] ??
    Object.values(listIds)[0];
  const listId = explicit ?? fallback;
  if (!listId) {
    throw new Error(
      "Planka board has no lists. Cannot place the card. Ensure the seed ran.",
    );
  }
  return listId;
};

/** Reverse the list index so a card's listId reads back as a status name. */
export const statusOf = (
  listIds: Record<string, string>,
  listId: string,
): string => {
  for (const [name, id] of Object.entries(listIds)) {
    if (id === listId) return name;
  }
  return "unknown";
};

/** Human-facing card URL, for tickets the agent reports back. */
export const ticketUrl = (boardId: string, cardId: string): string =>
  `${env.PLANKA_BASE_URL.replace(/\/api$/, "")}/boards/${boardId}/cards/${cardId}`;

/** A card as Planka returns it. */
export interface PlankaCard {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  listId: string;
}

/** Map a Planka card onto the harness ticket shape. */
export const toTicket = (
  card: PlankaCard,
  board: BoardContext,
): {
  id: string;
  title: string;
  body: string;
  status: string;
  url: string;
  createdAt: string;
} => ({
  id: card.id,
  title: card.name,
  body: card.description ?? "",
  status: statusOf(board.listIds, card.listId),
  url: ticketUrl(board.boardId, card.id),
  createdAt: card.createdAt,
});

/** The ticket shape capabilities return, shared with routes that read them. */
export interface TicketSummary {
  id: string;
  title: string;
  body: string;
  status: string;
  url: string;
  createdAt: string;
}
