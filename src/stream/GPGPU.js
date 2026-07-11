import { WorkerPool } from '../core/WorkerPool.js';
import { createWorkerFactory } from '../core/worker/workerBlob.js';
import { layout } from '../compose/index.js';

// BUILD_PLAN §Phase 10's own threshold ("wire layout.force to GPGPU above
// 5000 nodes") — below it, the existing main-thread Barnes-Hut charge force
// (compose/layout/force) is already fast enough that offloading would only
// add round-trip latency for no benefit.
const DEFAULT_THRESHOLD = 5000;
const DEFAULT_STRENGTH = -30;
const DEFAULT_DISTANCE_MIN = 1;
const DEFAULT_DISTANCE_MAX = Infinity;

// GLSL has no literal Infinity; a value this large is functionally
// unbounded for any realistic layout coordinate scale while staying a
// finite float uniform.
const GLSL_INFINITY = 1e20;

// All-pairs many-body repulsion/attraction, one node per texel — the same
// algorithm `core/worker/tasks.js`'s 'forceCharge' worker task runs on the
// CPU fallback (CLAUDE.md §1.1 DRY in spirit, though the two can't literally
// share code: GLSL vs. JS). O(n²) work, but spread across every texel's own
// fragment-shader invocation in parallel, which is exactly why this only
// pays off once there are enough nodes to keep the GPU busy.
const CHARGE_FRAGMENT_SHADER = `
uniform sampler2D positionTexture;
uniform float strength;
uniform float distanceMin;
uniform float distanceMax;
uniform float nodeCount;

void main() {
  vec2 uv = gl_FragCoord.xy / resolution.xy;
  vec3 selfPos = texture2D(positionTexture, uv).xyz;
  vec3 accel = vec3(0.0);
  float distanceMinSq = distanceMin * distanceMin;
  float distanceMaxSq = distanceMax * distanceMax;

  for (float fy = 0.0; fy < resolution.y; fy += 1.0) {
    for (float fx = 0.0; fx < resolution.x; fx += 1.0) {
      float index = fy * resolution.x + fx;
      if (index >= nodeCount) continue;

      vec2 otherUv = (vec2(fx, fy) + 0.5) / resolution.xy;
      vec3 otherPos = texture2D(positionTexture, otherUv).xyz;
      vec3 delta = otherPos - selfPos;
      float rawDistSq = dot(delta, delta);
      if (rawDistSq < 0.0000001) continue; // self

      float distSq = max(rawDistSq, distanceMinSq);
      if (distSq >= distanceMaxSq) continue;
      float dist = sqrt(distSq);
      float factor = strength / distSq;
      accel += (delta / dist) * factor;
    }
  }

  gl_FragColor = vec4(accel, 1.0);
}
`;

/**
 * GPU-accelerated many-body force computation (Prompt 165): render-target
 * ping-pong compute via `three/examples/jsm/misc/GPUComputationRenderer.js`
 * (lazy-loaded on first use, matching this codebase's established pattern
 * for optional three examples — see `GraphSceneCamera.enableOrbitControls`),
 * with a feature-detected CPU+worker fallback for when float render targets
 * aren't available.
 *
 * `computeCharge(positions, options)` is the low-level primitive — a flat
 * `[x0,y0,z0,...]` buffer in, an equally-shaped acceleration buffer out,
 * `async` regardless of backend (a GPU readback and a worker round-trip are
 * both genuinely asynchronous; unifying the contract means callers never
 * need to branch on `backend`). `attach(sim)` is the actual "wire
 * `layout.force` to GPGPU above 5000 nodes" integration: it replaces a
 * `layout.force()` simulation's `'charge'` force with a wrapper that only
 * switches to GPGPU once the simulation's node count crosses `threshold`.
 *
 * @example
 * const gpgpu = new GPGPU({ renderer: graph3d.renderer.three, capabilities: probe.capabilities });
 * const sim = layout.force().nodes(hugeNodeSet).force('link', layout.force.link(links));
 * gpgpu.attach(sim); // 'charge' now runs on GPGPU once nodes.length > 5000
 * loop.add(() => { if (sim.active()) sim.tick(); });
 * gpgpu.dispose();
 */
export class GPGPU {
  /** @type {THREE.WebGLRenderer|null} */
  #renderer;
  /** @type {boolean} */
  #floatTextures;
  /** @type {number} */
  #threshold;
  /** @type {WorkerPool|null} Lazily created — only if the worker fallback path is ever actually used. */
  #pool = null;
  /** @type {*} A `GPUComputationRenderer` instance, lazily created/resized. */
  #gpuCompute = null;
  /** @type {number} The `sizeX`/`sizeY` the current `#gpuCompute` was built for. */
  #gpuComputeSize = 0;
  /** @type {boolean} */
  #disposed = false;

  /**
   * @param {object} [options]
   * @param {THREE.WebGLRenderer} [options.renderer] Required for the GPU backend; omit to force the worker fallback.
   * @param {import('../core/CapabilityProbe.js').Capabilities} [options.capabilities] `capabilities.floatTextures` gates the GPU backend.
   * @param {number} [options.threshold] Node count above which `attach()` switches a simulation's charge force to GPGPU. Default `5000`.
   * @throws {TypeError} If `threshold` isn't a positive number.
   * @example new GPGPU({ renderer: graph3d.renderer.three, capabilities: probe.capabilities });
   */
  constructor({ renderer = null, capabilities = null, threshold = DEFAULT_THRESHOLD } = {}) {
    if (typeof threshold !== 'number' || !(threshold > 0)) {
      throw new TypeError(`GPGPU: threshold must be a positive number, received ${JSON.stringify(threshold)}.`);
    }
    this.#renderer = renderer;
    this.#floatTextures = capabilities?.floatTextures === true;
    this.#threshold = threshold;
  }

  /** @returns {'gpu'|'worker'} Which backend `computeCharge()` currently dispatches to. */
  get backend() {
    return this.#renderer && this.#floatTextures ? 'gpu' : 'worker';
  }

  /**
   * Computes many-body charge accelerations for a flat `[x0,y0,z0,...]`
   * position buffer, via whichever `backend` is available.
   * @param {Float32Array} positions
   * @param {{strength?: number, distanceMin?: number, distanceMax?: number}} [options]
   * @returns {Promise<Float32Array>} Accelerations, the same length as `positions`.
   * @throws {TypeError} If `positions` isn't a `Float32Array` with a length that's a multiple of 3.
   * @throws {Error} If called after `dispose()`.
   * @example
   * const accel = await gpgpu.computeCharge(new Float32Array([0, 0, 0, 1, 0, 0]), { strength: -30 });
   */
  async computeCharge(positions, { strength = DEFAULT_STRENGTH, distanceMin = DEFAULT_DISTANCE_MIN, distanceMax = DEFAULT_DISTANCE_MAX } = {}) {
    this.#assertNotDisposed('computeCharge');
    if (!(positions instanceof Float32Array) || positions.length % 3 !== 0) {
      throw new TypeError(`GPGPU.computeCharge: positions must be a Float32Array with a length that is a multiple of 3, received ${JSON.stringify(positions)}.`);
    }
    return this.backend === 'gpu'
      ? this.#computeChargeGPU(positions, { strength, distanceMin, distanceMax })
      : this.#computeChargeWorker(positions, { strength, distanceMin, distanceMax });
  }

  /**
   * Wires GPGPU-accelerated charge computation into `sim` (a
   * `layout.force()` instance): replaces its `'charge'` force with a
   * wrapper that, once `sim.nodes().length` exceeds `threshold`, delegates
   * to `computeCharge()` instead of the main-thread Barnes-Hut
   * approximation. Below `threshold`, the wrapper is byte-for-byte
   * `layout.force.charge(strength, options)` — small simulations are
   * unaffected.
   *
   * Both GPGPU backends are asynchronous (a GPU readback and a worker
   * round-trip can't complete inside `sim.tick()`'s single synchronous
   * call), so above `threshold` the wrapper applies the most recently
   * *resolved* acceleration (scaled by the current tick's `alpha`) every
   * tick, and kicks off a fresh background computation whenever the
   * previous one has finished — the simulation's charge force is correct
   * on average but lags real position changes by however many ticks the
   * round trip takes. `nodes()` before the first result resolves contribute
   * zero charge acceleration (harmless — other forces still apply immediately).
   * @param {object} sim A `layout.force()` instance.
   * @param {{strength?: number, distanceMin?: number, distanceMax?: number}} [options]
   * @returns {this}
   * @throws {TypeError} If `sim` doesn't expose `force()`/`nodes()`.
   * @throws {Error} If called after `dispose()`.
   * @example gpgpu.attach(sim, { strength: -50 });
   */
  attach(sim, { strength = DEFAULT_STRENGTH, distanceMin = DEFAULT_DISTANCE_MIN, distanceMax = DEFAULT_DISTANCE_MAX } = {}) {
    this.#assertNotDisposed('attach');
    if (!sim || typeof sim.force !== 'function' || typeof sim.nodes !== 'function') {
      throw new TypeError('GPGPU.attach: sim must be a layout.force() instance (expose force()/nodes()).');
    }

    const cpuCharge = layout.force.charge(strength, { distanceMin, distanceMax });
    let cachedAccel = null;
    let pending = false;

    const smartCharge = (nodes, alpha) => {
      if (nodes.length <= this.#threshold) {
        cpuCharge(nodes, alpha);
        return;
      }
      if (cachedAccel && cachedAccel.length === nodes.length * 3) {
        for (let i = 0; i < nodes.length; i++) {
          nodes[i].__ax += cachedAccel[i * 3] * alpha;
          nodes[i].__ay += cachedAccel[i * 3 + 1] * alpha;
          nodes[i].__az += cachedAccel[i * 3 + 2] * alpha;
        }
      }
      if (!pending && !this.#disposed) {
        pending = true;
        const positions = new Float32Array(nodes.length * 3);
        for (let i = 0; i < nodes.length; i++) {
          positions[i * 3] = nodes[i].x;
          positions[i * 3 + 1] = nodes[i].y;
          positions[i * 3 + 2] = nodes[i].z;
        }
        this.computeCharge(positions, { strength, distanceMin, distanceMax })
          .then((result) => {
            cachedAccel = result;
          })
          .catch((error) => {
            console.error('GPGPU.attach: computeCharge failed, reusing the previous result.', error);
          })
          .finally(() => {
            pending = false;
          });
      }
    };

    sim.force('charge', smartCharge);
    return this;
  }

  /**
   * Releases the worker pool and/or `GPUComputationRenderer`, whichever
   * this instance ended up creating. Does not detach `attach()`'s force
   * wrapper from any simulation it was registered on — call `sim.force(
   * 'charge', layout.force.charge(...))` to restore a plain CPU force
   * first, if `sim` outlives this `GPGPU` instance. Idempotent.
   * @example gpgpu.dispose();
   */
  dispose() {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#pool?.dispose();
    this.#gpuCompute?.dispose();
  }

  /**
   * Copies `positions` before transferring — `computeCharge` is public API
   * and must not silently detach a caller's own buffer.
   * @param {Float32Array} positions
   * @param {{strength: number, distanceMin: number, distanceMax: number}} options
   * @returns {Promise<Float32Array>}
   */
  async #computeChargeWorker(positions, options) {
    this.#pool ??= new WorkerPool({ workerFactory: createWorkerFactory() });
    const copy = positions.slice();
    return this.#pool.exec('forceCharge', { positions: copy, ...options }, [copy.buffer]);
  }

  /**
   * @param {Float32Array} positions
   * @param {{strength: number, distanceMin: number, distanceMax: number}} options
   * @returns {Promise<Float32Array>}
   */
  async #computeChargeGPU(positions, { strength, distanceMin, distanceMax }) {
    const n = positions.length / 3;
    const size = Math.max(1, Math.ceil(Math.sqrt(n)));
    const gpuCompute = await this.#ensureGpuCompute(size);

    const positionTexture = gpuCompute.createTexture();
    const data = positionTexture.image.data;
    for (let i = 0; i < n; i++) {
      data[i * 4] = positions[i * 3];
      data[i * 4 + 1] = positions[i * 3 + 1];
      data[i * 4 + 2] = positions[i * 3 + 2];
      data[i * 4 + 3] = 1;
    }
    positionTexture.needsUpdate = true;

    const material = gpuCompute.createShaderMaterial(CHARGE_FRAGMENT_SHADER, {
      positionTexture: { value: positionTexture },
      strength: { value: strength },
      distanceMin: { value: distanceMin },
      distanceMax: { value: Number.isFinite(distanceMax) ? distanceMax : GLSL_INFINITY },
      nodeCount: { value: n },
    });
    const renderTarget = gpuCompute.createRenderTarget();
    gpuCompute.doRenderTarget(material, renderTarget);

    const pixels = new Float32Array(size * size * 4);
    this.#renderer.readRenderTargetPixels(renderTarget, 0, 0, size, size, pixels);

    const accel = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      accel[i * 3] = pixels[i * 4];
      accel[i * 3 + 1] = pixels[i * 4 + 1];
      accel[i * 3 + 2] = pixels[i * 4 + 2];
    }

    renderTarget.dispose();
    material.dispose();
    positionTexture.dispose();
    return accel;
  }

  /**
   * Lazily creates (or resizes) the shared `GPUComputationRenderer` this
   * instance's GPU computations reuse.
   * @param {number} size
   * @returns {Promise<*>}
   * @throws {Error} If `dispose()` was called while the import was in flight.
   */
  async #ensureGpuCompute(size) {
    if (this.#gpuCompute && this.#gpuComputeSize === size) return this.#gpuCompute;
    this.#gpuCompute?.dispose();
    const { GPUComputationRenderer } = await import('three/examples/jsm/misc/GPUComputationRenderer.js');
    if (this.#disposed) {
      throw new Error('GPGPU: disposed while loading GPUComputationRenderer.');
    }
    this.#gpuCompute = new GPUComputationRenderer(size, size, this.#renderer);
    this.#gpuComputeSize = size;
    return this.#gpuCompute;
  }

  /** @param {string} method @throws {Error} */
  #assertNotDisposed(method) {
    if (this.#disposed) {
      throw new Error(`GPGPU.${method}: this GPGPU instance has been disposed.`);
    }
  }
}
