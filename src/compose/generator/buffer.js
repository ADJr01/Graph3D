/**
 * Packs per-datum `{ position, scale, color, attributes }` results into the
 * flat Float32Array buffers `GraphInstancedObject.setAllPositions/
 * setAllScales/setAllColors` expect — the single packing site every
 * generator's `compute(data)` funnels through (CLAUDE.md §1.1 DRY), so
 * `generator.bar/line/point/surface/arc` never re-implement the flatten loop.
 * @param {Array} data
 * @param {(datum: *, index: number) => {
 *   position: [number, number, number],
 *   scale?: [number, number, number],
 *   color?: [number, number, number],
 *   attributes?: Object<string, (number|number[])>,
 * }} resolve Called once per datum; must return at least `position`. `scale`
 *   defaults to `[1, 1, 1]`. `color`/`attributes` are omitted from the datum
 *   entirely when the generator doesn't produce them.
 * @returns {{
 *   positions: Float32Array,
 *   scales: Float32Array,
 *   colors: (Float32Array|null),
 *   attributes: Object<string, Float32Array>,
 * }} `colors` is `null` unless at least one datum supplied a `color`.
 *   Each `attributes` entry's item size is inferred from the first datum
 *   that supplies it (a number → size 1, an array → its length).
 * @throws {TypeError} If `data` isn't an array.
 * @example
 * buildBuffers([{ x: 0 }, { x: 1 }], (d) => ({ position: [d.x, 0, 0] }));
 * // { positions: Float32Array(6), scales: Float32Array(6) filled with 1, colors: null, attributes: {} }
 */
export function buildBuffers(data, resolve) {
  if (!Array.isArray(data)) {
    throw new TypeError(`generator: expected an array of data, received ${JSON.stringify(data)}.`);
  }

  const count = data.length;
  const positions = new Float32Array(count * 3);
  const scales = new Float32Array(count * 3).fill(1);
  let colors = null;
  const attributeItemSizes = {};
  const perDatumAttributes = new Array(count);

  for (let i = 0; i < count; i++) {
    const result = resolve(data[i], i);
    positions.set(result.position, i * 3);

    if (result.scale) scales.set(result.scale, i * 3);

    if (result.color) {
      if (colors === null) colors = new Float32Array(count * 3);
      colors.set(result.color, i * 3);
    }

    if (result.attributes) {
      perDatumAttributes[i] = result.attributes;
      for (const name of Object.keys(result.attributes)) {
        if (name in attributeItemSizes) continue;
        const value = result.attributes[name];
        attributeItemSizes[name] = Array.isArray(value) ? value.length : 1;
      }
    }
  }

  const attributes = {};
  for (const name of Object.keys(attributeItemSizes)) {
    const itemSize = attributeItemSizes[name];
    const buffer = new Float32Array(count * itemSize);
    for (let i = 0; i < count; i++) {
      const value = perDatumAttributes[i]?.[name];
      if (value === undefined) continue;
      if (itemSize === 1) buffer[i] = value;
      else buffer.set(value, i * itemSize);
    }
    attributes[name] = buffer;
  }

  return { positions, scales, colors, attributes };
}
