/** The only event `label().on()` supports today — literally the prompt's own wording (`annotation.label(...).on('click')`); grow this set when a real consumer needs another one (YAGNI). */
const LABEL_EVENTS = new Set(['click']);

/**
 * Creates a text-label annotation. Real text rendering is Phase 6's job
 * (`material/SDFText.js`, not built yet) — until then this returns metadata
 * only (`text`, `position`, `style`), which is exactly what `Axis`'s
 * per-tick labels and `annotation.callout`'s text also need, so the stub is
 * written once here and reused by both (CLAUDE.md §1.1 DRY two-strike rule).
 *
 * `on(event, handler)`/`emit(event, ...args)` (Prompt 155) give the returned
 * object a tiny event registry of its own — the same `on`/`emit` shape
 * `interact/eventEmitter.js` already provides, but written fresh here rather
 * than imported: `compose/` sits *below* `interact/` in CLAUDE.md §1.4's
 * layering table, so `compose/annotation` importing from `interact/` would
 * be an upward dependency with no sanctioned exception (unlike, say,
 * `compose/selection`'s narrow `anim/` carve-out). `interact/PointerRouter`
 * (which *can* import this module, being the higher layer) is the one that
 * actually calls `emit('click', ...)`, after hit-testing the label's
 * projected screen position against a click via `registerLabel()`.
 * @param {{ text: string, position?: {x?: number, y?: number, z?: number}, style?: object }} config
 * @returns {{ type: 'label', text: string, position: {x: number, y: number, z: number}, style: object,
 *   on: (event: 'click', handler: Function) => object, emit: (event: string, ...args: *) => void }}
 * @throws {TypeError} If `text` is not a string.
 * @example
 * const peak = annotation.label({ text: '42%', position: { x: 1, y: 2, z: 0 } });
 * peak.on('click', () => console.log('clicked the peak label'));
 */
export function label({ text, position = {}, style = {} } = {}) {
  if (typeof text !== 'string') {
    throw new TypeError(`annotation.label: expected text to be a string, received ${JSON.stringify(text)}.`);
  }
  const handlers = new Map();
  const result = {
    type: 'label',
    text,
    position: { x: position.x ?? 0, y: position.y ?? 0, z: position.z ?? 0 },
    style,
    on(event, handler) {
      if (!LABEL_EVENTS.has(event)) {
        throw new TypeError(`annotation.label.on: event must be one of ${[...LABEL_EVENTS].join(', ')}, received ${JSON.stringify(event)}.`);
      }
      if (typeof handler !== 'function') {
        throw new TypeError(`annotation.label.on: handler must be a function, received ${JSON.stringify(handler)}.`);
      }
      if (!handlers.has(event)) handlers.set(event, []);
      handlers.get(event).push(handler);
      return result;
    },
    emit(event, ...args) {
      for (const handler of handlers.get(event) ?? []) handler(...args);
    },
  };
  return result;
}
