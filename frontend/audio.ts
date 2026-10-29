import type { SimEvent } from "../shared/physics/types.ts";
import { prefs } from "./prefs/store.ts";

/** Contact sounds synthesised from impulse: amplitude ∝ J (N·s), band set by contact type. */
export class Audio {
  ctx: AudioContext | null = null;
  noise: AudioBuffer | null = null;

  /** Volume 0 in settings silences everything. */
  get muted(): boolean {
    return prefs.volume <= 0;
  }

  constructor() {
    const unlock = () => {
      this.ensure();
      removeEventListener("pointerdown", unlock);
    };
    addEventListener("pointerdown", unlock);
  }

  private ensure(): AudioContext | null {
    if (!this.ctx) {
      const C = globalThis.AudioContext ?? (globalThis as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!C) return null;
      this.ctx = new C();
      const n = this.ctx.sampleRate * 0.25;
      this.noise = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === "suspended") this.ctx.resume();
    return this.ctx;
  }

  private burst(freq: number, q: number, gain: number, decay: number, delay = 0): void {
    const c = this.ensure();
    if (!c || !this.noise || this.muted || gain < 0.002) return;
    const t = c.currentTime + delay;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.value = freq;
    f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(Math.min(1, gain), t);
    g.gain.exponentialRampToValueAtTime(0.0005, t + decay);
    src.connect(f).connect(g).connect(this.out(c));
    src.start(t, Math.random() * 0.1, decay + 0.02);
  }

  private master: GainNode | null = null;
  private out(c: AudioContext): GainNode {
    this.master ??= c.createGain();
    this.master.gain.value = prefs.volume;
    this.master.connect(c.destination);
    return this.master;
  }

  /** Sine partials with exponential decay: two-note turn chime, single short clock tick. */
  private tone(freq: number, gain: number, decay: number, delay = 0): void {
    const c = this.ensure();
    if (!c || this.muted) return;
    const t = c.currentTime + delay, o = c.createOscillator(), g = c.createGain();
    o.frequency.value = freq;
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0005, t + decay);
    o.connect(g).connect(this.out(c));
    o.start(t);
    o.stop(t + decay + 0.02);
  }

  chime(): void {
    this.tone(880, 0.12, 0.35);
    this.tone(1318.5, 0.1, 0.5, 0.11);
  }

  /** Rising triad for a win, falling minor third for a loss. */
  finale(won: boolean): void {
    const f = won ? [523.25, 659.25, 783.99] : [392, 329.63];
    f.forEach((x, i) => this.tone(x, 0.12, 0.6, i * 0.14));
  }

  tick(): void {
    this.tone(2093, 0.08, 0.05);
  }

  /** Nerves: a low lub-dub whose force grows as the shot clock runs out. */
  heartbeat(pressure: number): void {
    const gain = 0.09 + 0.16 * Math.max(0, Math.min(1, pressure));
    this.tone(52, gain, 0.13);
    this.tone(66, gain * 0.65, 0.1, 0.17);
  }

  strike(power: number): void {
    this.burst(1400, 2, 0.15 + 0.5 * power, 0.03);
  }

  events(ev: SimEvent[]): void {
    for (const e of ev) {
      if (e.k === "ball") this.burst(3200 + 800 * Math.random(), 6, Math.pow(e.j / 0.8, 0.8) * 0.9, 0.035);
      else if (e.k === "rail") this.burst(420, 1.2, Math.pow(e.j / 1.2, 0.8) * 0.5, 0.06);
      else if (e.k === "jaw") {
        // A dead thud plus a short rattle: the ball hit a pocket facing and stayed out.
        this.burst(260, 1.6, Math.pow(e.j / 0.9, 0.7) * 0.55, 0.07);
        this.burst(1150, 4, 0.08, 0.04, 0.045);
      } else if (e.k === "pocket" || e.k === "off") {
        this.burst(180, 1.5, 0.55, 0.12);
        this.burst(900, 3, 0.18, 0.05, 0.09);
        this.burst(700, 3, 0.12, 0.05, 0.16);
      }
    }
  }
}
