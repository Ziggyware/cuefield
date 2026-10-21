import type { GameState } from "../../shared/game/types.ts";
import { h } from "../dom.ts";
import { paletteHex } from "../prefs/look.ts";
import { size } from "../screen.ts";

/**
 * Pocketed-ball gutter along the bottom edge. A ball enters at the x of the pocket that swallowed it and rolls to the
 * next free slot; the roll lasts as long as the distance it has to travel, so balls from far pockets arrive later.
 * `sync` reconciles the strip with the authoritative state after a settle, a rewind or a network resync.
 */
export class Gutter {
  root: HTMLElement;
  private label = h("span", { class: "g-label", text: "POCKETED" });
  private slots = h("div", { class: "g-slots" });
  private layer = h("div", { class: "g-layer" });
  private order: number[] = [];
  private els = new Map<number, HTMLElement>();
  private gs = 22;
  private gap = 3;

  constructor() {
    this.root = h(
      "div",
      { class: "gutter", role: "status", "aria-live": "polite", title: "balls potted this rack" },
      this.label,
      this.slots,
      this.layer,
    );
    this.layout();
  }

  /** Recompute ball size and slot positions after a viewport or rotation change. */
  layout(): void {
    const w = size().w;
    const max = (w - 110) / 16 - this.gap;
    this.gs = Math.max(15, Math.min(24, max));
    this.root.style.setProperty("--gs", `${this.gs}px`);
    this.root.style.setProperty("--gg", `${this.gap}px`);
    // Keep existing balls on their slots after a resize.
    this.order.forEach((id, i) => {
      const el = this.els.get(id);
      if (el) el.style.transform = `translate(${this.slotX(i)}px, 0px)`;
    });
  }

  /** Centre of the first slot: 8 px gutter padding, the label, its 4 px gap, then half a ball. */
  private get origin(): number {
    return 8 + (this.label.offsetWidth || 52) + 4 + this.gs / 2;
  }

  private slotX(i: number): number {
    return this.origin + i * (this.gs + this.gap);
  }

  private ball(id: number): HTMLElement {
    const c = paletteHex(), bg = id > 8 ? `linear-gradient(${c[0]} 0 30%,${c[id]} 30% 70%,${c[0]} 70%)` : id === 0 ? "#f4f1e4" : c[id];
    return h(
      "i",
      { class: "g-ball", style: `background:${bg}` },
      h("b", { class: "g-num", text: id === 0 ? "" : String(id) }),
    );
  }

  /** A ball has just dropped into pocket `p`: roll it in from that pocket's screen x. */
  pocket(id: number, screenX: number): void {
    // The cue ball is respotted after a scratch; only object balls live in the gutter.
    if (id === 0 || this.els.has(id)) return;
    const el = this.ball(id);
    this.layer.append(el);
    const i = this.order.length;
    this.order.push(id);
    this.els.set(id, el);
    const w = size().w;
    const from = Math.max(this.gs / 2, Math.min(w - this.gs / 2, screenX));
    const to = this.slotX(i);
    const dist = Math.abs(to - from);
    const dur = Math.max(220, Math.min(1600, 240 + dist * 1.05));
    el.style.transform = `translate(${from}px, -18px)`;
    el.style.opacity = "0.25";
    const anim = el.animate(
      [
        { transform: `translate(${from}px, -18px)`, opacity: 0.25 },
        { transform: `translate(${from}px, 0px)`, opacity: 1, offset: 0.22 },
        { transform: `translate(${to}px, 0px)`, opacity: 1 },
      ],
      { duration: dur, easing: "cubic-bezier(.22,.9,.3,1)", fill: "forwards" },
    );
    anim.onfinish = () => {
      el.style.transform = `translate(${to}px, 0px)`;
      el.style.opacity = "1";
    };
  }

  /** Reconcile with the authoritative state: drop respotted balls, restore missing pots at their slots. */
  sync(st: GameState): void {
    const on = new Set(st.balls.filter((b) => b.on).map((b) => b.id));
    for (const id of [...this.order]) if (on.has(id)) this.remove(id);
    for (const b of st.balls) {
      if (b.on || b.id === 0 || this.els.has(b.id)) continue;
      const el = this.ball(b.id);
      const i = this.order.length;
      this.order.push(b.id);
      this.els.set(b.id, el);
      el.style.transform = `translate(${this.slotX(i)}px, 0px)`;
      this.layer.append(el);
    }
    if (!st.broken) this.clear();
  }

  clear(): void {
    this.order = [];
    this.els.clear();
    this.layer.replaceChildren();
  }

  private remove(id: number): void {
    this.els.get(id)?.remove();
    this.els.delete(id);
    this.order = this.order.filter((x) => x !== id);
    this.order.forEach((x, i) => {
      const el = this.els.get(x);
      if (el) el.style.transform = `translate(${this.slotX(i)}px, 0px)`;
    });
  }
}
