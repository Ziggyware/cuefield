/**
 * Run this script via Node.js to patch your local codebase 
 * and push the changes directly to your Val Town project.
 * 
 * Usage: node updateProject.js
 */
const fs = require('fs');
const path = require('path');

const PROJECT_ID = "b321dc81-fd21-4e46-8e09-feb1275549e6";
const API_KEY = process.env.VT;

const payload = `
// === FILE: frontend/aim.ts ===
import type { CueSpec } from "../shared/catalog.ts";
import type { StrikeCmd } from "../shared/game/types.ts";
import { prefs } from "./prefs/store.ts";

/** angle rad (world), power 0..1, tip −1..1 (y up), elev rad. */
export interface Aim {
  angle: number;
  power: number;
  tx: number;
  ty: number;
  elev: number;
  tipChalk: number;
  handChalk: number;
}

export function toCmd(a: Aim, cue: CueSpec, power: number, place?: [number, number], call?: number): StrikeCmd {
  const r = Math.hypot(a.tx, a.ty), k = r > 1 ? 1 / r : 1;
  const cmd: StrikeCmd = {
    k: "strike",
    dx: Math.round(Math.cos(a.angle) * 1e6),
    dy: Math.round(Math.sin(a.angle) * 1e6),
    power: Math.max(1, Math.min(1000, Math.round(Math.pow(power, prefs.powerCurve) * 1000))),
    tx: Math.round(a.tx * k * 1000),
    ty: Math.round(a.ty * k * 1000),
    el: Math.min(cue.elev, Math.round(Math.tan(a.elev / 2) * 1e4)),
    tipChalk: Math.round(a.tipChalk * 1000) / 1000,
    handChalk: Math.round(a.handChalk * 1000) / 1000,
  };
  if (place) cmd.place = [Math.round(place[0] * 1e5) / 1e5, Math.round(place[1] * 1e5) / 1e5];
  if (call !== undefined) cmd.call = call;
  return cmd;
}

export const maxElev = (cue: CueSpec) => 2 * Math.atan(cue.elev / 1e4);

export { type Preview, preview } from "./preview.ts";

// === FILE: shared/game/types.ts ===
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

// === FILE: shared/physics/types.ts ===
export interface Ball {
  id: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  wx: number;
  wy: number;
  wz: number;
  on: boolean;
}

export interface Cloth {
  muSlide: number;
  muRoll: number;
  muSpin: number;
  eCushion: number;
}

export interface Segment {
  ax: number;
  ay: number;
  nx: number;
  ny: number;
  tx: number;
  ty: number;
  len: number;
}

export interface Pocket {
  x: number;
  y: number;
  dx: number;
  dy: number;
  half: number;
  depth: number;
  taper: number;
  hx: number;
  hy: number;
  hr: number;
}

export interface Geometry {
  L: number;
  W: number;
  segments: Segment[];
  points: { x: number; y: number }[];
  pockets: Pocket[];
  cloth: Cloth;
}

export type SimEvent =
  | { k: "ball"; t: number; a: number; b: number; j: number }
  | { k: "rail"; t: number; a: number; j: number }
  | { k: "pocket"; t: number; a: number; p: number };

// === FILE: shared/game/rack.ts ===
import type { Mode } from "../catalog.ts";
import { R } from "../physics/constants.ts";
import type { Ball } from "../physics/types.ts";

export function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(a: T[], r: () => number): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    const t = a[i];
    a[i] = a[j];
    a[j] = t;
  }
  return a;
}

export const ball = (id: number, x: number, y: number, on = true): Ball => ({ id, x, y, z: 0, vx: 0, vy: 0, vz: 0, wx: 0, wy: 0, wz: 0, on });

const ROWS: Record<Mode, number[]> = { 8: [1, 2, 3, 4, 5], 9: [1, 2, 3, 2, 1], 10: [1, 2, 3, 4], 15: [1, 2, 3, 4, 5] };

export function rack(mode: Mode, L: number, seed: number): Ball[] {
  const r = rng(seed);
  const d = 2 * R + 2e-5;
  const h = (d * Math.sqrt(3)) / 2;
  const fx = L / 4;
  const slots: [number, number][] = [];
  ROWS[mode].forEach((n, i) => {
    for (let j = 0; j < n; j++) slots.push([fx + i * h, (j - (n - 1) / 2) * d]);
  });

  let order: number[];
  if (mode === 8) {
    const solids = shuffle([1, 2, 3, 4, 5, 6, 7], r);
    const stripes = shuffle([9, 10, 11, 12, 13, 14, 15], r);
    const flip = r() < 0.5;
    const cornerA = flip ? solids.pop()! : stripes.pop()!;
    const cornerB = flip ? stripes.pop()! : solids.pop()!;
    const rest = shuffle([...solids, ...stripes], r);
    order = [];
    for (let i = 0; i < 15; i++) {
      if (i === 4) order.push(8);
      else if (i === 10) order.push(cornerA);
      else if (i === 14) order.push(cornerB);
      else order.push(rest.pop()!);
    }
  } else if (mode === 15) {
    const rest = shuffle([4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14], r);
    order = slots.map((_, i) => (i === 0 ? 1 : i === 4 ? 15 : i === 10 ? 2 : i === 14 ? 3 : rest.pop()!));
  } else {
    const n = mode === 9 ? 9 : 10;
    const rest = shuffle(Array.from({ length: n - 2 }, (_, i) => i + 2), r);
    order = slots.map((_, i) => (i === 0 ? 1 : i === 4 ? n : rest.pop()!));
  }

  const balls: Ball[] = [ball(0, -L / 4, 0)];
  slots.forEach(([x, y], i) => {
    balls.push(ball(order[i], x + (r() - 0.5) * 2e-5, y + (r() - 0.5) * 2e-5));
  });
  balls.sort((a, b) => a.id - b.id);
  return balls;
}

export function respot(balls: Ball[], b: Ball, L: number): void {
  const free = (x: number) => balls.every((o) => o === b || !o.on || (o.x - x) * (o.x - x) + o.y * o.y >= 4 * R * R);
  const step = 2 * R + 1e-4;
  let x = L / 4;
  while (x < L / 2 - R && !free(x)) x += step;
  if (x >= L / 2 - R) {
    x = L / 4;
    while (!free(x)) x -= step;
  }
  b.x = x;
  b.y = 0;
  b.z = 0;
  b.on = true;
  b.vx = 0;
  b.vy = 0;
  b.vz = 0;
  b.wx = 0;
  b.wy = 0;
  b.wz = 0;
}

// === FILE: shared/physics/strike.ts ===
import type { CueSpec } from "../catalog.ts";
import type { StrikeCmd } from "../game/types.ts";
import { INERTIA, MASS, R } from "./constants.ts";
import type { Ball } from "./types.ts";

export interface StrikeInput {
  dx: number;
  dy: number;
  power: number;
  tx: number;
  ty: number;
  el: number;
}

export function clampInput(i: StrikeInput, cue: CueSpec): StrikeInput {
  const r = Math.sqrt(i.tx * i.tx + i.ty * i.ty);
  const k = r > 1000 ? 1000 / r : 1;
  return {
    dx: Math.round(i.dx),
    dy: Math.round(i.dy),
    power: Math.max(1, Math.min(1000, Math.round(i.power))),
    tx: Math.round(i.tx * k),
    ty: Math.round(i.ty * k),
    el: Math.max(0, Math.min(cue.elev, Math.round(i.el))),
  };
}

export function strike(cueBall: Ball, raw: StrikeCmd, cue: CueSpec, wobble = 0): void {
  const inp = clampInput(raw, cue);
  
  const tc = raw.tipChalk || 0;
  const hc = raw.handChalk || 0;
  
  let w = wobble * (1 - 0.3 * hc);
  w *= (1 - 0.4 * tc);
  
  const hn = Math.sqrt(inp.dx * inp.dx + inp.dy * inp.dy);
  let hx = inp.dx / hn, hy = inp.dy / hn;
  if (w !== 0) {
    const w2 = w * w, c0 = (1 - w2) / (1 + w2), s0 = (2 * w) / (1 + w2);
    const rx = hx * c0 - hy * s0;
    hy = hx * s0 + hy * c0;
    hx = rx;
  }
  const a = (inp.tx / 1000) * cue.spin * R;
  const b = (inp.ty / 1000) * cue.spin * R;
  const t = inp.el / 10000;
  const sinT = (2 * t) / (1 + t * t);
  const cosT = (1 - t * t) / (1 + t * t);

  const ar = a / R;
  const rest = 1 - ar * ar;
  const tanA = (2.5 * ar * Math.sqrt(rest)) / (1 + MASS / cue.endMass + 2.5 * rest);
  const sx0 = hy, sy0 = -hx;
  const qx = hx - tanA * sx0, qy = hy - tanA * sy0;
  const qn = Math.sqrt(qx * qx + qy * qy);
  hx = qx / qn;
  hy = qy / qn;

  const sx = hy, sy = -hx;
  const dx = hx * cosT, dy = hy * cosT, dz = -sinT;
  let ux = sy * dz, uy = -sx * dz, uz = sx * dy - sy * dx;
  const un = Math.sqrt(ux * ux + uy * uz + uz * uz);
  ux /= un;
  uy /= un;
  uz /= un;
  if (uz < 0) {
    ux = -ux;
    uy = -uy;
    uz = -uz;
  }
  const c = Math.sqrt(R * R - a * a - b * b);
  const Qx = a * sx + b * ux - c * dx;
  const Qy = a * sy + b * uy - c * dy;
  const Qz = b * uz - c * dz;

  const V = cue.speed * (inp.power / 1000);
  const F = ((1 + cue.tipE * (1 + 0.15 * tc)) * V) / (1 / cue.mass + 1 / MASS + (a * a + b * b) / INERTIA);
  
  cueBall.vx = (F * dx) / MASS;
  cueBall.vy = (F * dy) / MASS;
  
  if (dz < -0.1) {
    cueBall.vz = Math.abs((F * dz) / MASS) * 0.6;
  } else {
    cueBall.vz = 0;
  }
  
  cueBall.wx = (F * (Qy * dz - Qz * dy)) / INERTIA;
  cueBall.wy = (F * (Qz * dx - Qx * dz)) / INERTIA;
  cueBall.wz = (F * (Qx * dy - Qy * dx)) / INERTIA;
}

// === FILE: shared/physics/motion.ts ===
import { EPS_V, G, R, SPIN_K } from "./constants.ts";
import type { Ball, Cloth } from "./types.ts";

export function slip(b: Ball): number {
  const ux = b.vx - R * b.wy, uy = b.vy + R * b.wx;
  return Math.sqrt(ux * ux + uy * uy);
}

export function moving(b: Ball): boolean {
  if (!b.on) return false;
  if (b.vx * b.vx + b.vy * b.vy > EPS_V * EPS_V) return true;
  if (b.z > 0 || Math.abs(b.vz) > EPS_V) return true;
  return slip(b) > EPS_V;
}

function decaySpin(b: Ball, h: number, c: Cloth) {
  const d = SPIN_K * c.muSpin * G * h;
  if (b.wz > d) b.wz -= d;
  else if (b.wz < -d) b.wz += d;
  else b.wz = 0;
}

export function advance(b: Ball, h: number, c: Cloth): void {
  let rem = h;
  
  if (b.z > 0 || b.vz !== 0) {
    b.z += b.vz * rem - 0.5 * G * rem * rem;
    b.vz -= G * rem;
    if (b.z <= 0) {
      b.z = 0;
      b.vz = -b.vz * 0.5;
      if (Math.abs(b.vz) < 0.1) b.vz = 0;
    }
  }

  for (let guard = 0; guard < 4 && rem > 0; guard++) {
    const ux = b.vx - R * b.wy, uy = b.vy + R * b.wx;
    const us = Math.sqrt(ux * ux + uy * uy);
    if (us > EPS_V) {
      const ts = us / (3.5 * c.muSlide * G);
      const ends = ts <= rem;
      const dt = ends ? ts : rem;
      const ex = ux / us, ey = uy / us;
      const a = c.muSlide * G;
      b.x += b.vx * dt - 0.5 * a * ex * dt * dt;
      b.y += b.vy * dt - 0.5 * a * ey * dt * dt;
      b.vx -= a * ex * dt;
      b.vy -= a * ey * dt;
      const k = SPIN_K * a * dt;
      b.wx -= k * ey;
      b.wy += k * ex;
      if (ends) {
        b.wx = -b.vy / R;
        b.wy = b.vx / R;
      }
      decaySpin(b, dt, c);
      rem -= dt;
      continue;
    }
    const s = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
    if (s > EPS_V) {
      const a = c.muRoll * G;
      const tr = s / a;
      const stops = tr <= rem;
      const dt = stops ? tr : rem;
      const ex = b.vx / s, ey = b.vy / s;
      const d = s * dt - 0.5 * a * dt * dt;
      b.x += ex * d;
      b.y += ey * d;
      const ns = stops ? 0 : s - a * dt;
      b.vx = ex * ns;
      b.vy = ey * ns;
      b.wx = -b.vy / R;
      b.wy = b.vx / R;
      decaySpin(b, dt, c);
      rem -= dt;
      continue;
    }
    b.vx = 0;
    b.vy = 0;
    b.wx = 0;
    b.wy = 0;
    decaySpin(b, rem, c);
    rem = 0;
  }
}

// === FILE: backend/turns.ts ===
import { concede, play, timeout } from "../shared/game/engine.ts";
import type { Cmd, GameState } from "../shared/game/types.ts";
import { hash, validate } from "../shared/game/validate.ts";
import { q } from "./db.ts";
import { clockOf, createMatch, loadMatch, type Match } from "./match.ts";
import { payout } from "./payout.ts";

export const STALE_MS = 45_000;
const ANIM_GRACE_MS = 8_000;

async function commit(m: Match, state: GameState, entry: unknown, deadline: number, reason: string | null): Promise<boolean> {
  const done = state.winner >= 0;
  const rows = await q(
    \`UPDATE matches SET state = ?, log = ?, version = version + 1, deadline = ?, status = ?, winner = ?, reason = ?, ended = ?
     WHERE id = ? AND version = ? AND status = 'live' RETURNING id\`,
    [
      JSON.stringify(state),
      JSON.stringify([...m.log, entry]),
      deadline,
      done ? "done" : "live",
      state.winner,
      done ? reason : null,
      done ? Date.now() : null,
      m.id,
      m.version,
    ],
  );
  if (!rows.length) return false;
  if (done) await payout(m, state.winner as 0 | 1);
  return true;
}

export type ShotResult = { ok: true; hash: string; version: number } | { error: string; status?: number };

export async function submit(m: Match, seat: 0 | 1, cmd: Cmd, shot: number): Promise<ShotResult> {
  if (m.status !== "live") return { error: "over", status: 409 };
  const st = m.state;
  if (cmd.k === "concede") {
    const next = concede(st, seat);
    return (await commit(m, next, { by: seat, cmd }, m.deadline, "concede"))
      ? { ok: true, hash: hash(next), version: m.version + 1 }
      : { error: "race", status: 409 };
  }
  if (st.turn !== seat) return { error: "turn", status: 409 };
  if (st.shot !== shot) return { error: "seq", status: 409 };
  if (cmd.k !== "strike") return { error: "cmd", status: 400 };
  const cue = m.cue[seat];
  const err = validate(st, cmd, cue);
  if (err) return { error: err, status: 400 };
  
  const { state, sim } = play(st, cmd, cue);
  
  if (state.last?.foul && m.stake > 0) {
    const foulFine = 5;
    await q(\`UPDATE players SET coins = MAX(0, coins - ?) WHERE id = ?\`, [foulFine, m.p[seat]]);
  }
  
  const deadline = Date.now() + Math.ceil(sim.t * 1000) + clockOf(m) + ANIM_GRACE_MS;
  return (await commit(m, state, { by: seat, cmd }, deadline, "win"))
    ? { ok: true, hash: hash(state), version: m.version + 1 }
    : { error: "race", status: 409 };
}

async function abandon(m: Match): Promise<void> {
  const rows = await q(
    \`UPDATE matches SET status = 'done', winner = -1, reason = 'abandoned', ended = ?, version = version + 1 WHERE id = ? AND version = ? AND status = 'live' RETURNING id\`,
    [Date.now(), m.id, m.version],
  );
  if (rows.length && m.stake > 0) await q(\`UPDATE players SET coins = coins + ? WHERE id IN (?, ?)\`, [m.stake, m.p[0], m.p[1]]);
}

export async function tick(m: Match, now = Date.now()): Promise<Match> {
  if (m.status !== "live") return m;
  const stale = m.clock === null ? ([0, 1] as const).filter((s) => now - m.seen[s] > STALE_MS) : [];
  if (stale.length === 2) {
    await abandon(m);
    return (await loadMatch(m.id)) ?? m;
  }
  if (stale.length === 1) {
    const s = stale[0];
    await commit(m, concede(m.state, s), { by: s, cmd: { k: "forfeit" } }, m.deadline, "forfeit");
    return (await loadMatch(m.id)) ?? m;
  }
  if (now > m.deadline) {
    const next = timeout(m.state);
    if (m.stake > 0) {
      await q(\`UPDATE players SET coins = MAX(0, coins - ?) WHERE id = ?\`, [5, m.p[m.state.turn]]);
    }
    await commit(m, next, { by: m.state.turn, cmd: { k: "timeout" } }, now + clockOf(m) + ANIM_GRACE_MS, "timeouts");
    return (await loadMatch(m.id)) ?? m;
  }
  return m;
}

export async function heartbeat(m: Match, seat: 0 | 1): Promise<void> {
  m.seen[seat] = Date.now();
  await q(\`UPDATE matches SET seen\${seat} = ? WHERE id = ?\`, [m.seen[seat], m.id]);
}

export async function rematch(m: Match, seat: 0 | 1): Promise<string | null> {
  if (m.status !== "done") return null;
  if (m.next) return m.next;
  await q(\`UPDATE matches SET rematch\${seat} = 1 WHERE id = ?\`, [m.id]);
  const fresh = await loadMatch(m.id);
  if (!fresh || !fresh.rematch[0] || !fresh.rematch[1] || fresh.next) return fresh?.next ?? null;
  const claim = await q(\`UPDATE matches SET next_id = 'pending' WHERE id = ? AND next_id IS NULL RETURNING id\`, [m.id]);
  if (!claim.length) return null;
  const id = await createMatch(m.p[1], m.p[0], m.mode, m.table, m.ranked, undefined, { assist: m.assist, clock: m.clock });
  await q(\`UPDATE matches SET next_id = ? WHERE id = ?\`, [id ?? "none", m.id]);
  return id;
}

// === FILE: frontend/render/shaders-table.ts ===
import { COMMON } from "./shaders.ts";

export const TABLE_FS = COMMON + \`
in vec2 vP;out vec4 o;
uniform vec2 uH;uniform float uRail,uCush,uPx;
uniform vec3 uCloth,uRailC,uSight;
uniform vec4 uPk[6];uniform float uHalf[6];uniform float uTaper[6];uniform vec3 uHole[6];
const float FLOOR=.76;

float hash(vec2 p) {
    vec3 p3  = fract(vec3(p.xyx) * .1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}

float box(vec2 p,vec2 h){vec2 a=abs(p)-h;return max(a.x,a.y);}

vec3 floorCol(vec2 p){
  vec3 P=vec3(p,-FLOOR);float e=0.;
  for(int i=0;i<2;i++){
    vec3 d=uLamp[i]-P;float r2=max(dot(d,d),1e-5);float k=FLOOR/max(d.z,1e-5);vec2 q=p+d.xy*k;
    float pen=.12*FLOOR/max(uLamp[i].z+FLOOR,1e-5)+.01;
    e+=d.z*inversesqrt(r2)/r2*smoothstep(-pen,pen,box(q,uH+uRail));
  }
  return vec3(.050,.048,.044)*e/uE0;
}

void main(){
  vec2 p=vP,a=abs(p);
  float outer=box(p,uH+uRail);
  if(outer>uPx){o=vec4(srgb(grade(floorCol(p))),1.0);return;}
  float hole=1e9,throat=1e9;
  for(int i=0;i<6;i++){
    vec2 r=p-uPk[i].xy;float s=dot(r,uPk[i].zw);float lat=abs(r.x*uPk[i].w-r.y*uPk[i].z);
    throat=min(throat,max(lat-(uHalf[i]-max(s,0.)*uTaper[i]),-s));
    hole=min(hole,length(p-uHole[i].xy)-uHole[i].z);
  }
  float play=box(p,uH),cush=box(p,uH+uCush);
  vec3 cloth=lin(uCloth),alb;
  
  float grain = mix(0.94, 1.06, hash(p * 800.0));
  cloth *= grain;
  
  vec3 p_irr=vec3(p,0.0);
  vec3 n_irr=vec3(0.0,0.0,1.0);
  bool endRail=a.x-uH.x>a.y-uH.y;
  
  if(play<0.||(throat<0.&&cush<0.)){
    alb=cloth;
    float mk=min(min(length(p-vec2(uH.x*.5,0.)),length(p-vec2(-uH.x*.5,0.))),length(p));
    float line=max(abs(p.x+uH.x*.5)-.0007,0.)+max(a.y-uH.y,0.);
    alb=mix(alb,vec3(.78,.77,.72),(1.-smoothstep(.0055-uPx,.0055+uPx,mk))+.35*(1.-smoothstep(0.,uPx*1.5,line)));
  }else if(cush<0.){
    float t=clamp(endRail?(a.x-uH.x)/uCush:(a.y-uH.y)/uCush,0.,1.);
    n_irr=normalize(endRail?vec3(-sign(p.x)*(.75-.6*t),0.0,1.0):vec3(0.0,-sign(p.y)*(.75-.6*t),1.0));
    p_irr=vec3(p,.03);
    alb=cloth*.95;
  }else{
    float e=-outer;vec2 out2=endRail?vec2(sign(p.x),0.0):vec2(0.0,sign(p.y));
    n_irr=normalize(vec3(out2*(1.-smoothstep(0.,.014,e))*.9,1.0));
    p_irr=vec3(p,.045);
    vec2 sp=endRail?vec2(a.x-uH.x-(uRail+uCush)*.5,mod(p.y+uH.y*.5,uH.y*.5)-uH.y*.25):vec2(mod(p.x+uH.x*.25,uH.x*.25)-uH.x*.125,a.y-uH.y-(uRail+uCush)*.5);
    vec2 dd=abs(endRail?sp.yx:sp);float dm=dd.x/.011+dd.y/.0055-1.;
    float sightMask=smoothstep(-uPx/.0055,uPx/.0055,dm);
    float rim=1.-smoothstep(.012-uPx,.012+uPx,hole);
    
    vec3 woodCol = lin(uRailC) * mix(0.96, 1.04, hash(p * 200.0));
    alb=mix(lin(uSight)*1.1, woodCol, sightMask);
    alb=mix(alb,vec3(.018,.011,.007),rim);
    n_irr=mix(vec3(0.0,0.0,1.0),n_irr,max(sightMask,rim)); 
  }
  
  vec3 col=alb*irr(p_irr,n_irr);
  vec3 hc=cloth*.02*smoothstep(-uHalf[0],0.,hole)+vec3(.002);
  col=mix(hc,col,smoothstep(-uPx,uPx,hole));
  o=vec4(srgb(grade(col)),1.0);
}\`;

// === FILE: frontend/render/shaders-ball.ts ===
import { COMMON } from "./shaders.ts";

export const BALL_VS = \`#version 300 es
in vec2 aQ;in vec2 aC;in float aId;in vec3 aR0;in vec3 aR1;in vec3 aR2;in vec3 aCol;
uniform mat3 uClip;uniform float uR,uScale;
out vec2 vQ;out vec2 vC;flat out int vId;out vec3 r0;out vec3 r1;out vec3 r2;out vec3 vCol;
void main(){vQ=aQ*uScale;vC=aC;vId=int(aId+.5);r0=aR0;r1=aR1;r2=aR2;vCol=aCol;
gl_Position=vec4((uClip*vec3(aC+vQ*uR,1.0)).xy,0.0,1.0);}\`;

export const BALL_FS = COMMON + \`
in vec2 vQ;in vec2 vC;flat in int vId;in vec3 r0;in vec3 r1;in vec3 r2;in vec3 vCol;out vec4 o;
uniform float uR,uPx;uniform vec3 uCloth;uniform sampler2D uAtlas;
const vec3 IVORY=vec3(.80,.78,.70);
void main(){
  float d=length(vQ);float al=1.-smoothstep(1.-uPx/uR,1.+uPx/uR,d);if(al<=0.)discard;
  vec3 n=vec3(vQ,sqrt(max(0.,1.-d*d)));
  vec3 l=transpose(mat3(r0,r1,r2))*n;
  vec3 alb;
  if(vId==0){alb=IVORY;float m=max(abs(l.x),max(abs(l.y),abs(l.z)));if(m>.982)alb=vec3(.55,.03,.03);}
  else{
    vec3 base=lin(vCol);
    alb=vId>8?(abs(l.z)<.56?base:IVORY):base;
    vec2 uv=vec2(l.y*sign(l.x),l.z)/.436*.5+.5;
    int c=vId-1;
    vec2 cell=(vec2(float(c%4),float(3-c/4))+clamp(uv,0.,1.))/4.;
    float atlasMask=texture(uAtlas,cell).r;
    if(abs(l.x)>.9){
      alb=mix(IVORY,vec3(.012),atlasMask);
    }
  }
  vec3 P=vec3(vC,uR)+n*uR,V=vec3(0.0,0.0,1.0),col=vec3(0.0);
  const float A2=.0144;const float F0=.045;
  for(int i=0;i<2;i++){
    vec3 Ld=uLamp[i]-P;float r2=max(dot(Ld,Ld),1e-5);vec3 L=Ld*inversesqrt(r2);
    float nl=max(dot(n,L),0.),nv=max(n.z,1e-3);vec3 H=normalize(L+V);float nh=max(dot(n,H),0.);
    float D=A2/(3.14159*pow(max(nh*nh*(A2-1.)+1.,1e-5),2.));
    float k=A2*.5;float Gs=(nl/(nl*(1.-k)+k))*(nv/(nv*(1.-k)+k));
    float F=F0+(1.-F0)*pow(max(1.-max(dot(H,V),0.),1e-5),5.);
    float E=inversesqrt(r2)/r2/uE0;
    col+=(alb*(1.-F)*nl+vec3(D*F*Gs/(4.*nv+1e-4)))*E;
  }
  col+=alb*(.06+.22*lin(uCloth)*(1.-n.z));
  float rz=2.*n.z*n.z-1.;float Fr=F0+(1.-F0)*pow(max(1.-n.z,1e-5),5.);
  col+=Fr*lin(uCloth)*.85*smoothstep(0.,-.35,rz);
  o=vec4(srgb(grade(col)),al);
}\`;

export const SHADOW_FS = COMMON + \`
in vec2 vQ;in vec2 vC;out vec4 o;
uniform float uR;
void main(){
  vec2 p=vC+vQ*uR;float f=1.;
  for(int i=0;i<2;i++){
    vec3 L=uLamp[i];float k=uR/max(L.z-uR,1e-5);vec2 sc=vC+(vC-L.xy)*k;float sr=uR*L.z/max(L.z-uR,1e-5);
    float pen=.14*uR/max(L.z-uR,1e-5)*L.z+.004;
    f-=.40*(1.-smoothstep(sr-pen,sr+pen,length(p-sc)));
  }
  float c=length(p-vC)/uR;f-=.22*exp(-c*c*2.5);
  o=vec4(vec3(max(f,0.)),1.0);
}\`;

// === FILE: frontend/render/shaders.ts ===
export const COMMON = \`#version 300 es
precision highp float;
uniform vec3 uLamp[2];
uniform float uE0;
uniform vec3 uGrade;
vec3 grade(vec3 c){
  c*=uGrade.x;
  float l=dot(c,vec3(.2126,.7152,.0722));
  c=max(mix(vec3(l),c,uGrade.y),1e-5);
  c=.18*pow(max(c/.18,1e-5),vec3(uGrade.z));
  return mix(c,.8+.2*(1.-exp(-(c-.8)/.2)),step(.8,c));
}
vec3 srgb(vec3 c){
  c=clamp(c,1e-5,1.);
  return mix(c*12.92,1.055*pow(c,vec3(1./2.4))-.055,step(.0031308,c));
}
vec3 lin(vec3 c){
  return mix(c/12.92,pow(max((c+.055)/1.055,1e-5),vec3(2.4)),step(.04045,c));
}
float irr(vec3 p,vec3 n){
  float e=0.;
  for(int i=0;i<2;i++){
    vec3 d=uLamp[i]-p;
    float r2=max(dot(d,d),1e-5);
    e+=max(dot(n,d),0.)*inversesqrt(r2)/r2;
  }
  return e/uE0;
}
\`;

export const QUAD_VS = \`#version 300 es
in vec2 aP;
uniform mat3 uClip;
out vec2 vP;
void main(){vP=aP;gl_Position=vec4((uClip*vec3(aP,1.0)).xy,0.0,1.0);}\`;

// === FILE: frontend/render/renderer.ts ===
import type { TableSpec } from "../../shared/catalog.ts";
import { R } from "../../shared/physics/constants.ts";
import type { Ball, Geometry } from "../../shared/physics/types.ts";
import { RAIL, type View } from "../view.ts";
import { tablePass } from "./table-pass.ts";
import { TableCache } from "./table-cache.ts";
import { numberAtlas } from "./atlas.ts";
import { attrib, buffer, type Prog, program } from "./gl.ts";
import { QUAD_VS } from "./shaders.ts";
import { hexRgb, paletteHex } from "../prefs/look.ts";
import { prefs } from "../prefs/store.ts";
import { TABLE_FS } from "./shaders-table.ts";
import { BALL_FS, BALL_VS, SHADOW_FS } from "./shaders-ball.ts";

const LAMP_H = 1.0;
const CONTRAST = 1.08;
const STRIDE = 15;

export class Renderer {
  gl: WebGL2RenderingContext;
  table: Prog;
  ball: Prog;
  shadow: Prog;
  quad: WebGLBuffer;
  tableBuf: WebGLBuffer;
  inst: WebGLBuffer;
  data = new Float32Array(16 * STRIDE);
  atlas: WebGLTexture | null = null;
  spec: TableSpec | null = null;
  geo: Geometry | null = null;
  cache: TableCache;

  constructor(canvas: HTMLCanvasElement) {
    const gl = canvas.getContext("webgl2", { antialias: false, alpha: false, premultipliedAlpha: false });
    if (!gl) throw new Error("webgl2");
    this.gl = gl;
    this.table = program(gl, QUAD_VS, TABLE_FS);
    this.ball = program(gl, BALL_VS, BALL_FS);
    this.shadow = program(gl, BALL_VS, SHADOW_FS);
    this.quad = buffer(gl, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    this.tableBuf = buffer(gl, new Float32Array(8), gl.DYNAMIC_DRAW);
    this.inst = buffer(gl, this.data, gl.DYNAMIC_DRAW);
    this.cache = new TableCache(gl);
    numberAtlas(gl).then((t) => (this.atlas = t));
  }

  setTable(spec: TableSpec, geo: Geometry): void {
    this.spec = spec;
    this.geo = geo;
    const ex = spec.L / 2 + RAIL + 4, ey = spec.W / 2 + RAIL + 4, gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.tableBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-ex, -ey, ex, -ey, -ex, ey, ex, ey]), gl.STATIC_DRAW);
  }

  private lamps(p: Prog): void {
    const gl = this.gl, L = this.spec!.L;
    gl.uniform3fv(p.u("uLamp"), [-L / 4, 0, LAMP_H, L / 4, 0, LAMP_H]);
    const d2 = (L / 4) * (L / 4) + LAMP_H * LAMP_H;
    gl.uniform1f(p.u("uE0"), (2 * LAMP_H) / Math.pow(d2, 1.5));
    gl.uniform3f(p.u("uGrade"), prefs.exposure, prefs.saturation, CONTRAST);
  }

  cloth(): [number, number, number] {
    return prefs.clothCustom ? hexRgb(prefs.clothHex) : this.spec!.cloth;
  }

  clear(): void {
    this.gl.clearColor(0.031, 0.035, 0.039, 1);
    this.gl.clear(this.gl.COLOR_BUFFER_BIT);
  }

  draw(view: View, balls: Ball[], orient: Float32Array): void {
    const gl = this.gl, spec = this.spec, geo = this.geo;
    if (!spec || !geo) return;
    const cv = gl.canvas as HTMLCanvasElement;
    const W = Math.round(view.w * view.dpr), H = Math.round(view.h * view.dpr);
    if (cv.width !== W || cv.height !== H) {
      cv.width = W;
      cv.height = H;
    }
    const clip = view.clip();
    const px = 1 / (view.s * view.dpr), cloth = this.cloth();
    const key = \`\${spec.id}|\${clip.join()}|\${cloth.join()}|\${prefs.exposure},\${prefs.saturation}\`;
    this.cache.draw(W, H, key, this.quad, () => tablePass(gl, this.table, this.tableBuf, spec, cloth, geo, clip, px, (p) => this.lamps(p)));
    gl.enable(gl.BLEND);

    const pal = paletteHex().map(hexRgb);
    let n = 0;
    for (const b of balls) {
      if (!b.on) continue;
      const o = n * STRIDE;
      this.data[o] = b.x;
      this.data[o + 1] = b.y;
      this.data[o + 2] = b.id;
      this.data.set(orient.subarray(b.id * 9, b.id * 9 + 9), o + 3);
      
      const c = pal[b.id] ?? pal[0];
      this.data[o + 12] = c[0];
      this.data[o + 13] = c[1];
      this.data[o + 14] = c[2];
      
      n++;
    }
    if (!n) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.inst);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.data.subarray(0, n * STRIDE));

    const bind = (p: Prog, scale: number) => {
      gl.useProgram(p.p);
      gl.uniformMatrix3fv(p.u("uClip"), false, clip);
      gl.uniform1f(p.u("uR"), R);
      gl.uniform1f(p.u("uScale"), scale);
      gl.uniform1f(p.u("uPx"), px);
      this.lamps(p);
      for (let i = 0; i < 8; i++) gl.disableVertexAttribArray(i);
      attrib(gl, p.a("aQ"), this.quad, 2, 2, 0, 0);
      for (const [a, sz, off] of [["aC", 2, 0], ["aId", 1, 2], ["aR0", 3, 3], ["aR1", 3, 6], ["aR2", 3, 9], ["aCol", 3, 12]] as const) {
        attrib(gl, p.a(a), this.inst, sz, STRIDE, off, 1);
      }
    };

    gl.blendFunc(gl.ZERO, gl.SRC_COLOR);
    bind(this.shadow, 2.6);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, n);

    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    bind(this.ball, 1.0);
    gl.uniform3fv(this.ball.u("uCloth"), cloth);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.atlas);
    gl.uniform1i(this.ball.u("uAtlas"), 0);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, n);
  }
}

// === FILE: frontend/ui/controls.ts ===
import type { Aim } from "../aim.ts";
import { h } from "../dom.ts";
import { toVirt, rotated } from "../screen.ts";
import { drag } from "./drag.ts";
import { prefs } from "../prefs/store.ts";
import { canVibrate } from "../game/motion.ts";

export interface ControlEvents {
  change(): void;
  shoot(power: number): void;
}

function getCenterAndSize(el: HTMLElement) {
  const r = el.getBoundingClientRect();
  const scx = r.left + r.width / 2;
  const scy = r.top + r.height / 2;
  const [cx, cy] = toVirt(scx, scy);
  
  const w = rotated() ? r.height : r.width;
  const h = rotated() ? r.width : r.height;
  return { cx, cy, w, h };
}

export class Controls {
  root: HTMLElement;
  power = h("div", { class: "power" }, h("i"), h("span", { class: "pct" }));
  fine = h("div", { class: "fine" });
  spin = h("div", { class: "spin" }, h("b"), h("i"));
  elev = h("div", { class: "elev" }, h("i"), h("span", { class: "v" }));
  
  tipBtn = h("button", { style: "height: 52px; font-weight: 600;" });
  handBtn = h("button", { style: "height: 52px; font-weight: 600;" });
  
  pull = 0;
  enabled = false;
  armed: HTMLElement;
  chalkGame: HTMLElement;
  activeRaf = 0;
  
  aim: Aim;
  maxElev: number;
  ev: ControlEvents;

  constructor(aim: Aim, maxElev: number, ev: ControlEvents) {
    this.aim = aim;
    this.aim.tipChalk = 0;
    this.aim.handChalk = 0;
    this.maxElev = maxElev;
    this.ev = ev;
    
    const pad = (el: HTMLElement) => h("div", { class: "hit" }, el);
    const powerHit = pad(this.power), fineHit = pad(this.fine), spinHit = pad(this.spin), elevHit = pad(this.elev);
    
    const [near, far] = prefs.leftHanded ? ["right", "left"] : ["left", "right"];
    this.armed = h("div", { class: "armed" });
    this.chalkGame = h("div");
    
    this.root = h(
      "div",
      { style: "position:absolute;inset:0;pointer-events:none" },
      h("div", { class: "ctl", style: \`\${near}:max(24px,env(safe-area-inset-\${near}));top:50%;transform:translateY(-50%)\` }, powerHit),
      h("div", { class: "ctl", style: \`\${far}:max(24px,env(safe-area-inset-\${far}));top:50%;transform:translateY(-50%)\` }, fineHit),
      h("div", { class: "bottom-tray" }, this.handBtn, this.tipBtn, elevHit, spinHit),
      this.chalkGame,
      this.armed,
    );
    this.root.style.opacity = "0.35";

    this.tipBtn.onclick = () => this.enabled && this.startTipGame();
    this.handBtn.onclick = () => this.enabled && this.startHandGame();

    let start = 0;
    drag(powerHit, (e, ph) => {
      if (!this.enabled) return;
      const y = toVirt(e.clientX, e.clientY)[1];
      if (ph === "down") start = y;
      const prev = this.pull;
      this.pull = Math.max(0, Math.min(1, (y - start) / (this.power.offsetHeight * 0.9)));
      if (Math.floor(prev * 4) !== Math.floor(this.pull * 4) && canVibrate()) navigator.vibrate(6);
      if (ph === "up") {
        const p = this.pull;
        this.pull = 0;
        if (p > 0.015) {
          if (prefs.strokeConfirm) {
            this.arm(p, ev);
          } else {
            ev.shoot(p);
            this.resetChalk();
          }
        }
      }
      this.paint();
      ev.change();
    });

    let last = 0;
    drag(fineHit, (e, ph) => {
      if (!this.enabled) return;
      const y = toVirt(e.clientX, e.clientY)[1];
      if (ph !== "down") this.aim.angle += (y - last) * 0.0003 * prefs.aimSensitivity;
      last = y;
      ev.change();
    });

    drag(spinHit, (e, ph) => {
      if (!this.enabled || ph === "up") return;
      const { cx, cy, w, h } = getCenterAndSize(this.spin);
      const [vx, vy] = toVirt(e.clientX, e.clientY);
      
      let x = (vx - cx) / (w / 2);
      let y = -(vy - cy) / (h / 2);
      
      const m = Math.hypot(x, y);
      if (m > 1) {
        x /= m;
        y /= m;
      }
      this.aim.tx = x;
      this.aim.ty = y;
      this.paint();
      ev.change();
    });
    
    spinHit.addEventListener("dblclick", () => {
      this.aim.tx = 0;
      this.aim.ty = 0;
      this.paint();
      ev.change();
    });

    drag(elevHit, (e) => {
      if (!this.enabled) return;
      const { cx, cy, w, h } = getCenterAndSize(this.elev);
      const [vx, vy] = toVirt(e.clientX, e.clientY);
      
      const pivotX = cx - w / 2 + 6;
      const pivotY = cy + h / 2 - 6;
      const a = Math.atan2(pivotY - vy, vx - pivotX);
      this.aim.elev = Math.max(0, Math.min(this.maxElev, a));
      this.paint();
      ev.change();
    });
    
    this.paint();
  }

  cancelMinigame() {
    cancelAnimationFrame(this.activeRaf);
    this.chalkGame.replaceChildren();
  }

  startTipGame() {
    this.cancelMinigame();
    const zone = h("div", { class: "chalk-zone" });
    const cursor = h("div", { class: "chalk-cursor" });
    const bar = h("div", { class: "chalk-bar" }, zone, cursor);
    
    let pos = 0, dir = 1, speed = 2.5 + Math.random();
    const loop = () => {
      pos += dir * speed;
      if (pos > 100) { pos = 100; dir = -1; }
      if (pos < 0) { pos = 0; dir = 1; }
      cursor.style.left = \`\${pos}%\`;
      this.activeRaf = requestAnimationFrame(loop);
    };
    this.activeRaf = requestAnimationFrame(loop);

    const apply = () => {
      cancelAnimationFrame(this.activeRaf);
      const dist = Math.abs(pos - 50);
      this.aim.tipChalk = Math.max(0, 1 - Math.max(0, dist - 10) / 30);
      this.paint();
      this.chalkGame.replaceChildren();
      this.ev.change();
    };
    
    this.chalkGame.replaceChildren(
      h("div", { class: "chalk-game" },
        h("div", { class: "chalk-title" }, h("b", { text: "TIP CHALK" }), h("br"), h("small", { class: "k", text: "TAP IN THE GREEN" })),
        bar,
        h("div", { class: "row" },
          h("button", { class: "primary", text: "APPLY", onclick: apply }),
          h("button", { text: "CANCEL", onclick: () => this.cancelMinigame() })
        )
      )
    );
  }

  startHandGame() {
    this.cancelMinigame();
    const fill = h("div", { class: "chalk-fill" });
    const bar = h("div", { class: "chalk-bar" }, fill);
    
    let charge = 0, lastX = 0, lastDir = 0;
    drag(bar, (e, ph) => {
      if (ph === 'down') lastX = e.clientX;
      else if (ph === 'move') {
        const dx = e.clientX - lastX;
        if (Math.abs(dx) > 5) {
          const dir = Math.sign(dx);
          if (dir !== lastDir) {
            charge += 0.08;
            lastDir = dir;
          }
          lastX = e.clientX;
          fill.style.width = \`\${Math.min(100, charge * 100)}%\`;
          if (charge >= 1) {
            this.aim.handChalk = 1;
            this.paint();
            this.cancelMinigame();
            this.ev.change();
          }
        }
      }
    });

    this.chalkGame.replaceChildren(
      h("div", { class: "chalk-game" },
        h("div", { class: "chalk-title" }, h("b", { text: "HAND CHALK" }), h("br"), h("small", { class: "k", text: "SCRUB LEFT & RIGHT" })),
        bar,
        h("button", { text: "CANCEL", onclick: () => this.cancelMinigame() })
      )
    );
  }

  resetChalk() {
    this.aim.tipChalk = 0;
    this.aim.handChalk = 0;
  }

  setEnabled(on: boolean): void {
    if (on === this.enabled) return;
    this.enabled = on;
    this.root.style.opacity = on ? "1" : "0.35";
    if (!on) {
      this.armed.replaceChildren();
      this.cancelMinigame();
    }
  }

  disarm(): void {
    this.armed.replaceChildren();
    this.cancelMinigame();
  }

  private arm(p: number, ev: ControlEvents): void {
    const clear = () => this.armed.replaceChildren();
    this.armed.replaceChildren(
      h("button", { class: "primary", text: \`STRIKE \${Math.round(p * 100)}%\`, onclick: () => {
        clear();
        if (this.enabled) {
          ev.shoot(p);
          this.resetChalk();
          this.paint();
        }
      }}),
      h("button", { text: "×", onclick: clear }),
    );
  }

  paint(): void {
    const bar = this.power.firstElementChild as HTMLElement;
    bar.style.height = \`\${this.pull * 100}%\`;
    (this.power.lastElementChild as HTMLElement).textContent = this.pull ? \`\${Math.round(this.pull * 100)}\` : "";
    
    const dot = this.spin.lastElementChild as HTMLElement;
    dot.style.left = \`calc(50% + \${this.aim.tx * 42}%)\`;
    dot.style.top = \`calc(50% - \${this.aim.ty * 42}%)\`;
    
    (this.elev.firstElementChild as HTMLElement).style.transform = \`rotate(\${-this.aim.elev}rad)\`;
    (this.elev.lastElementChild as HTMLElement).textContent = \`\${Math.round((this.aim.elev * 180) / Math.PI)}°\`;
    
    const tp = Math.round(this.aim.tipChalk * 100);
    this.tipBtn.style.background = \`linear-gradient(0deg, var(--fg) \${tp}%, var(--raise) \${tp}%)\`;
    this.tipBtn.style.color = tp > 50 ? "var(--on-fg)" : "var(--ink)";
    this.tipBtn.textContent = \`TIP \${tp}%\`;

    const hp = Math.round(this.aim.handChalk * 100);
    this.handBtn.style.background = \`linear-gradient(0deg, var(--fg) \${hp}%, var(--raise) \${hp}%)\`;
    this.handBtn.style.color = hp > 50 ? "var(--on-fg)" : "var(--ink)";
    this.handBtn.textContent = \`HAND \${hp}%\`;
  }
}

// === FILE: frontend/game.css ===
.hud {
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  display: flex;
  justify-content: space-between;
  align-items: stretch;
  gap: 8px;
  padding: max(6px,env(safe-area-inset-top)) 8px 6px;
  pointer-events: none;
}
.hud > * {
  pointer-events: auto;
}
.pc {
  background: var(--panel);
  border: 1px solid var(--line);
  padding: 6px 9px;
  min-width: 128px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  position: relative;
}
.pc.turn {
  border-color: var(--fg);
}
.pc .clock {
  position: absolute;
  left: 0;
  bottom: -1px;
  height: 2px;
  background: var(--fg);
}
.balls {
  display: flex;
  gap: 3px;
  min-height: 12px;
}
.balls i {
  width: 11px;
  height: 11px;
  border-radius: 50%;
  display: block;
}
.mid {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  background: var(--panel);
  border: 1px solid var(--line);
  padding: 4px 10px;
}
.bubble {
  position: absolute;
  top: 100%;
  margin-top: 6px;
  left: 0;
  background: var(--fg);
  color: var(--bg);
  padding: 4px 8px;
  white-space: nowrap;
}
.ctl {
  position: absolute;
  pointer-events: none;
  display: flex;
  gap: 14px;
}
.bottom-tray {
  position: absolute;
  bottom: max(16px, env(safe-area-inset-bottom));
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: flex-end;
  gap: 14px;
  pointer-events: none;
}
.bottom-tray > * {
  pointer-events: auto;
}
.chalk-game {
  position: absolute;
  top: 35%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: var(--panel);
  border: 2px solid var(--fg);
  padding: 16px 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  pointer-events: auto;
  box-shadow: 0 12px 32px rgba(0,0,0,0.8);
  z-index: 100;
  min-width: 280px;
}
.chalk-title {
  text-align: center;
  font-size: 14px;
}
.chalk-bar {
  width: 100%;
  height: 32px;
  background: #111;
  border: 1px solid var(--line);
  position: relative;
  touch-action: none;
  cursor: ew-resize;
}
.chalk-zone {
  position: absolute;
  left: 40%;
  width: 20%;
  height: 100%;
  background: rgba(125, 255, 58, 0.3);
  border-left: 2px solid var(--fg);
  border-right: 2px solid var(--fg);
}
.chalk-cursor {
  position: absolute;
  top: -6px;
  bottom: -6px;
  width: 4px;
  background: var(--fg);
  transform: translateX(-50%);
  box-shadow: 0 0 8px var(--fg);
}
.chalk-fill {
  height: 100%;
  background: var(--fg);
  width: 0%;
  transition: width 0.05s linear;
}
.power {
  width: 64px;
  height: min(var(--avail, 240px), 400px);
  border: 2px solid var(--fg);
  background: color-mix(in srgb, var(--fg) 16%, transparent);
  position: relative;
  touch-action: none;
}
.power > i {
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  background: var(--fg);
}
.fine {
  width: 44px;
  height: min(var(--avail, 240px), 400px);
  border: 2px solid color-mix(in srgb, var(--fg) 70%, transparent);
  background: repeating-linear-gradient(0deg,color-mix(in srgb, var(--fg) 45%, transparent) 0 1px,transparent 1px 10px),color-mix(in srgb, var(--fg) 8%,
    transparent);
  touch-action: none;
}
.spin {
  width: 92px;
  height: 92px;
  border-radius: 50%;
  background: radial-gradient(circle at 38% 34%,#fff,#e4e6dd 70%,#a7aba1);
  position: relative;
  touch-action: none;
  border: 2px solid var(--fg);
}
.spin > i {
  position: absolute;
  width: 14px;
  height: 14px;
  margin: -7px 0 0 -7px;
  border-radius: 50%;
  background: var(--bad);
  box-shadow: 0 0 0 2px #000;
}
.spin > b {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  border: 1px dashed rgba(8,9,10,.45);
}
.elev {
  width: 92px;
  height: 52px;
  position: relative;
  border: 2px solid var(--fg);
  background: color-mix(in srgb, var(--fg) 12%, var(--panel));
  touch-action: none;
  display: flex;
  align-items: flex-end;
  justify-content: flex-end;
  padding: 3px 5px;
}
.elev > i {
  position: absolute;
  left: 6px;
  bottom: 6px;
  width: 64px;
  height: 3px;
  background: var(--fg);
  transform-origin: 0 50%;
}
.emotes {
  display: grid;
  grid-template-columns: repeat(3,auto);
  gap: 4px;
}
.toast {
  position: absolute;
  left: 50%;
  top: 22%;
  transform: translateX(-50%);
  background: var(--panel);
  border: 1px solid var(--fg);
  padding: 8px 14px;
  pointer-events: none;
  white-space: normal;
  text-align: center;
  width: max-content;
  max-width: calc(100vw - 32px);
  z-index: 10;
}

@media (max-width: 560px) {
  .hud {
    gap: 4px;
    padding-left: 4px;
    padding-right: 4px;
  }
  .pc {
    min-width: 0;
    flex: 1;
    padding: 4px 6px;
  }
  .mid {
    padding: 3px 4px;
  }
  .mid .row {
    flex-wrap: nowrap;
    gap: 3px;
  }
  .mid button {
    padding: 5px 6px;
    font-size: 11px;
  }
}

body.wide.port #gl,
body.wide.port #ov,
body.wide.port #ui {
  inset: auto;
  top: 0;
  left: 100vw;
  width: 100vh;
  height: 100vw;
  transform: rotate(90deg);
  transform-origin: 0 0;
}

.hit {
  padding: 22px;
  margin: -22px;
  touch-action: none;
}

.power > .pct {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 4px;
  text-align: center;
  color: var(--fg);
  mix-blend-mode: difference;
}

.mid .info {
  max-width: 44vw;
  text-align: center;
  font-size: 11px;
  line-height: 1.25;
}
.say {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 46vh;
  overflow: auto;
  background: var(--panel);
  padding: 6px;
  border: 1px solid var(--line);
}
.say input {
  flex: 1;
  width: auto;
  min-width: 0;
}
.armed {
  position: absolute;
  left: 50%;
  bottom: 140px;
  transform: translateX(-50%);
  display: flex;
  gap: 8px;
  pointer-events: auto;
}
.armed button {
  min-height: 48px;
  padding: 10px 22px;
  font-weight: 600;
}
`;

const files = {};
let currentFile = null;
let fileLines = [];

for (const line of payload.split('\n')) {
  if (line.startsWith('// === FILE: ')) {
    if (currentFile) files[currentFile] = fileLines.join('\n').trim() + '\n';
    currentFile = line.replace('// === FILE: ', '').replace(' ===', '').trim();
    fileLines = [];
  } else {
    if (currentFile) fileLines.push(line);
  }
}
if (currentFile) files[currentFile] = fileLines.join('\n').trim() + '\n';

async function update() {
  console.log(`Updating ${Object.keys(files).length} files...`);

  // 1. Write locally
  for (const [filepath, content] of Object.entries(files)) {
    const fullPath = path.join(process.cwd(), filepath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content, 'utf8');
    console.log(`💾 Saved locally: ${filepath}`);
  }

  // 2. Push to Val Town
  if (!API_KEY) {
    console.warn("\n⚠️ VT environment variable not set. Skipping push to Val Town.");
    return;
  }
  
  console.log(`\n🚀 Pushing files to Val Town Project ${PROJECT_ID}...`);
  for (const [filepath, content] of Object.entries(files)) {
    // API endpoint fix: encode URI parts individually
    const encodedPath = filepath.split('/').map(encodeURIComponent).join('/');
    const url = `https://api.val.town/v1/projects/${PROJECT_ID}/files/${encodedPath}`;
    
    try {
      const res = await fetch(url, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ content })
      });
      
      if (!res.ok) {
        const errText = await res.text();
        console.error(`❌ Failed to update ${filepath}: ${res.status} ${res.statusText} - ${errText}`);
      } else {
        console.log(`✅ Successfully updated ${filepath}`);
      }
    } catch (err) {
      console.error(`❌ Network error updating ${filepath}:`, err.message);
    }
  }
  console.log("\n🎉 Update complete!");
}

update();