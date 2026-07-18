import * as THREE from 'three';
import { loop } from '../../core/Graph3DLoop.js';
// The SDFText fallback below builds via Label (a same-layer sibling under
// material/label/, CLAUDE.md §1.4's compose/ row note on this exact crossing)
// instead of calling SDFText.create() + hand-rolling billboarding/disposal a
// second time — Axis.js's tick labels were the first copy of that sequence.
import { Label } from '../label/Label.js';
// resolveTarget/assertPositiveFiniteNumber/buildPlaneMesh moved to
// billboardTarget.js once graphIcon.js (material/icon/) needed the exact
// same three helpers — CLAUDE.md §1.1 DRY's two-strike rule.
import { resolveBillboardTarget, assertPositiveFiniteNumber, buildTexturedPlane } from '../billboardTarget.js';

/** @see https://developer.chrome.com/blog/html-in-canvas-origin-trial */
const ORIGIN_TRIAL_DOC_URL = 'https://developer.chrome.com/blog/html-in-canvas-origin-trial';

const DEFAULT_WIDTH = 2;
const DEFAULT_HEIGHT = 1;
const DEFAULT_PIXEL_WIDTH = 512;
const DEFAULT_PIXEL_HEIGHT = 256;
const DEFAULT_FALLBACK_FONT_SIZE = 0.3;

let warnedExperimental = false;
let warnedFallback = false;
/** Every fallback Label needs a unique scene-registry name; graphHTML() itself takes none (one-off, per-datum labels). */
let fallbackLabelId = 0;

/**
 * True if this browser exposes `CanvasRenderingContext2D.prototype.drawElementImage`
 * — the 2D-context entry point of Chrome's still-experimental HTML-in-Canvas
 * origin trial (`{@link ORIGIN_TRIAL_DOC_URL}`). As of this writing that
 * requires Chrome 148-150 with the trial registered, or Canary 149+ with the
 * `#canvas-draw-element` flag — effectively unavailable to almost every real
 * user today, which is exactly why `graphHTML()` always needs (and defaults
 * to) the `SDFText` fallback below.
 *
 * Checked as a plain global lookup rather than via a `renderer` argument:
 * `drawElementImage` lives on `CanvasRenderingContext2D`, not
 * `WebGLRenderingContext` — `graphHTML` rasterizes into its own small
 * offscreen 2D canvas, entirely independent of Graph3D's own WebGL canvas,
 * so no renderer needs to be probed or passed in.
 * @returns {boolean}
 * @example if (isHTMLInCanvasSupported()) { \ real HTML label rendering is available }
 */
export function isHTMLInCanvasSupported() {
  return (
    typeof CanvasRenderingContext2D !== 'undefined' &&
    typeof CanvasRenderingContext2D.prototype.drawElementImage === 'function'
  );
}

/** Strips markup down to plain text for the SDFText fallback. A detached element never touches the live document. @param {string} html @returns {string} */
function textFromHtml(html) {
  const container = document.createElement('div');
  container.innerHTML = html;
  return container.textContent ?? '';
}

/**
 * Rasterizes `html` via the experimental `drawElementImage` API into a
 * small offscreen 2D canvas, then wraps that canvas in a standard
 * `THREE.CanvasTexture` — no THREE internals involved, unlike the WebGL
 * entry point (`texElementImage2D`), which has no public way to hand THREE
 * an externally-uploaded texture. The `layoutsubtree` attribute is what
 * makes a canvas's DOM children participate in real layout instead of
 * being inert fallback content; the element must be a child of the canvas
 * to be captured at all (part of the origin trial's documented contract).
 * @param {{ html: string, pixelWidth: number, pixelHeight: number }} config
 * @returns {THREE.CanvasTexture}
 */
function captureHtmlTexture({ html, pixelWidth, pixelHeight }) {
  const canvas = document.createElement('canvas');
  canvas.width = pixelWidth;
  canvas.height = pixelHeight;
  canvas.setAttribute('layoutsubtree', '');

  const container = document.createElement('div');
  container.innerHTML = html;
  Object.assign(container.style, {
    position: 'absolute',
    left: '-99999px',
    width: `${pixelWidth}px`,
    height: `${pixelHeight}px`,
  });
  canvas.appendChild(container);
  document.body.appendChild(canvas);

  try {
    const ctx = canvas.getContext('2d');
    ctx.drawElementImage(container, 0, 0);
  } finally {
    canvas.removeChild(container);
    document.body.removeChild(canvas);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return texture;
}

/**
 * Attaches a real, camera-billboarded label to any targeted object —
 * **experimental** (Prompt-requested, not part of `prompts.md`'s numbered
 * sequence): tries Chrome's still-in-origin-trial HTML-in-Canvas API first
 * (real, arbitrary HTML/CSS content, `{@link ORIGIN_TRIAL_DOC_URL}`), and
 * transparently falls back to a `SDFText` label (plain text only — markup
 * is stripped) when that API is unavailable or fails at runtime. The two
 * paths are structurally interchangeable to the caller: same target
 * shapes, same returned handle, same disposal contract.
 *
 * Fire-and-forget, mirroring `Axis.render({camera})`'s existing pattern
 * (`SDFText.create` is inherently async — a texture-atlas fetch): the
 * returned handle exists synchronously, but `.mesh` is `null` until
 * `.ready` resolves. Calling `.dispose()` before `.ready` resolves is safe
 * — the in-flight build is discarded instead of added to the scene.
 *
 * Two independent size knobs, both optional: `width`/`height` are the
 * built plane's size in **world units** (default `2`×`1`, matching this
 * mesh's `THREE.PlaneGeometry` — same unit space as everything else in the
 * scene). `pixelWidth`/`pixelHeight` are the **raster resolution** the
 * `html` is captured at (default `512`×`256`, only meaningful on the
 * experimental path — `SDFText`'s fallback glyphs are vector, not
 * rasterized, so these two are ignored when the fallback is used).
 * Mismatching the two aspect ratios stretches the texture to fit the plane,
 * same as any other textured `THREE.PlaneGeometry`.
 *
 * @param {GraphMesh|{object: GraphInstancedObject, index: number}|{scene: THREE.Scene, position: {x:number,y:number,z:number}}} target
 *   A mesh, one instance of an instanced object, or an explicit scene+position pair.
 * @param {{
 *   html: string,
 *   camera: THREE.Camera,
 *   width?: number,
 *   height?: number,
 *   pixelWidth?: number,
 *   pixelHeight?: number,
 *   text?: string,
 *   style?: { fontSize?: number, color?: (string|number), outline?: object, glow?: object },
 * }} options `width`/`height` default to `2`/`1` world units; `pixelWidth`/`pixelHeight`
 *   default to `512`/`256` (experimental-path raster resolution only). `text` overrides the
 *   SDFText fallback's derived text (default: `html`'s stripped `textContent`). `style` only
 *   applies to the SDFText fallback (`fontSize` defaults to `0.3`, `color` to `'#ffffff'`) —
 *   it has no effect when the experimental path renders, since `html`'s own CSS controls that.
 * @returns {{ type: 'graphHTML', mesh: (THREE.Mesh|null), isExperimental: boolean, ready: Promise<void>, dispose: () => void }}
 * @throws {TypeError} If `target` doesn't match a recognized shape, or resolves to no
 *   `THREE.Scene` (a `GraphMesh`/instanced object that hasn't been added to a scene yet).
 * @throws {TypeError} If `options.html` isn't a string, `options.camera` isn't a `THREE.Camera`,
 *   or `width`/`height`/`pixelWidth`/`pixelHeight` aren't positive finite numbers.
 * @example
 * const bars = chart.selection().nodes(); \ 10 GraphMesh bars
 * bars.forEach((bar, i) => graphHTML(bar, { html: `<b>${i}</b>`, camera: scene.camera.three }));
 * @example
 * // Bigger raster for crisper small text, smaller world-space footprint:
 * graphHTML(bar, { html: '<small>42%</small>', camera, width: 1, height: 0.5, pixelWidth: 256, pixelHeight: 128 });
 */
export function graphHTML(target, options = {}) {
  if (options === null || typeof options !== 'object') {
    throw new TypeError(`graphHTML: options must be a plain object, received ${JSON.stringify(options)}.`);
  }
  const {
    html,
    camera,
    width = DEFAULT_WIDTH,
    height = DEFAULT_HEIGHT,
    pixelWidth = DEFAULT_PIXEL_WIDTH,
    pixelHeight = DEFAULT_PIXEL_HEIGHT,
    text,
    style = {},
  } = options;
  if (typeof html !== 'string') {
    throw new TypeError(`graphHTML: options.html must be a string, received ${JSON.stringify(html)}.`);
  }
  if (!(camera instanceof THREE.Camera)) {
    throw new TypeError(`graphHTML: options.camera must be a THREE.Camera instance, received ${JSON.stringify(camera)}.`);
  }
  assertPositiveFiniteNumber('width', width);
  assertPositiveFiniteNumber('height', height);
  assertPositiveFiniteNumber('pixelWidth', pixelWidth);
  assertPositiveFiniteNumber('pixelHeight', pixelHeight);

  const { position, scene } = resolveBillboardTarget(target);

  let disposed = false;
  let unbillboard = null;
  let disposeVisual = null;
  const handle = {
    type: 'graphHTML',
    mesh: null,
    isExperimental: false,
    ready: null,
    dispose() {
      if (disposed) return;
      disposed = true;
      if (unbillboard) unbillboard();
      if (disposeVisual) disposeVisual();
      handle.mesh = null;
    },
  };

  function finalize(mesh, isExperimental, disposeFn, offset = { x: 0, y: 0 }) {
    if (disposed) {
      disposeFn();
      return;
    }
    mesh.position.set(position.x + offset.x, position.y + offset.y, position.z);
    scene.add(mesh);
    const tick = () => mesh.quaternion.copy(camera.quaternion);
    tick();
    loop.add(tick);
    unbillboard = () => loop.remove(tick);
    disposeVisual = () => {
      scene.remove(mesh);
      disposeFn();
    };
    handle.mesh = mesh;
    handle.isExperimental = isExperimental;
  }

  async function build() {
    if (isHTMLInCanvasSupported()) {
      if (!warnedExperimental) {
        warnedExperimental = true;
        console.warn(
          `graphHTML: using the experimental Chrome HTML-in-Canvas API (origin trial, subject to change) — ${ORIGIN_TRIAL_DOC_URL}`,
        );
      }
      try {
        const texture = captureHtmlTexture({ html, pixelWidth, pixelHeight });
        const mesh = buildTexturedPlane(texture, width, height);
        finalize(mesh, true, () => {
          mesh.geometry.dispose();
          mesh.material.dispose();
          texture.dispose();
        });
        return;
      } catch (error) {
        console.error('graphHTML: the experimental HTML-in-Canvas path failed at runtime — falling back to SDFText.', error);
      }
    } else if (!warnedFallback) {
      warnedFallback = true;
      console.warn(
        'graphHTML: HTML-in-Canvas is unsupported in this browser — falling back to SDFText ' +
          `(plain text only; markup/CSS in 'html' is stripped). ${ORIGIN_TRIAL_DOC_URL}`,
      );
    }

    // Label's anchor('center') applies the same top-left-to-center recenter
    // SDFText's own `centerOffset` always needed here — both paths now anchor
    // at `position` the same way. graphHTML() itself takes no name (one-off,
    // per-datum labels), so each fallback Label gets an auto-generated one
    // purely for the scene registry (see fallbackLabelId's own doc comment).
    const fallbackLabel = new Label()
      .text(text ?? textFromHtml(html))
      .position(position)
      .font({
        fontSize: style.fontSize ?? DEFAULT_FALLBACK_FONT_SIZE,
        color: style.color ?? '#ffffff',
        align: 'center',
        outline: style.outline,
        glow: style.glow,
      })
      .anchor('center')
      .billboard(camera)
      .render(scene, `graphHTML_fallback_${++fallbackLabelId}`);
    disposeVisual = () => fallbackLabel.dispose();

    await fallbackLabel.ready;
    if (disposed) return;
    // null if the build failed (Label's own #build already logged it) or was
    // never reached because dispose() raced ahead of it.
    handle.mesh = fallbackLabel.mesh ? fallbackLabel.mesh.three : null;
    handle.isExperimental = false;
  }

  handle.ready = build();
  return handle;
}
