import { test } from "node:test";
import assert from "node:assert/strict";
import { Predictor, type PredictionRequest } from "../frontend/game/predictor.ts";
import { preview } from "../frontend/preview.ts";
import { cueById, tableById } from "../shared/catalog.ts";
import { begin, ACCURACY_SCALE, strokeSigma } from "../shared/game/engine.ts";
import { challengeState } from "../shared/game/challenges.ts";
import { shapeRack } from "../shared/game/rack.ts";
import type { StrikeCmd } from "../shared/game/types.ts";

const setup = () => {
  const st = challengeState("bank-school", 9, "sanctum", 0), cue = cueById("carbon");
  const dx = st.balls[1].x - st.balls[0].x, dy = st.balls[1].y - st.balls[0].y, len = Math.hypot(dx, dy);
  const cmd: StrikeCmd = { k: "strike", dx: Math.round(dx / len * 1e6), dy: Math.round(dy / len * 1e6), power: 1000, tx: 0, ty: 0, el: 0, tipChalk: 0.6, handChalk: 0.4, call: 0 };
  return { st, cue, cmd };
};

test("full prediction matches the real seeded shot through rest, even beyond 4.5 seconds", () => {
  const { st, cue, cmd } = setup();
  const guide = preview(st, cmd, cue, 4)!;
  const real = begin(st, cmd, cue);
  real.run();
  assert.ok(real.t > 4.5);
  for (const b of real.balls.filter((ball) => ball.on)) {
    const path = guide.paths.find((p) => p.id === b.id);
    assert.ok(path?.rest, `ball ${b.id} was traced to rest`);
    const end = path.pts.at(-1)!;
    assert.ok(Math.hypot(end[0] - b.x, end[1] - b.y) < 1e-8);
  }
});

test("prediction handles subset practice racks whose ball IDs are not array indices", () => {
  const { st, cue, cmd } = setup();
  const t = tableById(st.table)!;
  st.balls = shapeRack(9, t.L, t.W, "duo", 7);
  assert.doesNotThrow(() => preview(st, cmd, cue, 4));
});

test("stroke spread reflects the gentler default and both chalk factors", () => {
  const { cue, cmd } = setup();
  assert.equal(ACCURACY_SCALE, 0.35);
  assert.ok(strokeSigma(cmd, cue) < strokeSigma({ ...cmd, tipChalk: 0, handChalk: 0 }, cue));
  assert.ok(strokeSigma(cmd, cue) < cue.wobble);
});

test("prediction worker replaces stale pending requests instead of building a queue", () => {
  const previous = globalThis.Worker;
  class FakeWorker {
    static instance: FakeWorker;
    onmessage: ((event: MessageEvent) => void) | null = null;
    onerror: ((event: ErrorEvent) => void) | null = null;
    jobs: PredictionRequest[] = [];
    constructor() { FakeWorker.instance = this; }
    postMessage(req: PredictionRequest) { this.jobs.push(req); }
    terminate() {}
    reply(id: number) { this.onmessage?.({ data: { id, preview: null } } as MessageEvent); }
  }
  Object.assign(globalThis, { Worker: FakeWorker });
  try {
    const p = new Predictor(), { st, cue, cmd } = setup(), got: number[] = [];
    const req = { state: st, cmd, cue, level: 4 as const, options: { guideReach: 1, guidePrecision: 12 }, table: tableById(st.table)! };
    p.request(req, () => got.push(1));
    p.request(req, () => got.push(2));
    p.request(req, () => got.push(3));
    const w = FakeWorker.instance;
    assert.equal(w.jobs.length, 1);
    w.reply(w.jobs[0].id);
    assert.equal(w.jobs.length, 2);
    assert.deepEqual(got, []);
    w.reply(w.jobs[1].id);
    assert.deepEqual(got, [3]);
    p.stop();
  } finally { Object.assign(globalThis, { Worker: previous }); }
});
