const AXES = new Set(['x', 'y', 'z']);

/**
 * Validates an axis-orientation label — shared by `Axis` and
 * `annotation.referenceLine`/`referencePlane`, which both mark a constant
 * value along one of the three world axes.
 * @param {string} method
 * @param {*} value
 * @throws {TypeError} If `value` isn't `'x'`, `'y'`, or `'z'`.
 */
export function assertOrientation(method, value) {
  if (!AXES.has(value)) {
    throw new TypeError(`${method}: expected orientation to be one of 'x'|'y'|'z', received ${JSON.stringify(value)}.`);
  }
}

/**
 * Box dimensions `[width, height, depth]` for a thin bar of `length` running
 * along `orientation`, `thickness` on the other two axes — the shared shape
 * behind `Axis`'s spine/tick meshes and `annotation.referenceLine` (CLAUDE.md
 * §1.1 DRY two-strike rule: both need "which axis is the long one").
 * @param {'x'|'y'|'z'} orientation
 * @param {number} length
 * @param {number} thickness
 * @returns {[number, number, number]}
 * @throws {TypeError} If `orientation` isn't `'x'`, `'y'`, or `'z'`.
 * @example longAxisBoxSize('x', 10, 0.02); // [10, 0.02, 0.02]
 */
export function longAxisBoxSize(orientation, length, thickness) {
  assertOrientation('longAxisBoxSize', orientation);
  if (orientation === 'x') return [length, thickness, thickness];
  if (orientation === 'y') return [thickness, length, thickness];
  return [thickness, thickness, length];
}

/**
 * A world position with `value` along `orientation` and `0` on the other two axes.
 * @param {'x'|'y'|'z'} orientation
 * @param {number} value
 * @returns {{x: number, y: number, z: number}}
 * @throws {TypeError} If `orientation` isn't `'x'`, `'y'`, or `'z'`.
 * @example pointAlong('y', 3); // { x: 0, y: 3, z: 0 }
 */
export function pointAlong(orientation, value) {
  assertOrientation('pointAlong', orientation);
  if (orientation === 'x') return { x: value, y: 0, z: 0 };
  if (orientation === 'y') return { x: 0, y: value, z: 0 };
  return { x: 0, y: 0, z: value };
}
