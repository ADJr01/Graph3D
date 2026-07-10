import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { BarChart } from '../../src/chart/BarChart.js';
import { LineChart } from '../../src/chart/LineChart.js';
import { ScatterChart } from '../../src/chart/ScatterChart.js';
import { AreaChart } from '../../src/chart/AreaChart.js';
import { SurfaceChart } from '../../src/chart/SurfaceChart.js';
import { HeatmapChart } from '../../src/chart/HeatmapChart.js';
import { NetworkChart } from '../../src/chart/NetworkChart.js';
import { TreeChart } from '../../src/chart/TreeChart.js';
import { PackChart } from '../../src/chart/PackChart.js';
import { PieChart } from '../../src/chart/PieChart.js';
import { VolumeChart } from '../../src/chart/VolumeChart.js';
import { palette } from '../../src/compose/index.js';

// Phase 8 cross-cutting integration tests (Prompt 145). Every chart type
// already has its own lifecycle test in this directory, and join-hook
// dispatch (enter/update/exit sets) plus `.use()` middleware order-stability
// are already thoroughly covered on the abstract base class in
// tests/chart/GraphChart.test.js (Prompts 128/130/142) — not re-tested here.
// What's new: (a) a single table proving all 11 types still render together
// (catches a type accidentally broken by an unrelated change faster than 11
// separate files), (b)/(c) sustained-use leak checks no existing test runs
// (only create/destroy was covered, not repeated update()), (d) accessor
// styling actually landing in the instanced backend's real
// InstancedBufferAttribute rather than just being requested, and (e) a
// hand-written selection micro-edit surviving update()'s default
// position/scale rewrite for a datum whose bound data didn't change.

// BarChart/ScatterChart/HeatmapChart inherit GraphChart.data() as-is, which
// returns a JoinResult (not `this` — Prompt 128's documented two-in-one join
// API), so `.data(...)` can't be the last link in their chain here.
// LineChart/AreaChart/TreeChart/PackChart override `.data()` as a plain
// getter/setter returning `this` (they don't join per-datum the same way),
// so chaining it last is fine for those.
const CHART_BUILDERS = {
  bar: (scene) => {
    const chart = new BarChart(scene).x((d) => d.id).y((d) => d.value);
    chart.data([{ id: 0, value: 1 }, { id: 1, value: 2 }]);
    return chart;
  },
  line: (scene) => new LineChart(scene).x((d) => d.t).y((d) => d.value).data([{ t: 0, value: 0 }, { t: 1, value: 1 }]),
  scatter: (scene) => {
    const chart = new ScatterChart(scene).x((d) => d.x).y((d) => d.y);
    chart.data([{ x: 0, y: 0 }, { x: 1, y: 1 }]);
    return chart;
  },
  area: (scene) => new AreaChart(scene).x((d) => d.t).y((d) => d.value).data([{ t: 0, value: 0 }, { t: 1, value: 1 }]),
  surface: (scene) => new SurfaceChart(scene).values((x, z) => x + z).xDomain([-1, 1]).zDomain([-1, 1]).resolution(4),
  heatmap: (scene) => {
    const chart = new HeatmapChart(scene).x((d) => d.col).z((d) => d.row).color((d) => d.value);
    chart.data([{ col: 0, row: 0, value: 1 }, { col: 1, row: 1, value: 2 }]);
    return chart;
  },
  network: (scene) => new NetworkChart(scene).data([{ id: 0 }, { id: 1 }]).links([{ source: 0, target: 1 }]),
  tree: (scene) => new TreeChart(scene).data({ name: 'root', children: [{ name: 'a', value: 1 }] }),
  pack: (scene) => new PackChart(scene).data({ name: 'root', children: [{ name: 'a', value: 1 }] }),
  pie: (scene) => new PieChart(scene).data([{ count: 1 }, { count: 2 }]).value((d) => d.count),
  volume: (scene) => new VolumeChart(scene).values((x, y, z) => x + y + z).xDomain([-1, 1]).yDomain([-1, 1]).zDomain([-1, 1]).resolution(4).steps(4),
};

describe('Phase 8 integration', () => {
  // ── (a) every chart type renders ────────────────────────────────────────

  describe('(a) every chart type renders and destroys cleanly', () => {
    for (const [name, build] of Object.entries(CHART_BUILDERS)) {
      it(name, () => {
        const scene = new THREE.Scene();
        const chart = build(scene);
        expect(() => chart.render()).not.toThrow();
        expect(scene.children.length).toBeGreaterThan(0);
        chart.destroy();
        expect(scene.children.length).toBe(0);
      });
    }
  });

  // ── (b) 1000x update() leak-free ────────────────────────────────────────

  it('(b) 1000x update() with fresh data each pass leaves no residue on the instanced backend', () => {
    const scene = new THREE.Scene();
    const rows = (seed) => Array.from({ length: 60 }, (_, i) => ({ id: i, value: seed + i }));
    const chart = new BarChart(scene).x((d) => d.id).y((d) => d.value);
    chart.data(rows(0), (d) => d.id);
    chart.render();
    expect(scene.children.length).toBe(1); // instanced backend: one InstancedMesh

    for (let i = 0; i < 1000; i++) {
      chart.data(rows(i), (d) => d.id);
      expect(() => chart.update()).not.toThrow();
    }
    expect(scene.children.length).toBe(1);
    chart.destroy();
    expect(scene.children.length).toBe(0);
  });

  // ── (c) 1000x create/destroy leak-free (concrete chart type) ───────────

  it('(c) 1000x create/render/destroy cycles on a concrete chart type leave no scene children', () => {
    const scene = new THREE.Scene();
    const rows = Array.from({ length: 60 }, (_, i) => ({ id: i, value: i }));
    for (let i = 0; i < 1000; i++) {
      const chart = new BarChart(scene).x((d) => d.id).y((d) => d.value).color((d) => d.value);
      chart.data(rows, (d) => d.id);
      chart.render();
      chart.destroy();
    }
    expect(scene.children.length).toBe(0);
  });

  // ── (d) accessor styling maps to real instance attributes ──────────────

  it('(d) .color(accessor) lands in the InstancedMesh.instanceColor buffer, not just in the Selection request', () => {
    const scene = new THREE.Scene();
    const rows = Array.from({ length: 60 }, (_, i) => ({ id: i, group: i % 2 }));
    const chart = new BarChart(scene)
      .x((d) => d.id)
      .y((d) => d.id)
      .color((d) => d.group, palette.category10);
    chart.data(rows, (d) => d.id);
    chart.render();

    const mesh = scene.children[0];
    expect(mesh).toBeInstanceOf(THREE.InstancedMesh);
    expect(mesh.instanceColor).not.toBeNull();

    // Float32Array storage round-trips through 32-bit precision, so compare
    // components with a tolerance rather than THREE.Color#equals (exact ===).
    const isCloseTo = (a, b) => Math.abs(a.r - b.r) < 1e-5 && Math.abs(a.g - b.g) < 1e-5 && Math.abs(a.b - b.b) < 1e-5;
    const expected0 = new THREE.Color(palette.category10(0));
    const expected1 = new THREE.Color(palette.category10(1));
    let count0 = 0;
    let count1 = 0;
    for (let i = 0; i < rows.length; i++) {
      const instanceColor = new THREE.Color().fromArray(mesh.instanceColor.array, i * 3);
      if (isCloseTo(instanceColor, expected0)) count0++;
      else if (isCloseTo(instanceColor, expected1)) count1++;
    }
    // Order-agnostic: proves every group-0/group-1 datum got its palette
    // color somewhere in the buffer, without assuming instance index order.
    expect(count0).toBe(30);
    expect(count1).toBe(30);
  });

  // ── (e) selection micro-edits survive update() for unchanged datums ────

  it('(e) a hand-written selection.attr("color", ...) micro-edit survives update() when its datum is unchanged', () => {
    const scene = new THREE.Scene();
    const rows = [{ id: 0, value: 1 }, { id: 1, value: 2 }, { id: 2, value: 3 }];
    const chart = new BarChart(scene).x((d) => d.id).y((d) => d.value);
    chart.data(rows, (d) => d.id);
    chart.render();

    // update()'s default (handler-less) path only ever rewrites
    // position/scale (GraphChart.js#writeComputedTransform) — a color
    // written by hand through the public Selection API is never one of the
    // fields it touches, so it must still be there after a re-join of the
    // exact same data.
    chart.selection().filter((d) => d.id === 0).attr('color', 'crimson');

    chart.data(rows, (d) => d.id); // identical data/keys — nothing enters, exits, or moves
    chart.update();

    const meshForId0 = scene.children[0];
    expect(meshForId0.material.color.getHexString()).toBe(new THREE.Color('crimson').getHexString());
  });
});
