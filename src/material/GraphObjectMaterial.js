import * as THREE from 'three';
import { loop } from '../core/Graph3DLoop.js';
import { disposeMaterial, retainTexture, releaseTexture } from '../core/GraphDisposal.js';
import { GraphMesh } from '../object/GraphMesh.js';
import { GraphInstancedObject } from '../object/GraphInstancedObject.js';

/**
 * Uniform names `bindUniforms` can drive automatically, and the runtime
 * resource each one needs to stay live: `time` subscribes to the shared
 * `loop`, `resolution` subscribes to `window`'s `resize` event.
 */
const AUTO_UNIFORM_NAMES = ['time', 'resolution'];

/** THREE.Material texture-slot property names, keyed by the short name `setMap` accepts. */
const MAP_SLOTS = Object.freeze({
  map: 'map',
  normal: 'normalMap',
  roughness: 'roughnessMap',
  metalness: 'metalnessMap',
  emissive: 'emissiveMap',
  ao: 'aoMap',
  env: 'envMap',
  displacement: 'displacementMap',
  clearcoat: 'clearcoatMap',
});

/**
 * Every `THREE.Material` texture-slot property name a preset in this
 * codebase actually uses, checked in addition to `.uniforms.*.value`
 * (custom `THREE.ShaderMaterial` presets like `dataDriven`/`crystal` hold
 * their textures there instead of on named material properties).
 */
const KNOWN_TEXTURE_PROPS = [...new Set(Object.values(MAP_SLOTS))];

/**
 * Every `THREE.Texture` a material references, via its own named properties
 * or (for `THREE.ShaderMaterial`) its `uniforms`. The set `retainTexture`/
 * `releaseTexture` (Prompt 111) is walked over when a `GraphObjectMaterial`
 * starts or stops using a material, so a texture shared across several
 * materials (e.g. one `THREE.CubeTexture` passed to `material.crystal()` for
 * many bars) survives until every material referencing it is gone.
 * @param {THREE.Material} material
 * @returns {THREE.Texture[]}
 */
function texturesOf(material) {
  const found = [];
  for (const prop of KNOWN_TEXTURE_PROPS) {
    if (material[prop] instanceof THREE.Texture) found.push(material[prop]);
  }
  if (material.uniforms) {
    for (const uniform of Object.values(material.uniforms)) {
      if (uniform?.value instanceof THREE.Texture) found.push(uniform.value);
    }
  }
  return found;
}

/**
 * Material-layer wrapper around a single `GraphMesh`/`GraphInstancedObject`'s
 * material — swapping it, promoting it to a custom shader, wiring
 * self-updating uniforms, and assigning PBR texture maps, all through one
 * narrow surface instead of reaching into `target.three.material` directly.
 *
 * `material/` sits above `object/` in the CLAUDE.md layer table, so this
 * class importing `GraphMesh`/`GraphInstancedObject` is an ordinary downward
 * import, not one of the sanctioned upward exceptions — it's what lets
 * `GraphMesh`'s own `material` getter stay a raw `THREE.Material` (see that
 * file's comment) while still giving callers a richer wrapper on request.
 *
 * Multi-material targets (`target.three.material` as an array) aren't
 * supported — there's no single slot for `set`/`setMap` to address. Operate
 * on `target.three.material[i]` directly for those.
 *
 * `set()`/`setMap()` are ref-count-aware (Prompt 111, `core/GraphDisposal.js`'s
 * `retainTexture`/`releaseTexture`): swapping between two materials that
 * share a texture (or a map slot's old/new value) never disposes it out from
 * under the one still using it, since both sides of a single `set()`/
 * `setMap()` call are visible to that one call. This does **not** extend to
 * two *independently* constructed `GraphObjectMaterial`s that happen to
 * share a texture from the start (e.g. one `THREE.CubeTexture` handed to
 * many separate `material.crystal()` calls) — there's no way for one
 * wrapper's constructor to know a texture is already used elsewhere without
 * walking the whole scene. For that case, call `retainTexture(texture)`
 * yourself once per extra material sharing it (see `core/GraphDisposal.js`).
 *
 * @example
 * const wrapper = new GraphObjectMaterial(bar); // bar: GraphMesh
 * wrapper.set(new THREE.MeshStandardMaterial({ color: 'crimson' }));
 * wrapper.setMap('roughness', roughnessTexture);
 *
 * @example
 * // Custom shader with self-updating uniforms:
 * wrapper.applyShader(new THREE.ShaderMaterial({ uniforms: {}, vertexShader, fragmentShader }));
 * wrapper.bindUniforms({ time: 'auto', resolution: 'auto', intensity: 1.5 });
 */
export class GraphObjectMaterial {
  /** @type {GraphMesh|GraphInstancedObject} */
  #target;

  /** @type {boolean} */
  #disposed = false;

  /** @type {(function(number, number): void)|null} */
  #autoTimeTick = null;

  /** @type {(function(): void)|null} */
  #autoResolutionListener = null;

  /**
   * @param {GraphMesh|GraphInstancedObject} target
   * @throws {TypeError} If `target` is not a `GraphMesh` or `GraphInstancedObject`.
   * @throws {TypeError} If `target`'s current material is a multi-material array.
   * @throws {Error} If `target` has already been disposed.
   * @example new GraphObjectMaterial(bar);
   */
  constructor(target) {
    if (!(target instanceof GraphMesh) && !(target instanceof GraphInstancedObject)) {
      throw new TypeError(
        `GraphObjectMaterial: target must be a GraphMesh or GraphInstancedObject instance, ` +
          `received ${target?.constructor?.name ?? typeof target}.`,
      );
    }
    if (Array.isArray(target.material)) {
      throw new TypeError(
        'GraphObjectMaterial: multi-material targets (an array of THREE.Material) are not ' +
          'supported — operate on target.three.material[i] directly.',
      );
    }
    this.#target = target;
  }

  /**
   * The target's current material — a live read, not a cached snapshot.
   * @returns {THREE.Material}
   * @throws {Error} If called after `dispose()`, or if the wrapped target has been disposed.
   * @example wrapper.material.color.set('crimson');
   */
  get material() {
    this.#assertNotDisposed('material');
    return this.#target.material;
  }

  /**
   * Replace the target's material outright, disposing the one being
   * replaced (GPU cleanup — do not call this with a material you intend to
   * reuse elsewhere; reconstruct it instead). Textures the new material
   * references are retained *before* the old material's textures are
   * released, so a texture shared between the two (e.g. the same `envMap`)
   * survives the swap instead of being disposed out from under the new
   * material.
   * @param {THREE.Material} material
   * @returns {this}
   * @throws {TypeError} If `material` is not a `THREE.Material` instance.
   * @throws {Error} If called after `dispose()`, or if the wrapped target has been disposed.
   * @example wrapper.set(new THREE.MeshPhysicalMaterial({ metalness: 1 }));
   */
  set(material) {
    this.#assertNotDisposed('set');
    if (!(material instanceof THREE.Material)) {
      throw new TypeError(
        `GraphObjectMaterial.set: expected a THREE.Material instance, received ${JSON.stringify(material)}.`,
      );
    }
    for (const texture of texturesOf(material)) retainTexture(texture);
    disposeMaterial(this.#target.material);
    this.#target.three.material = material;
    return this;
  }

  /**
   * Promote the target to a custom `THREE.ShaderMaterial`/`RawShaderMaterial`.
   * A thin, self-documenting alias for `set()` — use `bindUniforms()`
   * afterward to wire its `uniforms`.
   *
   * Pass `preserveUniforms: true` for dev-mode shader hot-reload: values of
   * any uniform *name* present in both the current material and
   * `shaderMaterial` (including textures — safe thanks to `set()`'s own
   * ref-counted swap, Prompt 111) are copied onto `shaderMaterial` before
   * the swap, so re-applying a shader you've only edited the GLSL *text* of
   * keeps whatever values you'd already tweaked (`bindUniforms`,
   * `Selection.style`, ...) instead of resetting to `shaderMaterial`'s own
   * defaults. Defaults to `false` — for two *unrelated* shaders (e.g.
   * `holographic` → `crystal`) that happen to share a uniform name like
   * `color`, blindly carrying it over would be a surprising bleed-through,
   * not a helpful reload.
   * @param {THREE.ShaderMaterial} shaderMaterial
   * @param {{ preserveUniforms?: boolean }} [options]
   * @returns {this}
   * @throws {TypeError} If `shaderMaterial` is not a `THREE.ShaderMaterial` (or `RawShaderMaterial`).
   * @throws {Error} If called after `dispose()`, or if the wrapped target has been disposed.
   * @example wrapper.applyShader(new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader }));
   * @example
   * // Dev-mode hot-reload after editing fragmentShader's GLSL:
   * wrapper.applyShader(recompiledMaterial, { preserveUniforms: true });
   */
  applyShader(shaderMaterial, options = {}) {
    this.#assertNotDisposed('applyShader');
    if (!(shaderMaterial instanceof THREE.ShaderMaterial)) {
      throw new TypeError(
        `GraphObjectMaterial.applyShader: expected a THREE.ShaderMaterial (or RawShaderMaterial) ` +
          `instance, received ${JSON.stringify(shaderMaterial)}.`,
      );
    }
    if (options === null || typeof options !== 'object') {
      throw new TypeError(`GraphObjectMaterial.applyShader: options must be a plain object, received ${JSON.stringify(options)}.`);
    }
    const { preserveUniforms = false } = options;
    if (preserveUniforms) {
      const current = this.material;
      if (current.uniforms) {
        for (const [name, uniform] of Object.entries(current.uniforms)) {
          if (shaderMaterial.uniforms?.[name]) shaderMaterial.uniforms[name].value = uniform.value;
        }
      }
    }
    return this.set(shaderMaterial);
  }

  /**
   * Wire named entries of the current material's `uniforms` object. Each
   * value is either the literal `'auto'` — currently supported for `time`
   * (seconds elapsed, driven by the shared render loop) and `resolution`
   * (a `THREE.Vector2` of `window.innerWidth/innerHeight * devicePixelRatio`,
   * refreshed on `window`'s `resize` event) — or a static value assigned
   * directly to `uniforms[name].value`.
   *
   * THREE.js reads a compiled `ShaderMaterial`'s uniform value objects by
   * reference, so re-binding a name mutates its existing `.value` in place
   * rather than replacing the wrapper — call `bindUniforms` with every
   * uniform name the shader will ever need before the material's first
   * render.
   * @param {Object<string, ('auto'|*)>} uniforms
   * @returns {this}
   * @throws {TypeError} If `uniforms` is not a plain object.
   * @throws {Error} If the current material has no `uniforms` object (not a shader material).
   * @throws {Error} If `'auto'` is requested for a name other than `time`/`resolution`.
   * @throws {Error} If `resolution: 'auto'` is requested outside a browser (`window` undefined).
   * @throws {Error} If called after `dispose()`, or if the wrapped target has been disposed.
   * @example wrapper.bindUniforms({ time: 'auto', resolution: 'auto', intensity: 1.5 });
   */
  bindUniforms(uniforms) {
    this.#assertNotDisposed('bindUniforms');
    if (uniforms === null || typeof uniforms !== 'object' || Array.isArray(uniforms)) {
      throw new TypeError(
        `GraphObjectMaterial.bindUniforms: expected a plain object, received ${JSON.stringify(uniforms)}.`,
      );
    }
    const material = this.material;
    if (!material.uniforms || typeof material.uniforms !== 'object') {
      throw new Error(
        `GraphObjectMaterial.bindUniforms: the current material ('${material.type}') has no ` +
          `'uniforms' object — bindUniforms only works on a THREE.ShaderMaterial/RawShaderMaterial. ` +
          'Call applyShader() first.',
      );
    }

    for (const [name, spec] of Object.entries(uniforms)) {
      if (spec !== 'auto') {
        this.#bindStatic(name, spec);
        continue;
      }
      if (name === 'time') this.#bindAutoTime();
      else if (name === 'resolution') this.#bindAutoResolution();
      else {
        throw new Error(
          `GraphObjectMaterial.bindUniforms: 'auto' is only supported for ${AUTO_UNIFORM_NAMES.join(', ')} ` +
            `uniforms, received '${name}'.`,
        );
      }
    }
    return this;
  }

  /**
   * Assign a texture to a named PBR map slot, releasing (ref-count-aware)
   * whatever texture previously occupied that slot.
   * @param {keyof MAP_SLOTS} slot - One of: map, normal, roughness, metalness, emissive, ao, env, displacement, clearcoat.
   * @param {THREE.Texture} texture
   * @returns {this}
   * @throws {TypeError} If `slot` is not a recognised name.
   * @throws {TypeError} If `texture` is not a `THREE.Texture` instance.
   * @throws {Error} If the current material has no property for that slot (e.g. `clearcoat` on a non-physical material).
   * @throws {Error} If called after `dispose()`, or if the wrapped target has been disposed.
   * @example wrapper.setMap('normal', normalTexture);
   */
  setMap(slot, texture) {
    this.#assertNotDisposed('setMap');
    const prop = MAP_SLOTS[slot];
    if (!prop) {
      throw new TypeError(
        `GraphObjectMaterial.setMap: unknown slot '${slot}'. Expected one of: ${Object.keys(MAP_SLOTS).join(', ')}.`,
      );
    }
    if (!(texture instanceof THREE.Texture)) {
      throw new TypeError(
        `GraphObjectMaterial.setMap: expected a THREE.Texture instance, received ${JSON.stringify(texture)}.`,
      );
    }
    const material = this.material;
    if (!(prop in material)) {
      throw new Error(
        `GraphObjectMaterial.setMap: the current material ('${material.type}') has no '${prop}' property.`,
      );
    }
    const previous = material[prop];
    material[prop] = texture;
    material.needsUpdate = true;
    // No retainTexture() for the new texture here — unlike set()'s old/new
    // material pairing, a single setMap() call has no "other side" of its
    // own that could otherwise dispose it out from under this assignment.
    // Retaining unconditionally would double-count a texture used nowhere
    // else, requiring a second release that would never come (a leak, not
    // a fix). Skip releasing if the slot is being reassigned to itself.
    if (previous instanceof THREE.Texture && previous !== texture) releaseTexture(previous);
    return this;
  }

  /**
   * Unsubscribe any `'auto'` uniform bindings (render-loop tick, resize
   * listener). Does not dispose the wrapped material — the target
   * (`GraphMesh`/`GraphInstancedObject`) owns and disposes that itself.
   * Idempotent.
   * @returns {void}
   * @example wrapper.dispose();
   */
  dispose() {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#unbindAutoTime();
    this.#unbindAutoResolution();
  }

  // ── Private: auto-uniform bindings ─────────────────────────────────────────

  /** @param {string} name @param {*} value */
  #bindStatic(name, value) {
    if (name === 'time') this.#unbindAutoTime();
    if (name === 'resolution') this.#unbindAutoResolution();
    const material = this.material;
    if (material.uniforms[name]) material.uniforms[name].value = value;
    else material.uniforms[name] = { value };
  }

  #bindAutoTime() {
    if (this.#autoTimeTick) return;
    this.#bindStatic('time', 0);
    this.#autoTimeTick = (deltaSec, elapsedSec) => {
      const uniform = this.#target.material.uniforms?.time;
      if (uniform) uniform.value = elapsedSec;
    };
    loop.add(this.#autoTimeTick);
  }

  #unbindAutoTime() {
    if (!this.#autoTimeTick) return;
    loop.remove(this.#autoTimeTick);
    this.#autoTimeTick = null;
  }

  #bindAutoResolution() {
    if (this.#autoResolutionListener) return;
    if (typeof window === 'undefined') {
      throw new Error(
        "GraphObjectMaterial.bindUniforms: resolution: 'auto' requires a browser `window` global.",
      );
    }
    const readResolution = () =>
      new THREE.Vector2(
        window.innerWidth * (window.devicePixelRatio || 1),
        window.innerHeight * (window.devicePixelRatio || 1),
      );
    this.#bindStatic('resolution', readResolution());
    this.#autoResolutionListener = () => {
      const uniform = this.#target.material.uniforms?.resolution;
      if (uniform) uniform.value.copy(readResolution());
    };
    window.addEventListener('resize', this.#autoResolutionListener);
  }

  #unbindAutoResolution() {
    if (!this.#autoResolutionListener) return;
    window.removeEventListener('resize', this.#autoResolutionListener);
    this.#autoResolutionListener = null;
  }

  /** @param {string} method @throws {Error} */
  #assertNotDisposed(method) {
    if (this.#disposed) {
      throw new Error(`GraphObjectMaterial.${method}: instance has been disposed.`);
    }
  }
}
