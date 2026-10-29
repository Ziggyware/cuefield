import { test } from "node:test";
import assert from "node:assert/strict";
import { CHALLENGES, challengeState, clearsStation } from "../shared/game/challenges.ts";
import { cueById, TABLES } from "../shared/catalog.ts";
import { geometry, play } from "../shared/game/engine.ts";
import { R } from "../shared/physics/constants.ts";
import { validate } from "../shared/game/validate.ts";
import type { Report, StrikeCmd } from "../shared/game/types.ts";
import type { SimEvent } from "../shared/physics/types.ts";

test("all challenge layouts are legal and repeatable on every venue and mode", () => {
  for (const t of TABLES) for (const mode of [8, 9, 10, 15] as const) for (const game of CHALLENGES) for (let i = 0; i < game.stations; i++) {
    const state = challengeState(game.id, mode, t.id, i);
    assert.deepEqual(state, challengeState(game.id, mode, t.id, i));
    for (const [j, b] of state.balls.entries()) {
      assert.ok(Math.abs(b.x) <= t.L / 2 - R && Math.abs(b.y) <= t.W / 2 - R, `${game.id} ${t.id} station ${i}`);
      for (const a of state.balls.slice(j + 1)) assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= 2 * R);
    }
  }
});

test("the six-pocket tour is actually playable on all venues", () => {
  for (const t of TABLES) for (let i = 0; i < 6; i++) {
    const state = challengeState("pocket-tour", 9, t.id, i), p = geometry(t.id).pockets[i];
    const cmd: StrikeCmd = { k: "strike", dx: Math.round(p.dx * 1e6), dy: Math.round(p.dy * 1e6), power: 600, tx: 0, ty: 0, el: 0, call: i };
    const result = play(state, cmd, cueById("ash"));
    assert.ok(clearsStation("pocket-tour", i, result.state.last, result.sim.events), `${t.id} pocket ${i}`);
  }
});

test("bank school requires the object ball to hit a cushion before it is pocketed", () => {
  const report: Report = { by: 0, foul: null, pocketed: [1], keep: true, respot: [], win: -1, hit: 1, need: 1, uncalled: false, assign: 0, end: null };
  const pot: SimEvent = { k: "pocket", t: 2, a: 1, p: 4 };
  const rail: SimEvent = { k: "rail", t: 1, a: 1, j: 1, x: 0, y: 0 };
  assert.ok(clearsStation("bank-school", 0, report, [rail, pot]));
  assert.ok(!clearsStation("bank-school", 0, report, [pot]));
  assert.ok(!clearsStation("bank-school", 0, report, [{ ...rail, t: 3 }, pot]));
  assert.ok(!clearsStation("bank-school", 0, { ...report, foul: "scratch" }, [rail, pot]));
  assert.ok(clearsStation("pocket-tour", 4, report, [pot]));
  assert.ok(!clearsStation("pocket-tour", 3, report, [pot]));
});

test("bank-school stations have real legal bank shots, including called-pocket venues", () => {
  // Known playable strokes (angle, power, pocket) found using cushion reflections and verified by the full engine.
  const strokes: [string, [number, number, number][]][] = [
    ["garage", [[-0.5297525123664029,1000,1],[0.542899208914808,850,1],[-0.37739907396858363,850,1],[0.3984695352808248,1000,3],[-0.2870856354171696,600,0],[0.3091300012884833,600,2]]],
    ["tavern", [[-0.5257149712411846,600,0],[0.5311742808963846,600,3],[-0.3757442105794027,600,0],[0.39363393742548913,1000,0],[-0.2944368528717088,850,2],[0.30969781306444554,600,0]]],
    ["hall", [[-0.525802120649202,600,2],[0.5399053572390312,1000,0],[-0.37005388456711813,600,2],[0.3890499464468315,1000,0],[-0.2944277233275758,850,0],[0.3064277233275758,850,0]]],
    ["arena", [[-0.5177951485570045,850,3],[0.5399102550055089,1000,0],[-0.3950481686780979,1000,0],[0.3810541781380906,1000,3],[-0.3106980022697001,1000,0],[0.29043136951169185,600,3]]],
    ["sanctum", [[-0.4991451469415551,600,1],[0.5399149980166766,1000,0],[-0.37404263284250855,850,1],[0.38905827609553195,1000,0],[-0.29369329824100315,600,0],[0.30243490038497745,1000,0]]],
  ];
  for (const [table, shots] of strokes) shots.forEach(([angle, power, call], station) => {
    const st = challengeState("bank-school", 9, table, station);
    const cmd = { k: "strike" as const, dx: Math.round(Math.cos(angle) * 1e6), dy: Math.round(Math.sin(angle) * 1e6), power, tx: 0, ty: 0, el: 0, call };
    const { state, sim } = play(st, cmd, cueById("ash"));
    assert.ok(clearsStation("bank-school", station, state.last, sim.events), `${table} station ${station + 1}`);
  });
});


test("three-ball sprint can be cleared within five legal shots on every venue", () => {
  // A recorded legal run on each venue, including call-pocket venues; not dependent on the bot planner's timing.
  const runs: [string, [number, number, number, number, number?][]][] = [
    ["garage", [[930220,-367002,333,-700],[-732322,680959,333,-700],[118938,-992902,333,-700],[920521,390692,333,600]]],
    ["tavern", [[924943,-380106,333,-700],[-703384,710810,164,600],[555874,-831266,586,600],[-786192,617983,586,0]]],
    ["hall", [[920712,-390243,333,-700],[-683792,729677,333,-700],[601683,-798735,586,600]]],
    ["arena", [[921331,-388778,333,-700,2],[-608180,793799,333,0,5]]],
    ["sanctum", [[920325,-391154,333,-700,2],[-589402,807840,586,0,5],[961269,275611,586,600,5],[172134,985074,333,-700,1]]],
  ];
  for (const [table, strokes] of runs) {
    let state = challengeState("three-ball", 9, table);
    for (const [dx, dy, power, ty, call] of strokes) {
      const cmd: StrikeCmd = { k: "strike", dx, dy, power, tx: 0, ty, el: 0, ...(call === undefined ? {} : { call }) };
      assert.equal(validate(state, cmd, cueById("ash")), null, `${table} legal command`);
      state = play(state, cmd, cueById("ash")).state;
      assert.equal(state.last?.foul, null, `${table} foul`);
      assert.equal(state.last?.uncalled, false, `${table} call`);
      state.turn = 0; state.fouls = [0, 0];
    }
    assert.ok(strokes.length <= 5 && !state.balls.some((b) => b.on && b.id > 0), `${table} cleared`);
  }
});
