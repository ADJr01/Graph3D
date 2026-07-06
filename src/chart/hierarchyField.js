/**
 * `GraphObjectFactory.createNodes`' default `SphereGeometry` radius (world
 * units) — dividing a hierarchy node's `.r` (also world units, from
 * `layout.tree`/`layout.pack`'s `radiusFromValue`) by this gives the uniform
 * instance/mesh scale factor that renders the node's sphere at exactly its
 * true radius, matching the space the layout actually reserved for it.
 */
const NODE_BASE_RADIUS = 0.2;

/**
 * Converts a `layout.tree()`/`layout.pack()` node's `.r` into the uniform
 * scale factor `GraphObjectFactory.createNodes`'s default sphere geometry
 * needs to render at that radius. Shared by `TreeChart`/`PackChart`
 * (CLAUDE.md §1.1 DRY two-strike rule — second consumer).
 * @param {number} r
 * @returns {number}
 * @example nodeScaleForRadius(0.2); // 1 (renders at the geometry's own base radius)
 */
export function nodeScaleForRadius(r) {
  return r / NODE_BASE_RADIUS;
}

/**
 * Walks a `layout.tree()`/`layout.pack()` result (a positioned root node with
 * nested `.children`) into a flat array of every node — root and every
 * descendant, pre-order. Both `TreeChart` and `PackChart` render every node
 * (not just leaves) as a sphere, so both need the same flattening
 * (CLAUDE.md §1.1 DRY two-strike rule — second consumer).
 * @param {{children: (object[]|null)}} root
 * @returns {object[]}
 * @example flattenHierarchyNodes(layout.tree()(data)).length; // total node count
 */
export function flattenHierarchyNodes(root) {
  const nodes = [];
  (function visit(node) {
    nodes.push(node);
    if (node.children) for (const child of node.children) visit(child);
  })(root);
  return nodes;
}
