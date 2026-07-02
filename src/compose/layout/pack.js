import { buildHierarchy, radiusFromValue } from './hierarchy.js';
import { force } from './force/index.js';

// ponytail: settling child spheres via the existing collide+center force
// (Prompt 72) instead of a dedicated minimal-enclosing-sphere packer (what
// d3.pack does in 2D) — reuses tested code and is visually good enough for a
// data-viz pack chart. Upgrade to an exact solver if a chart needs
// mathematically tight packing.
const RELAX_TICKS = 150;
const SEED_SPREAD = 1.6;

// Only ever called with n > 1 — packChildren's n === 1 case returns before
// reaching this (a lone child needs no spread-out seed position).
function fibonacciSpherePoint(i, n) {
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  const y = 1 - (i / (n - 1)) * 2;
  const radiusAtY = Math.sqrt(Math.max(1 - y * y, 0));
  const theta = goldenAngle * i;
  return [Math.cos(theta) * radiusAtY, y, Math.sin(theta) * radiusAtY];
}

/**
 * Packs `children` (each already carrying a `.r`) into non-overlapping local
 * positions around `(0,0,0)` and returns the enclosing radius.
 * @param {object[]} children
 * @param {number} padding Extra gap enforced between sibling surfaces.
 * @returns {number}
 */
function packChildren(children, padding) {
  if (children.length === 1) {
    const [only] = children;
    only.x = 0;
    only.y = 0;
    only.z = 0;
    return only.r + padding;
  }

  const maxR = Math.max(...children.map((node) => node.r));
  const seedRadius = maxR * Math.cbrt(children.length) * SEED_SPREAD + padding;
  children.forEach((node, i) => {
    const [ux, uy, uz] = fibonacciSpherePoint(i, children.length);
    node.x = ux * seedRadius;
    node.y = uy * seedRadius;
    node.z = uz * seedRadius;
  });

  const sim = force()
    .nodes(children)
    .force('collide', force.collide((d) => d.r + padding / 2))
    .force('center', force.center(0, 0, 0, 0.05));
  for (let i = 0; i < RELAX_TICKS; i++) sim.tick();

  let cx = 0;
  let cy = 0;
  let cz = 0;
  for (const node of children) {
    cx += node.x;
    cy += node.y;
    cz += node.z;
  }
  cx /= children.length;
  cy /= children.length;
  cz /= children.length;

  let enclosing = 0;
  for (const node of children) {
    node.x -= cx;
    node.y -= cy;
    node.z -= cz;
    enclosing = Math.max(enclosing, Math.hypot(node.x, node.y, node.z) + node.r);
    delete node.vx;
    delete node.vy;
    delete node.vz;
    delete node.__ax;
    delete node.__ay;
    delete node.__az;
  }
  return enclosing + padding;
}

function packNode(node, padding) {
  if (!node.children) {
    node.r = radiusFromValue(node.value);
    return;
  }
  for (const child of node.children) packNode(child, padding);
  node.r = packChildren(node.children, padding);
}

function translateToGlobal(node) {
  if (!node.children) return;
  for (const child of node.children) {
    child.x += node.x;
    child.y += node.y;
    child.z += node.z;
    translateToGlobal(child);
  }
}

/**
 * Creates a 3D sphere-packing layout: nests each node's children as
 * non-overlapping spheres inside it, sphere volume proportional to
 * `.value` — the 3D analogue of d3.pack. d3-hierarchy-parity input
 * (`children`, `value`, `sort` — see `buildHierarchy`).
 * @param {{ children?: Function, value?: Function, sort?: Function, padding?: number }} [options]
 *   `padding` (default `0`) is extra world-unit gap enforced between sibling
 *   spheres and between a child and its parent's enclosing surface.
 * @returns {(data: object) => object} A function taking the root datum and
 *   returning the positioned root node (`{ data, children, x, y, z, r, ... }`,
 *   every descendant positioned in the same world space as the root).
 * @throws {TypeError} If the root datum is not a non-null object.
 * @example
 * const root = layout.pack({ padding: 0.1 })({ children: [{ value: 1 }, { value: 2 }] });
 * root.children[0].r; // > 0, root.children[0].x/y/z positioned inside root
 */
export function pack({ children, value, sort, padding = 0 } = {}) {
  return function packLayout(data) {
    const root = buildHierarchy(data, { children, value, sort });
    packNode(root, padding);
    root.x = 0;
    root.y = 0;
    root.z = 0;
    translateToGlobal(root);
    return root;
  };
}
