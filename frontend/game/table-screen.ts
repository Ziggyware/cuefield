import { narrate, narrationButton, roundText } from "../ui/rewards.ts";
import type { AssistLevel, CueSpec } from "../../shared/catalog.ts";
import type { GameState } from "../../shared/game/types.ts";
import { Audio } from "../audio.ts";
import { prefs } from "../prefs/store.ts";
import { h } from "../dom.ts";
import { Overlay } from "../render/overlay.ts";
import { Renderer } from "../render/renderer.ts";
import { Hud, type HudEvents, type Seat } from "../ui/hud.ts";
import { setWide, size, virtRect } from "../screen.ts";
import { bindInput } from "./input.ts";
import { canVibrate } from "./motion.ts";
import { Session, type SessionHooks } from "./session.ts";

let gfx: { renderer: Renderer; overlay: Overlay; audio: Audio } | null = null;

/** Graphics and audio are created once per page; WebGL contexts are a scarce resource. */
export function graphics() {
  gfx ??= {
    renderer: new Renderer(document.getElementById("gl") as HTMLCanvasElement),
    overlay: new Overlay(document.getElementById("ov") as HTMLCanvasElement),
    audio: new Audio(),
  };
  return gfx;
}

function alertTurn(audio: Audio): void {
  if (!prefs.turnAlert) return;
  audio.chime();
  if (canVibrate()) navigator.vibrate([30, 60, 30]);
}

export interface TableScreen {
  session: Session;
  hud: Hud;
  destroy(): void;
}

export function mountTable(
  ui: HTMLElement,
  state: GameState,
  cues: [CueSpec, CueSpec],
  seats: [Seat, Seat],
  stake: string,
  hooks: SessionHooks,
  ev: Omit<HudEvents, "mute">,
  opts: { assist?: AssistLevel; unlocks?: string[] } = {},
): TableScreen {
  setWide(true);
  const g = graphics();
  const session = new Session(state, cues, g, hooks, opts.assist);
  const extra = [
    { text: "−", fn: () => session.cycleZoom(-1) },
    { text: "+", fn: () => session.cycleZoom(1) },
    ...(prefs.instantReplay !== "off" ? [{ text: "↺", fn: () => session.startReplay() }] : []),
    ...(ev.extra ?? []),
  ];
  const hud = new Hud(seats, stake, { ...ev, extra }, opts.unlocks ?? []);
  const recap = h("div", { class: "round-recap", role: "status", "aria-live": "polite", text: "Rack ready · Make your opening play" });
  const commentary = h("div", { class: "commentary" }, recap, narrationButton());
  const root = h("div", { style: "position:absolute;inset:0;pointer-events:none" }, hud.root, session.controls.root, commentary);
  ui.replaceChildren(root);
  const unbind = bindInput(session, document.getElementById("ov")!);
  let mine = false, lastTick = 0, lastAvail = 0, seenShot = session.state.shot, ended = session.state.winner >= 0;
  const title = document.title;
  /** HUD, alerts and counters at 10 Hz: layout reads stay off the render frame. */
  const tick = () => {
    const st = session.state;
    if (st.shot !== seenShot) {
      seenShot = st.shot;
      const summary = roundText(st, seats.map((s) => s.name));
      recap.textContent = summary;
      recap.getAnimations().forEach((a) => a.cancel());
      if (!matchMedia("(prefers-reduced-motion: reduce)").matches) recap.animate([{ opacity: 0, transform: "translateY(6px)" }, { opacity: 1, transform: "translateY(0)" }], { duration: 240, easing: "ease-out" });
      if (st.winner < 0) narrate(summary);
      const l = st.last;
      hud.run = l && !l.foul && l.keep && l.pocketed.length ? hud.run + 1 : 0;
    }
    if (st.winner >= 0 && !ended && seats[1].name !== "") g.audio.finale(hooks.isLocal(st.winner as 0 | 1));
    ended = st.winner >= 0;
    const r = virtRect(hud.root), top = r.y + r.h + 4;
    const avail = size().h - top - 48;
    if (top !== session.top || avail !== lastAvail) {
      session.top = top;
      lastAvail = avail;
      session.controls.root.style.top = `${top}px`;
      session.controls.root.style.setProperty("--avail", `${avail}px`);
    }
    const left = session.deadline ? session.deadline - Date.now() : Infinity;
    hud.update(session.state, !session.sim, session.deadline ? left / session.clockSpan : 1);
    const can = session.canAct();
    if (can && !mine && seats[1].name !== "") alertTurn(g.audio);
    mine = can;
    document.title = can && document.hidden && prefs.turnAlert && Math.floor(Date.now() / 700) % 2 ? "▶ your shot" : title;
    const sec = Math.ceil(left / 1000);
    if (can && sec <= 5 && sec > 0 && sec !== lastTick) g.audio.tick();
    lastTick = sec;
  };
  const timer = setInterval(tick, 100);
  return {
    session,
    hud,
    destroy() {
      setWide(false);
      session.stop();
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
      requestAnimationFrame(() => g.renderer.clear());
      unbind();
      clearInterval(timer);
      document.title = title;
      root.remove();
      const ov = document.getElementById("ov") as HTMLCanvasElement;
      ov.getContext("2d")!.clearRect(0, 0, ov.width, ov.height);
    },
  };
}
