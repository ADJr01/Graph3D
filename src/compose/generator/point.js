import { accessorField } from './accessor.js';
import { buildBuffers } from './buffer.js';

const DEFAULT_SIZE = 1;
const DEFAULT_SHAPE = 'sphere';

// A single `InstancedMesh` shares one geometry across all instances (CLAUDE.md
// anti-pattern table: "per-mesh code for >50 datums" is forbidden), so shape
// is one generator-level setting rather than a per-datum value.
const SHAPE_TYPES = ['sphere', 'cube', 'cone', 'custom'];

/**
 * Creates a chainable point generator: maps each datum to a position sized by
 * `size` (uniform scale on all 3 axes). `compute(data)` funnels through
 * `buildBuffers` (CLAUDE.md §1.1 DRY) and tags the result with the chosen
 * `shape`, which a higher layer (`object/`) uses to pick the instanced
 * geometry — `'custom'` means the caller supplies that geometry itself.
 * @returns {{
 *   x: (accessorOrScale?: *) => (Function|object),
 *   y: (accessorOrScale?: *) => (Function|object),
 *   z: (accessorOrScale?: *) => (Function|object),
 *   size: (accessorOrScale?: *) => (Function|object),
 *   shape: (type?: ('sphere'|'cube'|'cone'|'custom')) => (string|object),
 *   compute: (data: Array) => { positions: Float32Array, scales: Float32Array, colors: (Float32Array|null), attributes: object, shape: string },
 * }}
 * @example
 * const points = generator.point().y((d) => d.value).size(0.3).shape('cube');
 * points.compute([{ value: 3 }, { value: 5 }]);
 */
export function point() {
  const gen = {};

  /** Get (no args) or set (chainable) the point's x accessor. Defaults to the datum's index. */
  gen.x = accessorField(gen, (d, i) => i);

  /** Get (no args) or set (chainable) the point's y accessor. Defaults to the datum itself. */
  gen.y = accessorField(gen, (d) => d);

  /** Get (no args) or set (chainable) the point's z accessor. Defaults to `0`. */
  gen.z = accessorField(gen, 0);

  /** Get (no args) or set (chainable) the point's uniform size. Default `1`. */
  gen.size = accessorField(gen, DEFAULT_SIZE);

  let shapeType = DEFAULT_SHAPE;

  /**
   * Get (no args) or set (chainable) the instanced geometry shape.
   * @param {'sphere'|'cube'|'cone'|'custom'} [type]
   * @returns {string|object}
   * @throws {TypeError} If `type` isn't one of the supported shape names.
   * @example generator.point().shape('cone');
   */
  gen.shape = function (type) {
    if (arguments.length === 0) return shapeType;
    if (!SHAPE_TYPES.includes(type)) {
      throw new TypeError(
        `generator.point().shape: expected one of ${SHAPE_TYPES.map((t) => `'${t}'`).join(', ')}, ` +
          `received ${JSON.stringify(type)}.`,
      );
    }
    shapeType = type;
    return gen;
  };

  /**
   * Computes instanced-render-ready buffers for `data`, tagged with `shape`.
   * @param {Array} data
   * @returns {{ positions: Float32Array, scales: Float32Array, colors: (Float32Array|null), attributes: object, shape: string }}
   * @throws {TypeError} If `data` isn't an array.
   */
  gen.compute = function (data) {
    const buffers = buildBuffers(data, (d, i) => {
      const x = gen.x()(d, i);
      const y = gen.y()(d, i);
      const z = gen.z()(d, i);
      const size = gen.size()(d, i);
      return { position: [x, y, z], scale: [size, size, size] };
    });
    return { ...buffers, shape: shapeType };
  };

  return gen;
}
