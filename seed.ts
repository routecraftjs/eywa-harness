/**
 * Seed the Planka board the showcase expects.
 *
 * `compose.yml` runs this once, before the app starts, so a fresh clone has a
 * project, a board, and the lists the capabilities resolve by name. Without it
 * every ticket operation fails on `Planka project "Craft Showcase" not found`.
 *
 * Idempotent by design: it looks each entity up by name and creates only what
 * is missing, so `docker compose up` on an existing volume is a no-op rather
 * than a pile of duplicate boards.
 *
 * Deliberately does NOT import `env.ts`. That schema requires an Anthropic key
 * because the agent needs one, and seeding a kanban board does not. A seeder
 * that refuses to run until you have an LLM key would be a silly gate on the
 * first thing a newcomer does.
 */

const BASE_URL = process.env["PLANKA_BASE_URL"] ?? "http://planka:1337";
const USER = process.env["PLANKA_USER"] ?? "demo@showcase.local";
const PASSWORD = process.env["PLANKA_PASSWORD"] ?? "demo";
const PROJECT_NAME = process.env["PLANKA_PROJECT_NAME"] ?? "Craft Showcase";
const BOARD_NAME = process.env["PLANKA_BOARD_NAME"] ?? "Tasks";
const APPROVAL_LIST = process.env["PLANKA_APPROVAL_LIST"] ?? "Approved";

/**
 * The lists, in board order.
 *
 * `Backlog` is first because `pickListId()` falls back to a backlog-shaped
 * list when a card carries no explicit status, which is every card the agent
 * files. The approval list comes from configuration rather than a literal, so
 * renaming it in `.env` renames it here and the approval route keeps matching.
 */
const LISTS = ["Backlog", "In Progress", APPROVAL_LIST, "Done"];

interface Named {
  id: string;
  name?: string;
}

const log = (message: string) => console.log(`[seed] ${message}`);

/** A Planka call that throws with the response body when it fails. */
const api = async <T>(
  path: string,
  init: RequestInit & { token?: string } = {},
): Promise<T> => {
  const { token, ...rest } = init;
  const response = await fetch(`${BASE_URL}${path}`, {
    ...rest,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...rest.headers,
    },
  });
  if (!response.ok) {
    throw new Error(
      `${init.method ?? "GET"} ${path} failed: ${response.status} ${await response.text()}`,
    );
  }
  return (await response.json()) as T;
};

/**
 * Wait for Planka to answer.
 *
 * Compose already gates this on the healthcheck, so this loop is insurance for
 * anyone running the seeder by hand against a stack that is still booting.
 */
const waitForPlanka = async (): Promise<void> => {
  for (let attempt = 1; attempt <= 60; attempt += 1) {
    try {
      const response = await fetch(`${BASE_URL}/api/config`);
      if (response.ok) return;
    } catch {
      // Not up yet. Fall through to the sleep below.
    }
    if (attempt === 1) log(`waiting for Planka at ${BASE_URL}`);
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error(`Planka did not become reachable at ${BASE_URL}`);
};

const login = async (): Promise<string> => {
  const { item } = await api<{ item: string }>("/api/access-tokens", {
    method: "POST",
    body: JSON.stringify({ emailOrUsername: USER, password: PASSWORD }),
  });
  return item;
};

const seed = async (): Promise<void> => {
  await waitForPlanka();
  const token = await login();

  const projects = await api<{
    items: Named[];
    included?: { boards?: Array<Named & { projectId: string }> };
  }>("/api/projects", { token });

  let project = projects.items.find((item) => item.name === PROJECT_NAME);
  if (project) {
    log(`project "${PROJECT_NAME}" already exists`);
  } else {
    ({ item: project } = await api<{ item: Named }>("/api/projects", {
      method: "POST",
      token,
      body: JSON.stringify({ name: PROJECT_NAME }),
    }));
    log(`created project "${PROJECT_NAME}"`);
  }

  let board = (projects.included?.boards ?? []).find(
    (item) => item.projectId === project.id && item.name === BOARD_NAME,
  ) as Named | undefined;
  if (board) {
    log(`board "${BOARD_NAME}" already exists`);
  } else {
    ({ item: board } = await api<{ item: Named }>(
      `/api/projects/${project.id}/boards`,
      {
        method: "POST",
        token,
        body: JSON.stringify({ name: BOARD_NAME, position: 1 }),
      },
    ));
    log(`created board "${BOARD_NAME}"`);
  }

  const existing = await api<{ included?: { lists?: Named[] } }>(
    `/api/boards/${board.id}`,
    { token },
  );
  const present = new Set(
    (existing.included?.lists ?? []).map((list) => list.name),
  );

  for (const [index, name] of LISTS.entries()) {
    if (present.has(name)) {
      log(`list "${name}" already exists`);
      continue;
    }
    await api(`/api/boards/${board.id}/lists`, {
      method: "POST",
      token,
      body: JSON.stringify({ name, position: (index + 1) * 65536 }),
    });
    log(`created list "${name}"`);
  }

  log(`board ready at ${BASE_URL}/boards/${board.id}`);
};

await seed();
