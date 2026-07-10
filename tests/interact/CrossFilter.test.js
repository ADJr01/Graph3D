import { describe, it, expect, vi, afterEach } from 'vitest';
import * as THREE from 'three';
import { link } from '../../src/interact/CrossFilter.js';
import { Brush } from '../../src/interact/Brush.js';
import { Picker } from '../../src/interact/Picker.js';
import { PointerRouter } from '../../src/interact/PointerRouter.js';
import { BarChart } from '../../src/chart/BarChart.js';
import { ScatterChart } from '../../src/chart/ScatterChart.js';
import { loop } from '../../src/core/Graph3DLoop.js';

// vi.spyOn(loop, 'add') is idempotent — spying on an already-spied method
// keeps accumulating call history across tests unless restored (same
// convention as tests/interact/PointerRouter.test.js).
afterEach(() => {
  vi.restoreAllMocks();
});

// Picker.pickAt() caches its result per (x, y) until the next loop frame
// (Prompt 147) — a test that changes which chart is registered *between* two
// clicks at the same coordinate must force that cache to expire first (same
// technique/rationale as tests/interact/PointerRouter.test.js's own helper).
function advanceFrame(addSpy, fromIndex) {
  addSpy.mock.calls[fromIndex][0]();
}

function makeChart(rows) {
  const chart = new BarChart(new THREE.Scene()).x((d) => d.id).y((d) => d.value);
  chart.data(rows, (d) => d.id);
  chart.render();
  return chart;
}

// Shared by the real-Brush and real-PointerRouter describe blocks below.
function makeOrthoCamera() {
  const camera = new THREE.OrthographicCamera(-5, 5, 5, -5, 0.1, 100);
  camera.position.set(0, 0, 10);
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
  return camera;
}

function makeDomElement() {
  return { width: 100, height: 100, addEventListener: vi.fn(), removeEventListener: vi.fn() };
}

function listenerFor(domElement, type) {
  return domElement.addEventListener.mock.calls.find(([eventType]) => eventType === type)[1];
}

/** A minimal `source` duck-typed to `on(event, handler)`, with a `fire` test hook that invokes the captured handler with a fake `Selection`-shaped `{ data() }`. */
function fakeSource() {
  let handler = null;
  return {
    on: (event, fn) => {
      expect(event).toBe('select');
      handler = fn;
    },
    fire: (selectedData) => handler({ data: () => selectedData }),
  };
}

describe('link validation', () => {
  it('throws TypeError if source lacks on()', () => {
    expect(() => link({}, makeChart([{ id: 0, value: 1 }]))).toThrow(TypeError);
  });

  it('throws TypeError if target lacks data()/render()', () => {
    expect(() => link(fakeSource(), {})).toThrow(TypeError);
  });

  it('throws TypeError if transform is given and is not a function', () => {
    expect(() => link(fakeSource(), makeChart([{ id: 0, value: 1 }]), { transform: 123 })).toThrow(TypeError);
  });
});

describe('link filtering', () => {
  it('filters target to rows referenced in the selected data (default transform)', () => {
    const rows = [{ id: 0, value: 1 }, { id: 1, value: 2 }, { id: 2, value: 3 }];
    const target = makeChart(rows);
    const source = fakeSource();
    link(source, target);

    source.fire([rows[1]]);
    expect(target.data()).toEqual([rows[1]]);
  });

  it('re-filters from the originally captured dataset on each select, not the previous filter result', () => {
    const rows = [{ id: 0, value: 1 }, { id: 1, value: 2 }, { id: 2, value: 3 }];
    const target = makeChart(rows);
    const source = fakeSource();
    link(source, target);

    source.fire([rows[0]]);
    expect(target.data()).toEqual([rows[0]]);

    source.fire([rows[0], rows[2]]);
    expect(target.data()).toEqual([rows[0], rows[2]]);
  });

  it('uses a custom transform to derive the predicate from the selected data', () => {
    const rows = [
      { id: 0, value: 1, category: 'a' },
      { id: 1, value: 2, category: 'b' },
      { id: 2, value: 3, category: 'a' },
    ];
    const target = makeChart(rows);
    const source = fakeSource();
    link(source, target, {
      transform: (selectedData) => {
        const categories = new Set(selectedData.map((d) => d.category));
        return (d) => categories.has(d.category);
      },
    });

    // The "selected data" here isn't even drawn from target's rows — transform only reads .category off it.
    source.fire([{ category: 'a' }]);
    expect(target.data()).toEqual([rows[0], rows[2]]);
  });

  it('links one source to multiple targets via two link() calls', () => {
    const rows = [{ id: 0, value: 1 }, { id: 1, value: 2 }];
    const targetB = makeChart(rows);
    const targetC = makeChart(rows);
    // fakeSource only supports one captured handler; two independent fake sources here
    // stand in for a real Brush's single 'select' event driving two separate link() calls.
    const sourceB = fakeSource();
    const sourceC = fakeSource();
    link(sourceB, targetB);
    link(sourceC, targetC);

    sourceB.fire([rows[0]]);
    sourceC.fire([rows[1]]);

    expect(targetB.data()).toEqual([rows[0]]);
    expect(targetC.data()).toEqual([rows[1]]);
  });
});

describe('link — real Brush integration', () => {
  it('filters targetChart when a Brush drag over sourceChart selects a datum', () => {
    const rows = [{ id: 0, value: 1 }, { id: 1, value: 1 }, { id: 2, value: 1 }];
    const sourceChart = makeChart(rows);
    // world x -3/0/3 -> screen x 20/50/80 under the orthographic camera above.
    sourceChart.selection().attr('position.x', (_d, i) => [-3, 0, 3][i]).attr('position.y', 0);

    const targetChart = makeChart(rows);

    const domElement = makeDomElement();
    const brush = new Brush({ camera: makeOrthoCamera(), domElement });
    brush.register(sourceChart);
    link(brush, targetChart);

    // Rect spans screen x [35, 65] -> only the middle datum (screen x 50, rows[1]).
    listenerFor(domElement, 'pointerdown')({ offsetX: 35, offsetY: 0 });
    listenerFor(domElement, 'pointerup')({ offsetX: 65, offsetY: 100 });

    expect(targetChart.data()).toEqual([rows[1]]);
  });
});

describe('link — a plain chart.on("select") as source (Prompt 156/158)', () => {
  // ScatterChart's x()/y()/z() are given raw (unscaled) accessors here — no
  // scale object attached — so a rendered point's world position always
  // equals its own datum's x/y/z fields exactly, with no domain-refitting
  // surprises after link() filters a chart down to fewer rows (unlike a
  // band-scaled BarChart, whose x() would re-fit to whatever's left). That
  // determinism is what lets the propagation test below click the *same*
  // world origin twice, before and after chartB gets filtered down to one row.
  function makeScatterChart(rows) {
    const chart = new ScatterChart(new THREE.Scene()).x((d) => d.x).y((d) => d.y).z((d) => d.z);
    chart.data(rows, (d) => d.id);
    chart.render();
    return chart;
  }

  function makePerspectiveCamera() {
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    camera.position.set(0, 0, 10);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    return camera;
  }

  const CANVAS = { width: 100, height: 100 };
  const CENTER = { offsetX: 50, offsetY: 50, shiftKey: false };

  it('filters target when a real click selects a datum in a GraphChart source', () => {
    // Only rows[1] sits at the world origin the camera looks straight down —
    // rows[0]/[2] are far off-screen misses (mirrors Picker.test.js's own convention).
    const rows = [{ id: 0, x: 1000, y: 1000, z: 0 }, { id: 1, x: 0, y: 0, z: 0 }, { id: 2, x: 1000, y: 1000, z: 0 }];
    const sourceChart = makeScatterChart(rows);
    const targetChart = makeScatterChart(rows); // same row objects — link()'s default transform needs shared identity

    const picker = new Picker({ camera: makePerspectiveCamera(), domElement: CANVAS });
    picker.register(sourceChart);
    const domElement = { addEventListener: vi.fn(), removeEventListener: vi.fn() };
    new PointerRouter({ picker, domElement });
    link(sourceChart, targetChart);

    listenerFor(domElement, 'click')(CENTER);

    expect(targetChart.data()).toEqual([rows[1]]);
  });

  it('propagates through a chain: clicking A filters B, then clicking (the now-filtered) B filters C', () => {
    const rows = [{ id: 0, x: 1000, y: 1000, z: 0 }, { id: 1, x: 0, y: 0, z: 0 }, { id: 2, x: 1000, y: 1000, z: 0 }];
    const chartA = makeScatterChart(rows);
    const chartB = makeScatterChart(rows);
    const chartC = makeScatterChart(rows); // never registered with the picker — just link()'s final target

    const picker = new Picker({ camera: makePerspectiveCamera(), domElement: CANVAS });
    picker.register(chartA).register(chartB);
    const domElement = { addEventListener: vi.fn(), removeEventListener: vi.fn() };
    new PointerRouter({ picker, domElement });
    link(chartA, chartB);
    link(chartB, chartC);

    const addSpy = vi.spyOn(loop, 'add');
    const callsBeforeFirstClick = addSpy.mock.calls.length;

    // Selects chartA's rows[1] -> filters chartB down to [rows[1]].
    listenerFor(domElement, 'click')(CENTER);
    expect(chartB.data()).toEqual([rows[1]]);

    // chartB's one remaining point is still at world (0,0,0) (rows[1]'s own
    // x/y/z, unscaled) — unregister chartA (whose own row is also still
    // there) to avoid a same-position pick tie, and force Picker.pickAt()'s
    // same-(x,y) cache (Prompt 147) to recompute rather than reuse the first
    // click's stale hit, then click again to select chartB's own
    // now-filtered datum, propagating the filter on to chartC.
    picker.unregister(chartA);
    advanceFrame(addSpy, callsBeforeFirstClick);
    listenerFor(domElement, 'click')(CENTER);
    expect(chartC.data()).toEqual([rows[1]]);
  });
});
