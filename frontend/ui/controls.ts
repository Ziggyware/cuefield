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
      h("div", { class: "ctl", style: `${near}:max(24px,env(safe-area-inset-${near}));top:50%;transform:translateY(-50%)` }, powerHit),
      h("div", { class: "ctl", style: `${far}:max(24px,env(safe-area-inset-${far}));top:50%;transform:translateY(-50%)` }, fineHit),
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
      cursor.style.left = `${pos}%`;
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
          fill.style.width = `${Math.min(100, charge * 100)}%`;
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
      h("button", { class: "primary", text: `STRIKE ${Math.round(p * 100)}%`, onclick: () => {
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
    bar.style.height = `${this.pull * 100}%`;
    (this.power.lastElementChild as HTMLElement).textContent = this.pull ? `${Math.round(this.pull * 100)}` : "";
    
    const dot = this.spin.lastElementChild as HTMLElement;
    dot.style.left = `calc(50% + ${this.aim.tx * 42}%)`;
    dot.style.top = `calc(50% - ${this.aim.ty * 42}%)`;
    
    (this.elev.firstElementChild as HTMLElement).style.transform = `rotate(${-this.aim.elev}rad)`;
    (this.elev.lastElementChild as HTMLElement).textContent = `${Math.round((this.aim.elev * 180) / Math.PI)}°`;
    
    const tp = Math.round(this.aim.tipChalk * 100);
    this.tipBtn.style.background = `linear-gradient(0deg, var(--fg) ${tp}%, var(--raise) ${tp}%)`;
    this.tipBtn.style.color = tp > 50 ? "var(--on-fg)" : "var(--ink)";
    this.tipBtn.textContent = `TIP ${tp}%`;

    const hp = Math.round(this.aim.handChalk * 100);
    this.handBtn.style.background = `linear-gradient(0deg, var(--fg) ${hp}%, var(--raise) ${hp}%)`;
    this.handBtn.style.color = hp > 50 ? "var(--on-fg)" : "var(--ink)";
    this.handBtn.textContent = `HAND ${hp}%`;
  }
}
