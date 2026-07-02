import { accessorField } from './accessor.js';
import { sampleCurve, CURVE_TYPES } from './curve.js';

const DEFAULT_TENSION = 0;
const DEFAULT_CURVE = 'linear';

/**
 * Creates a chainable line generator: maps `data` to a flat vertex position
 * stream — `[x0, y0, z0, x1, y1, z1, ...]` — ready for a Three.js `Line2`
 * (`new LineGeometry().setPositions(result.positions)`). Unlike
 * `generator.bar()`, this doesn't go through `buildBuffers`: a line isn't a
 * set of independent instances, it's one continuous path, so its output is
 * just the vertex stream `Line2` itself expects.
 * @returns {{
 *   x: (accessorOrScale?: *) => (Function|object),
 *   y: (accessorOrScale?: *) => (Function|object),
 *   z: (accessorOrScale?: *) => (Function|object),
 *   curve: (type?: ('linear'|'monotone'|'catmullRom'|'bezier')) => (string|object),
 *   tension: (value?: number) => (number|object),
 *   compute: (data: Array) => { positions: Float32Array },
 * }}
 * @example
 * const path = generator.line().x((d) => d.t).y((d) => d.v).curve('catmullRom');
 * path.compute([{ t: 0, v: 0 }, { t: 1, v: 2 }, { t: 2, v: 1 }]);
 */
export function line() {
  const gen = {};

  /** Get (no args) or set (chainable) the x accessor. Defaults to the datum's index. */
  gen.x = accessorField(gen, (d, i) => i);

  /** Get (no args) or set (chainable) the y accessor. Defaults to the datum itself. */
  gen.y = accessorField(gen, (d) => d);

  /** Get (no args) or set (chainable) the z accessor. Defaults to `0`. */
  gen.z = accessorField(gen, 0);

  let curveType = DEFAULT_CURVE;
  let tensionValue = DEFAULT_TENSION;

  /**
   * Get (no args) or set (chainable) the interpolation curve.
   * @param {'linear'|'monotone'|'catmullRom'|'bezier'} [type]
   * @returns {string|object}
   * @throws {TypeError} If `type` isn't one of the supported curve names.
   * @example generator.line().curve('catmullRom');
   */
  gen.curve = function (type) {
    if (arguments.length === 0) return curveType;
    if (!CURVE_TYPES.includes(type)) {
      throw new TypeError(
        `generator.line().curve: expected one of ${CURVE_TYPES.map((t) => `'${t}'`).join(', ')}, ` +
          `received ${JSON.stringify(type)}.`,
      );
    }
    curveType = type;
    return gen;
  };

  /**
   * Get (no args) or set (chainable) the curve tension, `0`-`1`. `0`
   * (default) is the fullest curvature; `1` flattens `'catmullRom'`/
   * `'bezier'` toward straight segments. Ignored by `'linear'` and
   * `'monotone'`.
   * @param {number} [value]
   * @returns {number|object}
   * @example generator.line().tension(0.5);
   */
  gen.tension = function (value) {
    if (arguments.length === 0) return tensionValue;
    tensionValue = Number(value);
    return gen;
  };

  /**
   * Computes a flat vertex position stream for `data`.
   * @param {Array} data At least 2 points.
   * @returns {{ positions: Float32Array }}
   * @throws {TypeError} If `data` isn't an array of at least 2 points.
   * @example generator.line().compute([0, 1, 2]);
   */
  gen.compute = function (data) {
    if (!Array.isArray(data) || data.length < 2) {
      throw new TypeError(
        `generator.line().compute: expected an array of at least 2 points, received ${JSON.stringify(data)}.`,
      );
    }
    const points = data.map((d, i) => [gen.x()(d, i), gen.y()(d, i), gen.z()(d, i)]);
    const sampled = sampleCurve(curveType, points, tensionValue);
    const positions = new Float32Array(sampled.length * 3);
    for (let i = 0; i < sampled.length; i++) positions.set(sampled[i], i * 3);
    return { positions };
  };

  return gen;
}
