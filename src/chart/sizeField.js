const SCALE_AXES = ['x', 'y', 'z'];

/**
 * Reads `index`'s current scale off the live backend — the same
 * `Selection.backend` escape hatch `ScatterChart.pick()` already
 * established, reused here (CLAUDE.md §1.1 DRY) rather than a second way
 * to reach the underlying `GraphMesh[]`/`GraphInstancedObject`.
 * @param {{type: string, meshes?: object[], object?: object, indices?: Uint32Array}} backend
 * @param {number} index
 * @returns {{x: number, y: number, z: number}}
 */
function readScale(backend, index) {
  return backend.type === 'meshes' ? backend.meshes[index].getScale() : backend.object.getInstanceScale(backend.indices[index]);
}

/**
 * Multiplies each of `axes`'s current per-datum scale component by
 * `chart.size()`'s accessor, writing back through `chart.selection().attr(...)`
 * — a per-datum size *multiplier* layered on top of whatever the chart's own
 * layout already computed (a bar's height, a node's `.r`-driven radius, ...),
 * never a replacement of it. No-op if `.size()` was never called.
 *
 * Reads the current scale once per axis-independent index (not once per
 * axis) via `chart.selection().backend`, then writes each requested axis —
 * safe against double-multiplying across repeated `update()` calls because
 * every current chart's `render()`/`update()` fully recomputes its base
 * scale from scratch on every call (CLAUDE.md §1.1 DRY — the established
 * full-rebuild-per-update precedent), so what's on the backend the moment
 * this runs is always that fresh, un-multiplied base value.
 * @param {{size: () => ((datum:*, index:number) => number)|null, selection: () => import('../compose/index.js').Selection}} chart
 *   Any `GraphChart` subclass — duck-typed to its `size()`/`selection()` getters.
 * @param {('x'|'y'|'z')[]} [axes] Which scale components the multiplier applies to. Default: all three.
 * @throws {TypeError} If any entry of `axes` isn't `'x'`, `'y'`, or `'z'`.
 * @example applySizeField(this); // uniform (sphere/wedge-shaped charts)
 * @example applySizeField(this, ['x', 'z']); // footprint only — leaves a bar's height/a tile's density alone
 */
export function applySizeField(chart, axes = SCALE_AXES) {
  const sizeAccessor = chart.size();
  if (!sizeAccessor) return;
  for (const axis of axes) {
    if (!SCALE_AXES.includes(axis)) {
      throw new TypeError(`applySizeField: axes must contain only 'x'/'y'/'z', received ${JSON.stringify(axis)}.`);
    }
  }

  const selection = chart.selection();
  const backend = selection.backend;
  const baseScales = Array.from({ length: selection.size() }, (_, i) => readScale(backend, i));

  for (const axis of axes) {
    selection.attr(`scale.${axis}`, (d, i) => baseScales[i][axis] * sizeAccessor(d, i));
  }
}
