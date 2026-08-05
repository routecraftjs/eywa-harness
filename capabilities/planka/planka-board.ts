import {
  craft,
  direct,
  http,
  only,
  type HttpResult,
} from "@routecraft/routecraft";
import { env } from "../../env.js";
import {
  authHeader,
  findByName,
  indexLists,
  type BoardContext,
} from "../../lib/planka.js";

interface Named {
  id: string;
  name?: string;
}

/** The body accumulates one field per lookup as the walk proceeds. */
type WithToken = { token: string };
type WithProject = WithToken & { projectId: string };
type WithBoard = WithProject & { boardId: string };

/**
 * Resolve the demo project, its board, and that board's lists.
 *
 * Internal plumbing, like planka-token: no persona lists it, so it is
 * reached only from other routes via `direct()`.
 *
 * Planka addresses everything by id while the harness configures everything
 * by name, so this walks projects to board to lists. That is three dependent
 * calls, which is what `.enrich()` is for: each step adds what it learned to
 * the body and the next step reads it.
 */
export default craft()
  .id("planka-board")
  .description("Internal: resolve the demo board's ids.")
  // Deliberately uncached, for now. Step-scope `.cache()` is wrong here:
  // it wraps a single step, and each step's body carries the caller's own
  // fields, so a hit would hand one capability another's input. Route-scope
  // `.cache()` is the right tool and did not take effect when the route is
  // invoked through `direct()` on 0.6.0-canary-20260805180433, so the walk
  // currently repeats per call. Correct, just three GETs more than it needs.
  .from(direct())
  .enrich(
    direct<unknown, string>("planka-token"),
    only((token: string) => token, "token"),
  )
  .enrich(
    http<WithToken, { items?: Named[] }>({
      url: `${env.PLANKA_BASE_URL}/api/projects`,
      headers: (ex) => authHeader(ex.body.token),
    }),
    only(
      (r: HttpResult<{ items?: Named[] }>) =>
        findByName(r.body.items, env.PLANKA_PROJECT_NAME, "project").id,
      "projectId",
    ),
  )
  .enrich(
    http<WithProject, { included?: { boards?: Named[] } }>({
      url: (ex) => `${env.PLANKA_BASE_URL}/api/projects/${ex.body.projectId}`,
      headers: (ex) => authHeader(ex.body.token),
    }),
    only(
      (r: HttpResult<{ included?: { boards?: Named[] } }>) =>
        findByName(r.body.included?.boards, env.PLANKA_BOARD_NAME, "board").id,
      "boardId",
    ),
  )
  .enrich(
    http<WithBoard, { included?: { lists?: Named[] } }>({
      url: (ex) => `${env.PLANKA_BASE_URL}/api/boards/${ex.body.boardId}`,
      headers: (ex) => authHeader(ex.body.token),
    }),
    only(
      (r: HttpResult<{ included?: { lists?: Named[] } }>) =>
        indexLists(r.body.included?.lists),
      "listIds",
    ),
  )
  .transform(
    (body): BoardContext => ({
      boardId: body.boardId,
      listIds: body.listIds,
    }),
  );
