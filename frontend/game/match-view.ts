import type { AssistLevel, CueSpec, Mode } from "../../shared/catalog.ts";
import type { GameState, StrikeCmd } from "../../shared/game/types.ts";

export interface MatchView {
  id: string;
  mode: Mode;
  table: string;
  stake: number;
  assist: AssistLevel;
  /** Shot clock in force (ms); a day for correspondence. */
  clock: number;
  corr: boolean;
  players: { id: string; name: string; rating: number; cue: CueSpec }[];
  seat: 0 | 1 | -1;
  state: GameState;
  hash: string;
  version: number;
  deadline: number;
  now: number;
  status: "live" | "done";
  winner: number;
  reason: string | null;
  next: string | null;
  /** Decisive finished games between the two players, per seat. */
  h2h: [number, number];
  watching: number;
  last: { by: 0 | 1; cmd: { k: string } & Partial<StrikeCmd> } | null;
}

/** Spectator poll reply: the public view plus reactions after the cursor. */
export interface WatchView extends MatchView {
  cheers: { id: number; kind: number }[];
}
