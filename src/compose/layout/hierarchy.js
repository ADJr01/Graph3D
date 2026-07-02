const DEFAULT_CHILDREN = (d) => d.children;
const DEFAULT_VALUE = (d) => d.value;

/**
 * Builds a d3-hierarchy-parity node tree from a single root datum: each node
 * is `{ data, parent, children, depth, height, value }`. Shared by
 * `layout.pack` and `layout.tree` (Prompt 73) so hierarchy traversal —
 * children resolution, value summation, sorting — lives in one place
 * (CLAUDE.md §1.1 DRY two-strike rule: both consumers need it).
 * @param {object} data The root datum. `children(datum)` is called
 *   recursively to find each node's child data.
 * @param {{ children?: (datum: *, node: object) => (*[]|undefined), value?: (datum: *, node: object) => number, sort?: (a: object, b: object) => number }} [options]
 *   `children` (default `(d) => d.children`) returns a datum's child data,
 *   or a non-array/empty value for a leaf. `value` (default `(d) => d.value`)
 *   is summed bottom-up into every node's `.value`, d3's `.sum()` semantics
 *   (non-numeric results coerce to `0`, matching d3-hierarchy itself). `sort`
 *   orders each node's children in place, applied after `.value` is known.
 * @returns {{ data: *, parent: (object|null), children: (object[]|null), depth: number, height: number, value: number }}
 * @throws {TypeError} If `data` is not a non-null object.
 * @example
 * const root = buildHierarchy({ name: 'a', children: [{ name: 'b', value: 1 }] });
 * root.children[0].value; // 1
 */
export function buildHierarchy(data, { children = DEFAULT_CHILDREN, value = DEFAULT_VALUE, sort } = {}) {
  if (data === null || typeof data !== 'object') {
    throw new TypeError(`layout hierarchy: expected a root data object, received ${JSON.stringify(data)}.`);
  }

  function build(datum, parent, depth) {
    const node = { data: datum, parent, depth, children: null, value: 0, height: 0 };
    const kids = children(datum, node);
    if (Array.isArray(kids) && kids.length > 0) {
      node.children = kids.map((kid) => build(kid, node, depth + 1));
    }
    return node;
  }
  const root = build(data, null, 0);

  (function computeValueAndHeight(node) {
    let sum = +value(node.data, node) || 0;
    let height = 0;
    if (node.children) {
      for (const child of node.children) {
        computeValueAndHeight(child);
        sum += child.value;
        height = Math.max(height, child.height + 1);
      }
      if (sort) node.children.sort(sort);
    }
    node.value = sum;
    node.height = height;
  })(root);

  return root;
}

/**
 * Maps a node's summed `.value` (a volume) to a sphere radius — `r ∝ ∛value`
 * so sphere *volume* (not radius) is proportional to value, the 3D analogue
 * of d3.pack's area-proportional circles. Shared by `layout.pack` (sphere
 * sizing) and `layout.tree` (node marker sizing).
 * @param {number} value
 * @returns {number}
 */
export function radiusFromValue(value) {
  return Math.cbrt(Math.max(value, 0));
}
