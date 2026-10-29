import { narrate, narrationButton, roundText } from "../ui/rewards.ts";
import type { AssistLevel, CueSpec } from "../../shared/catalog.ts";
import type { GameState } from "../../shared/game/types.ts";
import { whisperOf } from "../../shared/lore.ts";
import { Audio } from "../audio.ts";
import { observe, resetRun } from "../badges.ts";
import { prefs } from "../prefs/store.ts";
import { h } from "../dom.ts";
import { Overlay } from "../render/overlay.ts";
import { Renderer } from "../render/renderer.ts";
import { Hud, type HudEvents, type Seat } from "../ui/hud.ts";
import { setWide, size, virtRect } from "../screen.ts";
import { RAIL } from "../view.ts";
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
  opts: { assist?: AssistLevel; unlocks?: string[]; highlights?: boolean } = {},
): TableScreen {
  setWide(true);
  const g = graphics();
  const session = new Session(state, cues, g, hooks, opts.assist);
  session.highlightsEnabled = opts.highlights !== false;
  // The HUD reads the effective cue so each player's upgrade badges are visible to the whole table.
  seats[0].cue ??= cues[0];
  seats[1].cue ??= cues[1];
  const extra = [
    { text: "−", fn: () => session.cycleZoom(-1) },
    { text: "+", fn: () => session.cycleZoom(1) },
    ...(prefs.instantReplay !== "off" ? [{ text: "↺", fn: () => session.startReplay() }] : []),
    ...(ev.extra ?? []),
  ];
  const hud = new Hud(seats, stake, { ...ev, extra }, opts.unlocks ?? []);
  const recap = h("div", { class: "round-recap", role: "status", "aria-live": "polite", text: "Rack ready · Make your opening play" });
  /** Cloth whispers: one line of physics or table lore after every settled shot. */
  const whisper = h("div", { class: "whisper", "aria-live": "polite" });
  const commentary = h(
    "div",
    { class: "commentary" },
    h("div", { style: "display:flex;flex-direction:column;gap:3px;min-width:0" }, recap, whisper),
    narrationButton(),
  );
  /** Nerves: the heartbeat vignette over the whole table. */
  const nerves = h("div", { class: "nerves" });
  session.controls.attach(hud.chalk, hud.cue);
  const replayTitle = h("strong"), replayNote = h("span");
  const shield = h("div", { class: "replay-guard", role: "status", "aria-live": "polite", "aria-hidden": "true" },
    h("div", { class: "replay-card" }, h("span", { class: "replay-eyebrow", text: "INSTANT REPLAY" }), replayTitle, replayNote));
  const swallow = (e: Event) => { e.preventDefault(); e.stopPropagation(); };
  for (const type of ["pointerdown", "pointerup", "click", "dblclick", "contextmenu"]) shield.addEventListener(type, swallow);
  session.onReplay = (r) => {
    if (shield.classList.contains("show") !== !!r) {
      shield.classList.toggle("show", !!r);
      shield.setAttribute("aria-hidden", String(!r));
    }
    if (!r) return;
    const note = r.phase === "before" ? `Replay starts in ${Math.ceil(2 - r.elapsed)}s · controls paused` :
      r.phase === "after" ? `Returning in ${Math.ceil(2 - r.elapsed)}s · controls paused` : "SLOW MOTION · controls paused";
    if (replayTitle.textContent !== r.label) replayTitle.textContent = r.label;
    if (replayNote.textContent !== note) replayNote.textContent = note;
  };
  const root = h("div", { style: "position:absolute;inset:0;pointer-events:none" }, nerves, hud.root, session.controls.root, session.gutter.root, commentary, shield);
  ui.replaceChildren(root);
  // The gutter measures its label from layout, so re-slot after the first paint.
  requestAnimationFrame(() => session.gutter.layout());
  const unbind = bindInput(session, document.getElementById("ov")!);
  let mine = false, lastTick = 0, lastAvail = 0, seenShot = session.state.shot, ended = session.state.winner >= 0;
  let lastTl = -1, lastTr = -1, nextBeat = 0;
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
      if (st.shot === 1) resetRun();
      // Only the stroke that actually produced this report: an undo/rewind restores an older state whose shot
      // number no longer matches the last simulated stroke, and must not re-feed whispers or badges.
      const ls = session.lastShot;
      if (l && ls && ls.cmd.k === "strike" && ls.pre.shot === st.shot - 1) {
        // The cloth whispers what just happened, and the badge case watches every shot.
        const line = prefs.whispers ? whisperOf(ls.cmd, l, st, { jaws: session.shotJaws, rails: session.shotRails }) : null;
        whisper.textContent = line ?? "";
        whisper.classList.toggle("show", !!line);
        observe({
          pre: ls.pre,
          st,
          rep: l,
          cmd: ls.cmd,
          seat: hooks.isLocal(l.by) ? l.by : null,
          jaws: session.shotJaws,
          rails: session.shotRails,
        });
      }
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
    // Stroke bands: each runs from a live table edge out to its screen edge. The same edges are published on the
    // root so the commentary strip can keep to the clear centre.
    const v = session.view, w = size().w;
    const halfW = (session.spec.L / 2 + RAIL) * v.s;
    const tl = Math.round(Math.max(84, Math.min(w - 84, v.cx - halfW)));
    const tr = Math.round(Math.max(84, Math.min(w - 84, v.cx + halfW)));
    if (tl !== lastTl || tr !== lastTr) {
      lastTl = tl;
      lastTr = tr;
      session.controls.zones(tl, tr);
      root.style.setProperty("--tl", `${tl}px`);
      root.style.setProperty("--tr", `${tr}px`);
      root.style.setProperty("--rw", `${w - tr}px`);
    }
    const left = session.deadline ? session.deadline - Date.now() : Infinity;
    const frac = session.deadline ? left / session.clockSpan : 1;
    hud.update(session.state, !session.sim && !session.replay, frac);
    const can = session.canAct();
    // Nerves: the table pulses and your heart does with it as the clock runs down.
    if (prefs.nerves && can && frac < 0.4 && !document.hidden) {
      const pressure = Math.max(0, Math.min(1, 1 - frac / 0.4));
      const beat = Math.round(950 - 520 * pressure);
      nerves.classList.add("on");
      nerves.style.setProperty("--beat", `${beat}ms`);
      if (Date.now() >= nextBeat) {
        g.audio.heartbeat(pressure);
        nextBeat = Date.now() + beat;
      }
    } else {
      nerves.classList.remove("on");
      nextBeat = 0;
    }
    if (can && !mine && seats[1].name !== "") alertTurn(g.audio);
    mine = can;
    document.title = can && document.hidden && prefs.turnAlert && Math.floor(Date.now() / 700) % 2 ? "▶ your shot" : title;
    const sec = Math.ceil(left / 1000);
    if (can && sec <= 5 && sec > 0 && sec !== lastTick) g.audio.tick();
    lastTick = sec;
  };
  const timer = setInterval(tick, 100);
  const relayout = () => session.gutter.layout();
  addEventListener("resize", relayout);
  return {
    session,
    hud,
    destroy() {
      setWide(false);
      removeEventListener("resize", relayout);
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
