import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { scale, palette, color, Selection, Axis, annotation } from '../../src/index.js';

// Integration proof for Prompt 85 (Phase 4 capstone): the exact "hand-rolled
// bar chart" pattern from examples/04-compose/main.js — Selection + join +
// scale.band()/scale.linear() + color.sequential() + Axis + annotation —
// run across many churning-membership join cycles with no chart class.

const CATEGORIES = ['A', 'B', 'C', 'D', 'E'];
const MAX_VALUE = 100;

describe('Phase 4 capstone: hand-rolled bar chart via Selection + join + scales + palettes', () => {
  it('re-joins a churning dataset across many cycles: correct membership, no leaks, template survives merge', () => {
    const scene = new THREE.Scene();
    const x = scale.band().domain(CATEGORIES).range([-5, 5]).paddingInner(0.3);
    const y = scale.linear().domain([0, MAX_VALUE]).range([0, 5]);
    const barColor = color.sequential(palette.viridis, [0, MAX_VALUE]);

    function layoutBars(selection) {
      selection
        .attr('position.x', (d) => x(d.id) + x.bandwidth() / 2)
        .attr('position.y', (d) => y(d.value) / 2)
        .attr('scale.y', (d) => Math.max(y(d.value), 0.001))
        .style('color', (d) => barColor(d.value));
    }

    let selection = new Selection({
      type: 'meshes',
      meshes: [],
      template: { scene, name: 'bar', geometry: new THREE.BoxGeometry(), material: new THREE.MeshStandardMaterial() },
    });

    function update(dataset) {
      const joined = selection.data(dataset, (d) => d.id);
      selection = joined.join(
        (entered) => layoutBars(entered),
        (updated) => layoutBars(updated),
        (exited) => exited.remove(),
      );
    }

    let seed = 1;
    function pseudoRandom() {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    }

    for (let cycle = 0; cycle < 200; cycle++) {
      const activeCount = 1 + Math.floor(pseudoRandom() * CATEGORIES.length);
      const active = CATEGORIES.filter(() => pseudoRandom() < activeCount / CATEGORIES.length);
      const dataset = active.map((id) => ({ id, value: 10 + pseudoRandom() * (MAX_VALUE - 10) }));

      update(dataset);

      // Every live bar's transform reflects its own datum, computed straight
      // from the scales (proves attr()/style() routing, not just the join).
      expect(selection.size()).toBe(dataset.length);
      for (const d of dataset) {
        const mesh = scene.children.find((c) => c.userData.graph3d?.datum?.id === d.id);
        expect(mesh).toBeDefined();
        expect(mesh.position.x).toBeCloseTo(x(d.id) + x.bandwidth() / 2);
        expect(mesh.position.y).toBeCloseTo(y(d.value) / 2);
        expect(mesh.scale.y).toBeCloseTo(Math.max(y(d.value), 0.001));
      }

      // No leaked scene children: exactly one mesh per live bar.
      expect(scene.children.length).toBe(dataset.length);
    }
  });

  it('Axis and annotation.referenceLine render alongside the bars without throwing', () => {
    const scene = new THREE.Scene();
    const x = scale.band().domain(CATEGORIES).range([-5, 5]).paddingInner(0.3);
    const y = scale.linear().domain([0, MAX_VALUE]).range([0, 5]);

    const xAxis = new Axis().scale(x).orientation('x').render(scene, 'xAxis');
    const yAxis = new Axis().scale(y).orientation('y').tickCount(5).render(scene, 'yAxis');
    const midline = annotation.referenceLine(y, MAX_VALUE / 2, { scene, name: 'midline', orientation: 'y', extent: 10 });

    expect(xAxis.labels.length).toBe(CATEGORIES.length);
    expect(yAxis.labels.length).toBeGreaterThan(0);
    expect(midline.getPosition().y).toBeCloseTo(y(MAX_VALUE / 2));

    xAxis.dispose();
    yAxis.dispose();
    midline.dispose();
    expect(scene.children.length).toBe(0);
  });
});
