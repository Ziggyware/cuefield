/** Settings and cosmetics bought with coins; ids are stored in the player's unlock list with an "f:" prefix. */
export interface Feature {
  id: string;
  name: string;
  price: number;
}

export const FEATURES: Feature[] = [
  { id: "cone", name: "stroke spread cone", price: 300 },
  { id: "banks", name: "bank finder", price: 900 },
  { id: "labels", name: "ball labels", price: 100 },
  { id: "replay", name: "instant replay", price: 250 },
  { id: "slowmo", name: "slow-motion playback", price: 200 },
  { id: "trails", name: "motion trails", price: 200 },
  { id: "lock", name: "stroke lock", price: 120 },
  { id: "lab", name: "practice lab physics", price: 450 },
  { id: "sandbox", name: "practice sandbox", price: 300 },
  { id: "rewind", name: "practice rewind", price: 200 },
  { id: "themes", name: "themes and accent colour", price: 150 },
  { id: "balls", name: "classic and neon ball sets", price: 120 },
  { id: "cloth", name: "custom cloth colour", price: 200 },
];

/** Colour of the ring around balls you may legally hit first. White is free; each other colour is an unlock. */
export const RINGS: { id: string; hex: string; price: number }[] = [
  { id: "white", hex: "#ffffff", price: 0 },
  { id: "cyan", hex: "#22e4ff", price: 60 },
  { id: "magenta", hex: "#ff2fd2", price: 60 },
  { id: "orange", hex: "#ff8a00", price: 60 },
  { id: "red", hex: "#ff3030", price: 60 },
  { id: "lime", hex: "#7dff3a", price: 60 },
  { id: "violet", hex: "#9b6bff", price: 90 },
  { id: "spectrum", hex: "", price: 300 },
];

export const featureKey = (id: string) => `f:${id}`;
export const ringKey = (id: string) => `ring:${id}`;

/** Server-side price lookup for a "feature" purchase id (feature or ring). */
export function featurePrice(key: unknown): number | null {
  if (typeof key !== "string") return null;
  const [kind, id] = key.split(":");
  if (kind === "f") return FEATURES.find((f) => f.id === id)?.price ?? null;
  if (kind === "ring") return RINGS.find((r) => r.id === id && r.price > 0)?.price ?? null;
  return null;
}
