import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { PieChart } from '../../src/chart/PieChart.js';
import { color, palette } from '../../src/compose/index.js';

function makeScene() {
  return new THREE.Scene();
}

function makeSlices(count) {
  return Array.from({ length: count }, (_, i) => ({ id: i, count: i + 1 }));
}

describe('PieChart', () => {
  describe('constructor', () => {
    it('throws if scene is falsy (inherited from GraphChart)', () => {
      expect(() => new PieChart(null)).toThrow(TypeError);
    });
  });

  describe('.data()', () => {
    it('stores and reads the slice array', () => {
      const chart = new PieChart(makeScene());
      const rows = makeSlices(3);
      chart.data(rows);
      expect(chart.data()).toBe(rows);
    });

    it('throws for a non-array', () => {
      expect(() => new PieChart(makeScene()).data('nope')).toThrow(TypeError);
    });
  });

  describe('.value()/.sortSlices()/.padAngle()', () => {
    it('getters/setters work', () => {
      const chart = new PieChart(makeScene());
      const valueFn = (d) => d.count;
      chart.value(valueFn);
      expect(chart.value()).toBe(valueFn);

      expect(chart.sortSlices()).toBeNull();
      const sortFn = (a, b) => b.count - a.count;
      chart.sortSlices(sortFn);
      expect(chart.sortSlices()).toBe(sortFn);
      chart.sortSlices(null);
      expect(chart.sortSlices()).toBeNull();

      expect(chart.padAngle()).toBe(0);
      chart.padAngle(0.05);
      expect(chart.padAngle()).toBe(0.05);
    });

    it('throws for invalid values', () => {
      const chart = new PieChart(makeScene());
      expect(() => chart.value('nope')).toThrow(TypeError);
      expect(() => chart.sortSlices('nope')).toThrow(TypeError);
      expect(() => chart.padAngle(NaN)).toThrow(TypeError);
    });
  });

  describe('.innerRadius()/.outerRadius()/.extrude()', () => {
    it('getters/setters accept a number or function', () => {
      const chart = new PieChart(makeScene());
      expect(chart.innerRadius()).toBe(0);
      chart.innerRadius(0.5);
      expect(chart.innerRadius()).toBe(0.5);

      expect(chart.outerRadius()).toBe(1);
      const fn = () => 2;
      chart.outerRadius(fn);
      expect(chart.outerRadius()).toBe(fn);

      expect(chart.extrude()).toBe(1);
      chart.extrude(0.3);
      expect(chart.extrude()).toBe(0.3);
    });

    it('throws for a non-number/function', () => {
      const chart = new PieChart(makeScene());
      expect(() => chart.innerRadius('nope')).toThrow(TypeError);
      expect(() => chart.outerRadius('nope')).toThrow(TypeError);
      expect(() => chart.extrude('nope')).toThrow(TypeError);
    });
  });

  describe('.explodeOffset()', () => {
    it('getter/setter accepts a finite number', () => {
      const chart = new PieChart(makeScene());
      expect(chart.explodeOffset()).toBe(0.3);
      chart.explodeOffset(0.6);
      expect(chart.explodeOffset()).toBe(0.6);
    });

    it('throws for a non-finite value', () => {
      expect(() => new PieChart(makeScene()).explodeOffset(NaN)).toThrow(TypeError);
    });
  });

  describe('render() — one mesh per slice', () => {
    it('throws calling render() before data(arr)', () => {
      expect(() => new PieChart(makeScene()).render()).toThrow(/call data\(arr\)/);
    });

    it('renders one GraphMesh per slice', () => {
      const scene = makeScene();
      const chart = new PieChart(scene).data(makeSlices(4)).value((d) => d.count);
      chart.render();
      expect(scene.children).toHaveLength(4);
    });

    it('every slice mesh has finite, non-degenerate geometry', () => {
      const scene = makeScene();
      const chart = new PieChart(scene).data(makeSlices(3)).value((d) => d.count);
      chart.render();
      for (const mesh of scene.children) {
        const positions = mesh.geometry.attributes.position.array;
        expect(positions.length).toBeGreaterThan(0);
        for (const v of positions) expect(Number.isFinite(v)).toBe(true);
      }
    });

    it('sweeps each slice through a distinct, non-degenerate angular span (not collapsed to a single angle)', () => {
      // Regression test: layout.pie() is chainable-only (like layout.stack()),
      // not an options-object constructor like layout.tree()/layout.pack() —
      // calling it the wrong way silently no-ops every option, collapsing
      // every slice's startAngle/endAngle to 0 (a degenerate wedge that still
      // passes a plain "positions are finite" check).
      const scene = makeScene();
      const chart = new PieChart(scene).data(makeSlices(3)).value((d) => d.count);
      chart.render();

      const outerRadiusOf = (mesh) => {
        const positions = mesh.geometry.attributes.position.array;
        let maxRadius = 0;
        for (let i = 0; i < positions.length; i += 3) {
          maxRadius = Math.max(maxRadius, Math.hypot(positions[i], positions[i + 2]));
        }
        return maxRadius;
      };
      for (const mesh of scene.children) expect(outerRadiusOf(mesh)).toBeCloseTo(1);

      // Distinct slices must occupy distinct angular regions — sample each
      // mesh's own mid-angle-direction vertex and confirm no two slices
      // share the same (x, z) direction (which a startAngle=endAngle=0
      // degenerate wedge would, since every "slice" would collapse to the
      // same angle-0 line).
      const angleOf = (mesh) => {
        const positions = mesh.geometry.attributes.position.array;
        // The outer-wall vertex farthest from the origin along y=0 gives a
        // representative angle for this wedge.
        let best = null;
        let bestRadius = 0;
        for (let i = 0; i < positions.length; i += 3) {
          const r = Math.hypot(positions[i], positions[i + 2]);
          if (r > bestRadius) {
            bestRadius = r;
            best = Math.atan2(positions[i + 2], positions[i]);
          }
        }
        return best;
      };
      const angles = scene.children.map(angleOf);
      const uniqueAngles = new Set(angles.map((a) => a.toFixed(3)));
      expect(uniqueAngles.size).toBeGreaterThan(1);
    });
  });

  describe('update()', () => {
    it('throws calling update() before render()', () => {
      const chart = new PieChart(makeScene()).data(makeSlices(2));
      expect(() => chart.update()).toThrow(/call render\(\) first/);
    });

    it('rebuilds the backend to match a changed slice count', () => {
      const scene = makeScene();
      const chart = new PieChart(scene).data(makeSlices(2)).value((d) => d.count);
      chart.render();

      chart.data(makeSlices(5));
      chart.update();
      expect(scene.children).toHaveLength(5);
    });
  });

  describe('.explode()', () => {
    it('throws calling explode() before render()', () => {
      const chart = new PieChart(makeScene()).data(makeSlices(2));
      expect(() => chart.explode(chart.data()[0])).toThrow(/call render\(\) first/);
    });

    it('offsets the slice mesh radially outward from center, and restores it', () => {
      const scene = makeScene();
      const rows = makeSlices(2);
      const chart = new PieChart(scene).data(rows).value((d) => d.count);
      chart.render();

      const mesh = scene.children.find((m) => m.userData.graph3d.datum === rows[0]);
      expect(mesh.position.length()).toBeCloseTo(0);

      chart.explode(rows[0], true);
      expect(mesh.position.length()).toBeCloseTo(chart.explodeOffset());

      chart.explode(rows[0], false);
      expect(mesh.position.length()).toBeCloseTo(0);
    });

    it('is a no-op for a datum that is not currently rendered', () => {
      const scene = makeScene();
      const rows = makeSlices(2);
      const chart = new PieChart(scene).data(rows).value((d) => d.count);
      chart.render();
      expect(() => chart.explode({ not: 'a slice' })).not.toThrow();
    });

    it('keeps an exploded datum exploded across update() (by reference)', () => {
      const scene = makeScene();
      const rows = makeSlices(2);
      const chart = new PieChart(scene).data(rows).value((d) => d.count);
      chart.render();
      chart.explode(rows[0], true);

      chart.data([...rows]); // same objects, new array
      chart.update();

      const mesh = scene.children.find((m) => m.userData.graph3d.datum === rows[0]);
      expect(mesh.position.length()).toBeCloseTo(chart.explodeOffset());
    });
  });

  describe('.pick()', () => {
    it('throws calling pick() before render()', () => {
      const chart = new PieChart(makeScene()).data(makeSlices(2));
      expect(() => chart.pick({})).toThrow(/call render\(\) first/);
    });

    it('returns null when the raycaster hits nothing', () => {
      const scene = makeScene();
      const chart = new PieChart(scene).data(makeSlices(2)).value((d) => d.count);
      chart.render();
      const raycaster = { intersectObjects: () => [] };
      expect(chart.pick(raycaster)).toBeNull();
    });

    it('returns the hit slice datum', () => {
      const scene = makeScene();
      const rows = makeSlices(2);
      const chart = new PieChart(scene).data(rows).value((d) => d.count);
      chart.render();
      const hitMesh = scene.children[1];
      const raycaster = { intersectObjects: () => [{ object: hitMesh }] };
      expect(chart.pick(raycaster)).toBe(rows[1]);
    });
  });

  describe('.color() — reused via applyColorField', () => {
    it('colors slices via palette.viridis when no palette is given', () => {
      const scene = makeScene();
      const rows = [
        { id: 0, count: 0 },
        { id: 1, count: 100 },
      ];
      const chart = new PieChart(scene).data(rows).value((d) => d.count + 1).color((d) => d.count);
      chart.render();

      const expectedScale = color.sequential(palette.viridis, [0, 100]);
      const meshA = scene.children.find((m) => m.userData.graph3d.datum === rows[0]);
      const meshB = scene.children.find((m) => m.userData.graph3d.datum === rows[1]);
      expect(meshA.material.color.getHexString()).toBe(new THREE.Color(expectedScale(0)).getHexString());
      expect(meshB.material.color.getHexString()).toBe(new THREE.Color(expectedScale(100)).getHexString());
    });
  });

  describe('.opacity()/.visible()/.size() (Prompt 141)', () => {
    it('applies per-datum opacity and visibility', () => {
      const scene = makeScene();
      const rows = [{ id: 0, count: 1 }, { id: 1, count: 1 }];
      const chart = new PieChart(scene)
        .data(rows)
        .value((d) => d.count)
        .opacity((d) => (d.id === 0 ? 1 : 0.4))
        .visible((d) => d.id === 0);
      chart.render();

      const meshA = scene.children.find((m) => m.userData.graph3d.datum === rows[0]);
      const meshB = scene.children.find((m) => m.userData.graph3d.datum === rows[1]);
      expect(meshA.material.opacity).toBeCloseTo(1);
      expect(meshB.material.opacity).toBeCloseTo(0.4);
      expect(meshA.visible).toBe(true);
      expect(meshB.visible).toBe(false);
    });

    it('.size(fn) uniformly scales a slice mesh (base scale is always 1)', () => {
      const scene = makeScene();
      const rows = [{ id: 0, count: 1 }, { id: 1, count: 1 }];
      const chart = new PieChart(scene)
        .data(rows)
        .value((d) => d.count)
        .size((d) => (d.id === 0 ? 1 : 2));
      chart.render();

      const meshA = scene.children.find((m) => m.userData.graph3d.datum === rows[0]);
      const meshB = scene.children.find((m) => m.userData.graph3d.datum === rows[1]);
      expect(meshA.scale.x).toBeCloseTo(1);
      expect(meshB.scale.x).toBeCloseTo(2);
      expect(meshB.scale.y).toBeCloseTo(2);
      expect(meshB.scale.z).toBeCloseTo(2);
    });

    it('leaves opacity/visible/size untouched when never called', () => {
      const scene = makeScene();
      const chart = new PieChart(scene).data([{ count: 1 }]).value((d) => d.count);
      chart.render();
      expect(scene.children[0].material.opacity).toBe(1);
      expect(scene.children[0].visible).toBe(true);
      expect(scene.children[0].scale.x).toBeCloseTo(1);
    });
  });

  describe('.legend(options) (Prompt 143)', () => {
    it('renders into the configured container on render()', () => {
      const scene = makeScene();
      const container = document.createElement('div');
      const rows = [{ id: 0, count: 1 }, { id: 1, count: 9 }];
      const chart = new PieChart(scene)
        .data(rows)
        .value((d) => d.count)
        .color((d) => d.count)
        .legend({ container });
      chart.render();

      expect(container.childNodes.length).toBe(1);
      expect(container.textContent).toContain('9');
    });
  });

  describe('destroy()', () => {
    it('disposes every slice mesh and is idempotent', () => {
      const scene = makeScene();
      const chart = new PieChart(scene).data(makeSlices(3)).value((d) => d.count);
      chart.render();
      expect(scene.children.length).toBeGreaterThan(0);

      chart.destroy();
      expect(scene.children.length).toBe(0);
      expect(() => chart.destroy()).not.toThrow();
    });

    it('throws calling public methods after destroy()', () => {
      const chart = new PieChart(makeScene()).data(makeSlices(2)).value((d) => d.count);
      chart.render();
      chart.destroy();

      expect(() => chart.render()).toThrow(/destroyed/);
      expect(() => chart.update()).toThrow(/destroyed/);
      expect(() => chart.data([])).toThrow(/destroyed/);
      expect(() => chart.explode({})).toThrow(/destroyed/);
      expect(() => chart.pick({})).toThrow(/destroyed/);
      expect(() => chart.selection()).toThrow(/destroyed/);
    });
  });
});
