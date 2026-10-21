import { test } from "node:test";
import assert from "node:assert/strict";
import { cueById, TABLES } from "../shared/catalog.ts";
import { newGame, play, wobbleOf } from "../shared/game/engine.ts";
import type { StrikeCmd } from "../shared/game/types.ts";
import { validate } from "../shared/game/validate.ts";
import { buildGeometry } from "../shared/physics/geometry.ts";
import { Sim } from "../shared/physics/sim.ts";
import type { Ball } from "../shared/physics/types.ts";

const ball = (id: number, x: number, y: number, z = 0): Ball => ({
  id,
  x,
  y,
  z,
  vx: 0,
  vy: 0,
  vz: 0,
  wx: 0,
  wy: 0,
  wz: 0,
  on: true,
});

test("a straight ball down each pocket axis drops into that pocket on every venue", () => {
  for (const t of TABLES) {
    const geo = buildGeometry(t);
    geo.pockets.forEach((p, k) => {
      const b = ball(0, p.x - p.dx * 0.34, p.y - p.dy * 0.34);
      b.vx = p.dx * 1.7;
      b.vy = p.dy * 1.7;
      const sim = new Sim([b], geo);
      sim.run();
      assert.equal(b.on, false, `${t.id} pocket ${k} should capture`);
      const ev = sim.events.find((e) => e.k === "pocket");
      assert.ok(ev && ev.k === "pocket" && ev.p === k, `${t.id} pocket ${k} event`);
    });
  }
});

test("every pocket narrows from a wider mouth to the jaw line", () => {
  for (const t of TABLES) {
    const geo = buildGeometry(t);
    assert.equal(geo.pockets.length, 6);
    for (const p of geo.pockets) {
      assert.ok(p.mouthHalf > p.half, `${t.id}: mouth wider than the jaw line`);
      assert.ok(p.funnel > 0, `${t.id}: a real funnel between mouth and jaws`);
      assert.ok(p.drop - p.hr > 0, `${t.id}: the drop circle starts beyond the jaws`);
    }
  }
});

test("a ball that clips a jaw is rejected instead of swallowed", () => {
  const geo = buildGeometry(TABLES[2]);
  const p = geo.pockets[3];
  // A sharp cut still aimed at the hole: the facing has to turn it away.
  const a0 = Math.atan2(p.dy, p.dx) + (40 * Math.PI) / 180;
  const b = ball(0, p.x - Math.cos(a0) * 0.35, p.y - Math.sin(a0) * 0.35);
  const a = Math.atan2(p.hy - b.y, p.hx - b.x);
  b.vx = Math.cos(a) * 1.8;
  b.vy = Math.sin(a) * 1.8;
  const sim = new Sim([b], geo);
  sim.run();
  assert.ok(sim.events.some((e) => e.k === "jaw"), "expected a jaw contact");
  assert.equal(b.on, true);
});

test("a raised ball flies over an object ball without touching it", () => {
  const geo = buildGeometry(TABLES[2]);
  const cb = ball(0, -0.3, 0, 0.2);
  cb.vx = 2.2;
  const ob = ball(1, -0.05, 0);
  const sim = new Sim([cb, ob], geo);
  // Step only until the cue ball is past the object ball: later bounces would test something else.
  for (let i = 0; i < 4000 && cb.x > -0.42 && cb.x < 0.05; i++) sim.step();
  assert.equal(ob.x, -0.05);
  assert.equal(ob.y, 0);
  assert.equal(cb.on, true);
  assert.ok(cb.z > 0, "cue ball should still be airborne");
});

test("a legacy state without ball heights still simulates", () => {
  const st = newGame(8, "hall", 77, 0);
  for (const b of st.balls) delete (b as Partial<Ball>).z;
  const cmd: StrikeCmd = { k: "strike", dx: 1_000_000, dy: 0, power: 600, tx: 0, ty: 0, el: 0 };
  const r = play(st, cmd, cueById("maple"));
  for (const b of r.state.balls) {
    assert.ok(Number.isFinite(b.x) && Number.isFinite(b.y) && Number.isFinite(b.z ?? 0));
  }
});

test("simulation is deterministic for a full stroke", () => {
  const st = newGame(8, "hall", 1234567, 0);
  const cmd: StrikeCmd = { k: "strike", dx: 1_000_000, dy: 0, power: 830, tx: 120, ty: -240, el: 0, tipChalk: 0.6, handChalk: 0.4 };
  const a = play(st, cmd, cueById("carbon"));
  const b = play(st, cmd, cueById("carbon"));
  assert.deepEqual(a.sim.balls, b.sim.balls);
  assert.deepEqual(a.state.last, b.state.last);
});

test("heavy-strike finesse scales the stroke error and is validated", () => {
  const st = newGame(9, "hall", 99, 0);
  const cmd: StrikeCmd = { k: "strike", dx: 1_000_000, dy: 0, power: 900, tx: 0, ty: 0, el: 0 };
  const shank = wobbleOf(st, { ...cmd, finesse: 0 }, cueById("carbon"));
  const clean = wobbleOf(st, { ...cmd, finesse: 1000 }, cueById("carbon"));
  assert.ok(Math.abs(clean) < Math.abs(shank));
  assert.equal(validate(st, cmd, cueById("carbon")), null);
  assert.equal(validate(st, { ...cmd, finesse: 1200 }, cueById("carbon")), "finesse");
  assert.equal(validate(st, { ...cmd, finesse: 402 }, cueById("carbon")), null);
  assert.equal(validate(st, { ...cmd, tipChalk: 2 }, cueById("carbon")), "chalk");
  assert.equal(validate(st, { ...cmd, handChalk: -0.1 }, cueById("carbon")), "chalk");
});

test("pocket capture honours the lip allowance at the edge of the drop circle", () => {
  const geo = buildGeometry(TABLES[3]);
  const p = geo.pockets[0];
  const lat = p.hr + 0.0025;
  const edge = () => {
    const b = ball(0, p.hx + p.dy * lat, p.hy - p.dx * lat);
    b.vx = p.dx * 0.01;
    b.vy = p.dy * 0.01;
    return b;
  };
  const plain = edge();
  new Sim([plain], geo).step();
  assert.equal(plain.on, true, "outside the bare drop radius");
  const lucky = edge();
  new Sim([lucky], geo, 0.005).step();
  assert.equal(lucky.on, false, "the luck allowance reaches it");
});
