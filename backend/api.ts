import { rewardStatus } from "./rewards.ts";
import { Hono } from "npm:hono@4";
import type { Mode } from "../shared/catalog.ts";
import { body, fail } from "./http.ts";
import { cleanName, createGuest, playerById } from "./auth.ts";
import { type Env, hasOAuthProvider, requireAuth, vtUser } from "./identity.ts";
import { migrate } from "./db.ts";
import { joinQueue, leaveQueue, pollQueue } from "./lobby.ts";
import { closeRoom, createRoom, joinRoom, roomStatus } from "./rooms.ts";
import hub from "./api-hub.ts";
import matchApi from "./api-match.ts";
import { buy, buyUpgrade, claimDaily, equip, leaderboard, rename, view } from "./profile.ts";
import { globalStats, playerStats } from "./stats.ts";
import { finishSolo, startSolo } from "./solo.ts";

const api = new Hono<Env>();
api.post("/guest", async (c) => {
  await migrate();
  const name = cleanName((await body(c)).name);
  if (!name) return c.json({ error: "name" }, 400);
  const { token, id } = await createGuest(name);
  return c.json({ token, profile: view((await playerById(id))!) });
});

/**
 * ICE: public STUN only. When no direct path forms (symmetric NAT on both ends), the match mailbox relays every
 * message through this server, so no TURN credentials are needed.
 */
api.get("/config", (c) => c.json({ ice: [{ urls: ["stun:stun.l.google.com:19302", "stun:stun.cloudflare.com:3478"] }] }));

/** Who is signed in with Val Town on this browser (public; drives the login screen). */
api.get("/session", async (c) => c.json({ user: (await vtUser(c))?.name ?? null, valTownLogin: hasOAuthProvider() }));

api.get("/leaderboard", async (c) => {
  await migrate();
  return c.json(await leaderboard());
});

api.get("/stats", async (c) => {
  await migrate();
  return c.json(await globalStats());
});

api.use("/me/*", requireAuth);
api.use("/me", requireAuth);
api.use("/mm/*", requireAuth);
api.use("/room/*", requireAuth);
api.use("/match/*", requireAuth);

api.get("/me/rewards", async (c) => c.json(await rewardStatus(c.get("player").id)));

api.get("/me", (c) => c.json(view(c.get("player"))));
api.post("/me/name", async (c) => {
  if (c.get("player").vt_id) return c.json({ error: "valtown-name" }, 409);
  const name = cleanName((await body(c)).name);
  if (!name) return c.json({ error: "name" }, 400);
  return c.json(view(await rename(c.get("player"), name)));
});
api.post("/me/daily", async (c) => {
  const r = await claimDaily(c.get("player"));
  if (fail(r)) return c.json(r, 409);
  return c.json({ ...r, profile: view((await playerById(c.get("player").id))!) });
});
api.post("/me/buy", async (c) => {
  const b = await body(c);
  const r = await buy(c.get("player"), b.kind, b.id);
  if (fail(r)) return c.json(r, 409);
  return c.json(view((await playerById(c.get("player").id))!));
});
api.post("/me/equip", async (c) => {
  const r = await equip(c.get("player"), (await body(c)).id);
  if (fail(r)) return c.json(r, 409);
  return c.json(view((await playerById(c.get("player").id))!));
});
api.post("/me/upgrade", async (c) => {
  const r = await buyUpgrade(c.get("player"), (await body(c)).track);
  if (fail(r)) return c.json(r, 409);
  return c.json(view((await playerById(c.get("player").id))!));
});
api.post("/me/solo", async (c) => {
  const b = await body(c);
  const r = await startSolo(c.get("player"), b.mode, b.table, b.level, b.physics);
  return fail(r) ? c.json(r, 409) : c.json(r);
});
api.post("/me/solo/finish", async (c) => {
  const b = await body(c);
  const r = await finishSolo(c.get("player"), b.id, b.log);
  if (fail(r)) return c.json(r, 409);
  return c.json({ ...r, profile: view((await playerById(c.get("player").id))!) });
});
api.get("/me/stats", async (c) => c.json(await playerStats(c.get("player"))));

api.post("/mm/join", async (c) => {
  const b = await body(c);
  const r = await joinQueue(c.get("player"), b.mode as Mode, String(b.table));
  return fail(r) ? c.json(r, 409) : c.json(r);
});
api.post("/mm/poll", async (c) => c.json(await pollQueue(c.get("player"))));
api.post("/mm/leave", async (c) => {
  await leaveQueue(c.get("player"));
  return c.json({ ok: true });
});

api.post("/room/create", async (c) => {
  const b = await body(c);
  const r = await createRoom(c.get("player"), b.mode as Mode, String(b.table), b.assist, b.corr);
  return fail(r) ? c.json(r, 409) : c.json(r);
});
api.get("/room/:code", async (c) => {
  const r = await roomStatus(c.get("player"), c.req.param("code"));
  return fail(r) ? c.json(r, 404) : c.json(r);
});
api.delete("/room/:code", async (c) => {
  await closeRoom(c.get("player"), c.req.param("code"));
  return c.json({ ok: true });
});
api.post("/room/join", async (c) => {
  const r = await joinRoom(c.get("player"), String((await body(c)).code ?? ""));
  return fail(r) ? c.json(r, 409) : c.json(r);
});

api.route("/match", matchApi);
api.route("/", hub);

export default api;
