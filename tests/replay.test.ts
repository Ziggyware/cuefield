import { test } from "node:test";
import assert from "node:assert/strict";
import { HighlightReplay, ShotRecording } from "../frontend/game/highlight.ts";
import { highlightOf } from "../shared/game/highlights.ts";
import { newGame } from "../shared/game/engine.ts";
import { ball } from "../shared/game/rack.ts";
import type { SimEvent } from "../shared/physics/types.ts";

test("highlight playback locks for two seconds before and after the slow-motion clip", () => {
  const balls = [ball(0, 0, 0), ball(1, 0.2, 0)], orientation = new Float32Array(144);
  const record = new ShotRecording(balls);
  record.capture(0, balls, orientation, true);
  balls[1].x = 0.4;
  record.capture(1, balls, orientation, true);
  const replay = new HighlightReplay(record, "JUMP", 1, 0, 1, [0.2, 0]);
  assert.equal(replay.advance(1.99), false);
  assert.equal(replay.phase, "before");
  assert.equal(replay.advance(0.01), false);
  assert.equal(replay.phase, "playing");
  assert.equal(replay.advance(1.25), false);
  assert.equal(replay.cursor, 0.5);
  assert.ok(Math.abs(replay.balls[1].x - 0.3) < 1e-6);
  assert.equal(replay.advance(1.25), false);
  assert.equal(replay.phase, "after");
  assert.equal(replay.advance(1.99), false);
  assert.equal(replay.advance(0.01), true);
  assert.equal(balls[1].x, 0.4, "playback must not mutate the authoritative balls");
});

test("exit, jump, multi-pot and victory highlights have deterministic priority", () => {
  const st = newGame(9, "garage", 1, 0);
  const pots: SimEvent[] = [{ k: "pocket", t: 1, a: 1, p: 0 }, { k: "pocket", t: 2, a: 9, p: 1 }];
  assert.equal(highlightOf(pots, st)?.kind, "multi");
  const jump: SimEvent = { k: "jump", t: 0.5, a: 0, x: 0, y: 0 };
  assert.equal(highlightOf([...pots, jump], st)?.kind, "jump");
  const off: SimEvent = { k: "off", t: 3, a: 1, x: 1, y: 0 };
  assert.equal(highlightOf([...pots, jump, off], st)?.kind, "off");
  st.winner = 0;
  assert.equal(highlightOf([pots[1]], st)?.kind, "win");
  assert.equal(highlightOf([], st), null);
});
