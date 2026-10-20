import type { Mode } from "../catalog.ts";
import type { StrikeInput } from "../physics/strike.ts";
import type { Ball } from "../physics/types.ts";

/** 0 open/none, 1 solids, 2 stripes. */
export type Group = 0 | 1 | 2;
/** 0 none, 1 behind the head string, 2 anywhere. */
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
  /** Rack seed; with the shot number it fixes each stroke's wobble. Absent on matches created before it existed. */
  seed?: number;
  /** Rotation points per seat. */
  score?: [number, number];
}

export interface StrikeCmd extends StrikeInput {
  k: "strike";
  place?: [number, number];
  call?: number;
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

/** Why the rack ended, when it did. */
export type End = "eight" | "nine" | "ten" | "points" | "eight-early" | "eight-foul" | "eight-pocket" | "three-fouls" | null;

export interface Report {
  by: 0 | 1;
  foul: Foul;
  pocketed: number[];
  keep: boolean;
  respot: number[];
  win: -1 | 0 | 1;
  /** First ball the cue ball touched (−1 none) and the ball or group the rules required. */
  hit: number;
  need: number;
  /** Balls dropped, none in the called pocket: no foul, turn passes. */
  uncalled: boolean;
  /** Rotation: points this shot scored for the shooter. */
  points?: number;
  /** Group claimed by the shooter on this shot (8-ball open table). */
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
