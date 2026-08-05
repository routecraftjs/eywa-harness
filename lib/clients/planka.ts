/**
 * Minimal Planka REST client for the harness demo.
 *
 * Authenticates with email + password, caches the access token, and exposes
 * the verbs the ticket capabilities need: list/get/create/update/comment.
 *
 * Resolves the configured project + board on first call so capabilities can
 * pretend there is one canonical board.
 */

import { env } from "../../env.js";

interface PlankaToken {
  token: string;
  expiresAt: number;
}

interface PlankaItem {
  id: string;
  type?: string;
  attributes?: Record<string, unknown>;
}

interface PlankaResponse<T> {
  item: T;
  included?: Record<string, unknown>;
}

interface PlankaListResponse<T> {
  items: T[];
  included?: Record<string, unknown>;
}

let tokenCache: PlankaToken | null = null;

async function authenticate(): Promise<string> {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 30_000) {
    return tokenCache.token;
  }
  const res = await fetch(`${env.PLANKA_BASE_URL}/api/access-tokens`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      emailOrUsername: env.PLANKA_USER,
      password: env.PLANKA_PASSWORD,
    }),
  });
  if (!res.ok) {
    throw new Error(
      `Planka auth failed: ${res.status} ${await res.text()}`,
    );
  }
  const json = (await res.json()) as { item: string };
  tokenCache = {
    token: json.item,
    expiresAt: Date.now() + 60 * 60 * 1000,
  };
  return json.item;
}

async function api<T = unknown>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const token = await authenticate();
  const res = await fetch(`${env.PLANKA_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(init.headers as Record<string, string> | undefined),
    },
  });
  if (!res.ok) {
    throw new Error(
      `Planka ${init.method ?? "GET"} ${path} failed: ${res.status} ${await res.text()}`,
    );
  }
  return (await res.json()) as T;
}

let projectBoardCache: { projectId: string; boardId: string; listIds: Record<string, string> } | null =
  null;

async function resolveBoard() {
  if (projectBoardCache) return projectBoardCache;

  const projects = await api<PlankaListResponse<PlankaItem & { name?: string }>>(
    "/api/projects",
  );
  const project = projects.items.find(
    (p) => (p as { name?: string }).name === env.PLANKA_PROJECT_NAME,
  );
  if (!project) {
    throw new Error(
      `Planka project "${env.PLANKA_PROJECT_NAME}" not found. Run docker compose up to seed it.`,
    );
  }

  const projectDetails = await api<{ included?: { boards?: PlankaItem[]; lists?: PlankaItem[] } }>(
    `/api/projects/${project.id}`,
  );
  const boards = (projectDetails.included?.boards ?? []) as Array<
    PlankaItem & { name?: string }
  >;
  const board = boards.find((b) => b.name === env.PLANKA_BOARD_NAME);
  if (!board) {
    throw new Error(
      `Planka board "${env.PLANKA_BOARD_NAME}" not found in project "${env.PLANKA_PROJECT_NAME}".`,
    );
  }

  const boardDetails = await api<{ included?: { lists?: Array<PlankaItem & { name?: string }> } }>(
    `/api/boards/${board.id}`,
  );
  const lists = boardDetails.included?.lists ?? [];
  const listIds: Record<string, string> = {};
  for (const list of lists) {
    if (list.name) listIds[list.name.toLowerCase()] = list.id;
  }

  projectBoardCache = { projectId: project.id, boardId: board.id, listIds };
  return projectBoardCache;
}

export interface CreateTicketInput {
  title: string;
  body?: string;
  status?: string;
  labels?: string[];
}

export interface PlankaTicket {
  id: string;
  title: string;
  body: string;
  status: string;
  url: string;
  createdAt: string;
}

function ticketUrl(boardId: string, cardId: string): string {
  const base = env.PLANKA_BASE_URL.replace(/\/api$/, "");
  return `${base}/boards/${boardId}/cards/${cardId}`;
}

function pickListId(
  listIds: Record<string, string>,
  status?: string,
): string {
  if (status) {
    const id = listIds[status.toLowerCase()];
    if (id) return id;
  }
  // Default to "Backlog" or the first list.
  const fallback =
    listIds["backlog"] ??
    listIds["to do"] ??
    listIds["todo"] ??
    Object.values(listIds)[0];
  if (!fallback) {
    throw new Error(
      "Planka board has no lists. Cannot create ticket. Ensure the seed ran.",
    );
  }
  return fallback;
}

export async function createTicket(
  input: CreateTicketInput,
): Promise<PlankaTicket> {
  const { boardId, listIds } = await resolveBoard();
  const listId = pickListId(listIds, input.status);
  const created = await api<
    PlankaResponse<{ id: string; name: string; description: string | null; createdAt: string }>
  >(`/api/lists/${listId}/cards`, {
    method: "POST",
    body: JSON.stringify({
      name: input.title,
      description: input.body ?? null,
      position: 65535,
    }),
  });
  const card = created.item;

  // Best-effort label attachment. Skipped on any failure; capabilities surface
  // labels in the ticket body too.
  if (input.labels && input.labels.length > 0) {
    try {
      const board = await api<{ included?: { labels?: Array<PlankaItem & { name?: string }> } }>(
        `/api/boards/${boardId}`,
      );
      const labelMap = new Map<string, string>();
      for (const label of board.included?.labels ?? []) {
        if (label.name) labelMap.set(label.name.toLowerCase(), label.id);
      }
      for (const label of input.labels) {
        const labelId = labelMap.get(label.toLowerCase());
        if (labelId) {
          await api(`/api/cards/${card.id}/labels`, {
            method: "POST",
            body: JSON.stringify({ labelId }),
          }).catch(() => {});
        }
      }
    } catch {
      // labels are nice-to-have for the demo
    }
  }

  return {
    id: card.id,
    title: card.name,
    body: card.description ?? "",
    status: input.status ?? "backlog",
    url: ticketUrl(boardId, card.id),
    createdAt: card.createdAt,
  };
}

/**
 * Every card on the board, newest first, with its list name as `status`.
 *
 * Planka returns the whole board in one call, so this stays a single request
 * no matter how many cards there are.
 */
export async function listTickets(options: { status?: string } = {}): Promise<
  PlankaTicket[]
> {
  const { boardId, listIds } = await resolveBoard();
  const board = await api<{
    included?: {
      cards?: Array<{
        id: string;
        name: string;
        description: string | null;
        createdAt: string;
        listId: string;
      }>;
    };
  }>(`/api/boards/${boardId}`);

  const listIdToName = new Map<string, string>();
  for (const [name, lid] of Object.entries(listIds)) listIdToName.set(lid, name);

  const wanted = options.status?.toLowerCase();
  return (board.included?.cards ?? [])
    .map((card) => ({
      id: card.id,
      title: card.name,
      body: card.description ?? "",
      status: listIdToName.get(card.listId) ?? "unknown",
      url: ticketUrl(boardId, card.id),
      createdAt: card.createdAt,
    }))
    .filter((t) => (wanted ? t.status === wanted : true))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getTicket(id: string): Promise<PlankaTicket> {
  const res = await api<
    PlankaResponse<{ id: string; name: string; description: string | null; createdAt: string; listId: string }>
  >(`/api/cards/${id}`);
  const { boardId, listIds } = await resolveBoard();
  const listIdToName = new Map<string, string>();
  for (const [name, lid] of Object.entries(listIds)) listIdToName.set(lid, name);

  return {
    id: res.item.id,
    title: res.item.name,
    body: res.item.description ?? "",
    status: listIdToName.get(res.item.listId) ?? "unknown",
    url: ticketUrl(boardId, res.item.id),
    createdAt: res.item.createdAt,
  };
}

export async function updateTicketStatus(
  id: string,
  status: string,
): Promise<PlankaTicket> {
  const { listIds } = await resolveBoard();
  const listId = listIds[status.toLowerCase()];
  if (!listId) {
    throw new Error(
      `Planka list "${status}" not found. Available: ${Object.keys(listIds).join(", ")}`,
    );
  }
  await api(`/api/cards/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ listId, position: 65535 }),
  });
  return getTicket(id);
}

export async function commentOnTicket(
  id: string,
  text: string,
): Promise<{ id: string; ticketId: string; text: string; createdAt: string }> {
  const res = await api<
    PlankaResponse<{ id: string; cardId: string; text: string; createdAt: string }>
  >(`/api/cards/${id}/comments`, {
    method: "POST",
    body: JSON.stringify({ text }),
  });
  return {
    id: res.item.id,
    ticketId: res.item.cardId,
    text: res.item.text,
    createdAt: res.item.createdAt,
  };
}
