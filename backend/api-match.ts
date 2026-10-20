import { Hono } from "npm:hono@4";
import type { Cmd } from "../shared/game/types.ts";
import type { Env } from "./identity.ts";
import { body, fail } from "./http.ts";
import { loadMatch, seatOf } from "./match.ts";
import { cheersAfter, matchView, watcherCount } from "./match-view.ts";
import { receive, send } from "./signal.ts";
import { heartbeat, rematch, submit, tick } from "./turns.ts";

const r = new Hono<Env>();
const cursor = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : -1);

r.get("/:id", async (c) => {
  const m = await loadMatch(c.req.param("id"));
  if (!m) return c.json({ error: "match" }, 404);
  const seat = seatOf(m, c.get("player").id);
  if (seat !== -1) await heartbeat(m, seat);
  return c.json(await matchView(await tick(m), seat));
});

r.post("/:id/shot", async (c) => {
  const m = await loadMatch(c.req.param("id"));
  if (!m) return c.json({ error: "match" }, 404);
  const seat = seatOf(m, c.get("player").id);
  if (seat === -1) return c.json({ error: "seat" }, 403);
  const b = await body(c);
  const res = await submit(m, seat, b.cmd as Cmd, Number(b.shot));
  return fail(res) ? c.json({ error: res.error }, (res.status ?? 400) as 400) : c.json(res);
});

/** Signal + heartbeat + lazy clock in one round trip. */
r.post("/:id/signal", async (c) => {
  const m = await loadMatch(c.req.param("id"));
  if (!m) return c.json({ error: "match" }, 404);
  const seat = seatOf(m, c.get("player").id);
  if (seat === -1) return c.json({ error: "seat" }, 403);
  const b = await body(c);
  if (b.msg !== undefined) {
    const s = await send(m, seat, b.msg);
    if (fail(s)) return c.json(s, 413);
  }
  await heartbeat(m, seat);
  const t = await tick(m);
  const [msgs, watching, cheers] = await Promise.all([
    receive(m, seat, Number(b.after) || 0),
    watcherCount(m.id),
    cheersAfter(m.id, cursor(b.cheer)),
  ]);
  const head = { version: t.version, status: t.status, shot: t.state.shot, deadline: t.deadline, now: Date.now(), next: t.next, watching, cheers };
  return c.json({ msgs, head });
});

r.post("/:id/rematch", async (c) => {
  const m = await loadMatch(c.req.param("id"));
  if (!m) return c.json({ error: "match" }, 404);
  const seat = seatOf(m, c.get("player").id);
  if (seat === -1) return c.json({ error: "seat" }, 403);
  return c.json({ next: await rematch(m, seat) });
});

export default r;
