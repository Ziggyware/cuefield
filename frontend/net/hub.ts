import type { CueSpec, Mode } from "../../shared/catalog.ts";
import type { GameState } from "../../shared/game/types.ts";

export interface ActiveMatch {
  id: string;
  mode: Mode;
  table: string;
  corr: boolean;
  opponent: string;
  yourTurn: boolean;
}

export interface Invite {
  id: string;
  from: string;
  mode: Mode;
  table: string;
  assist: number;
  corr: boolean;
}

export interface Pulse {
  active: ActiveMatch[];
  invites: Invite[];
}

export interface LiveTable {
  id: string;
  mode: Mode;
  table: string;
  corr: boolean;
  shot: number;
  players: [string, string];
  watching: number;
}

export interface OnlinePlayer {
  id: string;
  name: string;
  rating: number;
  busy: boolean;
}

export interface Hub extends Pulse {
  online: OnlinePlayer[];
  live: LiveTable[];
  recent: { id: string; mode: Mode; table: string; opponent: string; won: boolean }[];
}

export interface ReplayData {
  id: string;
  mode: Mode;
  table: string;
  players: [string, string];
  cues: [CueSpec, CueSpec];
  init: GameState;
  log: { by: 0 | 1; cmd: { k: string } }[];
  winner: number;
  reason: string | null;
}

export interface DailyInfo {
  day: number;
  physics?: 1 | 2;
  seed: number;
  mode: Mode;
  table: string;
  reward: number;
  ends: number;
  board: { name: string; score: number }[];
  best: number | null;
  cue: CueSpec;
}
