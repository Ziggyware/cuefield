import type { Aim } from "../aim.ts";
import type { CueSpec } from "../../shared/catalog.ts";
import { h } from "../dom.ts";
import { rotated, toVirt } from "../screen.ts";
import { drag } from "./drag.ts";
import { onPref, prefs } from "../prefs/store.ts";
import { canVibrate } from "../game/motion.ts";
import { type Game, handChalkGame, strikeGame, tipChalkGame } from "./minigames.ts";

export interface ControlEvents {
  change(): void;
  shoot(power: number, finesse?: number): void;
}

function getCenterAndSize(el: HTMLElement) {
  const r = el.getBoundingClientRect();
  const scx = r.left + r.width / 2;
  const scy = r.top + r.height / 2;
  const [cx, cy] = toVirt(scx, scy);
  const w = rotated() ? r.height : r.width;
  const hh = rotated() ? r.width : r.height;
  return { cx, cy, w, h: hh };
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * Stroke controls. The power band owns every pixel from the left screen edge to the left edge of the table, and the
 * precision band from the right edge of the table to the right screen edge (mirrored for left-handed play); press
 * anywhere inside a band to drive it. The chalk selections dock in the HUD centre and spin/massé beside them.
 */
export class Controls {
  root: HTMLElement;
  power = h("div", { class: "power", title: "pull for power · starts where you press" }, h("i"), h("b", { class: "origin" }), h("span", { class: "pct" }));
  fine = h("div", { class: "fine", title: "fine aim · drag for angle" }, h("i"));
  spin = h("div", { class: "spin", title: "tip offset · double-tap to centre" }, h("b"), h("i"), h("u", { class: "range" }));
  elev = h("div", { class: "elev", title: "cue elevation / massé" }, h("i"), h("span", { class: "v" }));

  tipBtn = h("button", { class: "chalk-chip tip", title: "tip chalk: timing game" });
  handBtn = h("button", { class: "chalk-chip hand", title: "hand chalk: scrub game" });
  chalkDock = h("div", { class: "chalk-set" });
  cueDock = h("div", { class: "cue-set" });
  readSpin = h("span", { class: "cue-val" });
  readElev = h("span", { class: "cue-val" });

  /** The two full-height input bands; the whole band is the hit area. */
  powerDock = h("div", { class: "ctl dock power-dock" }, h("span", { class: "zone-cap", text: "POWER" }), this.power);
  fineDock = h("div", { class: "ctl dock fine-dock" }, h("span", { class: "zone-cap", text: "PRECISION" }), this.fine);

  pull = 0;
  /** Bar fraction where the current drag started, and which way the fill grows. */
  originFrac = 1;
  fillDir = -1;
  enabled = false;
  armed: HTMLElement;
  gameHost: HTMLElement;
  game: Game | null = null;
  activeRaf = 0;

  aim: Aim;
  maxElev: number;
  cue: CueSpec;
  ev: ControlEvents;

  constructor(aim: Aim, maxElev: number, ev: ControlEvents, cue: CueSpec) {
    this.aim = aim;
    this.aim.tipChalk = 0;
    this.aim.handChalk = 0;
    this.maxElev = maxElev;
    this.ev = ev;
    this.cue = cue;

    const slim = (el: HTMLElement) => h("div", { class: "hit slim" }, el);
    const spinHit = slim(this.spin), elevHit = slim(this.elev);
    const powerDock = this.powerDock, fineDock = this.fineDock;

    // Bands are placed from the live table edges (--tl/--tr, virtual px) by `zones`; the left-handed preference
    // swaps which band owns which side of the table.
    this.root = h(
      "div",
      { style: "position:absolute;inset:0;pointer-events:none" },
      powerDock,
      fineDock,
      this.gameHost = h("div", { class: "mg-host" }),
      this.armed = h("div", { class: "armed" }),
    );
    this.root.style.opacity = "0.35";
    const place = () => this.root.classList.toggle("mirror", prefs.leftHanded);
    place();
    onPref((k) => k === "leftHanded" && place());
    this.chalkDock.append(
      h("span", { class: "dock-cap", text: "CHALK" }),
      this.tipBtn,
      this.handBtn,
    );
    this.cueDock.append(
      h("div", { class: "cue-cell" }, h("span", { class: "dock-cap", text: "SPIN" }), spinHit, this.readSpin),
      h("div", { class: "cue-cell" }, h("span", { class: "dock-cap", text: "MASSE" }), elevHit, this.readElev),
    );
    this.readSpin.title = `tip limit ${(this.cue.spin * 100).toFixed(0)}% of the ball radius`;
    this.readElev.title = "cue elevation limit";

    this.tipBtn.onclick = () => this.enabled && this.startTipGame();
    this.handBtn.onclick = () => this.enabled && this.startHandGame();

    let originY = 0, top = 0, bottom = 1;
    drag(powerDock, (e, ph) => {
      if (!this.enabled) return;
      const y = toVirt(e.clientX, e.clientY)[1];
      if (ph === "down") {
        // The whole band is the bar: a press anywhere between screen edge and table edge anchors the pull.
        const { cy, h: bh } = getCenterAndSize(powerDock);
        top = cy - bh / 2;
        bottom = cy + bh / 2;
        originY = clamp(y, top + 1, bottom - 1);
        this.originFrac = (originY - top) / bh;
        this.fillDir = 0;
      }
      if (ph === "up") {
        const p = this.pull;
        this.pull = 0;
        this.originFrac = 1;
        this.fillDir = -1;
        if (p > 0.015) {
          if (prefs.strokeConfirm) this.arm(p);
          else this.fire(p);
        }
      } else {
        const up = (originY - y) / Math.max(10, originY - top);
        const down = (y - originY) / Math.max(10, bottom - originY);
        const prev = this.pull;
        this.pull = clamp01(Math.max(up, down));
        this.fillDir = down >= up ? 1 : -1;
        if (Math.floor(prev * 8) !== Math.floor(this.pull * 8) && canVibrate()) navigator.vibrate(5);
      }
      this.paint();
      ev.change();
    });

    let last = 0, finePos = 50;
    drag(fineDock, (e, ph) => {
      if (!this.enabled) return;
      const y = toVirt(e.clientX, e.clientY)[1];
      if (ph === "down") {
        const { cy, h: bh } = getCenterAndSize(fineDock);
        finePos = clamp(((y - (cy - bh / 2)) / bh) * 100, 4, 96);
      } else if (ph === "move") {
        // Half the old angular rate: twice the precision per pixel for fine aim.
        this.aim.angle += (y - last) * 0.00015 * prefs.aimSensitivity;
        finePos = clamp(finePos + (y - last) * 0.5, 4, 96);
      }
      this.fine.firstElementChild!.setAttribute("style", `top:${finePos}%`);
      last = y;
      ev.change();
    });

    drag(spinHit, (e, ph) => {
      if (!this.enabled || ph === "up") return;
      const { cx, cy, w, h: bh } = getCenterAndSize(this.spin);
      const [vx, vy] = toVirt(e.clientX, e.clientY);
      let x = (vx - cx) / (w / 2);
      let y = -(vy - cy) / (bh / 2);
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
      const { cx, cy, w, h: bh } = getCenterAndSize(this.elev);
      const [vx, vy] = toVirt(e.clientX, e.clientY);
      const pivotX = cx - w / 2 + 4;
      const pivotY = cy + bh / 2 - 4;
      const a = Math.atan2(pivotY - vy, vx - pivotX);
      this.aim.elev = clamp(a, 0, this.maxElev);
      this.paint();
      ev.change();
    });

    this.paint();
  }

  /** The active seat changed: retitle the limits and clamp a now-illegal elevation. */
  setCue(cue: CueSpec, limit: number): void {
    this.cue = cue;
    this.maxElev = limit;
    if (this.aim.elev > limit) this.aim.elev = limit;
    this.readSpin.title = `tip limit ${(cue.spin * 100).toFixed(0)}% of the ball radius`;
    this.readElev.title = `cue elevation limit ${Math.round((limit * 180) / Math.PI)}°`;
    this.paint();
  }

  /** Mount the two docks in the HUD. */
  attach(chalk: HTMLElement, cue: HTMLElement): void {
    chalk.append(this.chalkDock);
    cue.append(this.cueDock);
  }

  /** Live table edges in virtual px; each band spans from its table edge out to the screen edge. */
  zones(tl: number, tr: number): void {
    this.root.style.setProperty("--tl", `${Math.round(tl)}px`);
    this.root.style.setProperty("--tr", `${Math.round(tr)}px`);
  }

  cancelMinigame(): void {
    this.game?.stop();
    this.game = null;
    this.gameHost.replaceChildren();
    this.gameHost.style.pointerEvents = "none";
  }

  private open(game: { el: HTMLElement; stop(): void }): void {
    this.cancelMinigame();
    this.game = game;
    this.gameHost.replaceChildren(game.el);
    // Block the table while a skill game is up so a stray drag cannot arm a stroke behind it.
    this.gameHost.style.pointerEvents = "auto";
    this.armed.replaceChildren();
    this.pull = 0;
    this.paint();
  }

  startTipGame(): void {
    this.open(
      tipChalkGame(
        (q) => {
          this.aim.tipChalk = q;
          this.cancelMinigame();
          this.paint();
          this.ev.change();
        },
        () => this.cancelMinigame(),
      ),
    );
  }

  startHandGame(): void {
    this.open(
      handChalkGame(
        (q) => {
          this.aim.handChalk = q;
          this.cancelMinigame();
          this.paint();
          this.ev.change();
        },
        () => this.cancelMinigame(),
      ),
    );
  }

  /** Above 80% power a timing check decides how cleanly the cue is delivered. */
  private fire(p: number): void {
    if (p > 0.8 && prefs.heavySkill) {
      this.open(
        strikeGame(
          p,
          (fine) => {
            this.cancelMinigame();
            this.ev.shoot(p, fine);
            this.resetChalk();
            this.paint();
          },
          () => {
            this.cancelMinigame();
            this.paint();
          },
        ),
      );
      return;
    }
    this.ev.shoot(p);
    this.resetChalk();
    this.paint();
  }

  resetChalk(): void {
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

  private arm(p: number): void {
    const clear = () => this.armed.replaceChildren();
    this.armed.replaceChildren(
      h("button", {
        class: "primary",
        text: `STRIKE ${Math.round(p * 100)}%`,
        onclick: () => {
          clear();
          if (this.enabled) this.fire(p);
        },
      }),
      h("button", { text: "×", onclick: clear }),
    );
  }

  paint(): void {
    const fill = this.power.firstElementChild as HTMLElement;
    const origin = this.power.children[1] as HTMLElement;
    if (!this.pull) {
      fill.style.top = "100%";
      fill.style.height = "0%";
    } else if (this.fillDir >= 0) {
      fill.style.top = `${this.originFrac * 100}%`;
      fill.style.height = `${this.pull * 100}%`;
    } else {
      fill.style.top = `${(this.originFrac - this.pull) * 100}%`;
      fill.style.height = `${this.pull * 100}%`;
    }
    origin.style.top = `${this.originFrac * 100}%`;
    origin.style.opacity = this.pull ? "1" : "0";
    (this.power.lastElementChild as HTMLElement).textContent = this.pull ? `${Math.round(this.pull * 100)}` : "";

    const dot = this.spin.children[1] as HTMLElement;
    dot.style.left = `calc(50% + ${this.aim.tx * 40}%)`;
    dot.style.top = `calc(50% - ${this.aim.ty * 40}%)`;

    (this.elev.firstElementChild as HTMLElement).style.transform = `rotate(${-this.aim.elev}rad)`;
    (this.elev.lastElementChild as HTMLElement).textContent = `${Math.round((this.aim.elev * 180) / Math.PI)}°`;

    const tp = Math.round(this.aim.tipChalk * 100);
    this.tipBtn.style.background = `linear-gradient(0deg, var(--fg) ${tp}%, var(--raise) ${tp}%)`;
    this.tipBtn.style.color = tp > 50 ? "var(--on-fg)" : "var(--ink)";
    this.tipBtn.textContent = `TIP ${tp}`;

    const hp = Math.round(this.aim.handChalk * 100);
    this.handBtn.style.background = `linear-gradient(0deg, var(--fg) ${hp}%, var(--raise) ${hp}%)`;
    this.handBtn.style.color = hp > 50 ? "var(--on-fg)" : "var(--ink)";
    this.handBtn.textContent = `HAND ${hp}`;

    this.readSpin.textContent = `${this.aim.tx.toFixed(1)}, ${this.aim.ty.toFixed(1)}`;
    this.readElev.textContent = `${Math.round((this.aim.elev * 180) / Math.PI)}° max ${Math.round((this.maxElev * 180) / Math.PI)}°`;
  }
}
