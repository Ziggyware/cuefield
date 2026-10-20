import { type Group, pct, T, x } from "./defs.ts";

export const GROUPS_A: Group[] = [
  {
    title: "MATCH",
    defs: [
      { k: "botLevel", label: "bot difficulty", note: "Default opponent for vs bot.", c: { kind: "select", options: [[0, "easy"], [1, "club"], [2, "pro"]] } },
      { k: "strokeConfirm", label: "stroke lock", note: "Releasing the power bar arms the shot; a second tap strikes. Ends misfires.", c: T },
      { k: "turnAlert", label: "turn alert", note: "Chime, vibration and a flashing tab title when the table is yours.", c: T },
      { k: "haptics", label: "contact haptics", note: "Vibration scaled by each collision impulse.", c: T },
      { k: "volume", label: "volume", note: "", c: { kind: "range", min: 0, max: 1, step: 0.05, fmt: pct } },
      { k: "hideOpponentCue", label: "focus mode", note: "Hide the opponent's live cue while they aim.", c: T },
      { k: "muteOpponent", label: "mute opponent", note: "Drop incoming emotes and chat.", c: T },
    ],
  },
  {
    title: "PREDICTION",
    note: "Venues cap the guide; these settings shape it within that cap.",
    defs: [
      {
        k: "guideReach",
        label: "prediction distance",
        note: "Share of the venue's guide length to draw.",
        c: { kind: "range", min: 0.25, max: 1, step: 0.05, fmt: pct },
      },
      {
        k: "guidePrecision",
        label: "prediction accuracy",
        note: "Path sampling: 12 traces every 0.5 ms physics step.",
        c: { kind: "range", min: 1, max: 12, step: 1, fmt: (v) => `${v}/12` },
      },
      {
        k: "practiceGuide",
        label: "practice prediction",
        note: "Default prediction when practising alone; also offered when hosting.",
        c: { kind: "select", options: [[4, "4 · full"], [3, "3 · cue + first ball"], [2, "2 · cue ball only"], [1, "1 · none"]] },
      },
      { k: "spreadCone", label: "stroke spread cone", note: "±2σ aim error of your cue at the current power: where the shot can really go.", c: T },
      {
        k: "bankMirror",
        label: "bank finder",
        note: "One-cushion bank lines from the targeted ball, found by mirroring every pocket across each cushion.",
        c: T,
      },
      { k: "ballLabels", label: "ball labels", note: "Number above every ball.", c: T },
    ],
  },
  {
    title: "MOTION",
    defs: [
      { k: "playbackSpeed", label: "shot playback", note: "Slow every shot down in real time.", c: { kind: "range", min: 0.25, max: 1, step: 0.05, fmt: x } },
      {
        k: "instantReplay",
        label: "instant replay",
        note: "Replay the last shot from the physics log.",
        c: { kind: "select", options: [["off", "off"], ["button", "on demand"], ["auto", "after every shot"]] },
      },
      { k: "trails", label: "motion trails", note: "Paths of every ball from the last shot.", c: T },
    ],
  },
];
