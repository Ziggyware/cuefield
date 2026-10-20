import type { PrefKey } from "./store.ts";

export type Control =
  | { kind: "toggle" }
  | { kind: "range"; min: number; max: number; step: number; unit?: string; fmt?: (v: number) => string }
  | { kind: "select"; options: [string | number, string][] }
  | { kind: "color" };

export interface Def {
  k: PrefKey;
  label: string;
  note: string;
  c: Control;
}

export const T = { kind: "toggle" } as const;
export const pct = (v: number) => `${Math.round(v * 100)}%`;
export const x = (v: number) => `${v.toFixed(2)}×`;

export type Group = { title: string; note?: string; defs: Def[] };
