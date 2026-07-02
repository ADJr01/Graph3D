import { buildHierarchy, radiusFromValue } from './hierarchy.js';

const DEFAULT_LEVEL_HEIGHT = 1;
const DEFAULT_LEVEL_RADIUS = 1;

// ponytail: angular allocation by leaf count is a "conical tree" / sunburst-
// style heuristic, not full Reingold-Tilford contour fitting — siblings never
// collide (each gets a disjoint angular wedge) but wedges aren't width-aware,
// so a wide leaf can visually crowd a narrow neighbor. Good enough for a
// data-viz hierarchy; add contour tracking if that crowding shows up.
function countLeaves(node) {
  if (!node.children) return (node.__leafCount = 1);
  let total = 0;
  for (const child of node.children) total += countLeaves(child);
  return (node.__leafCount = total);
}

function layoutRadial(node, angleStart, angleEnd, levelHeight, levelRadius) {
  const angle = (angleStart + angleEnd) / 2;
  const radius = node.depth * levelRadius;
  node.x = Math.cos(angle) * radius;
  node.z = Math.sin(angle) * radius;
  node.y = -node.depth * levelHeight;
  node.r = radiusFromValue(node.value);
  delete node.__leafCount;
  if (!node.children) return;

  let cursor = angleStart;
  const totalLeaves = node.children.reduce((sum, child) => sum + child.__leafCount, 0);
  for (const child of node.children) {
    const span = (child.__leafCount / totalLeaves) * (angleEnd - angleStart);
    layoutRadial(child, cursor, cursor + span, levelHeight, levelRadius);
    cursor += span;
  }
}

/**
 * Creates a 3D "conical tree" hierarchy layout: nodes are layered by depth
 * along `y` (root at `y=0`, each level `levelHeight` further down) and fanned
 * angularly in the `x`/`z` plane, each node's angular wedge split among its
 * children proportional to their leaf count — so sibling subtrees never
 * overlap. d3-hierarchy-parity input (`children`, `value`, `sort` — see
 * `buildHierarchy`).
 * @param {{ children?: Function, value?: Function, sort?: Function, levelHeight?: number, levelRadius?: number }} [options]
 *   `levelHeight` (default `1`) is the world-unit drop per depth level.
 *   `levelRadius` (default `1`) is the world-unit ring radius per depth level.
 * @returns {(data: object) => object} A function taking the root datum and
 *   returning the positioned root node (`{ data, children, x, y, z, r, ... }`).
 * @throws {TypeError} If the root datum is not a non-null object.
 * @example
 * const root = layout.tree({ levelHeight: 2 })({ children: [{ value: 1 }, { value: 1 }] });
 * root.children[0].y; // -2
 */
export function tree({ children, value, sort, levelHeight = DEFAULT_LEVEL_HEIGHT, levelRadius = DEFAULT_LEVEL_RADIUS } = {}) {
  return function treeLayout(data) {
    const root = buildHierarchy(data, { children, value, sort });
    countLeaves(root);
    layoutRadial(root, 0, Math.PI * 2, levelHeight, levelRadius);
    return root;
  };
}
