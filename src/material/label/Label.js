import * as THREE from 'three';
// Lives in material/, not compose/, specifically so material/text/GraphHTML.js
// can use it too: compose/ is allowed to import material/ (the sanctioned
// compose/ -> material/ crossing compose/axis/Axis.js and
// compose/annotation/label.js already document, CLAUDE.md §1.4's compose/
// row), never the reverse — a material/-layer caller importing a compose/
// primitive would be an upward import with no sanctioned exception. Label
// wraps SDFText (a same-layer sibling here) + a real GraphMesh (the same
// object/ import GraphMesh.js documents material/ needing eventually, now
// realized) — this is the shared primitive Axis.js, GraphHTML.js's SDFText
// fallback, and (eventually) annotation/label.js all migrate onto instead of
// each hand-rolling the same "build SDF text, billboard it, dispose it"
// sequence a second, third, and fourth time.
import { SDFText } from '../text/SDFText.js';
import { GraphMesh } from '../../object/index.js';
import { register, unregister } from './billboardRegistry.js';

const ANCHORS = new Set(['center', 'start']);
const ZERO_OFFSET = { x: 0, y: 0 };

/** @param {string} method @param {*} value @throws {TypeError} */
function assertString(method, name, value) {
  if (typeof value !== 'string') {
    throw new TypeError(`Label.${method}: ${name} must be a string, received ${JSON.stringify(value)}.`);
  }
}

/** @param {string} method @param {...number} values @throws {TypeError} */
function assertFiniteNumbers(method, ...values) {
  if (values.some((v) => typeof v !== 'number' || !Number.isFinite(v))) {
    throw new TypeError(`Label.${method}: expected finite numbers, received [${values.join(', ')}].`);
  }
}

/**
 * A chainable, disposable, GPU-text label — wraps `SDFText` + a real
 * `GraphMesh` behind one primitive, so `Axis`, `annotation.label`, and
 * `graphHTML` can each stop hand-rolling the same "build SDF text, recenter
 * it, billboard it, dispose it" sequence a third and fourth time (CLAUDE.md
 * §1.1's DRY two-strike rule — `Axis.js` and `GraphHTML.js`'s fallback path
 * were the first two independent copies; see improvement.md section (c)).
 *
 * Calling `.text()`/`.font()`/`.anchor()` again after `.render()` rebuilds
 * the live mesh's geometry in place — the update capability `graphHTML()`
 * never got (`.claude/TODO.md`). `.position()` after `.render()` is cheap
 * (no rebuild, just repositions the existing mesh). Billboarding is opt-in
 * via `.billboard(camera)` and shares one `loop` registration across every
 * currently-billboarded label (`billboardRegistry.js`), not one per label.
 *
 * @example
 * const l = label()
 *   .text('42%')
 *   .position({ x: 1, y: 2, z: 0 })
 *   .font({ fontSize: 0.3, color: '#ffffff' })
 *   .anchor('center')
 *   .billboard(camera)
 *   .render(scene, 'bar_0_label');
 * l.text('88%'); // updates the live mesh
 * l.dispose();
 */
export class Label {
  #textValue = '';
  #positionValue = { x: 0, y: 0, z: 0 };
  #fontValue = {};
  #anchorValue = 'center';
  #billboardCamera = null;
  #billboardRegistered = false;

  #scene = null;
  #name = null;
  #mesh = null;
  #sdfText = null;
  #currentOffset = ZERO_OFFSET;
  #buildGeneration = 0;
  #buildPromise = Promise.resolve();
  #disposed = false;

  /**
   * Set this label's text. Rebuilds the live mesh's geometry if already rendered.
   * @param {string} value
   * @returns {this}
   * @throws {TypeError} If `value` is not a string.
   * @throws {Error} If called after `dispose()`.
   */
  text(value) {
    this.#assertNotDisposed('text');
    assertString('text', 'value', value);
    this.#textValue = value;
    this.#requestRebuild();
    return this;
  }

  /**
   * Set this label's anchor position — the world-space point its text is
   * placed relative to (see `.anchor()` for how). Cheap after `.render()`:
   * repositions the existing mesh without rebuilding its geometry.
   * @param {{x: number, y: number, z: number}} position
   * @returns {this}
   * @throws {TypeError} If `position.x`/`.y`/`.z` isn't a finite number.
   * @throws {Error} If called after `dispose()`.
   */
  position({ x, y, z } = {}) {
    this.#assertNotDisposed('position');
    assertFiniteNumbers('position', x, y, z);
    this.#positionValue = { x, y, z };
    this.#applyPosition();
    return this;
  }

  /**
   * Set (merging with any previous call) this label's typography — the same
   * option set `SDFText.create()` accepts: `fontSize`, `letterSpacing`,
   * `align`, `color`, `outline`, `glow`. Rebuilds the live mesh's geometry
   * if already rendered.
   * @param {{fontSize?: number, letterSpacing?: number, align?: ('left'|'center'|'right'),
   *   color?: (string|number), outline?: (object|false), glow?: (object|false)}} options
   * @returns {this}
   * @throws {TypeError} If `options` is not a plain object.
   * @throws {Error} If called after `dispose()`.
   */
  font(options) {
    this.#assertNotDisposed('font');
    if (options === null || typeof options !== 'object') {
      throw new TypeError(`Label.font: options must be a plain object, received ${JSON.stringify(options)}.`);
    }
    this.#fontValue = { ...this.#fontValue, ...options };
    this.#requestRebuild();
    return this;
  }

  /**
   * Set where this label's text block sits relative to `.position()`:
   * `'center'` (default) centers the whole block on that point, via
   * `SDFText.centerOffset` — the same math `Axis`'s tick labels and
   * `graphHTML`'s SDFText fallback already use. `'start'` places the
   * block's natural top-left origin at that point instead. Rebuilds the
   * live mesh's geometry if already rendered (the offset is baked into the
   * next build's position, not applied via a transform).
   * @param {('center'|'start')} value
   * @returns {this}
   * @throws {TypeError} If `value` is not `'center'`/`'start'`.
   * @throws {Error} If called after `dispose()`.
   */
  anchor(value) {
    this.#assertNotDisposed('anchor');
    if (!ANCHORS.has(value)) {
      throw new TypeError(`Label.anchor: expected one of ${[...ANCHORS].join(', ')}, received ${JSON.stringify(value)}.`);
    }
    this.#anchorValue = value;
    this.#requestRebuild();
    return this;
  }

  /**
   * Opt in (or out, via `null`) to billboarding — rotating this label's mesh
   * to face `camera` every frame. Backed by `billboardRegistry.js`'s single
   * shared `loop` callback, not a dedicated one per label.
   * @param {(import('three').Camera|null)} [camera]
   * @returns {this}
   * @throws {TypeError} If `camera` is neither a `THREE.Camera` nor `null`.
   * @throws {Error} If called after `dispose()`.
   */
  billboard(camera = null) {
    this.#assertNotDisposed('billboard');
    if (camera !== null && !(camera instanceof THREE.Camera)) {
      throw new TypeError(`Label.billboard: expected a THREE.Camera or null, received ${JSON.stringify(camera)}.`);
    }
    this.#billboardCamera = camera;
    this.#syncBillboardRegistration();
    return this;
  }

  /**
   * The underlying `GraphMesh`, once built — `null` before `.render()` and
   * while the initial build is still in flight (`SDFText.create()` is
   * inherently async, so the mesh doesn't exist synchronously).
   * @returns {(GraphMesh|null)}
   */
  get mesh() {
    return this.#mesh;
  }

  /**
   * Resolves once the most recently requested build (from `.render()` or a
   * later `.text()`/`.font()`/`.anchor()` update) has settled — never
   * rejects, mirroring `graphHTML()`'s identical `.ready` (a failed build is
   * logged via `console.error`, not thrown). `.mesh` is reliably non-null
   * right after this resolves, unless the build failed or was superseded by
   * a newer update requested before it settled.
   * @returns {Promise<void>}
   * @example await l.render(scene, 'a').ready;
   */
  get ready() {
    return this.#buildPromise;
  }

  /**
   * Builds this label into `scene` under `name`. Fire-and-forget, matching
   * `Axis.render({camera})`'s existing pattern: returns `this` synchronously
   * (`SDFText.create()` is inherently async), and the mesh joins `scene`
   * once that resolves. Call `.text()`/`.position()`/`.font()`/`.anchor()`
   * to update the label afterward — do not call `.render()` again.
   * @param {import('three').Scene} scene
   * @param {string} name
   * @returns {this}
   * @throws {TypeError} If `scene` is not a `THREE.Scene`, or `name` is not a non-empty string.
   * @throws {Error} If already rendered, or called after `dispose()`.
   */
  render(scene, name) {
    this.#assertNotDisposed('render');
    if (!(scene instanceof THREE.Scene)) {
      throw new TypeError(`Label.render: scene must be a THREE.Scene instance, received ${JSON.stringify(scene)}.`);
    }
    if (typeof name !== 'string' || name.length === 0) {
      throw new TypeError(`Label.render: name must be a non-empty string, received ${JSON.stringify(name)}.`);
    }
    if (this.#scene !== null) {
      throw new Error(`Label.render: label '${this.#name}' has already been rendered — call .text()/.position()/.font()/.anchor() to update it instead of calling .render() again.`);
    }
    this.#scene = scene;
    this.#name = name;
    this.#requestRebuild();
    return this;
  }

  /**
   * Disposes the underlying mesh (if built) and unregisters from the
   * billboard registry. Idempotent; safe before `.render()` has ever been
   * called, and safe to call while the initial build is still in flight
   * (the in-flight `SDFText` is discarded once it resolves instead of being
   * added to the scene).
   * @example l.dispose();
   */
  dispose() {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#buildGeneration++;
    if (this.#billboardRegistered) {
      unregister(this.#mesh.three);
      this.#billboardRegistered = false;
    }
    this.#mesh?.dispose();
    this.#mesh = null;
    this.#sdfText = null;
  }

  /** @throws {Error} */
  #assertNotDisposed(method) {
    if (this.#disposed) {
      throw new Error(`Label.${method}: instance has been disposed.`);
    }
  }

  #requestRebuild() {
    if (this.#scene === null) return; // not rendered yet — current state is used on the first render()
    this.#buildGeneration++;
    this.#buildPromise = this.#build(this.#buildGeneration);
  }

  /** @param {number} myGeneration */
  async #build(myGeneration) {
    let sdfText;
    try {
      sdfText = await SDFText.create(this.#textValue, {
        fontSize: this.#fontValue.fontSize,
        letterSpacing: this.#fontValue.letterSpacing,
        align: this.#fontValue.align,
        color: this.#fontValue.color,
        outline: this.#fontValue.outline,
        glow: this.#fontValue.glow,
      });
    } catch (error) {
      console.error(`Label.render: failed to build text '${this.#textValue}' for label '${this.#name}'.`, error);
      return;
    }

    // Disposed, or superseded by a newer .text()/.font()/.anchor() call that
    // landed while this build was in flight — discard, don't touch the scene.
    if (this.#disposed || myGeneration !== this.#buildGeneration) {
      sdfText.dispose();
      return;
    }

    this.#currentOffset = this.#anchorValue === 'center' ? sdfText.centerOffset : ZERO_OFFSET;

    if (this.#mesh === null) {
      this.#mesh = new GraphMesh({
        scene: this.#scene,
        name: this.#name,
        geometry: sdfText.mesh.geometry,
        material: sdfText.mesh.material,
      });
    } else {
      const three = this.#mesh.three;
      const previous = this.#sdfText;
      three.geometry = sdfText.mesh.geometry;
      three.material = sdfText.mesh.material;
      previous.dispose(); // old geometry/material only — the shared atlas texture is untouched (see SDFText.dispose)
    }
    this.#sdfText = sdfText;

    this.#applyPosition();
    this.#syncBillboardRegistration();
  }

  #applyPosition() {
    if (this.#mesh === null) return;
    const p = this.#positionValue;
    const offset = this.#currentOffset;
    this.#mesh.setPosition(p.x + offset.x, p.y + offset.y, p.z);
  }

  #syncBillboardRegistration() {
    if (this.#mesh === null) return;
    if (this.#billboardCamera !== null && !this.#billboardRegistered) {
      register(this.#mesh.three, () => this.#billboardCamera);
      this.#billboardRegistered = true;
    } else if (this.#billboardCamera === null && this.#billboardRegistered) {
      unregister(this.#mesh.three);
      this.#billboardRegistered = false;
    }
  }
}

/**
 * Creates a new, unrendered `Label` — see the `Label` class doc for the full
 * chainable API and an example.
 * @returns {Label}
 * @example label().text('42%').position({ x: 0, y: 0, z: 0 }).render(scene, 'l0');
 */
export function label() {
  return new Label();
}
