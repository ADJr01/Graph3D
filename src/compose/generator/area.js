import { accessorField } from './accessor.js';
import { sampleCurve, CURVE_TYPES } from './curve.js';
import { sub, cross, normalize } from './vector.js';

const DEFAULT_CURVE = 'linear';
const DEFAULT_TENSION = 0;
const DEFAULT_BASELINE = 0;

/**
 * Creates a chainable area generator: maps `data` to an extruded vertical
 * "wall" — a triangulated ribbon of quads between each point's value (top
 * edge) and a constant `baseline` (bottom edge). Like `generator.line()`,
 * this isn't a set of independent instances (a wall is one continuous
 * strip), so it shares `line`'s `x`/`y`/`z`/`curve`/`tension` fields and top
 * edge sampling (`sampleCurve`, CLAUDE.md §1.1 DRY — the curve math isn't
 * reimplemented here) but returns a triangulated mesh — `{positions,
 * indices, normals}`, the same shape `generator.surface()`/`generator.arc()`
 * return — instead of `line`'s flat vertex stream.
 * @returns {{
 *   x: (accessorOrScale?: *) => (Function|object),
 *   y: (accessorOrScale?: *) => (Function|object),
 *   z: (accessorOrScale?: *) => (Function|object),
 *   baseline: (value?: number) => (number|object),
 *   curve: (type?: ('linear'|'monotone'|'catmullRom'|'bezier')) => (string|object),
 *   tension: (value?: number) => (number|object),
 *   compute: (data: Array) => { positions: Float32Array, indices: Uint32Array, normals: Float32Array },
 * }}
 * @example
 * const wall = generator.area().x((d) => d.t).y((d) => d.v).baseline(0);
 * wall.compute([{ t: 0, v: 0 }, { t: 1, v: 2 }, { t: 2, v: 1 }]);
 */
export function area() {
  const gen = {};

  /** Get (no args) or set (chainable) the x accessor. Defaults to the datum's index. */
  gen.x = accessorField(gen, (d, i) => i);

  /** Get (no args) or set (chainable) the y accessor (the wall's top edge). Defaults to the datum itself. */
  gen.y = accessorField(gen, (d) => d);

  /** Get (no args) or set (chainable) the z accessor. Defaults to `0`. */
  gen.z = accessorField(gen, 0);

  let baselineValue = DEFAULT_BASELINE;

  /**
   * Get (no args) or set (chainable) the wall's bottom edge — a constant y.
   * Default `0`.
   * @param {number} [value]
   * @returns {number|object}
   * @throws {TypeError} If `value` isn't a finite number.
   * @example generator.area().baseline(-2);
   */
  gen.baseline = function (value) {
    if (arguments.length === 0) return baselineValue;
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new TypeError(`generator.area().baseline: expected a finite number, received ${JSON.stringify(value)}.`);
    }
    baselineValue = value;
    return gen;
  };

  let curveType = DEFAULT_CURVE;
  let tensionValue = DEFAULT_TENSION;

  /**
   * Get (no args) or set (chainable) the top edge's interpolation curve.
   * @param {'linear'|'monotone'|'catmullRom'|'bezier'} [type]
   * @returns {string|object}
   * @throws {TypeError} If `type` isn't one of the supported curve names.
   * @example generator.area().curve('catmullRom');
   */
  gen.curve = function (type) {
    if (arguments.length === 0) return curveType;
    if (!CURVE_TYPES.includes(type)) {
      throw new TypeError(
        `generator.area().curve: expected one of ${CURVE_TYPES.map((t) => `'${t}'`).join(', ')}, ` +
          `received ${JSON.stringify(type)}.`,
      );
    }
    curveType = type;
    return gen;
  };

  /**
   * Get (no args) or set (chainable) the curve tension, `0`-`1`. Ignored by
   * `'linear'`/`'monotone'`. Default `0`.
   * @param {number} [value]
   * @returns {number|object}
   * @example generator.area().tension(0.5);
   */
  gen.tension = function (value) {
    if (arguments.length === 0) return tensionValue;
    tensionValue = Number(value);
    return gen;
  };

  /**
   * Computes a triangulated wall mesh for `data`.
   * @param {Array} data At least 2 points.
   * @returns {{ positions: Float32Array, indices: Uint32Array, normals: Float32Array }}
   * @throws {TypeError} If `data` isn't an array of at least 2 points.
   */
  gen.compute = function (data) {
    if (!Array.isArray(data) || data.length < 2) {
      throw new TypeError(
        `generator.area().compute: expected an array of at least 2 points, received ${JSON.stringify(data)}.`,
      );
    }
    const topPoints = data.map((d, i) => [gen.x()(d, i), gen.y()(d, i), gen.z()(d, i)]);
    const sampledTop = sampleCurve(curveType, topPoints, tensionValue);
    const n = sampledTop.length;

    const positions = new Float32Array(n * 2 * 3);
    for (let i = 0; i < n; i++) {
      const [x, y, z] = sampledTop[i];
      const top = i * 2 * 3;
      const bottom = top + 3;
      positions[top] = x;
      positions[top + 1] = y;
      positions[top + 2] = z;
      positions[bottom] = x;
      positions[bottom + 1] = baselineValue;
      positions[bottom + 2] = z;
    }

    const indices = new Uint32Array((n - 1) * 6);
    let ii = 0;
    for (let i = 0; i < n - 1; i++) {
      const topA = i * 2;
      const bottomA = topA + 1;
      const topB = topA + 2;
      const bottomB = topA + 3;
      indices[ii++] = topA;
      indices[ii++] = bottomA;
      indices[ii++] = topB;
      indices[ii++] = bottomA;
      indices[ii++] = bottomB;
      indices[ii++] = topB;
    }

    const normals = new Float32Array(n * 2 * 3);
    const vertexAt = (index) => [positions[index * 3], positions[index * 3 + 1], positions[index * 3 + 2]];
    for (let t = 0; t < indices.length; t += 3) {
      const [ia, ib, ic] = [indices[t], indices[t + 1], indices[t + 2]];
      const faceNormal = cross(sub(vertexAt(ib), vertexAt(ia)), sub(vertexAt(ic), vertexAt(ia)));
      for (const index of [ia, ib, ic]) {
        normals[index * 3] += faceNormal[0];
        normals[index * 3 + 1] += faceNormal[1];
        normals[index * 3 + 2] += faceNormal[2];
      }
    }
    for (let v = 0; v < n * 2; v++) {
      const [nx, ny, nz] = normalize([normals[v * 3], normals[v * 3 + 1], normals[v * 3 + 2]]);
      normals[v * 3] = nx;
      normals[v * 3 + 1] = ny;
      normals[v * 3 + 2] = nz;
    }

    return { positions, indices, normals };
  };

  return gen;
}
