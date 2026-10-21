import assert from "node:assert/strict";
import { test } from "node:test";
import { ball, RACK_SHAPES, shapeRack } from "../shared/game/rack.ts";
import { NICKNAMES, whisperOf } from "../shared/lore.ts";
import { R } from "../shared/physics/constants.ts";
import { TABLES } from "../shared/catalog.ts";
import type { GameState, Report, StrikeCmd } from "../shared/game/types.ts";

const rep = (over: Partial<Report> = {}): Report => ({
  by: 0,
  foul: null,
  pocketed: [],
  keep: false,
  respot: [],
  win: -1,
  hit: 1,
  need: 1,
  uncalled: false,
  assign: 0,
  end: null,
  ...over,
});

const cmd = (over: Partial<StrikeCmd> = {}): StrikeCmd => ({ k: "strike", dx: 1_000_000, dy: 0, power: 500, tx: 0, ty: 0, el: 0, ...over });

const st = (over: Partial<GameState> = {}): GameState => ({
  mode: 9,
  table: "garage",
  balls: [ball(0, -0.4, 0), ball(1, 0.4, 0)],
  turn: 0,
  shot: 3,
  broken: true,
  groups: [0, 0],
  bih: 0,
  fouls: [0, 0],
  winner: -1,
  last: null,
  ...over,
});

test("trick racks stay legal on every table and mode", () => {
  for (const t of TABLES) {
    for (const mode of [8, 9, 10, 15] as const) {
      for (const { id } of RACK_SHAPES) {
        const balls = shapeRack(mode, t.L, t.W, id, 42);
        assert.equal(balls[0].id, 0, "cue ball sorts first");
        for (const b of balls) {
          assert.ok(Math.abs(b.x) <= t.L / 2 - R + 1e-5, `${id}: ball ${b.id} off the long rail`);
          assert.ok(Math.abs(b.y) <= t.W / 2 - R + 1e-5, `${id}: ball ${b.id} off the short rail`);
        }
        for (let i = 0; i < balls.length; i++) {
          for (let j = i + 1; j < balls.length; j++) {
            const d = Math.hypot(balls[i].x - balls[j].x, balls[i].y - balls[j].y);
            assert.ok(d >= 2 * R - 1e-4, `${id}: balls ${balls[i].id} and ${balls[j].id} overlap (${d})`);
          }
        }
        const count = mode === 9 ? 9 : mode === 10 ? 10 : 15;
        if (id !== "duo" && id !== "solo") assert.equal(balls.length - 1, count, `${id}: wrong ball count for mode ${mode}`);
        if (id === "duo") assert.equal(balls.length - 1, 2);
        if (id === "solo") assert.equal(balls.length - 1, 1);
        // Subset shapes never carry the 8, so eight-ball cannot end by accident.
        if ((id === "duo" || id === "solo") && mode === 8) assert.ok(!balls.some((b) => b.id === 8));
      }
    }
  }
});

test("trick racks are deterministic per seed and repeatable for retries", () => {
  const a = shapeRack(8, 2.54, 1.27, "snake", 7);
  const b = shapeRack(8, 2.54, 1.27, "snake", 7);
  const c = shapeRack(8, 2.54, 1.27, "snake", 99);
  assert.deepEqual(a, b, "same seed, same layout");
  assert.notDeepEqual(a, c, "different seed, different jitter");
});

test("whispers cover fouls, spin, wins and quiet shots", () => {
  const scratch = whisperOf(cmd(), rep({ foul: "scratch", pocketed: [0] }), st());
  assert.match(scratch!, /swim/);

  const masse = whisperOf(cmd({ el: 5000 }), rep({ pocketed: [3], keep: true }), st());
  assert.match(masse!, /massé/i);

  const draw = whisperOf(cmd({ ty: -600 }), rep({ pocketed: [3], keep: true }), st());
  assert.match(draw!, /draw/i);

  const win = whisperOf(cmd(), rep({ pocketed: [8], win: 0, end: "eight" }), st({ mode: 8, winner: 0 }));
  assert.match(win!, /widow/);

  // Ordinary shots rotate the table wisdom, keyed by the shot number: same state, same whisper.
  const quietA = whisperOf(cmd(), rep(), st({ shot: 5 }));
  const quietB = whisperOf(cmd(), rep(), st({ shot: 5 }));
  assert.equal(quietA, quietB);
  assert.ok(quietA!.length > 10);
});

test("every ball has a nickname and the cue ball is the ghost", () => {
  for (let id = 0; id <= 15; id++) assert.ok(NICKNAMES[id], `ball ${id} needs a nickname`);
  assert.equal(NICKNAMES[0], "the ghost");
});
