import { Hono } from "npm:hono@4";
import { body, fail } from "./http.ts";
import { type Env, requireAuth } from "./identity.ts";
import { migrate } from "./db.ts";
import { dailyInfo, finishDaily } from "./daily.ts";
import { liveTables, online, pulse, recent } from "./hub.ts";
import { answer, challenge, inviteStatus } from "./invites.ts";
import { cheer, replayData, watch } from "./watch.ts";
import { playerById } from "./auth.ts";
import { view } from "./profile.ts";

/** Multiplayer hub: presence, challenges, spectating, replays and the daily rack. */
const r = new Hono<Env>();

// Public: anyone with a link can watch a table or a replay.
r.get("/live", async (c) => {
  await migrate();
  return c.json(await liveTables());
});
r.get("/watch/:id", async (c) => {
  await migrate();
  const after = Number(c.req.query("after") ?? -1);
  const v = await watch(c.req.param("id"), c.req.query("v"), Number.isFinite(after) ? after : -1);
  return v ? c.json(v) : c.json({ error: "match" }, 404);
});
r.post("/watch/:id/cheer", async (c) => {
  await migrate();
  const b = await body(c);
  const res = await cheer(c.req.param("id"), b.v, b.kind);
  return fail(res) ? c.json(res, 429) : c.json(res);
});
r.get("/replay/:id", async (c) => {
  await migrate();
  const d = await replayData(c.req.param("id"));
  return d ? c.json(d) : c.json({ error: "replay" }, 404);
});

for (const p of ["/hub", "/pulse", "/challenge", "/challenge/*", "/daily", "/daily/*"]) r.use(p, requireAuth);

r.get("/pulse", async (c) => c.json(await pulse(c.get("player"))));
r.get("/hub", async (c) => {
  const p = c.get("player");
  const [pl, people, tables, mine] = await Promise.all([pulse(p), online(p), liveTables(), recent(p)]);
  return c.json({ ...pl, online: people, live: tables, recent: mine });
});

r.post("/challenge", async (c) => {
  const res = await challenge(c.get("player"), await body(c));
  return fail(res) ? c.json(res, 409) : c.json(res);
});
r.get("/challenge/:id", async (c) => {
  const res = await inviteStatus(c.get("player"), c.req.param("id"));
  return fail(res) ? c.json(res, 404) : c.json(res);
});
r.post("/challenge/:id/cancel", async (c) => c.json(await inviteStatus(c.get("player"), c.req.param("id"), true)));
r.post("/challenge/:id/:verb{accept|decline}", async (c) => {
  const res = await answer(c.get("player"), c.req.param("id"), c.req.param("verb") === "accept");
  return fail(res) ? c.json(res, 409) : c.json(res);
});

r.get("/daily", async (c) => c.json(await dailyInfo(c.get("player"))));
r.post("/daily/finish", async (c) => {
  const b = await body(c);
  const res = await finishDaily(c.get("player"), b.day, b.log);
  if (fail(res)) return c.json(res, 409);
  return c.json({ ...res, profile: view((await playerById(c.get("player").id))!) });
});

export default r;
