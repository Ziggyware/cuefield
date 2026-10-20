import type { GameState, StrikeCmd } from "../../shared/game/types.ts";
import type { Aim } from "../aim.ts";
import type { Audio } from "../audio.ts";
import type { Overlay } from "../render/overlay.ts";
import type { Renderer } from "../render/renderer.ts";

export interface SessionHooks {
  isLocal(seat: 0 | 1): boolean;
  shoot(cmd: StrikeCmd): void;
  settled(st: GameState, cmd: StrikeCmd): void;
  aim?(a: Aim, pull: number, place: [number, number] | null): void;
}

export interface Gfx {
  renderer: Renderer;
  overlay: Overlay;
  audio: Audio;
}
