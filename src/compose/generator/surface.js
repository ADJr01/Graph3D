import { sub, cross, normalize } from './vector.js';

const DEFAULT_DOMAIN = [0, 1];
const DEFAULT_RESOLUTION = 32;

function isDomain(value) {
  return Array.isArray(value) && value.length === 2 && value.every((n) => typeof n === 'number' && Number.isFinite(n));
}

/**
 * Creates a chainable surface generator: maps a heightfield — either a 2D
 * `values[][]` grid or an `(x, z) => y` function sampled over `xDomain`/
 * `zDomain` at `resolution` segments per axis — to a triangulated mesh.
 * `compute()` returns plain `Float32Array`/`Uint32Array` buffers (no Three.js
 * import, per CLAUDE.md §1.4 SoC); a higher layer wraps them in a
 * `BufferGeometry`. Vertex normals are the average of each vertex's
 * surrounding face normals (smooth shading). `rows`/`cols` (the grid's
 * segment counts) come along too — `SurfaceChart`'s optional contour overlay
 * (Prompt 135, `compose/generator/contour.js`) traces isolines through this
 * same already-computed `positions` grid rather than re-deriving it.
 * @returns {{
 *   values: (source?: (number[][]|((x: number, z: number) => number))) => (Function|object),
 *   xDomain: (domain?: [number, number]) => ([number, number]|object),
 *   zDomain: (domain?: [number, number]) => ([number, number]|object),
 *   resolution: (segments?: number) => (number|object),
 *   compute: () => { positions: Float32Array, indices: Uint32Array, normals: Float32Array, rows: number, cols: number },
 * }}
 * @example
 * const terrain = generator.surface()
 *   .values((x, z) => Math.sin(x) * Math.cos(z))
 *   .xDomain([-3, 3])
 *   .zDomain([-3, 3])
 *   .resolution(64);
 * terrain.compute();
 * @example
 * // A fixed grid skips xDomain/zDomain/resolution — the grid shape comes
 * // from the array itself.
 * generator.surface().values([[0, 1], [1, 2]]).compute();
 */
export function surface() {
  const gen = {};

  let valuesSource = null;
  let xDomain = DEFAULT_DOMAIN;
  let zDomain = DEFAULT_DOMAIN;
  let resolution = DEFAULT_RESOLUTION;

  /**
   * Get (no args) or set (chainable) the heightfield source: a 2D
   * `values[row][col]` array, or an `(x, z) => y` function sampled over
   * `xDomain`/`zDomain` at `resolution` segments per axis.
   * @param {(number[][]|((x: number, z: number) => number))} [source]
   * @returns {Function|object}
   */
  gen.values = function (source) {
    if (arguments.length === 0) return valuesSource;
    valuesSource = source;
    return gen;
  };

  /**
   * Get (no args) or set (chainable) the x range sampled when `values` is a
   * function. Ignored for a `values[][]` grid. Default `[0, 1]`.
   * @param {[number, number]} [domain]
   * @returns {[number, number]|object}
   * @throws {TypeError} If `domain` isn't a `[min, max]` pair of finite numbers.
   */
  gen.xDomain = function (domain) {
    if (arguments.length === 0) return xDomain;
    if (!isDomain(domain)) {
      throw new TypeError(
        `generator.surface().xDomain: expected a [min, max] pair of finite numbers, received ${JSON.stringify(domain)}.`,
      );
    }
    xDomain = domain;
    return gen;
  };

  /**
   * Get (no args) or set (chainable) the z range sampled when `values` is a
   * function. Ignored for a `values[][]` grid. Default `[0, 1]`.
   * @param {[number, number]} [domain]
   * @returns {[number, number]|object}
   * @throws {TypeError} If `domain` isn't a `[min, max]` pair of finite numbers.
   */
  gen.zDomain = function (domain) {
    if (arguments.length === 0) return zDomain;
    if (!isDomain(domain)) {
      throw new TypeError(
        `generator.surface().zDomain: expected a [min, max] pair of finite numbers, received ${JSON.stringify(domain)}.`,
      );
    }
    zDomain = domain;
    return gen;
  };

  /**
   * Get (no args) or set (chainable) the grid segments per axis sampled when
   * `values` is a function. Ignored for a `values[][]` grid. Default `32`.
   * @param {number} [segments] A positive integer.
   * @returns {number|object}
   * @throws {TypeError} If `segments` isn't a positive integer.
   */
  gen.resolution = function (segments) {
    if (arguments.length === 0) return resolution;
    if (!Number.isInteger(segments) || segments < 1) {
      throw new TypeError(
        `generator.surface().resolution: expected a positive integer, received ${JSON.stringify(segments)}.`,
      );
    }
    resolution = segments;
    return gen;
  };

  /**
   * Computes a triangulated mesh for the current `values` source.
   * @returns {{ positions: Float32Array, indices: Uint32Array, normals: Float32Array, rows: number, cols: number }}
   * @throws {TypeError} If `values` hasn't been set, or is a grid smaller than 2x2.
   */
  gen.compute = function () {
    let rows;
    let cols;
    let heightAt;

    if (typeof valuesSource === 'function') {
      rows = resolution;
      cols = resolution;
      const [xMin, xMax] = xDomain;
      const [zMin, zMax] = zDomain;
      heightAt = (row, col) => valuesSource(xMin + (col / cols) * (xMax - xMin), zMin + (row / rows) * (zMax - zMin));
    } else if (Array.isArray(valuesSource) && Array.isArray(valuesSource[0])) {
      rows = valuesSource.length - 1;
      cols = valuesSource[0].length - 1;
      heightAt = (row, col) => valuesSource[row][col];
    } else {
      throw new TypeError(
        `generator.surface().compute: call .values() with a values[][] grid or an (x, z) => y function first, ` +
          `received ${JSON.stringify(valuesSource)}.`,
      );
    }

    if (rows < 1 || cols < 1) {
      throw new TypeError(
        `generator.surface().compute: values grid must be at least 2x2, received ${rows + 1}x${cols + 1}.`,
      );
    }

    const [xMin, xMax] = xDomain;
    const [zMin, zMax] = zDomain;
    const colCount = cols + 1;
    const rowCount = rows + 1;
    const vertexCount = rowCount * colCount;

    const positions = new Float32Array(vertexCount * 3);
    for (let row = 0; row < rowCount; row++) {
      for (let col = 0; col < colCount; col++) {
        const i = (row * colCount + col) * 3;
        positions[i] = xMin + (col / cols) * (xMax - xMin);
        positions[i + 1] = heightAt(row, col);
        positions[i + 2] = zMin + (row / rows) * (zMax - zMin);
      }
    }

    const indices = new Uint32Array(rows * cols * 6);
    let ii = 0;
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const a = row * colCount + col;
        const b = a + 1;
        const c = a + colCount;
        const d = c + 1;
        indices[ii++] = a;
        indices[ii++] = c;
        indices[ii++] = b;
        indices[ii++] = b;
        indices[ii++] = c;
        indices[ii++] = d;
      }
    }

    const normals = new Float32Array(vertexCount * 3);
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
    for (let v = 0; v < vertexCount; v++) {
      const [nx, ny, nz] = normalize([normals[v * 3], normals[v * 3 + 1], normals[v * 3 + 2]]);
      normals[v * 3] = nx;
      normals[v * 3 + 1] = ny;
      normals[v * 3 + 2] = nz;
    }

    return { positions, indices, normals, rows, cols };
  };

  return gen;
}
