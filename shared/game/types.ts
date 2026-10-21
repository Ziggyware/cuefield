import type { Mode } from "../catalog.ts";
import type { StrikeInput } from "../physics/strike.ts";
import type { Ball } from "../physics/types.ts";

export type Group = 0 | 1 | 2;
export type BallInHand = 0 | 1 | 2;

export interface GameState {
  mode: Mode;
  table: string;
  balls: Ball[];
  turn: 0 | 1;
  shot: number;
  broken: boolean;
  groups: [Group, Group];
  bih: BallInHand;
  fouls: [number, number];
  winner: -1 | 0 | 1;
  last: Report | null;
  stats?: [import("../rewards.ts").RackStats, import("../rewards.ts").RackStats];
  seed?: number;
  score?: [number, number];
}

export interface StrikeCmd extends StrikeInput {
  k: "strike";
  place?: [number, number];
  call?: number;
  tipChalk?: number;
  handChalk?: number;
}

export type Cmd = StrikeCmd | { k: "timeout" } | { k: "concede" };

export type Foul =
  | "scratch"
  | "no-contact"
  | "wrong-ball"
  | "no-rail"
  | "bad-break"
  | "timeout"
  | null;

export type End = "eight" | "nine" | "ten" | "points" | "eight-early" | "eight-foul" | "eight-pocket" | "three-fouls" | null;

export interface Report {
  by: 0 | 1;
  foul: Foul;
  pocketed: number[];
  keep: boolean;
  respot: number[];
  win: -1 | 0 | 1;
  hit: number;
  need: number;
  uncalled: boolean;
  points?: number;
  assign: Group;
  end: End;
}

export interface ShotFacts {
  first: number;
  railAfter: boolean;
  railBalls: number;
  pocketed: number[];
  pockets: Map<number, number>;
  scratch: boolean;
}
