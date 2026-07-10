import * as THREE from 'three';

const DEFAULT_DEGENERATE_AREA_EPSILON = 1e-10;
const CHECKED_ATTRIBUTES = ['position', 'normal', 'uv', 'color'];

const scratchA = new THREE.Vector3();
const scratchB = new THREE.Vector3();
const scratchC = new THREE.Vector3();
const scratchAB = new THREE.Vector3();
const scratchAC = new THREE.Vector3();
const scratchCross = new THREE.Vector3();

/** @param {THREE.BufferAttribute} attribute @param {string} name @param {object[]} issues */
function checkFiniteAttribute(attribute, name, issues) {
  if (!attribute) return;
  for (let i = 0; i < attribute.count; i++) {
    for (let c = 0; c < attribute.itemSize; c++) {
      const value = attribute.getComponent(i, c);
      if (!Number.isFinite(value)) {
        issues.push({
          type: 'non-finite-attribute',
          message: `'${name}' attribute has a non-finite value (${value}) at vertex ${i}, component ${c}.`,
          attribute: name,
          vertexIndex: i,
        });
      }
    }
  }
}

/** @param {THREE.BufferGeometry} geometry @param {object[]} issues */
function checkAttributeLengthMismatch(geometry, issues) {
  const position = geometry.getAttribute('position');
  for (const name of ['normal', 'uv', 'color']) {
    const attribute = geometry.getAttribute(name);
    if (attribute && attribute.count !== position.count) {
      issues.push({
        type: 'attribute-length-mismatch',
        message: `'${name}' attribute has ${attribute.count} entries but 'position' has ${position.count} — every attribute must have one entry per vertex.`,
        attribute: name,
      });
    }
  }
}

/** @param {THREE.BufferGeometry} geometry @param {object[]} issues @returns {boolean} Whether any out-of-range index was found. */
function checkIndexRange(geometry, issues) {
  const index = geometry.getIndex();
  if (!index) return false;
  const vertexCount = geometry.getAttribute('position').count;
  let found = false;
  for (let i = 0; i < index.count; i++) {
    const v = index.getX(i);
    if (v < 0 || v >= vertexCount) {
      found = true;
      issues.push({
        type: 'index-out-of-range',
        message: `Index buffer entry ${i} references vertex ${v}, but 'position' only has ${vertexCount} vertices.`,
        indexEntry: i,
        vertexIndex: v,
      });
    }
  }
  return found;
}

/** @param {THREE.BufferAttribute} position @param {number} ia @param {number} ib @param {number} ic @returns {number} */
function triangleArea(position, ia, ib, ic) {
  scratchA.fromBufferAttribute(position, ia);
  scratchB.fromBufferAttribute(position, ib);
  scratchC.fromBufferAttribute(position, ic);
  scratchAB.subVectors(scratchB, scratchA);
  scratchAC.subVectors(scratchC, scratchA);
  scratchCross.crossVectors(scratchAB, scratchAC);
  return scratchCross.length() / 2;
}

/** @param {THREE.BufferGeometry} geometry @param {number} epsilon @param {object[]} issues @param {boolean} hasOutOfRangeIndex */
function checkDegenerateTriangles(geometry, epsilon, issues, hasOutOfRangeIndex) {
  if (hasOutOfRangeIndex) return; // triangleArea would read garbage past the buffer — already reported
  const position = geometry.getAttribute('position');
  const index = geometry.getIndex();
  const triangleCount = Math.floor((index ? index.count : position.count) / 3);
  for (let t = 0; t < triangleCount; t++) {
    const ia = index ? index.getX(t * 3) : t * 3;
    const ib = index ? index.getX(t * 3 + 1) : t * 3 + 1;
    const ic = index ? index.getX(t * 3 + 2) : t * 3 + 2;
    const area = triangleArea(position, ia, ib, ic);
    if (!Number.isFinite(area) || area < epsilon) {
      issues.push({
        type: 'degenerate-triangle',
        message: `Triangle ${t} has ${Number.isFinite(area) ? 'near-zero' : 'non-finite'} area (${area}) — likely duplicate or collinear vertices.`,
        triangleIndex: t,
        area,
      });
    }
  }
}

/**
 * Scans a `THREE.BufferGeometry` for the structural/topological errors that
 * silently produce broken or invisible rendering rather than a thrown error:
 * NaN/Infinity vertex data, degenerate (zero- or near-zero-area) triangles,
 * per-vertex attributes with a different entry count than `position`, and
 * index-buffer entries that reference a vertex past the end of `position`.
 * These are always bugs — never an intentional design choice — so, unlike
 * `assignDepthJitter`'s heuristic depth-overlap mitigation, this reports
 * with certainty rather than a best guess.
 *
 * A diagnostic tool for development, not a hot-path check: it walks every
 * vertex and every triangle, which is real O(n) work — call it while
 * debugging a specific mesh (e.g. straight after building custom geometry,
 * or on a `GraphMesh`/`GraphInstancedObject` you suspect is broken), not
 * automatically on every object this library creates. There's no dev/prod
 * build-time stripping for this call (unlike the `assert()` helper CLAUDE.md
 * §1.5 describes — that infrastructure doesn't exist in this codebase yet);
 * it's an explicit, opt-in developer tool, not automatic instrumentation.
 * @param {THREE.BufferGeometry} geometry
 * @param {{degenerateEpsilon?: number}} [options]
 * @param {number} [options.degenerateEpsilon=1e-10] Triangle area below which a triangle is reported as degenerate.
 * @returns {{valid: boolean, issues: Array<{type: string, message: string, [key: string]: *}>}}
 * @throws {TypeError} If `geometry` isn't a `THREE.BufferGeometry`.
 * @example
 * const { valid, issues } = validateGeometry(mesh.three.geometry);
 * if (!valid) console.warn(issues);
 */
export function validateGeometry(geometry, options = {}) {
  if (!(geometry instanceof THREE.BufferGeometry)) {
    throw new TypeError(`validateGeometry: expected a THREE.BufferGeometry, received ${JSON.stringify(geometry)}.`);
  }
  const epsilon = options.degenerateEpsilon ?? DEFAULT_DEGENERATE_AREA_EPSILON;

  const position = geometry.getAttribute('position');
  if (!position || position.count === 0) {
    return { valid: false, issues: [{ type: 'empty-geometry', message: "Geometry has no 'position' attribute, or zero vertices." }] };
  }

  const issues = [];
  for (const name of CHECKED_ATTRIBUTES) checkFiniteAttribute(geometry.getAttribute(name), name, issues);
  checkAttributeLengthMismatch(geometry, issues);
  const hasOutOfRangeIndex = checkIndexRange(geometry, issues);
  checkDegenerateTriangles(geometry, epsilon, issues, hasOutOfRangeIndex);

  return { valid: issues.length === 0, issues };
}
