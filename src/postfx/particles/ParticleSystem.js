import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { guardExternalImport } from '../../core/umdCompat.js';
import { buildParticleShaders } from './particleShaders.js';
import { buildVelocityFragmentShader, POSITION_SIM_FRAGMENT_SHADER, SIMULATION_VERTEX_SHADER } from './behaviorShaders.js';
import { advanceRingCursor, splitRingRangeIntoRectangles } from './ringBuffer.js';
import { BEHAVIOR_DEFAULTS, BEHAVIOR_NAMES, accumulateCPUAcceleration } from './behaviors.js';
import { sampleMeshSurface } from './meshSampling.js';

const DEFAULT_CAPACITY = 10_000;
const DEFAULT_LIFETIME = 5;
const DEFAULT_SIZE = 1;
const DEFAULT_COLOR = 0xffffff;

// Read-only sentinel — never mutated, only its x/y/z are read.
const ZERO_VECTOR3 = new THREE.Vector3();

/** Shared by every `ParticleSystem` — presets are a named vocabulary, not per-instance state (mirrors `PostFX.registerPreset`). */
const presetRegistry = new Map();

/**
 * @param {*} value - A fixed value, or a `(index) => value` function for
 *   per-particle variation within one `emit()` batch.
 * @param {number} index
 * @param {*} fallback
 * @returns {*}
 */
function resolvePerParticle(value, index, fallback) {
  if (typeof value === 'function') return value(index);
  return value ?? fallback;
}

/**
 * GPU-instanced particle system with a fixed-capacity ring-buffer pool
 * (Prompt 120) plus continuous force behaviors and named presets (Prompt
 * 121). Renders every particle as one instanced draw call — either
 * camera-facing billboards (default) or a caller-supplied "mesh particle"
 * geometry. Two simulation backends, chosen once at construction from
 * `CapabilityProbe`:
 *
 * - **GPU path** (`webgl2 && floatTextures`): position+age and
 *   velocity+lifetime each live in their own ping-ponged pair of
 *   floating-point `WebGLRenderTarget`s, advanced each `update()` by two
 *   `FullScreenQuad` shader passes run in sequence: (1) velocity += sum of
 *   active behaviors' acceleration × delta, (2) position += the
 *   *just-updated* velocity × delta. No per-particle JS work, scales to
 *   millions of particles. The velocity pass's fragment shader is rebuilt
 *   (not just re-uniformed) whenever the active behavior *set* changes —
 *   see `behaviorShaders.js`.
 * - **CPU path** (fallback, including iOS Safari without float-texture
 *   support): position/velocity/age/lifetime live in regular
 *   `InstancedBufferAttribute`s (velocity as a plain typed array, not a
 *   geometry attribute — the render shader never samples it), integrated in
 *   a JS loop every `update()` call — correct at any scale, just not
 *   GPU-parallel.
 *
 * A particle "dies" once `age >= lifetime` (or was never spawned, i.e.
 * `lifetime <= 0`) — the shared fragment shader discards it; dead slots are
 * simply recycled by future `emit()` calls (a ring buffer, not a free-list —
 * emitting faster than particles die force-recycles the oldest ones).
 *
 * The particle geometry does not participate in frustum culling
 * (`object.frustumCulled = false`) since its own local bounds are
 * meaningless — every particle's real position lives in the simulation
 * state, not in this object's geometry bounds. Keep the returned `.object`
 * at the identity transform; bake any offset into emitted particle positions
 * instead (the vertex shaders assume `modelViewMatrix` composes only the
 * scene's own view transform, not an additional per-system offset).
 *
 * @example
 * const rain = new ParticleSystem({
 *   scene: scene.three, camera: scene.camera.three, renderer: g.renderer.three,
 *   capacity: 100_000, capabilities: g.capabilities,
 * });
 * rain.addBehavior('gravity', { strength: 2 });
 * rain.emit({
 *   count: 1000,
 *   position: () => new THREE.Vector3((Math.random() - 0.5) * 20, 20, (Math.random() - 0.5) * 20),
 *   velocity: new THREE.Vector3(0, -10, 0),
 *   lifetime: 3,
 *   size: 0.1,
 *   color: 0x88aaff,
 * });
 * g.loop.add((dt) => rain.update(dt));
 * // later: rain.dispose();
 */
export class ParticleSystem {
  /** @type {THREE.Scene} */
  #scene;

  /** @type {THREE.WebGLRenderer} */
  #renderer;

  /** @type {number} */
  #capacity;

  /** @type {number} */
  #textureSize;

  /** @type {boolean} */
  #gpuSim;

  /** @type {boolean} */
  #billboard;

  /** @type {THREE.Mesh} */
  #object;

  /** @type {THREE.ShaderMaterial} */
  #material;

  /** @type {number} */
  #cursor = 0;

  /** @type {Map<string, Object>} */
  #behaviors = new Map();

  /** @type {boolean} */
  #disposed = false;

  // ── CPU-sim state (shares backing arrays with the geometry's own attributes) ──
  /** @type {Float32Array|null} */
  #cpuPosition = null;
  /** @type {Float32Array|null} */
  #cpuVelocity = null;
  /** @type {Float32Array|null} */
  #cpuAge = null;
  /** @type {Float32Array|null} */
  #cpuLifetime = null;

  // ── GPU-sim state ──────────────────────────────────────────────────────
  /** @type {THREE.WebGLRenderTarget[]|null} */
  #gpuPosTargets = null;
  /** @type {THREE.WebGLRenderTarget[]|null} */
  #gpuVelTargets = null;
  /** @type {number} */
  #gpuReadIndex = 0;
  /** @type {THREE.ShaderMaterial|null} */
  #gpuPosSimMaterial = null;
  /** @type {FullScreenQuad|null} */
  #gpuPosSimQuad = null;
  /** @type {THREE.ShaderMaterial|null} */
  #gpuVelSimMaterial = null;
  /** @type {FullScreenQuad|null} */
  #gpuVelSimQuad = null;

  /**
   * @param {Object} options
   * @param {THREE.Scene} options.scene
   * @param {THREE.Camera} options.camera - Billboards orient to face this camera.
   * @param {THREE.WebGLRenderer} options.renderer
   * @param {number} [options.capacity=10000] - Max simultaneous particles.
   *   Rounded up to the nearest perfect square — the GPU path needs a square
   *   simulation texture, and the CPU path uses the same rounded value so
   *   `capacity` means the same thing either way.
   * @param {THREE.BufferGeometry} [options.geometry] - Per-particle geometry
   *   for "mesh particle" mode (not disposed by this class — only its
   *   `position`/`index`/`uv` attributes are borrowed by reference into an
   *   internal `InstancedBufferGeometry`). Omit for the default billboard
   *   mode (a camera-facing unit quad this class owns and disposes).
   * @param {boolean} [options.billboard] - Defaults to `true` when no
   *   `geometry` is given, `false` otherwise. Set explicitly to billboard a
   *   custom shape instead of letting it keep its own orientation.
   * @param {import('../../core/CapabilityProbe.js').Capabilities} [options.capabilities] -
   *   Selects the GPU-simulated path when `webgl2 && floatTextures`;
   *   omitted or lacking either flag falls back to the CPU path (this is the
   *   "feature-detect float-texture support and fall back to CPU update"
   *   requirement — iOS Safari is the motivating case).
   * @throws {TypeError} If `scene`, `camera`, or `renderer` is missing, if
   *   `capacity` isn't a positive integer, or if `geometry` is given but
   *   isn't a `THREE.BufferGeometry`.
   * @throws {Error} If the GPU-simulated path is selected and constructed from
   *   the UMD `<script>`-tag build without the `three/addons/postprocessing/Pass.js`
   *   global set (`core/umdCompat.js`).
   */
  constructor({ scene, camera, renderer, capacity = DEFAULT_CAPACITY, geometry, billboard, capabilities } = {}) {
    if (!scene) throw new TypeError('ParticleSystem: scene is required.');
    if (!camera) throw new TypeError('ParticleSystem: camera is required.');
    if (!renderer) throw new TypeError('ParticleSystem: renderer is required.');
    if (!Number.isInteger(capacity) || capacity <= 0) {
      throw new TypeError(`ParticleSystem: capacity must be a positive integer, received ${JSON.stringify(capacity)}.`);
    }
    if (geometry !== undefined && !(geometry instanceof THREE.BufferGeometry)) {
      throw new TypeError('ParticleSystem: geometry must be a THREE.BufferGeometry.');
    }

    this.#scene = scene;
    this.#renderer = renderer;
    this.#textureSize = Math.ceil(Math.sqrt(capacity));
    this.#capacity = this.#textureSize * this.#textureSize;
    this.#billboard = billboard ?? !geometry;
    this.#gpuSim = Boolean(capabilities?.webgl2 && capabilities?.floatTextures);

    const particleGeometry = this.#buildInstancedGeometry(geometry);
    const { vertexShader, fragmentShader } = buildParticleShaders({ billboard: this.#billboard, gpuSim: this.#gpuSim });
    this.#material = new THREE.ShaderMaterial({
      name: 'ParticleSystemMaterial',
      vertexShader,
      fragmentShader,
      uniforms: this.#gpuSim ? { tPosition: { value: null }, tVelocityLifetime: { value: null } } : {},
    });
    this.#object = new THREE.Mesh(particleGeometry, this.#material);
    // Every particle's real position lives in sim state (texture or
    // attribute), not this object's own local geometry bounds — frustum
    // culling against those bounds would be meaningless.
    this.#object.frustumCulled = false;
    this.#scene.add(this.#object);

    if (this.#gpuSim) {
      this.#initGPUBuffers();
    } else {
      this.#initCPUBuffers();
    }
  }

  /**
   * Register a named preset — a reusable "recipe" that calls `emit()`/
   * `addBehavior()`/`spawnAt()` on the `ParticleSystem` instance it's given
   * with tuned defaults. Shared by every instance (mirrors
   * `PostFX.registerPreset`); called once per preset module at import time
   * (`postfx/particles/presets.js`).
   *
   * @param {string} name
   * @param {function(ParticleSystem, Object): void} factory
   * @throws {TypeError} If `name` is not a non-empty string, or `factory` is
   *   not a function.
   * @returns {void}
   * @example ParticleSystem.registerPreset('dust', (system, opts) => system.emit({...}));
   */
  static registerPreset(name, factory) {
    if (typeof name !== 'string' || name.length === 0) {
      throw new TypeError(`ParticleSystem.registerPreset: name must be a non-empty string, received ${JSON.stringify(name)}.`);
    }
    if (typeof factory !== 'function') {
      throw new TypeError(`ParticleSystem.registerPreset('${name}'): factory must be a function.`);
    }
    presetRegistry.set(name, factory);
  }

  /**
   * Applies a registered preset — typically one or more `emit()` calls, and
   * sometimes a continuous behavior (e.g. `'smoke'` adds `wind`/`curl`).
   * Behaviors a preset adds are persistent (like any `addBehavior` call) and
   * keyed by behavior name, not by preset — applying two presets that both
   * use e.g. `wind` means the second's settings win, since both write the
   * same `'wind'` slot (see `skipping_list.md`).
   *
   * @param {string} name - A name previously passed to `registerPreset()`.
   * @param {Object} [opts={}] - Forwarded to the preset's factory, merged
   *   over its own tuned defaults.
   * @returns {this}
   * @throws {Error} If `name` is not a registered preset, or if disposed.
   * @example rain.preset('dust');
   * @example burst.preset('sparks', { count: 500, position: origin });
   */
  preset(name, opts = {}) {
    this.#assertNotDisposed('preset');
    const factory = presetRegistry.get(name);
    if (!factory) {
      const registered = [...presetRegistry.keys()];
      throw new Error(
        `ParticleSystem.preset: unknown preset '${name}'. ` +
          `Expected one of: [${registered.length ? registered.join(', ') : 'none registered yet'}].`,
      );
    }
    factory(this, opts);
    return this;
  }

  /**
   * Enable a continuous force behavior (accumulates into particle
   * acceleration every `update()`). Calling `addBehavior()` again with the
   * same `name` reconfigures it in place rather than stacking a second
   * instance — at most one active configuration per behavior name.
   *
   * @param {'gravity'|'wind'|'attract'|'repel'|'curl'|'swirl'} name
   * @param {Object} [opts={}] - Merged over the behavior's own defaults
   *   (see `behaviors.js`'s `BEHAVIOR_DEFAULTS`). `direction`/`target`/
   *   `center`/`axis` fields take a `THREE.Vector3` — held by reference, so
   *   mutating the same object later live-updates the behavior.
   * @returns {this}
   * @throws {TypeError} If `name` is not a known behavior.
   * @throws {Error} If disposed.
   * @example rain.addBehavior('wind', { strength: 0.5, direction: new THREE.Vector3(1, 0, 0) });
   */
  addBehavior(name, opts = {}) {
    this.#assertNotDisposed('addBehavior');
    if (!BEHAVIOR_DEFAULTS[name]) {
      throw new TypeError(`ParticleSystem.addBehavior: unknown behavior '${name}'. Expected one of: [${BEHAVIOR_NAMES.join(', ')}].`);
    }
    this.#behaviors.set(name, { ...BEHAVIOR_DEFAULTS[name], ...opts });
    if (this.#gpuSim) this.#rebuildVelocitySimMaterial();
    return this;
  }

  /**
   * Disable a previously-added behavior. No-op if `name` isn't active
   * (mirrors `PostFX.disable`'s `Map`-delete semantics).
   * @param {string} name
   * @returns {this}
   * @throws {Error} If disposed.
   * @example rain.removeBehavior('wind');
   */
  removeBehavior(name) {
    this.#assertNotDisposed('removeBehavior');
    if (!this.#behaviors.delete(name)) return this;
    if (this.#gpuSim) this.#rebuildVelocitySimMaterial();
    return this;
  }

  /**
   * Update options on an already-active behavior.
   * @param {string} name
   * @param {Object} opts - Shallow-merged into the behavior's current options.
   * @returns {this}
   * @throws {Error} If `name` is not currently active, or if disposed.
   * @example rain.configureBehavior('wind', { strength: 1.5 });
   */
  configureBehavior(name, opts) {
    this.#assertNotDisposed('configureBehavior');
    const current = this.#behaviors.get(name);
    if (!current) {
      throw new Error(`ParticleSystem.configureBehavior: behavior '${name}' is not active. Call addBehavior('${name}', opts) first.`);
    }
    this.#behaviors.set(name, { ...current, ...opts });
    if (this.#gpuSim) this.#rebuildVelocitySimMaterial();
    return this;
  }

  /** @returns {string[]} Names of currently-active behaviors. */
  get activeBehaviors() {
    return [...this.#behaviors.keys()];
  }

  /**
   * Spawn `options.count` particles distributed across `source`'s surface
   * (area-weighted random triangle sampling — see `meshSampling.js`), with
   * velocity defaulting to outward along each sample's face normal times
   * `options.speed`. The common "burst/dissolve from a mesh's surface"
   * emitter (backs the `'dissolve'` preset when given a `mesh` option).
   *
   * @param {THREE.Mesh|{three: THREE.Mesh}} source - A raw `THREE.Mesh`, or
   *   anything exposing one as `.three` (duck-typed — matches `GraphMesh`
   *   without importing `object/`, which `postfx/` must not do per CLAUDE.md
   *   §1.4).
   * @param {Object} [options={}]
   * @param {number} [options.count=100]
   * @param {number} [options.speed=1] - Outward speed along the surface
   *   normal; ignored if `options.velocity` is given.
   * @param {THREE.Vector3|function(number): THREE.Vector3} [options.velocity] -
   *   Overrides the default outward-normal velocity.
   * @param {number|function(number): number} [options.lifetime]
   * @param {number|function(number): number} [options.size]
   * @param {number|string|THREE.Color|function(number): (number|string|THREE.Color)} [options.color]
   * @param {THREE.Blending} [options.blending]
   * @returns {this}
   * @throws {TypeError} If `source` isn't a `THREE.Mesh` (or doesn't wrap one).
   * @throws {Error} If disposed.
   * @example rain.spawnAt(floorMesh, { count: 2000, speed: 2, lifetime: 1.5 });
   */
  spawnAt(source, options = {}) {
    this.#assertNotDisposed('spawnAt');
    const mesh = source?.isMesh ? source : source?.three?.isMesh ? source.three : null;
    if (!mesh) {
      throw new TypeError('ParticleSystem.spawnAt: source must be a THREE.Mesh, or an object exposing one as `.three`.');
    }
    const { count = 100, speed = 1, velocity, lifetime, size, color, blending } = options;
    mesh.updateWorldMatrix(true, false);
    const { points, normals } = sampleMeshSurface(mesh, count);
    return this.emit({
      count,
      position: (i) => points[i],
      velocity: velocity ?? ((i) => normals[i].clone().multiplyScalar(speed)),
      lifetime,
      size,
      color,
      blending,
    });
  }

  /**
   * Spawn `count` new particles into the next ring-buffer slots, recycling
   * the oldest ones if the pool is full. `position`/`velocity`/`lifetime`/
   * `size`/`color` each accept a fixed value or a `(index) => value`
   * function called once per particle (`index` runs 0..`count`-1 within
   * this batch) for per-particle variation.
   *
   * @param {Object} options
   * @param {number} options.count - Positive integer, at most `capacity`.
   * @param {THREE.Vector3|function(number): THREE.Vector3} [options.position] - Default `(0,0,0)`.
   * @param {THREE.Vector3|function(number): THREE.Vector3} [options.velocity] - Default `(0,0,0)`.
   * @param {number|function(number): number} [options.lifetime] - Seconds. Default `5`.
   * @param {number|function(number): number} [options.size] - Default `1`.
   * @param {number|string|THREE.Color|function(number): (number|string|THREE.Color)} [options.color] - Default `0xffffff`.
   * @param {THREE.Blending} [options.blending] - Applied to the whole system's
   *   shared material (one draw call, one blend mode) — omit to leave the
   *   current blending mode untouched.
   * @returns {this}
   * @throws {TypeError} If `count` is not a positive integer.
   * @throws {RangeError} If `count` exceeds `capacity`.
   * @throws {Error} If disposed.
   * @example rain.emit({ count: 1000, velocity: new THREE.Vector3(0, -10, 0), lifetime: 3 });
   */
  emit({ count, position, velocity, lifetime, size, color, blending } = {}) {
    this.#assertNotDisposed('emit');
    if (!Number.isInteger(count) || count <= 0) {
      throw new TypeError(`ParticleSystem.emit: count must be a positive integer, received ${JSON.stringify(count)}.`);
    }
    if (count > this.#capacity) {
      throw new RangeError(
        `ParticleSystem.emit: count (${count}) exceeds capacity (${this.#capacity}). ` +
          'Emit in smaller batches or construct with a larger capacity.',
      );
    }
    if (blending !== undefined) {
      this.#material.blending = blending;
    }

    const { start, next } = advanceRingCursor(this.#cursor, count, this.#capacity);
    this.#cursor = next;

    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);
    const lifetimes = new Float32Array(count);
    const sizes = new Float32Array(count);
    const colors = new Float32Array(count * 3);
    const tmpColor = new THREE.Color();
    for (let i = 0; i < count; i++) {
      const p = resolvePerParticle(position, i, ZERO_VECTOR3);
      const v = resolvePerParticle(velocity, i, ZERO_VECTOR3);
      positions[i * 3] = p.x;
      positions[i * 3 + 1] = p.y;
      positions[i * 3 + 2] = p.z;
      velocities[i * 3] = v.x;
      velocities[i * 3 + 1] = v.y;
      velocities[i * 3 + 2] = v.z;
      lifetimes[i] = resolvePerParticle(lifetime, i, DEFAULT_LIFETIME);
      sizes[i] = resolvePerParticle(size, i, DEFAULT_SIZE);
      tmpColor.set(resolvePerParticle(color, i, DEFAULT_COLOR));
      colors[i * 3] = tmpColor.r;
      colors[i * 3 + 1] = tmpColor.g;
      colors[i * 3 + 2] = tmpColor.b;
    }

    this.#writeStaticAttributes(start, count, sizes, colors);
    if (this.#gpuSim) {
      this.#emitGPU(start, count, positions, velocities, lifetimes);
    } else {
      this.#emitCPU(start, count, positions, velocities, lifetimes);
    }
    return this;
  }

  /**
   * Advances the simulation by `deltaSeconds` — call once per frame from the
   * shared render loop (`g.loop.add((dt) => system.update(dt))`; this class
   * never schedules its own `requestAnimationFrame`, per CLAUDE.md §2).
   * @param {number} deltaSeconds
   * @throws {Error} If disposed.
   * @returns {void}
   * @example g.loop.add((dt) => system.update(dt));
   */
  update(deltaSeconds) {
    this.#assertNotDisposed('update');
    if (this.#gpuSim) {
      this.#updateGPU(deltaSeconds);
    } else {
      this.#updateCPU(deltaSeconds);
    }
  }

  /** @returns {'gpu'|'cpu'} Which simulation backend this instance selected. */
  get simMode() {
    return this.#gpuSim ? 'gpu' : 'cpu';
  }

  /** @returns {boolean} Whether particles render as camera-facing billboards (`false` = mesh particles). */
  get billboard() {
    return this.#billboard;
  }

  /** @returns {number} Actual pool size after rounding up to a perfect square. */
  get capacity() {
    return this.#capacity;
  }

  /** @returns {THREE.Mesh} The instanced object added to `scene` — do not move it (see class docs). */
  get object() {
    return this.#object;
  }

  /**
   * Releases the geometry, material, and (GPU path) render targets/textures.
   * Idempotent — safe to call twice.
   * @returns {void}
   * @example rain.dispose();
   */
  dispose() {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#scene.remove(this.#object);
    this.#object.geometry.dispose();
    this.#material.dispose();
    if (this.#gpuSim) {
      this.#gpuPosTargets[0].dispose();
      this.#gpuPosTargets[1].dispose();
      this.#gpuVelTargets[0].dispose();
      this.#gpuVelTargets[1].dispose();
      this.#gpuPosSimMaterial.dispose();
      this.#gpuPosSimQuad.dispose();
      this.#gpuVelSimMaterial.dispose();
      this.#gpuVelSimQuad.dispose();
    }
  }

  // ── Private: geometry/buffers ───────────────────────────────────────────

  /**
   * @param {THREE.BufferGeometry} [customGeometry]
   * @returns {THREE.InstancedBufferGeometry}
   */
  #buildInstancedGeometry(customGeometry) {
    const base = customGeometry ?? new THREE.PlaneGeometry(1, 1);
    const geometry = new THREE.InstancedBufferGeometry();
    geometry.index = base.index;
    geometry.attributes.position = base.attributes.position;
    if (base.attributes.uv) geometry.attributes.uv = base.attributes.uv;

    geometry.setAttribute('aSize', new THREE.InstancedBufferAttribute(new Float32Array(this.#capacity), 1));
    geometry.setAttribute('aColor', new THREE.InstancedBufferAttribute(new Float32Array(this.#capacity * 3), 3));

    if (this.#gpuSim) {
      const particleUV = new Float32Array(this.#capacity * 2);
      for (let i = 0; i < this.#capacity; i++) {
        const x = i % this.#textureSize;
        const y = Math.floor(i / this.#textureSize);
        particleUV[i * 2] = (x + 0.5) / this.#textureSize;
        particleUV[i * 2 + 1] = (y + 0.5) / this.#textureSize;
      }
      geometry.setAttribute('aParticleUV', new THREE.InstancedBufferAttribute(particleUV, 2));
    } else {
      geometry.setAttribute('aPosition', new THREE.InstancedBufferAttribute(new Float32Array(this.#capacity * 3), 3));
      geometry.setAttribute('aAge', new THREE.InstancedBufferAttribute(new Float32Array(this.#capacity), 1));
      geometry.setAttribute('aLifetime', new THREE.InstancedBufferAttribute(new Float32Array(this.#capacity), 1));
    }
    return geometry;
  }

  #initCPUBuffers() {
    const attrs = this.#object.geometry.attributes;
    this.#cpuPosition = attrs.aPosition.array;
    this.#cpuAge = attrs.aAge.array;
    this.#cpuLifetime = attrs.aLifetime.array;
    // Velocity isn't sampled by the render shader (the JS integration loop
    // already applies it before uploading position), so it doesn't need to
    // be a geometry attribute at all.
    this.#cpuVelocity = new Float32Array(this.#capacity * 3);
  }

  #initGPUBuffers() {
    guardExternalImport('ParticleSystem GPU simulation', () => {
      const size = this.#textureSize;
      const targetOptions = {
        type: THREE.FloatType,
        format: THREE.RGBAFormat,
        minFilter: THREE.NearestFilter,
        magFilter: THREE.NearestFilter,
        depthBuffer: false,
        stencilBuffer: false,
      };
      this.#gpuPosTargets = [new THREE.WebGLRenderTarget(size, size, targetOptions), new THREE.WebGLRenderTarget(size, size, targetOptions)];
      this.#gpuVelTargets = [new THREE.WebGLRenderTarget(size, size, targetOptions), new THREE.WebGLRenderTarget(size, size, targetOptions)];

      this.#gpuPosSimMaterial = new THREE.ShaderMaterial({
        name: 'ParticlePositionSimMaterial',
        uniforms: { tPosition: { value: null }, tVelocity: { value: null }, delta: { value: 0 } },
        vertexShader: SIMULATION_VERTEX_SHADER,
        fragmentShader: POSITION_SIM_FRAGMENT_SHADER,
      });
      this.#gpuPosSimQuad = new FullScreenQuad(this.#gpuPosSimMaterial);

      this.#rebuildVelocitySimMaterial();

      this.#material.uniforms.tPosition.value = this.#gpuPosTargets[this.#gpuReadIndex].texture;
      this.#material.uniforms.tVelocityLifetime.value = this.#gpuVelTargets[this.#gpuReadIndex].texture;
    });
  }

  /**
   * (Re)builds the velocity-pass material from the current active-behavior
   * set. Disposes the previous material/quad first (a no-op the very first
   * time, when they don't exist yet).
   */
  #rebuildVelocitySimMaterial() {
    this.#gpuVelSimMaterial?.dispose();
    this.#gpuVelSimQuad?.dispose();
    const { fragmentShader, uniforms } = buildVelocityFragmentShader(this.#behaviors);
    this.#gpuVelSimMaterial = new THREE.ShaderMaterial({
      name: 'ParticleVelocitySimMaterial',
      uniforms: { tPosition: { value: null }, tVelocity: { value: null }, delta: { value: 0 }, ...uniforms },
      vertexShader: SIMULATION_VERTEX_SHADER,
      fragmentShader,
    });
    this.#gpuVelSimQuad = new FullScreenQuad(this.#gpuVelSimMaterial);
  }

  // ── Private: emit ────────────────────────────────────────────────────────

  /**
   * @param {number} start
   * @param {number} count
   * @param {Float32Array} sizes
   * @param {Float32Array} colors
   */
  #writeStaticAttributes(start, count, sizes, colors) {
    const { aSize, aColor } = this.#object.geometry.attributes;
    for (let i = 0; i < count; i++) {
      const slot = (start + i) % this.#capacity;
      aSize.array[slot] = sizes[i];
      aColor.array[slot * 3] = colors[i * 3];
      aColor.array[slot * 3 + 1] = colors[i * 3 + 1];
      aColor.array[slot * 3 + 2] = colors[i * 3 + 2];
    }
    aSize.needsUpdate = true;
    aColor.needsUpdate = true;
  }

  #emitCPU(start, count, positions, velocities, lifetimes) {
    for (let i = 0; i < count; i++) {
      const slot = (start + i) % this.#capacity;
      this.#cpuPosition[slot * 3] = positions[i * 3];
      this.#cpuPosition[slot * 3 + 1] = positions[i * 3 + 1];
      this.#cpuPosition[slot * 3 + 2] = positions[i * 3 + 2];
      this.#cpuVelocity[slot * 3] = velocities[i * 3];
      this.#cpuVelocity[slot * 3 + 1] = velocities[i * 3 + 1];
      this.#cpuVelocity[slot * 3 + 2] = velocities[i * 3 + 2];
      this.#cpuAge[slot] = 0;
      this.#cpuLifetime[slot] = lifetimes[i];
    }
    const { aPosition, aAge, aLifetime } = this.#object.geometry.attributes;
    aPosition.needsUpdate = true;
    aAge.needsUpdate = true;
    aLifetime.needsUpdate = true;
  }

  /**
   * Patches the ring-buffer's spawned slots directly into the *current*
   * ping-pong read targets (via `renderer.copyTextureToTexture`, for both
   * position and velocity) — the next `update()`'s simulation passes read
   * them as input, so the spawn is visible immediately with no extra latency.
   */
  #emitGPU(start, count, positions, velocities, lifetimes) {
    this.#writeRingDataToTarget(this.#gpuPosTargets[this.#gpuReadIndex], start, count, (data, i, srcIndex) => {
      data[i * 4] = positions[srcIndex * 3];
      data[i * 4 + 1] = positions[srcIndex * 3 + 1];
      data[i * 4 + 2] = positions[srcIndex * 3 + 2];
      data[i * 4 + 3] = 0; // age
    });
    this.#writeRingDataToTarget(this.#gpuVelTargets[this.#gpuReadIndex], start, count, (data, i, srcIndex) => {
      data[i * 4] = velocities[srcIndex * 3];
      data[i * 4 + 1] = velocities[srcIndex * 3 + 1];
      data[i * 4 + 2] = velocities[srcIndex * 3 + 2];
      data[i * 4 + 3] = lifetimes[srcIndex];
    });
  }

  /**
   * Shared by both position and velocity GPU emit paths: splits `[start,
   * start+count)` into row-aligned rectangles, fills a scratch
   * `DataTexture` per rectangle via `fillTexel(data, texelIndex, srcIndex)`,
   * and copies it into `target` at the rectangle's offset.
   * @param {THREE.WebGLRenderTarget} target
   * @param {number} start
   * @param {number} count
   * @param {function(Float32Array, number, number): void} fillTexel
   */
  #writeRingDataToTarget(target, start, count, fillTexel) {
    const rects = splitRingRangeIntoRectangles(start, count, this.#capacity, this.#textureSize);
    for (const rect of rects) {
      const data = new Float32Array(rect.width * rect.height * 4);
      for (let i = 0; i < rect.width; i++) {
        fillTexel(data, i, rect.offset + i);
      }
      const texture = new THREE.DataTexture(data, rect.width, rect.height, THREE.RGBAFormat, THREE.FloatType);
      texture.needsUpdate = true;
      this.#renderer.copyTextureToTexture(texture, target.texture, null, new THREE.Vector2(rect.x, rect.y));
      texture.dispose();
    }
  }

  // ── Private: update ──────────────────────────────────────────────────────

  #updateCPU(deltaSeconds) {
    const capacity = this.#capacity;
    const hasBehaviors = this.#behaviors.size > 0;
    const tmpPosition = new THREE.Vector3();
    const tmpAccel = new THREE.Vector3();
    for (let i = 0; i < capacity; i++) {
      const lifetime = this.#cpuLifetime[i];
      if (lifetime <= 0) continue; // never spawned
      const age = this.#cpuAge[i];
      if (age >= lifetime) continue; // dead
      this.#cpuAge[i] = age + deltaSeconds;

      if (hasBehaviors) {
        tmpPosition.set(this.#cpuPosition[i * 3], this.#cpuPosition[i * 3 + 1], this.#cpuPosition[i * 3 + 2]);
        accumulateCPUAcceleration(this.#behaviors, tmpPosition, tmpAccel);
        this.#cpuVelocity[i * 3] += tmpAccel.x * deltaSeconds;
        this.#cpuVelocity[i * 3 + 1] += tmpAccel.y * deltaSeconds;
        this.#cpuVelocity[i * 3 + 2] += tmpAccel.z * deltaSeconds;
      }

      this.#cpuPosition[i * 3] += this.#cpuVelocity[i * 3] * deltaSeconds;
      this.#cpuPosition[i * 3 + 1] += this.#cpuVelocity[i * 3 + 1] * deltaSeconds;
      this.#cpuPosition[i * 3 + 2] += this.#cpuVelocity[i * 3 + 2] * deltaSeconds;
    }
    const { aPosition, aAge } = this.#object.geometry.attributes;
    aPosition.needsUpdate = true;
    aAge.needsUpdate = true;
  }

  #updateGPU(deltaSeconds) {
    const posRead = this.#gpuPosTargets[this.#gpuReadIndex];
    const posWrite = this.#gpuPosTargets[1 - this.#gpuReadIndex];
    const velRead = this.#gpuVelTargets[this.#gpuReadIndex];
    const velWrite = this.#gpuVelTargets[1 - this.#gpuReadIndex];

    // Pass 1: velocity += sum(behavior accelerations) * delta.
    this.#gpuVelSimMaterial.uniforms.tPosition.value = posRead.texture;
    this.#gpuVelSimMaterial.uniforms.tVelocity.value = velRead.texture;
    this.#gpuVelSimMaterial.uniforms.delta.value = deltaSeconds;
    this.#renderToTarget(velWrite, this.#gpuVelSimQuad);

    // Pass 2: position += (just-updated) velocity * delta.
    this.#gpuPosSimMaterial.uniforms.tPosition.value = posRead.texture;
    this.#gpuPosSimMaterial.uniforms.tVelocity.value = velWrite.texture;
    this.#gpuPosSimMaterial.uniforms.delta.value = deltaSeconds;
    this.#renderToTarget(posWrite, this.#gpuPosSimQuad);

    this.#gpuReadIndex = 1 - this.#gpuReadIndex;
    this.#material.uniforms.tPosition.value = this.#gpuPosTargets[this.#gpuReadIndex].texture;
    this.#material.uniforms.tVelocityLifetime.value = this.#gpuVelTargets[this.#gpuReadIndex].texture;
  }

  /**
   * @param {THREE.WebGLRenderTarget} target
   * @param {FullScreenQuad} quad
   */
  #renderToTarget(target, quad) {
    const previous = this.#renderer.getRenderTarget();
    this.#renderer.setRenderTarget(target);
    quad.render(this.#renderer);
    this.#renderer.setRenderTarget(previous);
  }

  /**
   * @param {string} method
   * @throws {Error}
   */
  #assertNotDisposed(method) {
    if (this.#disposed) {
      throw new Error(`ParticleSystem.${method}: instance has been disposed.`);
    }
  }
}
