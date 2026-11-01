import assert from "node:assert/strict";
import { test } from "node:test";
import { TABLES } from "../shared/catalog.ts";
import { ball } from "../shared/game/rack.ts";
import { RAIL, View, quality } from "../frontend/view.ts";

const bounds = { top: 108, bottom: 112, left: 150, right: 150 };

test("camera fits the entire wood rail, not only the cloth, on every venue", () => {
  for (const spec of TABLES) {
    for (const [w, h] of [[1568, 780], [1024, 768], [844, 390], [667, 375]]) {
      const v = new View();
      v.fit(spec.L, spec.W, w, h, bounds);
      const [left, bottom] = v.toScreen(-spec.L / 2 - RAIL, -spec.W / 2 - RAIL);
      const [right, top] = v.toScreen(spec.L / 2 + RAIL, spec.W / 2 + RAIL);
      assert.ok(left >= bounds.left - 1e-7);
      assert.ok(right <= w - bounds.right + 1e-7);
      assert.ok(top >= bounds.top - 1e-7);
      assert.ok(bottom <= h - bounds.bottom + 1e-7);
    }
  }
});

test("moving-ball fit uses a dimensionless zoom and stays inside requested magnification", () => {
  const spec = TABLES[0], base = new View(), v = new View();
  base.fit(spec.L, spec.W, 1568, 780, bounds);
  const balls = [ball(0, -.3, 0), ball(1, .3, .1)];
  balls[0].vx = .5;
  balls[1].vy = -.2;
  for (const zoom of [1, 1.5, 2.2]) {
    v.fit(spec.L, spec.W, 1568, 780, bounds, zoom, [0, 0], balls);
    assert.ok(v.s >= base.s);
    assert.ok(v.s <= base.s * zoom + 1e-7, "scale must not be multiplied by pixels-per-metre twice");
  }
});

test("zoomed world/screen coordinates round trip and settle correctly", () => {
  const v = new View();
  v.fit(2, 1, 1568, 780, bounds, 2.2, [.4, -.2]);
  const original: [number, number] = [.13, -.24];
  const actual = v.toWorld(...v.toScreen(...original));
  assert.ok(Math.abs(original[0] - actual[0]) < 1e-10);
  assert.ok(Math.abs(original[1] - actual[1]) < 1e-10);
  assert.equal(v.moving(), true);
  v.settle();
  assert.equal(v.moving(), false);
});

test("adaptive quality keeps at least one physical sample per CSS pixel", () => {
  const before = quality.scale;
  try {
    quality.scale = .6;
    const v = new View();
    v.fit(2, 1, 1568, 780, bounds);
    assert.ok(v.dpr >= 1);
  } finally {
    quality.scale = before;
  }
});
