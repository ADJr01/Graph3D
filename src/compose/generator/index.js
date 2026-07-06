import { bar } from './bar.js';
import { line } from './line.js';
import { point } from './point.js';
import { surface } from './surface.js';
import { arc } from './arc.js';
import { area } from './area.js';
import { heatmap } from './heatmap.js';

export { accessor, accessorField } from './accessor.js';
export { buildBuffers } from './buffer.js';

/**
 * The `generator` namespace (CLAUDE.md §5) — pure data→buffer builders.
 * `bar` (Prompt 65), `point` (Prompt 67), and `heatmap` (Prompt 136) are
 * chainable factories ending in `.compute(data)` that return
 * `{ positions, scales, colors, attributes }` Float32Arrays ready for
 * `GraphInstancedObject.setAll*` (built on `buildBuffers`, above) — `point`
 * additionally tags its result with a `shape` string. `line` (Prompt 66)
 * instead returns `{ positions }`, a flat vertex stream for a Three.js
 * `Line2` — a continuous path isn't a set of independent instances, so it
 * doesn't go through `buildBuffers`. `surface` (Prompt 68), `arc` (Prompt
 * 69), and `area` (Prompt 135) return `{ positions, indices, normals }`, a
 * triangulated mesh for a `BufferGeometry` — also not instance data, so they
 * don't go through `buildBuffers` either. `area` shares `line`'s
 * `x`/`y`/`z`/`curve`/`tension` fields and top-edge curve sampling, extruding
 * it down to a `baseline`. `heatmap` is a fixed-size grid-cell box — no
 * baseline concept applies, unlike `bar`.
 */
export const generator = { bar, line, point, surface, arc, area, heatmap };
