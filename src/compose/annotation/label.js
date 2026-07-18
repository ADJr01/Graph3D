import * as THREE from 'three';
// Real label rendering (as opposed to the { text, position } stub below) is
// the same sanctioned compose/ -> material/ crossing Axis.js already
// documents for SDFText (CLAUDE.md §1.4's compose/ row). Calls the shared
// Label primitive (improvement.md initiative (c) PR 6) directly instead of
// graphHTML(): annotation.label() only ever needed plain SDF text, never
// graphHTML's experimental HTML-in-Canvas path, so routing through Label
// drops that unused indirection rather than picking between two rendering
// backends this call site never chose between.
import { Label } from '../../material/label/Label.js';

/** The only event `label().on()` supports today — literally the prompt's own wording (`annotation.label(...).on('click')`); grow this set when a real consumer needs another one (YAGNI). */
const LABEL_EVENTS = new Set(['click']);

/** Mirrors `GraphHTML.js`'s identical `DEFAULT_FALLBACK_FONT_SIZE`/color — kept in sync by hand (two call sites, not worth a shared module) so migrating off `graphHTML()` here doesn't shrink real labels down to `SDFText`'s own bare default (fontSize 1). */
const DEFAULT_LABEL_FONT_SIZE = 0.3;
const DEFAULT_LABEL_COLOR = '#ffffff';

/** Every real label needs a unique scene-registry name; `annotation.label()` itself takes none. */
let annotationLabelId = 0;

/**
 * Creates a text-label annotation. Returns `{ text, position, style }`
 * metadata by default — exactly what `Axis`'s per-tick labels and
 * `annotation.callout`'s text also need, so the stub is written once here
 * and reused by both (CLAUDE.md §1.1 DRY two-strike rule).
 *
 * Passing `options.scene` + `options.camera` opts into also building a
 * real, visible label via the shared `Label` primitive (billboarded SDF
 * text) at `position` — mirroring `Axis.render()`'s identical
 * `options.camera` opt-in. Omitting them keeps the original metadata-only
 * behavior; existing callers (`Axis`, `annotation.callout`) don't pass them
 * and are unaffected. Fire-and-forget, same as `Axis`: `label()` stays
 * synchronous, the real mesh appears once `Label`'s async build resolves.
 * Call the returned `dispose()` to remove it (a no-op if no real mesh was
 * ever requested/built). **Behavior change from before this migration**:
 * this call site only ever rendered plain text, never `graphHTML`'s
 * experimental HTML-in-Canvas path (no caller passed markup through it), so
 * the now-unreachable `options.html` passthrough was removed along with the
 * `graphHTML` dependency — not a capability loss for any real use.
 *
 * `on(event, handler)`/`emit(event, ...args)` (Prompt 155) give the returned
 * object a tiny event registry of its own — the same `on`/`emit` shape
 * `interact/eventEmitter.js` already provides, but written fresh here rather
 * than imported: `compose/` sits *below* `interact/` in CLAUDE.md §1.4's
 * layering table (re-verified at improvement.md initiative (c) PR 6 — still
 * holds), so `compose/annotation` importing from `interact/` would be an
 * upward dependency with no sanctioned exception (unlike, say,
 * `compose/selection`'s narrow `anim/` carve-out). `interact/PointerRouter`
 * (which *can* import this module, being the higher layer) is the one that
 * actually calls `emit('click', ...)`, after hit-testing the label's
 * projected screen position against a click via `registerLabel()`.
 * @param {{ text: string, position?: {x?: number, y?: number, z?: number}, style?: object,
 *   scene?: THREE.Scene, camera?: THREE.Camera }} config `style` is always carried on the
 *   returned metadata as before, and — only when `scene`/`camera` are supplied — is
 *   additionally forwarded to the real `Label`'s `.font()` (`fontSize`/`color`/`outline`/`glow`;
 *   `fontSize`/`color` default to `0.3`/`'#ffffff'` when omitted, matching this call site's
 *   prior `graphHTML`-fallback defaults).
 * @returns {{ type: 'label', text: string, position: {x: number, y: number, z: number}, style: object,
 *   on: (event: 'click', handler: Function) => object, emit: (event: string, ...args: *) => void,
 *   dispose: () => void }}
 * @throws {TypeError} If `text` is not a string, or `scene`/`camera` are supplied but the wrong type.
 * @example
 * const peak = annotation.label({ text: '42%', position: { x: 1, y: 2, z: 0 } });
 * peak.on('click', () => console.log('clicked the peak label'));
 * @example
 * // Real, visible, camera-billboarded label:
 * const peak = annotation.label({ text: '42%', position: { x: 1, y: 2, z: 0 }, scene: scene.three, camera: scene.camera.three });
 * peak.dispose(); \ removes the real mesh
 */
export function label({ text, position = {}, style = {}, scene, camera } = {}) {
  if (typeof text !== 'string') {
    throw new TypeError(`annotation.label: expected text to be a string, received ${JSON.stringify(text)}.`);
  }
  if (scene !== undefined && !(scene instanceof THREE.Scene)) {
    throw new TypeError(`annotation.label: expected scene to be a THREE.Scene, received ${JSON.stringify(scene)}.`);
  }
  if (camera !== undefined && !(camera instanceof THREE.Camera)) {
    throw new TypeError(`annotation.label: expected camera to be a THREE.Camera, received ${JSON.stringify(camera)}.`);
  }
  const resolvedPosition = { x: position.x ?? 0, y: position.y ?? 0, z: position.z ?? 0 };
  const handlers = new Map();
  let realLabel = null;
  const result = {
    type: 'label',
    text,
    position: resolvedPosition,
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
    dispose() {
      realLabel?.dispose();
    },
  };

  if (scene !== undefined && camera !== undefined) {
    realLabel = new Label()
      .text(text)
      .position(resolvedPosition)
      .font({
        fontSize: style.fontSize ?? DEFAULT_LABEL_FONT_SIZE,
        color: style.color ?? DEFAULT_LABEL_COLOR,
        align: 'center',
        outline: style.outline,
        glow: style.glow,
      })
      .anchor('center')
      .billboard(camera)
      .render(scene, `annotation_label_${++annotationLabelId}`);
  }

  return result;
}
