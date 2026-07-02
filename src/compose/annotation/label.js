/**
 * Creates a text-label annotation. Real text rendering is Phase 6's job
 * (`material/SDFText.js`, not built yet) — until then this returns metadata
 * only (`text`, `position`, `style`), which is exactly what `Axis`'s
 * per-tick labels and `annotation.callout`'s text also need, so the stub is
 * written once here and reused by both (CLAUDE.md §1.1 DRY two-strike rule).
 * @param {{ text: string, position?: {x?: number, y?: number, z?: number}, style?: object }} config
 * @returns {{ type: 'label', text: string, position: {x: number, y: number, z: number}, style: object }}
 * @throws {TypeError} If `text` is not a string.
 * @example annotation.label({ text: '42%', position: { x: 1, y: 2, z: 0 } });
 */
export function label({ text, position = {}, style = {} } = {}) {
  if (typeof text !== 'string') {
    throw new TypeError(`annotation.label: expected text to be a string, received ${JSON.stringify(text)}.`);
  }
  return {
    type: 'label',
    text,
    position: { x: position.x ?? 0, y: position.y ?? 0, z: position.z ?? 0 },
    style,
  };
}
