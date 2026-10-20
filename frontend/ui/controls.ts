import type { Aim } from "../aim.ts";
import { h } from "../dom.ts";
import { toVirt, virtRect } from "../screen.ts";
import { drag } from "./drag.ts";
import { prefs } from "../prefs/store.ts";
import { canVibrate } from "../game/motion.ts";

export interface ControlEvents {
  change(): void;
  shoot(power: number): void;
}

/**
 * Stroke controls in the virtual landscape frame: power bar on the left (pull down, release to strike),
 * fine-aim strip on the right, elevation dial and tip-offset pad bottom-right. Each sits inside a padded
 * hit area so a slightly-off touch still lands on the control rather than the cloth.
 */
export class Controls {
  root: HTMLElement;
  power = h("div", { class: "power" }, h("i"), h("span", { class: "pct" }));
  fine = h("div", { class: "fine" });
  spin = h("div", { class: "spin" }, h("b"), h("i"));
  elev = h("div", { class: "elev" }, h("i"), h("span", { class: "v" }));
  pull = 0;
  enabled = false;
  armed: HTMLElement;
  aim: Aim;
  maxElev: number;

  constructor(aim: Aim, maxElev: number, ev: ControlEvents) {
    this.aim = aim;
    this.maxElev = maxElev;
    const pad = (el: HTMLElement) => h("div", { class: "hit" }, el);
    const powerHit = pad(this.power), fineHit = pad(this.fine), spinHit = pad(this.spin), elevHit = pad(this.elev);
    const [near, far] = prefs.leftHanded ? ["right", "left"] : ["left", "right"];
    this.armed = h("div", { class: "armed" });
    this.root = h(
      "div",
      { style: "position:absolute;inset:0;pointer-events:none" },
      h("div", { class: "ctl", style: `${near}:max(24px,env(safe-area-inset-${near}));top:50%;transform:translateY(-50%)` }, powerHit, fineHit),
      h("div", { class: "ctl stack", style: `${far}:max(24px,env(safe-area-inset-${far}));top:50%;transform:translateY(-50%)` }, elevHit, spinHit),
      this.armed,
    );
    this.root.style.opacity = "0.35";

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
        if (p > 0.015) prefs.strokeConfirm ? this.arm(p, ev) : ev.shoot(p);
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
      const r = virtRect(this.spin), [vx, vy] = toVirt(e.clientX, e.clientY);
      let x = ((vx - r.x) / r.w) * 2 - 1, y = -(((vy - r.y) / r.h) * 2 - 1);
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
      const r = virtRect(this.elev), [vx, vy] = toVirt(e.clientX, e.clientY);
      const a = Math.atan2(r.y + r.h - 6 - vy, vx - r.x - 6);
      this.aim.elev = Math.max(0, Math.min(this.maxElev, a));
      this.paint();
      ev.change();
    });
    this.paint();
  }

  setEnabled(on: boolean): void {
    if (on === this.enabled) return;
    this.enabled = on;
    this.root.style.opacity = on ? "1" : "0.35";
    if (!on) this.armed.replaceChildren();
  }

  disarm(): void {
    this.armed.replaceChildren();
  }

  /** Stroke lock: the released power waits for an explicit strike or cancel. */
  private arm(p: number, ev: ControlEvents): void {
    const clear = () => this.armed.replaceChildren();
    this.armed.replaceChildren(
      h("button", { class: "primary", text: `STRIKE ${Math.round(p * 100)}%`, onclick: () => (clear(), this.enabled && ev.shoot(p)) }),
      h("button", { text: "×", onclick: clear }),
    );
  }

  paint(): void {
    const bar = this.power.firstElementChild as HTMLElement;
    bar.style.height = `${this.pull * 100}%`;
    (this.power.lastElementChild as HTMLElement).textContent = this.pull ? `${Math.round(this.pull * 100)}` : "";
    const dot = this.spin.lastElementChild as HTMLElement;
    dot.style.left = `${50 + this.aim.tx * 42}%`;
    dot.style.top = `${50 - this.aim.ty * 42}%`;
    (this.elev.firstElementChild as HTMLElement).style.transform = `rotate(${-this.aim.elev}rad)`;
    (this.elev.lastElementChild as HTMLElement).textContent = `${Math.round((this.aim.elev * 180) / Math.PI)}°`;
  }
}
