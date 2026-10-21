import { type AssistLevel, type CueSpec, tableById, type TableSpec } from "../../shared/catalog.ts";
import { begin, geometry } from "../../shared/game/engine.ts";
import type { GameState, StrikeCmd } from "../../shared/game/types.ts";
import { mustCall, placeError } from "../../shared/game/validate.ts";
import type { Sim } from "../../shared/physics/sim.ts";
import { replaySim } from "./motion.ts";
import type { Geometry } from "../../shared/physics/types.ts";
import { type Aim, maxElev, type Preview, toCmd } from "../aim.ts";
import { toast } from "../dom.ts";
import { Orient } from "../render/orient.ts";
import { Controls } from "../ui/controls.ts";
import { View } from "../view.ts";
import { startLoop } from "./stage.ts";
import { resetAim } from "./aim-reset.ts";
import type { Gfx, SessionHooks } from "./session-types.ts";

export type { Gfx, SessionHooks };

/** One table: authoritative-state holder, deterministic animation, guides and local stroke input. */
export class Session {
  view = new View();
  orient = new Orient();
  spec: TableSpec;
  geo: Geometry;
  sim: Sim | null = null;
  simCmd: StrikeCmd | null = null;
  acc = 0;
  heard = 0;
  aim: Aim = { angle: 0, power: 0, tx: 0, ty: 0, elev: 0, tipChalk: 1, handChalk: 1 };
  controls: Controls;
  place: [number, number] | null = null;
  call = -1;
  dirty = true;
  prev: Preview | null = null;
  prevAt = 0;
  remoteAim: { a: Aim; pull: number; place: [number, number] | null } | null = null;
  deadline = 0;
  clockSpan = 30_000;
  running = true;
  /** Bottom edge of the HUD, virtual px. */
  top = 72;
  /** Ball paths of the shot in progress or the last one. */
  trails: Map<number, [number, number][]> | null = null;
  /** Last stroke + its pre-state (instant replay). */
  lastShot: { pre: GameState; cmd: StrikeCmd; cue: CueSpec } | null = null;
  replay: { sim: Sim; acc: number; heard: number } | null = null;
  /** Camera magnification around the cue ball. */
  zoom = 1;
  /** Practice sandbox: object balls can be dragged. */
  sandbox = false;
  /** Strokes in order (the server replays bot logs). */
  log: StrikeCmd[] = [];
  state: GameState;
  cues: [CueSpec, CueSpec];
  gfx: Gfx;
  hooks: SessionHooks;
  /** Prediction level for local strokes. */
  assist: AssistLevel;

  constructor(state: GameState, cues: [CueSpec, CueSpec], gfx: Gfx, hooks: SessionHooks, assist?: AssistLevel) {
    this.state = state;
    this.cues = cues;
    this.gfx = gfx;
    this.hooks = hooks;
    this.spec = tableById(state.table)!;
    this.assist = assist ?? this.spec.assist;
    this.geo = geometry(state.table);
    gfx.renderer.setTable(this.spec, this.geo);
    this.controls = new Controls(this.aim, maxElev(this.myCue()), {
      change: () => {
        this.dirty = true;
        this.hooks.aim?.(this.aim, this.controls.pull, this.place);
      },
      shoot: (p) => this.shoot(p),
    });
    this.resetAim();
    startLoop(this);
  }

  myCue(): CueSpec {
    return this.cues[this.hooks.isLocal(0) ? 0 : 1];
  }

  canAct(): boolean {
    return !this.sim && !this.replay && this.state.winner < 0 && this.hooks.isLocal(this.state.turn);
  }

  /** Aims at the nearest legal first-contact ball; clears tip, elevation, placement and call. */
  resetAim(): void {
    resetAim(this);
  }

  placeOk(): boolean {
    return !this.place || !placeError(this.state, this.place[0], this.place[1]);
  }

  cmdFor(power: number): StrikeCmd {
    return toCmd(this.aim, this.myCue(), power, this.place ?? undefined, mustCall(this.state) ? this.call : undefined);
  }

  shoot(power: number): void {
    if (!this.canAct() || !this.placeOk()) return;
    if (mustCall(this.state) && this.call < 0) {
      toast("call a pocket first: tap the pocket");
      return;
    }
    const cmd = this.cmdFor(power);
    this.gfx.audio.strike(power);
    this.hooks.shoot(cmd);
    this.play(cmd);
  }

  /** Steps the camera zoom through 1×, 1.5×, 2.2×. */
  cycleZoom(dir: 1 | -1): void {
    const Z = [1, 1.5, 2.2], i = Z.indexOf(this.zoom);
    this.zoom = Z[Math.max(0, Math.min(Z.length - 1, i + dir))];
  }

  startReplay(): void {
    if (this.lastShot && !this.sim) this.replay = replaySim(this);
  }

  play(cmd: StrikeCmd): void {
    this.replay = null;
    this.trails = new Map();
    this.log.push(cmd);
    this.sim = begin(this.state, cmd, this.cues[this.state.turn]);
    this.simCmd = cmd;
    this.acc = 0;
    this.heard = 0;
    this.remoteAim = null;
  }

  setState(st: GameState): void {
    this.sim = null;
    this.replay = null;
    this.simCmd = null;
    this.state = st;
    this.resetAim();
  }

  stop(): void {
    this.running = false;
  }
}
