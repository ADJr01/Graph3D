import { accessorField } from './accessor.js';
import { sub, cross, normalize } from './vector.js';

const DEFAULT_INNER_RADIUS = 0;
const DEFAULT_OUTER_RADIUS = 1;
const DEFAULT_START_ANGLE = 0;
const DEFAULT_EXTRUDE = 1;

// Angular resolution for a complete 2π sweep; a wedge's actual segment count
// scales down proportionally to its span, so a thin slice isn't over-
// tessellated and a full donut ring still looks smooth (same idea as
// curve.js's SEGMENTS_PER_INTERVAL).
const FULL_CIRCLE_SEGMENTS = 64;

// Floating-point tolerance for detecting a full 2π sweep (no end caps needed).
const FULL_CIRCLE_EPSILON = 1e-9;

function polar(radius, angle, y) {
  return [radius * Math.cos(angle), y, radius * Math.sin(angle)];
}

/**
 * Appends a planar quad (4 corners, perimeter order) as 2 triangles with a
 * shared flat normal computed from the corners themselves — every wedge face
 * (top/bottom/inner/outer/caps) is planar or finely-subdivided-curved, so a
 * single helper covers all of them (CLAUDE.md §1.1 DRY).
 */
function pushQuad(positions, normals, indices, corners) {
  const base = positions.length / 3;
  const normal = normalize(cross(sub(corners[1], corners[0]), sub(corners[3], corners[0])));
  for (const corner of corners) {
    positions.push(corner[0], corner[1], corner[2]);
    normals.push(normal[0], normal[1], normal[2]);
  }
  indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

/**
 * Builds one wedge (donut/pie slice) as a closed, flat-shaded solid: a top
 * annulus face, a bottom annulus face, inner and outer curved walls, and
 * (unless the wedge is a full 2π ring) two flat end caps closing the slice.
 * @returns {{ positions: number[], normals: number[], indices: number[] }}
 */
function buildWedge(innerRadius, outerRadius, startAngle, endAngle, extrude) {
  const span = endAngle - startAngle;
  const segments = Math.max(1, Math.round((FULL_CIRCLE_SEGMENTS * Math.abs(span)) / (2 * Math.PI)));
  const step = span / segments;

  const positions = [];
  const normals = [];
  const indices = [];

  for (let k = 0; k < segments; k++) {
    const a0 = startAngle + k * step;
    const a1 = a0 + step;
    const TI0 = polar(innerRadius, a0, extrude);
    const TI1 = polar(innerRadius, a1, extrude);
    const TO0 = polar(outerRadius, a0, extrude);
    const TO1 = polar(outerRadius, a1, extrude);
    const BI0 = polar(innerRadius, a0, 0);
    const BI1 = polar(innerRadius, a1, 0);
    const BO0 = polar(outerRadius, a0, 0);
    const BO1 = polar(outerRadius, a1, 0);

    pushQuad(positions, normals, indices, [TI0, TI1, TO1, TO0]); // top, normal +y
    pushQuad(positions, normals, indices, [BO0, BO1, BI1, BI0]); // bottom, normal -y
    pushQuad(positions, normals, indices, [BO1, BO0, TO0, TO1]); // outer wall, normal +radial
    pushQuad(positions, normals, indices, [BI0, BI1, TI1, TI0]); // inner wall, normal -radial
  }

  const isFullCircle = Math.abs(Math.abs(span) - 2 * Math.PI) < FULL_CIRCLE_EPSILON;
  if (!isFullCircle) {
    pushQuad(positions, normals, indices, [
      polar(innerRadius, startAngle, 0),
      polar(innerRadius, startAngle, extrude),
      polar(outerRadius, startAngle, extrude),
      polar(outerRadius, startAngle, 0),
    ]); // start cap
    pushQuad(positions, normals, indices, [
      polar(innerRadius, endAngle, 0),
      polar(outerRadius, endAngle, 0),
      polar(outerRadius, endAngle, extrude),
      polar(innerRadius, endAngle, extrude),
    ]); // end cap
  }

  return { positions, normals, indices };
}

/**
 * Creates a chainable arc generator: maps each datum to a 3D pie/donut wedge
 * — a flat-shaded solid swept from `startAngle` to `endAngle` between
 * `innerRadius` and `outerRadius`, extruded up by `extrude`. `compute(data)`
 * combines every datum's wedge into one triangulated mesh — plain
 * `Float32Array`/`Uint32Array` buffers (no Three.js import, per CLAUDE.md
 * §1.4 SoC), matching `generator.surface()`'s output shape.
 * @returns {{
 *   innerRadius: (accessorOrScale?: *) => (Function|object),
 *   outerRadius: (accessorOrScale?: *) => (Function|object),
 *   startAngle: (accessorOrScale?: *) => (Function|object),
 *   endAngle: (accessorOrScale?: *) => (Function|object),
 *   extrude: (accessorOrScale?: *) => (Function|object),
 *   compute: (data: Array) => { positions: Float32Array, indices: Uint32Array, normals: Float32Array },
 * }}
 * @example
 * // A pie chart typically supplies startAngle/endAngle per slice itself
 * // (that layout math lives at the chart layer, not in this generator).
 * const wedges = generator.arc().innerRadius(0.5).endAngle((d) => d.angle);
 * wedges.compute([{ angle: Math.PI / 2 }, { angle: Math.PI }]);
 */
export function arc() {
  const gen = {};

  /** Get (no args) or set (chainable) the wedge's inner radius. Default `0`. */
  gen.innerRadius = accessorField(gen, DEFAULT_INNER_RADIUS);

  /** Get (no args) or set (chainable) the wedge's outer radius. Default `1`. */
  gen.outerRadius = accessorField(gen, DEFAULT_OUTER_RADIUS);

  /** Get (no args) or set (chainable) the wedge's sweep start angle, in radians. Default `0`. */
  gen.startAngle = accessorField(gen, DEFAULT_START_ANGLE);

  /**
   * Get (no args) or set (chainable) the wedge's sweep end angle, in
   * radians. Defaults to the datum itself, so `arc().compute([Math.PI / 2])`
   * works on a plain array of angle values.
   */
  gen.endAngle = accessorField(gen, (d) => d);

  /** Get (no args) or set (chainable) the wedge's extrusion height (y-axis). Default `1`. */
  gen.extrude = accessorField(gen, DEFAULT_EXTRUDE);

  /**
   * Computes a combined triangulated mesh for every datum's wedge.
   * @param {Array} data
   * @returns {{ positions: Float32Array, indices: Uint32Array, normals: Float32Array }}
   * @throws {TypeError} If `data` isn't an array.
   */
  gen.compute = function (data) {
    if (!Array.isArray(data)) {
      throw new TypeError(`generator.arc().compute: expected an array of data, received ${JSON.stringify(data)}.`);
    }

    const positions = [];
    const normals = [];
    const indices = [];

    data.forEach((d, i) => {
      const wedge = buildWedge(
        gen.innerRadius()(d, i),
        gen.outerRadius()(d, i),
        gen.startAngle()(d, i),
        gen.endAngle()(d, i),
        gen.extrude()(d, i),
      );
      const base = positions.length / 3;
      positions.push(...wedge.positions);
      normals.push(...wedge.normals);
      for (const index of wedge.indices) indices.push(base + index);
    });

    return {
      positions: Float32Array.from(positions),
      indices: Uint32Array.from(indices),
      normals: Float32Array.from(normals),
    };
  };

  return gen;
}
