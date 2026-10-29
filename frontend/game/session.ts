import { type AssistLevel, type CueSpec, tableById, type TableSpec } from "../../shared/catalog.ts";
import { begin, geometry } from "../../shared/game/engine.ts";
import type { GameState, StrikeCmd } from "../../shared/game/types.ts";
import { mustCall, placeError } from "../../shared/game/validate.ts";
import type { Sim } from "../../shared/physics/sim.ts";
import { HighlightReplay, ShotRecording } from "./highlight.ts";
import type { Highlight } from "../../shared/game/highlights.ts";
import type { SimEvent } from "../../shared/physics/types.ts";
import type { Geometry } from "../../shared/physics/types.ts";
import { type Aim, maxElev, type Preview, toCmd } from "../aim.ts";
import { toast } from "../dom.ts";
import { Orient } from "../render/orient.ts";
import { Controls } from "../ui/controls.ts";
import { Gutter } from "../ui/gutter.ts";
import { View } from "../view.ts";
import { startLoop } from "./stage.ts";
import { prefs } from "../prefs/store.ts";
import { resetAim } from "./aim-reset.ts";
import { Predictor } from "./predictor.ts";
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
  /** Bottom strip of pocketed balls, reconciled with the state on settle. */
  gutter = new Gutter();
  /** Recent jaw contacts, for the rejection flash. */
  jawHits: { x: number; y: number; t: number }[] = [];
  /** Chalk scuffs left on the cushions this rack, where balls struck wood. */
  railMarks: { x: number; y: number; j: number; t: number }[] = [];
  /** Pocket ledger: drops vs rattles per pocket this rack. */
  heat = { pots: [0, 0, 0, 0, 0, 0], jaws: [0, 0, 0, 0, 0, 0] };
  /** Contacts during the shot in flight (or the last one): whispers and badges read these. */
  shotRails = 0;
  shotJaws = 0;
  /** Smoothed bullet-time playback factor; 1 is real time. */
  bullet = 1;
  place: [number, number] | null = null;
  call = -1;
  /** Optional marked pocket for local challenge games. */
  challengePocket: number | null = null;
  dirty = true;
  prev: Preview | null = null;
  prevAt = 0;
  prevVersion = 0;
  predictor = new Predictor();
  remoteAim: { a: Aim; pull: number; place: [number, number] | null } | null = null;
  deadline = 0;
  clockSpan = 30_000;
  running = true;
  /** Bottom edge of the HUD, virtual px. */
  top = 48;
  /** Ball paths of the shot in progress or the last one. */
  trails: Map<number, [number, number][]> | null = null;
  /** Last stroke + its pre-state (instant replay). */
  lastShot: { pre: GameState; cmd: StrikeCmd; cue: CueSpec; events: SimEvent[] } | null = null;
  recording: ShotRecording | null = null;
  lastRecording: ShotRecording | null = null;
  replay: HighlightReplay | null = null;
  onReplay: ((replay: HighlightReplay | null) => void) | null = null;
  highlightsEnabled = true;
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
    this.controls = new Controls(
      this.aim,
      maxElev(this.myCue()),
      {
        change: () => {
          this.dirty = true;
          this.hooks.aim?.(this.aim, this.controls.pull, this.place);
        },
        shoot: (p, fine) => this.shoot(p, fine),
      },
      this.myCue(),
    );
    this.gutter.sync(state);
    this.resetAim();
    this.syncCue();
    startLoop(this);
  }

  /** The cue of the seat that is shooting when that seat is local (hot-seat play), else the local player's own. */
  myCue(): CueSpec {
    const t = this.state.turn;
    if (this.hooks.isLocal(t)) return this.cues[t];
    return this.cues[this.hooks.isLocal(0) ? 0 : 1];
  }

  /** Keep the control limits in step with whose cue is live. */
  syncCue(): void {
    const cue = this.myCue();
    this.controls.setCue(cue, maxElev(cue));
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

  cmdFor(power: number, finesse?: number): StrikeCmd {
    return toCmd(this.aim, this.myCue(), power, this.place ?? undefined, mustCall(this.state) ? this.call : undefined, finesse);
  }

  shoot(power: number, finesse?: number): void {
    if (!this.canAct() || !this.placeOk()) return;
    if (mustCall(this.state) && this.call < 0) {
      toast("call a pocket first: tap the pocket");
      return;
    }
    const cmd = this.cmdFor(power, finesse);
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
    if (!this.lastRecording || this.sim || this.replay) return;
    const cb = this.state.balls[0];
    this.beginReplay("LAST SHOT", 0, Math.max(0, this.lastRecording.duration - 3), this.lastRecording.duration, [cb.x, cb.y]);
  }

  beginAutoReplay(done: () => void): void {
    if (!this.lastRecording || this.sim || this.replay) return;
    const cb = this.state.balls[0], end = this.lastRecording.duration;
    this.beginReplay("LAST SHOT", 0, end - 0.9, end, [cb.x, cb.y], done);
  }

  beginHighlight(h: Highlight, done: () => void): void {
    const p = h.pocket === undefined ? null : this.geo.pockets[h.pocket];
    const b = this.state.balls.find((b) => b.id === h.ball) ?? this.state.balls[0];
    const focus: [number, number] = [h.x ?? p?.hx ?? b.x, h.y ?? p?.hy ?? b.y];
    this.beginReplay(h.label, h.ball, h.t - 0.6, h.t + 0.45, focus, done);
  }

  private beginReplay(label: string, ball: number, start: number, end: number, focus: [number, number], complete: (() => void) | null = null): void {
    if (!this.lastRecording || this.replay) return;
    this.controls.disarm();
    this.replay = new HighlightReplay(this.lastRecording, label, ball, start, end, focus, complete);
    this.onReplay?.(this.replay);
  }

  play(cmd: StrikeCmd): void {
    if (this.sim || this.replay) return;
    this.predictor.invalidate();
    this.prev = null;
    this.trails = new Map();
    this.jawHits = [];
    this.shotRails = 0;
    this.shotJaws = 0;
    this.log.push(cmd);
    this.sim = begin(this.state, cmd, this.cues[this.state.turn]);
    this.recording = this.highlightsEnabled && (prefs.highlightReplay || prefs.instantReplay !== "off") ? new ShotRecording(this.sim.balls) : null;
    this.recording?.capture(this.sim.t, this.sim.balls, this.orient.m, true);
    this.simCmd = cmd;
    this.acc = 0;
    this.heard = 0;
    this.remoteAim = null;
  }

  setState(st: GameState): void {
    this.sim = null;
    this.replay = null;
    this.onReplay?.(null);
    this.recording = null;
    this.predictor.invalidate();
    this.prev = null;
    this.simCmd = null;
    this.jawHits = [];
    // A fresh rack wipes the cloth: the cushions lose their scuffs and the pockets their ledger.
    if (st.shot === 0 && !st.broken) {
      this.railMarks = [];
      this.heat = { pots: [0, 0, 0, 0, 0, 0], jaws: [0, 0, 0, 0, 0, 0] };
    }
    this.state = st;
    this.gutter.sync(st);
    this.syncCue();
    this.resetAim();
  }

  stop(): void {
    this.running = false;
    this.onReplay = null;
    this.predictor.stop();
  }
}
