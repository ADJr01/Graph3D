import { bar } from './bar.js';
import { line } from './line.js';
import { point } from './point.js';
import { surface } from './surface.js';
import { arc } from './arc.js';

export { accessor, accessorField } from './accessor.js';
export { buildBuffers } from './buffer.js';

/**
 * The `generator` namespace (CLAUDE.md §5) — pure data→buffer builders.
 * `bar` (Prompt 65) and `point` (Prompt 67) are chainable factories ending in
 * `.compute(data)` that return `{ positions, scales, colors, attributes }`
 * Float32Arrays ready for `GraphInstancedObject.setAll*` (built on
 * `buildBuffers`, above) — `point` additionally tags its result with a
 * `shape` string. `line` (Prompt 66) instead returns `{ positions }`, a flat
 * vertex stream for a Three.js `Line2` — a continuous path isn't a set of
 * independent instances, so it doesn't go through `buildBuffers`. `surface`
 * (Prompt 68) and `arc` (Prompt 69) return `{ positions, indices, normals }`,
 * a triangulated mesh for a `BufferGeometry` — also not instance data, so
 * they don't go through `buildBuffers` either.
 */
export const generator = { bar, line, point, surface, arc };
