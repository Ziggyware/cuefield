import type { CueSpec } from "../../shared/catalog.ts";
import { rng } from "../../shared/game/rack.ts";
import type { GameState } from "../../shared/game/types.ts";
import { type Level, plan } from "./plan.ts";

self.onmessage = (e: MessageEvent<{ id: number; state: GameState; cue: CueSpec; level: Level; seed: number }>) => {
  const { id, state, cue, level, seed } = e.data;
  const cmd = plan(state, cue, level, rng(seed));
  (self as unknown as Worker).postMessage({ id, cmd });
};
