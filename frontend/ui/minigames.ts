import { h } from "../dom.ts";
import { canVibrate } from "../game/motion.ts";

export interface Game {
  stop(): void;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** Panels share the same frame: title, instruction list, a live phase line, the play area and cancel. */
function panel(title: string, intro: string, help: string[], body: HTMLElement, cancel: () => void) {
  const phase = h("div", { class: "mg-phase" });
  const result = h("div", { class: "mg-result" });
  const el = h(
    "div",
    { class: "chalk-game mg", role: "dialog", "aria-label": title },
    h("div", { class: "chalk-title" }, h("b", { text: title }), h("div", { class: "mg-intro", text: intro })),
    h("ul", { class: "mg-help" }, ...help.map((t) => h("li", { text: t }))),
    phase,
    body,
    result,
    h("button", { class: "mg-cancel", text: "CANCEL · ESC", onclick: cancel }),
  );
  return { el, phase, result };
}

/** Bar with a green scoring band and an optional red hazard at both ends. */
function track(zoneLo: number, zoneHi: number, hazard: number) {
  const zone = h("div", { class: "mg-zone", style: `left:${zoneLo}%;width:${zoneHi - zoneLo}%` });
  const badA = h("div", { class: "mg-bad", style: `left:0%;width:${hazard}%` });
  const badB = h("div", { class: "mg-bad", style: `right:0%;width:${hazard}%` });
  const needle = h("div", { class: "mg-needle" });
  const fill = h("div", { class: "mg-fill" });
  const bar = h("div", { class: "chalk-bar mg-bar" }, badA, badB, zone, fill, needle);
  return { bar, needle, zone, fill };
}

function hud(title: string, intro: string, help: string[], body: HTMLElement, cancel: () => void) {
  const p = panel(title, intro, help, body, cancel);
  return p;
}

/** Tip chalk: two timing stops — the sweep, then the burnish — with grit at the edges that ruins the coat. */
export function tipChalkGame(done: (q: number) => void, cancel: () => void): { el: HTMLElement; stop: () => void } {
  const speed = 46 + Math.random() * 26;
  const zc = 42 + Math.random() * 16;
  const half = 7 + Math.random() * 4;
  const m = track(zc - half, zc + half, 10);
  m.zone.classList.add("good");
  const p = hud(
    "TIP CHALK",
    "A dry tip sprays the cue ball. Work the chalk in with two clean stops.",
    [
      "STOP 1 — tap the bar while the needle is inside the green band.",
      "STOP 2 — the needle speeds up: tap again inside the shrinking band to burnish the chalk.",
      "The red grit at the ends halves the coat. A perfect pair = 100%.",
    ],
    m.bar,
    () => finish(cancel),
  );
  let phase = 0, pos = 0, dir = 1, t = performance.now(), q1 = 0, q2 = 0, raf = 0, alive = true;
  const band = (now: number) => {
    const k = 0.62 - 0.35 * clamp01((now - t) / 5000);
    m.zone.style.left = `${Math.max(2, zc - half * k * 2)}%`;
    m.zone.style.width = `${Math.min(96, half * k * 4)}%`;
    return { lo: zc - half * k * 2, hi: zc + half * k * 2 };
  };
  const loop = (now: number) => {
    if (!alive) return;
    const dt = Math.min(50, now - t);
    t = now;
    pos += ((dir * speed * dt) / 1000) * (1 + (now - start) / 9000);
    if (pos >= 100) {
      pos = 100;
      dir = -1;
    } else if (pos <= 0) {
      pos = 0;
      dir = 1;
    }
    m.needle.style.left = `${pos}%`;
    raf = requestAnimationFrame(loop);
  };
  const start = performance.now();
  t = start;
  raf = requestAnimationFrame(loop);
  p.phase.textContent = "STOP 1 · line up the sweep";
  let settle = 0;
  const finish = (fn: () => void) => {
    // A result already on its way to `done` cannot be cancelled; the button must also drop that timer.
    clearTimeout(settle);
    cancelAnimationFrame(raf);
    const live = alive;
    alive = false;
    if (live) fn();
  };
  const tap = (e: Event) => {
    e.preventDefault();
    if (!alive) return;
    const now = performance.now();
    if (phase === 0) {
      const z = band(now).lo;
      const hi = band(now).hi;
      q1 = pos < z || pos > hi ? 0 : 1 - Math.abs(pos - (z + hi) / 2) / ((hi - z) / 2);
      if (pos < 10 || pos > 90) q1 *= 0.35;
      phase = 1;
      m.zone.classList.remove("good");
      m.zone.style.left = `${38 + Math.random() * 14}%`;
      m.zone.style.width = "10%";
      m.fill.style.width = "0%";
      p.phase.textContent = "STOP 2 · burnish the tip";
      if (canVibrate()) navigator.vibrate(8);
      return;
    }
    const zl = parseFloat(m.zone.style.left), zw = parseFloat(m.zone.style.width);
    const q = pos < zl || pos > zl + zw ? 0 : 1 - Math.abs(pos - (zl + zw / 2)) / (zw / 2);
    q2 = pos < 10 || pos > 90 ? q * 0.35 : q;
    const total = clamp01(0.55 * q1 + 0.45 * q2);
    const perfect = q1 > 0.92 && q2 > 0.92;
    p.result.textContent = perfect ? "PERFECT COAT · 100%" : `COAT ${Math.round(total * 100)}% · ${q1 > q2 ? "sweep clean" : "burnish short"}`;
    p.result.className = `mg-result ${total > 0.7 ? "good" : total > 0.35 ? "" : "bad"}`;
    if (canVibrate()) navigator.vibrate(perfect ? [12, 40, 18] : 10);
    alive = false;
    cancelAnimationFrame(raf);
    settle = window.setTimeout(() => done(perfect ? 1 : total), 520);
  };
  m.bar.addEventListener("pointerdown", tap);
  return {
    el: p.el,
    stop: () => {
      alive = false;
      cancelAnimationFrame(raf);
      clearTimeout(settle);
    },
  };
}

/**
 * Hand chalk: scrub left↔right to load the tip. Speed builds pressure; too much dusts the chalk off, too little
 * glazes it, and holding one side too long clumps it.
 */
export function handChalkGame(done: (q: number) => void, cancel: () => void): { el: HTMLElement; stop: () => void } {
  const m = track(30, 70, 0);
  m.zone.classList.add("good");
  const pressure = h("div", { class: "mg-meter" }, h("i", { class: "pm" }), h("span", { text: "PRESSURE" }));
  const clump = h("div", { class: "mg-meter" }, h("i", { class: "cl" }), h("span", { text: "CLUMP" }));
  const frame = h("div", { class: "mg-meters" }, pressure, clump);
  const p = hud(
    "HAND CHALK",
    "Scrub the chalk across the tip. Even pressure, no dust, no glaze.",
    [
      "SWIPE left ↔ right repeatedly; each reversal works more chalk in.",
      "Keep PRESSURE in the green: fast scrubbing dusts off, slow strokes glaze over.",
      "Reverse before CLUMP fills, or the chalk cakes and you lose part of the coat.",
    ],
    h("div", {}, m.bar, frame),
    () => finish(cancel),
  );
  let charge = 0, press = 0.45, clumpV = 0, lastX = -1, lastDir = 0, lastMove = performance.now(), alive = true, raf = 0, settle = 0;
  let dust = 0, glaze = 0, t = performance.now();
  const tick = (now: number) => {
    if (!alive) return;
    const dt = Math.min(100, now - t) / 1000;
    t = now;
    press = Math.max(0.05, press - dt * 0.45);
    clumpV = Math.max(0, clumpV - (now - lastMove > 260 ? 0 : dt * 0.15));
    if (press > 0.9) {
      dust += dt;
      charge = Math.max(0, charge - dt * 0.16);
    } else if (press < 0.16) {
      glaze += dt;
      charge = Math.max(0, charge - dt * 0.07);
    } else {
      dust = Math.max(0, dust - dt);
      glaze = Math.max(0, glaze - dt);
    }
    if (clumpV >= 1) {
      charge = Math.max(0, charge - 0.15);
      clumpV = 0.35;
      p.result.textContent = "CLUMPED · −15%";
      p.result.className = "mg-result bad";
      if (canVibrate()) navigator.vibrate(30);
    }
    m.fill.style.width = `${charge * 100}%`;
    (pressure.firstElementChild as HTMLElement).style.width = `${press * 100}%`;
    (clump.firstElementChild as HTMLElement).style.width = `${clumpV * 100}%`;
    m.needle.style.left = `${30 + press * 40}%`;
    p.phase.textContent = `COAT ${Math.round(charge * 100)}% · ${dust > 0.35 ? "DUSTING" : glaze > 0.6 ? "GLAZING" : "even"}`;
    if (charge >= 1) {
      p.phase.textContent = "FULL COAT";
      alive = false;
      cancelAnimationFrame(raf);
      settle = window.setTimeout(() => done(1), 320);
      return;
    }
    raf = requestAnimationFrame(tick);
  };
  const move = (e: PointerEvent) => {
    if (lastX < 0) {
      lastX = e.clientX;
      return;
    }
    const dx = e.clientX - lastX;
    if (Math.abs(dx) > 3) {
      const dir = Math.sign(dx);
      const speed = Math.abs(dx) / Math.max(8, performance.now() - lastMove);
      press = clamp01(press + speed * 1.15 - 0.02);
      if (dir !== lastDir && lastDir !== 0) {
        const clean = 1 - Math.min(1, Math.abs(press - 0.58) / 0.55);
        charge = Math.min(1, charge + 0.055 + 0.05 * clean);
        clumpV = Math.max(0, clumpV - 0.22);
        if (canVibrate()) navigator.vibrate(5);
      }
      lastDir = dir;
      lastX = e.clientX;
      lastMove = performance.now();
    }
  };
  m.bar.addEventListener("pointermove", move);
  m.bar.addEventListener("pointerdown", (e) => {
    lastX = e.clientX;
    lastMove = performance.now();
    m.bar.setPointerCapture(e.pointerId);
  });
  raf = requestAnimationFrame(tick);
  const finish = (fn: () => void) => {
    // A result already on its way to `done` cannot be cancelled; the button must also drop that timer.
    clearTimeout(settle);
    cancelAnimationFrame(raf);
    const live = alive;
    alive = false;
    if (live) fn();
  };
  return {
    el: p.el,
    stop: () => {
      alive = false;
      cancelAnimationFrame(raf);
      clearTimeout(settle);
    },
  };
}

/**
 * Heavy-stroke timing check. Above 80% power the cue has to be delivered straight: two stops (line, contact) with
 * red shank bands at the ends and a sweet spot that shrinks if you hold too long.
 */
export function strikeGame(power: number, done: (finesse: number) => void, cancel: () => void): { el: HTMLElement; stop: () => void } {
  const m = track(42, 58, 12);
  m.zone.classList.add("good");
  const p = hud(
    "PERFECT STRIKE",
    `${Math.round(power * 100)}% power — the harder the hit, the more the cue deflects.`,
    [
      "STOP 1 · LINE: stop the needle in the green to set a straight cue line.",
      "STOP 2 · CONTACT: the spot shrinks and drifts. Stop it dead centre for a perfect hit.",
      "Red SHANK bands at the ends throw the cue off line; hesitating past 3 s shrinks the spot.",
    ],
    m.bar,
    () => finish(cancel),
  );
  let phase = 0, pos = 0, dir = 1, alive = true, raf = 0, q1 = 0, q2 = 0, t = performance.now(), phaseT = t, settle = 0;
  let speed = 52 + power * 30;
  let c0 = 50, w0 = 8;
  const loop = (now: number) => {
    if (!alive) return;
    const dt = Math.min(50, now - t);
    t = now;
    pos += ((dir * speed * dt) / 1000) * (phase === 0 ? 1 : 1.22);
    if (pos >= 100) {
      pos = 100;
      dir = -1;
    } else if (pos <= 0) {
      pos = 0;
      dir = 1;
    }
    m.needle.style.left = `${pos}%`;
    const late = (now - phaseT) / 1000;
    if (phase === 1) {
      // The sweet spot drifts and, after three seconds of hesitation, narrows: computed from elapsed time so the
      // difficulty is the same on a 60 Hz and a 120 Hz screen.
      const drift = Math.sin(late * 1.7) * 5;
      const shrink = Math.max(3.2, w0 - Math.max(0, late - 3) * 2.4);
      m.zone.style.left = `${c0 - shrink / 2 + drift}%`;
      m.zone.style.width = `${shrink}%`;
      p.phase.textContent = `STOP 2 · contact · ${Math.max(0, 6 - late).toFixed(1)}s`;
    }
    raf = requestAnimationFrame(loop);
  };
  p.phase.textContent = "STOP 1 · line";
  raf = requestAnimationFrame(loop);
  const finish = (fn: () => void) => {
    // A result already on its way to `done` cannot be cancelled; the button must also drop that timer.
    clearTimeout(settle);
    cancelAnimationFrame(raf);
    const live = alive;
    alive = false;
    if (live) fn();
  };
  const tap = (e: Event) => {
    e.preventDefault();
    if (!alive) return;
    const zl = parseFloat(m.zone.style.left), zw = parseFloat(m.zone.style.width);
    const q = pos < zl || pos > zl + zw ? 0 : 1 - Math.abs(pos - (zl + zw / 2)) / (zw / 2);
    const shank = pos < 12 || pos > 88;
    if (phase === 0) {
      q1 = shank ? q * 0.3 : q;
      m.fill.style.width = "100%";
      phase = 1;
      c0 = 45 + Math.random() * 10;
      w0 = 8;
      m.zone.style.left = `${c0 - w0 / 2}%`;
      m.zone.style.width = `${w0}%`;
      phaseT = performance.now();
      p.phase.textContent = "STOP 2 · contact";
      if (canVibrate()) navigator.vibrate(8);
      return;
    }
    q2 = shank ? q * 0.3 : q;
    const quality = clamp01(0.45 * q1 + 0.55 * q2);
    const perfect = q1 > 0.94 && q2 > 0.94;
    const fine = perfect ? 1000 : Math.round(quality * 1000);
    p.result.textContent = perfect ? "PERFECT CONTACT · +spin stability" : `CONTACT ${Math.round(quality * 100)}% · ${q1 < q2 ? "line wobbles" : "tip skids"}`;
    p.result.className = `mg-result ${perfect ? "good" : quality > 0.55 ? "" : "bad"}`;
    if (canVibrate()) navigator.vibrate(perfect ? [14, 40, 22] : 12);
    alive = false;
    cancelAnimationFrame(raf);
    settle = window.setTimeout(() => done(fine), 560);
  };
  m.bar.addEventListener("pointerdown", tap);
  return {
    el: p.el,
    stop: () => {
      alive = false;
      cancelAnimationFrame(raf);
      clearTimeout(settle);
    },
  };
}
