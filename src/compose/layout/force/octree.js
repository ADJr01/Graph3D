// Coincident (or near-coincident) points would otherwise recurse forever
// trying to separate them into ever-smaller octants; past this depth they're
// merged into one aggregate leaf instead.
const MAX_DEPTH = 24;

// Bounding cube padding so points exactly on the root's max edge still fall
// inside an octant (a zero-width cube can't be subdivided).
const BOUNDS_EPSILON = 1e-6;

function buildNode(points, indices, cx, cy, cz, half, depth) {
  const node = { cx, cy, cz, half, mass: 0, mx: 0, my: 0, mz: 0, children: null, pointIndex: -1 };

  if (indices.length === 1 || depth >= MAX_DEPTH) {
    for (const i of indices) {
      const p = points[i];
      node.mass += p.mass;
      node.mx += p.x * p.mass;
      node.my += p.y * p.mass;
      node.mz += p.z * p.mass;
    }
    if (indices.length === 1) {
      node.pointIndex = indices[0];
    } else {
      // Coincident points forced together at MAX_DEPTH: self-exclusion by
      // pointIndex no longer works (this leaf isn't "just self"), so keep
      // the member list to subtract self's own contribution at query time.
      node.indices = indices;
    }
    return node;
  }

  const buckets = [[], [], [], [], [], [], [], []];
  for (const i of indices) {
    const p = points[i];
    const octant = (p.x >= cx ? 1 : 0) | (p.y >= cy ? 2 : 0) | (p.z >= cz ? 4 : 0);
    buckets[octant].push(i);
  }

  const half2 = half / 2;
  node.children = [];
  for (let octant = 0; octant < 8; octant++) {
    if (buckets[octant].length === 0) continue;
    const child = buildNode(
      points,
      buckets[octant],
      cx + (octant & 1 ? half2 : -half2),
      cy + (octant & 2 ? half2 : -half2),
      cz + (octant & 4 ? half2 : -half2),
      half2,
      depth + 1,
    );
    node.children.push(child);
    node.mass += child.mass;
    node.mx += child.mx;
    node.my += child.my;
    node.mz += child.mz;
  }
  return node;
}

/**
 * Builds a Barnes-Hut octree over `points` (each `{ x, y, z, mass }`) for
 * O(n log n) many-body force approximation — the spatial index
 * `forceCharge` (Prompt 72) walks once per node per tick. This is a
 * separate, minimal structure from `object/Octree.js`: that one indexes
 * THREE.js-positioned render instances for frustum/ray culling (id + radius
 * + `THREE.Box3` bounds); this one aggregates plain-number mass and
 * center-of-mass per cell for physics, and `compose/` can't import
 * THREE.js-coupled code anyway (CLAUDE.md §1.4 SoC) — reusing that class
 * isn't an option, and the two solve genuinely different problems.
 * @param {Array<{ x: number, y: number, z: number, mass: number }>} points
 * @returns {{ accumulate: (selfIndex: number, x: number, y: number, z: number, theta: number, apply: (mass: number, dx: number, dy: number, dz: number, distSq: number) => void) => void }}
 * @example
 * const tree = buildBarnesHutOctree([{ x: 0, y: 0, z: 0, mass: 1 }, { x: 1, y: 0, z: 0, mass: 1 }]);
 * tree.accumulate(0, 0, 0, 0, 0.9, (mass, dx, dy, dz, distSq) => { ... });
 */
export function buildBarnesHutOctree(points) {
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
    if (p.z < minZ) minZ = p.z;
    if (p.z > maxZ) maxZ = p.z;
  }

  const half = Math.max(maxX - minX, maxY - minY, maxZ - minZ) / 2 + BOUNDS_EPSILON;
  const root =
    points.length === 0
      ? null
      : buildNode(
          points,
          points.map((_, i) => i),
          (minX + maxX) / 2,
          (minY + maxY) / 2,
          (minZ + maxZ) / 2,
          half,
          0,
        );

  return {
    accumulate(selfIndex, x, y, z, theta, apply) {
      const theta2 = theta * theta;
      (function visit(node) {
        if (node === null || node.mass === 0 || node.pointIndex === selfIndex) return;

        let mass = node.mass;
        let mx = node.mx;
        let my = node.my;
        let mz = node.mz;
        if (node.indices !== undefined && node.indices.includes(selfIndex)) {
          // node.indices is only ever set on a multi-point merged leaf
          // (buildNode's indices.length > 1 branch), so subtracting self
          // always leaves at least one other point's mass behind.
          const self = points[selfIndex];
          mass -= self.mass;
          mx -= self.x * self.mass;
          my -= self.y * self.mass;
          mz -= self.z * self.mass;
        }

        const comX = mx / mass;
        const comY = my / mass;
        const comZ = mz / mass;
        const dx = comX - x;
        const dy = comY - y;
        const dz = comZ - z;
        const distSq = dx * dx + dy * dy + dz * dz;
        const width = node.half * 2;
        // A node's center-of-mass can sit far from a query point that's
        // geometrically inside that same node's bounds (e.g. an outlier
        // corner point in an otherwise clustered cell) — approximating it
        // would fold the query point's own mass into the aggregate. Force
        // a recursion in that case regardless of theta; it always bottoms
        // out at the query point's own leaf, which excludes it correctly.
        const containsQuery = Math.abs(x - node.cx) <= node.half && Math.abs(y - node.cy) <= node.half && Math.abs(z - node.cz) <= node.half;
        if (node.children === null || (!containsQuery && (width * width) / distSq < theta2)) {
          apply(mass, dx, dy, dz, distSq);
          return;
        }
        for (const child of node.children) visit(child);
      })(root);
    },
  };
}
