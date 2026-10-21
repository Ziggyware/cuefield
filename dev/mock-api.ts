import type { Plugin } from "vite";
import { BOUNTIES } from "../shared/rewards.ts";

/**
 * A tiny stand-in for the Val Town backend, for local development and previews only. It serves just enough of the
 * HTTP API for the lobby, the store, practice, drills, hot seat and an offline bot match. Nothing here is
 * authoritative: production runs the real backend in `backend/`.
 */

const MAPLE = {
  id: "maple",
  price: 400,
  speed: 5.7,
  spin: 0.36,
  elev: 5206,
  endMass: 0.0095,
  guide: 0.55,
  mass: 0.54,
  tipE: 0.75,
  wobble: 0.0025,
  luck: 0,
  finish: 0,
  shaft: "#e6d6b0",
  butt: "#7a2f1d",
  ring: "#c9b27a",
};

function makeProfile() {
  return {
    id: "dev",
    name: "Dev Player",
    coins: 5000,
    rating: 1200,
    wins: 0,
    losses: 0,
    cue: "maple",
    cues: ["ash", "maple"],
    unlocks: ["f:cone", "f:banks", "f:labels", "f:replay", "f:slowmo", "f:trails", "f:lock", "f:lab", "f:sandbox", "f:rewind", "f:themes", "f:balls", "f:cloth", "basic", "rail"],
    account: "guest" as const,
    daily: 0,
    streak: 3,
    upgrades: { power: 2, spin: 1 } as Record<string, number>,
    earned: 5000,
    progression: { xp: 5000, level: 5, floor: 4000, next: 6250, progress: (5000 - 4000) / 2250 },
    winStreak: 0,
    bestStreak: 2,
    botWins: 0,
    botLosses: 0,
  };
}

let profile = makeProfile();

const midnight = () => {
  const d = new Date();
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1) - Date.now();
};

function readBody(req: { on: (ev: string, fn: (d?: unknown) => void) => void }): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (c: unknown) => (raw += String(c ?? "")));
    req.on("end", () => {
      try {
        resolve(JSON.parse(raw || "{}") as Record<string, unknown>);
      } catch {
        resolve({});
      }
    });
  });
}

export function mockApi(): Plugin {
  return {
    name: "cuefield-mock-api",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url ?? "/", "http://dev");
        if (!url.pathname.startsWith("/api/")) return next();
        const path = url.pathname.slice(4);
        const body = req.method === "POST" ? await readBody(req) : {};
        const send = (data: unknown, status = 200) => {
          res.statusCode = status;
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify(data));
        };
        const fail = (error: string, status = 400) => send({ error }, status);

        switch (path) {
          case "/session":
            return send({ user: null });
          case "/guest": {
            const name = typeof body.name === "string" && body.name.trim().length >= 2 ? body.name.trim().slice(0, 20) : null;
            if (!name) return fail("name");
            profile = { ...makeProfile(), name };
            return send({ token: "dev-token", profile });
          }
          case "/me":
            return send(profile);
          case "/me/daily":
            profile = { ...profile, coins: profile.coins + 100, daily: 20 * 3600_000 };
            return send({ amount: 100, profile });
          case "/stats":
            return send({
              players: 2,
              live: 0,
              queued: 0,
              today: { online: 0, bot: 3, paid: 40 },
              venues: [{ id: "garage", plays: 3, paid: 40 }],
              top: [{ name: "Railbird", rating: 1250, wins: 3, losses: 1 }],
              streak: { name: "Railbird", n: 3 },
              recent: [],
            });
          case "/pulse":
            return send({ active: [], invites: [] });
          case "/hub":
            return send({
              active: [],
              invites: [],
              online: [{ id: "dev2", name: "Railbird", busy: false }],
              live: [],
              recent: [],
            });
          case "/leaderboard":
            return send([
              { id: "dev2", name: "Railbird", rating: 1250, wins: 3, losses: 1 },
              { id: profile.id, name: profile.name, rating: profile.rating, wins: profile.wins, losses: profile.losses },
            ]);
          case "/me/stats":
            return send({ rank: 2, of: 2, winPct: profile.wins + profile.losses ? Math.round((100 * profile.wins) / (profile.wins + profile.losses)) : null, venues: [{ id: "garage", w: profile.wins, l: profile.losses }], recent: [] });
          case "/me/rewards":
            return send({ resets: midnight(), goals: BOUNTIES.map((b) => ({ ...b, progress: 0, claimed: false })) });
          case "/daily":
            return send({ day: Math.floor(Date.now() / 86_400_000), seed: 20261021, mode: 9, table: "garage", reward: 150, ends: 3, board: [{ name: "Railbird", score: 12 }], best: null, cue: MAPLE });
          case "/daily/finish": {
            const strokes = Array.isArray(body.log) ? body.log.length : 0;
            return send({ score: strokes, strokes, fouls: 0, best: strokes || 12, rank: 1, reward: 150, profile });
          }
          case "/me/solo":
            return send({ id: `dev-${Date.now()}`, seed: (Math.random() * 2 ** 31) >>> 0, breaker: Math.random() < 0.5 ? 0 : 1, cue: MAPLE });
          case "/me/solo/finish": {
            const won = Math.random() < 0.5;
            profile = { ...profile, wins: profile.wins + (won ? 1 : 0), losses: profile.losses + (won ? 0 : 1) };
            return send({ won, reward: won ? 20 : 0, bonuses: won ? [{ title: "Winner's purse", amount: 30 }] : [], capped: false });
          }
          case "/me/upgrade": {
            const track = String(body.track ?? "");
            const lvl = Math.min(5, (profile.upgrades[track] ?? 0) + 1);
            profile = { ...profile, upgrades: { ...profile.upgrades, [track]: lvl } };
            return send(profile);
          }
          case "/me/equip":
            profile = { ...profile, cue: profile.cues.includes(String(body.id)) ? String(body.id) : profile.cue };
            return send(profile);
          case "/me/buy": {
            const key = String(body.id ?? "");
            if (body.kind === "feature" || body.kind === "social") {
              const id = body.kind === "social" ? key : key;
              profile = { ...profile, unlocks: profile.unlocks.includes(id) ? profile.unlocks : [...profile.unlocks, id] };
            } else if (body.kind === "cue") {
              profile = { ...profile, cues: [...profile.cues, key], cue: key };
            }
            return send(profile);
          }
          case "/mm/join":
          case "/mm/poll":
            return fail("offline in dev preview: play vs bot, practice, drills or hot seat", 503);
          case "/room/create":
            return send({ code: "DEV123" });
          default:
            if (path.startsWith("/room/")) return send({ match: null });
            return fail("not-mocked", 404);
        }
      });
    },
  };
}
