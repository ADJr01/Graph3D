import { palette as paletteNamespace } from '../compose/index.js';
import { material } from '../material/index.js';
import { GraphChart } from './GraphChart.js';
import { GraphObjectFactory } from '../object/index.js';

const DEFAULT_RESOLUTION = 32;
const DEFAULT_STEPS = 64;
const DEFAULT_DENSITY_SCALE = 1;
const DEFAULT_OPACITY = 1;
const DEFAULT_DOMAIN = Object.freeze([-1, 1]);
const MESH_NAME = 'volume';
const CUBE_HALF = 0.5;

// [normal, corners (perimeter order)] for each of a unit cube's 6 faces,
// spanning [-0.5, 0.5]^3 local space — matching `material.volumeRaymarch`'s
// vertex shader, which reads `position` directly as the ray's local entry
// point. Built as plain data (no `THREE.BoxGeometry`) so this stays
// `GraphObjectFactory.createTriangleMesh`-compatible: that factory (unlike
// `createBars`/`createMesh`) never clones the `material` it's given, which
// matters here since `material.volumeRaymarch`'s `dispose()` is wired to
// free its own density/palette textures — cloning would silently orphan the
// real material (and its textures) while disposing an inert copy.
const CUBE_FACES = [
  [
    [0, 0, 1],
    [
      [-CUBE_HALF, -CUBE_HALF, CUBE_HALF],
      [CUBE_HALF, -CUBE_HALF, CUBE_HALF],
      [CUBE_HALF, CUBE_HALF, CUBE_HALF],
      [-CUBE_HALF, CUBE_HALF, CUBE_HALF],
    ],
  ],
  [
    [0, 0, -1],
    [
      [CUBE_HALF, -CUBE_HALF, -CUBE_HALF],
      [-CUBE_HALF, -CUBE_HALF, -CUBE_HALF],
      [-CUBE_HALF, CUBE_HALF, -CUBE_HALF],
      [CUBE_HALF, CUBE_HALF, -CUBE_HALF],
    ],
  ],
  [
    [1, 0, 0],
    [
      [CUBE_HALF, -CUBE_HALF, CUBE_HALF],
      [CUBE_HALF, -CUBE_HALF, -CUBE_HALF],
      [CUBE_HALF, CUBE_HALF, -CUBE_HALF],
      [CUBE_HALF, CUBE_HALF, CUBE_HALF],
    ],
  ],
  [
    [-1, 0, 0],
    [
      [-CUBE_HALF, -CUBE_HALF, -CUBE_HALF],
      [-CUBE_HALF, -CUBE_HALF, CUBE_HALF],
      [-CUBE_HALF, CUBE_HALF, CUBE_HALF],
      [-CUBE_HALF, CUBE_HALF, -CUBE_HALF],
    ],
  ],
  [
    [0, 1, 0],
    [
      [-CUBE_HALF, CUBE_HALF, CUBE_HALF],
      [CUBE_HALF, CUBE_HALF, CUBE_HALF],
      [CUBE_HALF, CUBE_HALF, -CUBE_HALF],
      [-CUBE_HALF, CUBE_HALF, -CUBE_HALF],
    ],
  ],
  [
    [0, -1, 0],
    [
      [-CUBE_HALF, -CUBE_HALF, -CUBE_HALF],
      [CUBE_HALF, -CUBE_HALF, -CUBE_HALF],
      [CUBE_HALF, -CUBE_HALF, CUBE_HALF],
      [-CUBE_HALF, -CUBE_HALF, CUBE_HALF],
    ],
  ],
];

/**
 * Builds a unit cube's `{positions, indices, normals}` — the same shape
 * `generator.area()`/`.surface()`/`.arc()` return, ready for
 * `GraphObjectFactory.createTriangleMesh` (see `CUBE_FACES`'s own doc for why
 * this is hand-built rather than `THREE.BoxGeometry`).
 * @returns {{positions: Float32Array, indices: Uint32Array, normals: Float32Array}}
 */
function buildUnitCubeBuffers() {
  const positions = [];
  const normals = [];
  const indices = [];
  for (const [normal, corners] of CUBE_FACES) {
    const base = positions.length / 3;
    for (const corner of corners) {
      positions.push(...corner);
      normals.push(...normal);
    }
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  return {
    positions: Float32Array.from(positions),
    normals: Float32Array.from(normals),
    indices: Uint32Array.from(indices),
  };
}

/** @param {*} domain @returns {boolean} */
function isValidDomain(domain) {
  return Array.isArray(domain) && domain.length === 2 && domain.every((v) => typeof v === 'number' && Number.isFinite(v)) && domain[0] < domain[1];
}

/**
 * `GraphChart` specialized for ray-marched scalar-field volumes (Prompt
 * 139's "opt-in heavier shader"). The scalar field comes from `.values(fn)`
 * — a `(x, y, z) => number` sampling function, mirroring `SurfaceChart`'s
 * own `.values((x, z) => number)` — sampled onto a `.resolution()`^3 grid at
 * `render()`/`update()` time and uploaded as a 3D texture. Like
 * `SurfaceChart`, there's no per-datum concept a bar/point/line/area chart
 * has, so `GraphChart`'s inherited `x()`/`y()`/`z()`/`data()`/`color()`/
 * `size()`/`shape()`/`filter()`/`sort()`/`on()`/`selection()`/`material()`
 * are all inert (documented explicitly, same precedent as `SurfaceChart`'s
 * inert fields) — `.material()` specifically is inert because this chart's
 * rendering *is* `material.volumeRaymarch(...)`, always, built from this
 * chart's own sampled data, not a user-selectable generic preset the way
 * `SurfaceChart.material()` genuinely is. `.opacity(value)` is overridden
 * with different semantics than `GraphChart`'s inherited per-datum accessor:
 * a single global alpha multiplier (a plain number, no per-datum concept
 * applies to one continuous volume).
 *
 * Renders as a single unit cube spanning `.xDomain()`/`.yDomain()`/
 * `.zDomain()`, materialized via `GraphObjectFactory.createTriangleMesh`
 * (the same "raw triangulated-mesh buffers into one continuous `GraphMesh`"
 * factory `AreaChart`/`SurfaceChart`/`PieChart` already use) from a
 * hand-built unit-cube buffer rather than `GraphObjectFactory.createBars`'s
 * default `BoxGeometry` — `createBars`/`createMesh` clone whatever material
 * they're given, which would silently orphan `material.volumeRaymarch`'s
 * real density/palette textures behind a disposed-but-inert clone (see
 * `buildUnitCubeBuffers`'s own doc). Textured with `material.volumeRaymarch`
 * (`material/presets/volumeRaymarch.js`) — a `THREE.ShaderMaterial` that
 * ray-marches the sampled density texture from the camera, through the
 * cube, accumulating front-to-back alpha-composited color from `.palette()`
 * (defaults to `palette.viridis`, matching every other Phase 8 chart's own
 * uncolored-fallback convention).
 *
 * Sampled values are normalized to `[0, 1]` across their own `[min, max]`
 * before upload (CLAUDE.md §1.1 DRY — same min-max-normalize idea
 * `applyColorField` already uses for `.color()`, inlined here since there's
 * no per-datum `Selection` to route it through).
 * @example
 * new VolumeChart(scene)
 *   .values((x, y, z) => Math.exp(-(x * x + y * y + z * z)))
 *   .xDomain([-2, 2]).yDomain([-2, 2]).zDomain([-2, 2])
 *   .resolution(48)
 *   .steps(96)
 *   .render();
 */
export class VolumeChart extends GraphChart {
  /** @type {((x: number, y: number, z: number) => number)|null} */
  #valuesFn = null;

  /** @type {[number, number]} */
  #xDomain = DEFAULT_DOMAIN;

  /** @type {[number, number]} */
  #yDomain = DEFAULT_DOMAIN;

  /** @type {[number, number]} */
  #zDomain = DEFAULT_DOMAIN;

  /** @type {number} */
  #resolution = DEFAULT_RESOLUTION;

  /** @type {number} */
  #steps = DEFAULT_STEPS;

  /** @type {number} */
  #densityScale = DEFAULT_DENSITY_SCALE;

  /** @type {number} */
  #opacityValue = DEFAULT_OPACITY;

  /** @type {((t: number) => string) & {colors: string[]}} */
  #paletteFn = paletteNamespace.viridis;

  /** @type {import('../object/GraphMesh.js').GraphMesh|null} */
  #mesh = null;

  /** @type {boolean} Whether `render()` has materialized the volume yet. */
  #rendered = false;

  /** @type {boolean} */
  #destroyed = false;

  /**
   * @param {object} scene The raw `THREE.Scene` this chart will attach to.
   * @throws {TypeError} If `scene` is falsy.
   */
  constructor(scene) {
    // No `compose/generator` fits: a scalar field sampled onto a 3D grid and
    // ray-marched isn't an accessor+scale pipeline — this stub only
    // satisfies GraphChart's constructor duck-type check (mirrors
    // NetworkChart/TreeChart/PackChart/PieChart's identical stub).
    super(scene, { compute: () => ({}) });
  }

  /**
   * Gets or sets the scalar-field sampling function, called at
   * `render()`/`update()` time for every grid cell.
   * @param {(x: number, y: number, z: number) => number} [fn]
   * @returns {((x: number, y: number, z: number) => number)|null|this}
   * @throws {TypeError} If `fn` is given and isn't a function.
   * @example chart.values((x, y, z) => Math.exp(-(x * x + y * y + z * z)));
   */
  values(fn) {
    this.#assertNotDestroyed('values');
    if (fn === undefined) return this.#valuesFn;
    if (typeof fn !== 'function') {
      throw new TypeError(`VolumeChart.values: expected a function, received ${JSON.stringify(fn)}.`);
    }
    this.#valuesFn = fn;
    return this;
  }

  /**
   * Gets or sets the world-space `[min, max]` range sampled along x.
   * @param {[number, number]} [domain]
   * @returns {[number, number]|this}
   * @throws {TypeError} If `domain` is given and isn't a `[min, max]` array of finite numbers with `min < max`.
   * @example chart.xDomain([-2, 2]);
   */
  xDomain(domain) {
    return this.#domainField('xDomain', domain, (value) => (this.#xDomain = value));
  }

  /**
   * Gets or sets the world-space `[min, max]` range sampled along y.
   * @param {[number, number]} [domain]
   * @returns {[number, number]|this}
   * @throws {TypeError} If `domain` is given and isn't a `[min, max]` array of finite numbers with `min < max`.
   * @example chart.yDomain([-2, 2]);
   */
  yDomain(domain) {
    return this.#domainField('yDomain', domain, (value) => (this.#yDomain = value));
  }

  /**
   * Gets or sets the world-space `[min, max]` range sampled along z.
   * @param {[number, number]} [domain]
   * @returns {[number, number]|this}
   * @throws {TypeError} If `domain` is given and isn't a `[min, max]` array of finite numbers with `min < max`.
   * @example chart.zDomain([-2, 2]);
   */
  zDomain(domain) {
    return this.#domainField('zDomain', domain, (value) => (this.#zDomain = value));
  }

  /**
   * @param {string} name @param {*} domain @param {(value: [number,number]) => void} setter
   * @returns {[number, number]|this}
   */
  #domainField(name, domain, setter) {
    this.#assertNotDestroyed(name);
    if (domain === undefined) return name === 'xDomain' ? this.#xDomain : name === 'yDomain' ? this.#yDomain : this.#zDomain;
    if (!isValidDomain(domain)) {
      throw new TypeError(`VolumeChart.${name}: expected a [min, max] array of finite numbers with min < max, received ${JSON.stringify(domain)}.`);
    }
    setter(domain);
    return this;
  }

  /**
   * Gets or sets the grid resolution sampled per axis (`resolution ** 3`
   * total samples).
   * @param {number} [value]
   * @returns {number|this}
   * @throws {TypeError} If `value` is given and isn't a positive integer.
   * @example chart.resolution(48);
   */
  resolution(value) {
    this.#assertNotDestroyed('resolution');
    if (value === undefined) return this.#resolution;
    if (!Number.isInteger(value) || value < 1) {
      throw new TypeError(`VolumeChart.resolution: expected a positive integer, received ${JSON.stringify(value)}.`);
    }
    this.#resolution = value;
    return this;
  }

  /**
   * Gets or sets the ray-march step count — forwarded to
   * `material.volumeRaymarch`'s own `steps` option (which enforces the
   * compiled `1..256` ceiling; CLAUDE.md §1.1 DRY, not duplicated here).
   * @param {number} [value]
   * @returns {number|this}
   * @throws {TypeError} If `value` is given and isn't a positive integer.
   * @example chart.steps(96);
   */
  steps(value) {
    this.#assertNotDestroyed('steps');
    if (value === undefined) return this.#steps;
    if (!Number.isInteger(value) || value < 1) {
      throw new TypeError(`VolumeChart.steps: expected a positive integer, received ${JSON.stringify(value)}.`);
    }
    this.#steps = value;
    return this;
  }

  /**
   * Gets or sets a multiplier applied to each sampled (already `[0, 1]`-
   * normalized) density before it drives color/alpha — boosts a sparse
   * field's apparent opacity without changing `.opacity()`'s global fade.
   * @param {number} [value]
   * @returns {number|this}
   * @throws {TypeError} If `value` is given and isn't a finite number.
   * @example chart.densityScale(2);
   */
  densityScale(value) {
    this.#assertNotDestroyed('densityScale');
    if (value === undefined) return this.#densityScale;
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new TypeError(`VolumeChart.densityScale: expected a finite number, received ${JSON.stringify(value)}.`);
    }
    this.#densityScale = value;
    return this;
  }

  /**
   * Gets or sets a global alpha multiplier applied to the whole volume.
   * Overrides `GraphChart.opacity()` (a per-datum constant-or-accessor) with
   * a plain number: one continuous volume has no per-datum concept for it
   * to accessor-ize.
   * @param {number} [value]
   * @returns {number|this}
   * @throws {TypeError} If `value` is given and isn't a finite number.
   * @example chart.opacity(0.7);
   */
  opacity(value) {
    this.#assertNotDestroyed('opacity');
    if (value === undefined) return this.#opacityValue;
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new TypeError(`VolumeChart.opacity: expected a finite number, received ${JSON.stringify(value)}.`);
    }
    this.#opacityValue = value;
    return this;
  }

  /**
   * Gets or sets the color ramp sampled densities are looked up through.
   * Defaults to `palette.viridis`, matching every other Phase 8 chart's own
   * uncolored fallback.
   * @param {((t: number) => string) & {colors: string[]}} [fn]
   * @returns {(((t: number) => string) & {colors: string[]})|this}
   * @throws {TypeError} If `fn` is given and isn't a function.
   * @example chart.palette(palette.plasma);
   */
  palette(fn) {
    this.#assertNotDestroyed('palette');
    if (fn === undefined) return this.#paletteFn;
    if (typeof fn !== 'function') {
      throw new TypeError(`VolumeChart.palette: expected a palette function, received ${JSON.stringify(fn)}.`);
    }
    this.#paletteFn = fn;
    return this;
  }

  /**
   * First call materializes the volume cube; every later call routes to
   * `update()`.
   * @returns {this}
   * @throws {Error} If `values(fn)` was never called before this render.
   * @see GraphChart#render
   */
  render() {
    this.#assertNotDestroyed('render');
    if (this.#rendered) return this.update();
    if (this.#valuesFn === null) {
      throw new Error('VolumeChart.render: call values(fn) before render().');
    }
    this.#sync();
    this.#rendered = true;
    return this;
  }

  /**
   * Re-samples the scalar field from the latest `.values()`/domains/
   * `.resolution()` and rebuilds the volume cube to match.
   * @returns {this}
   * @throws {Error} If `render()` hasn't successfully run yet.
   * @see GraphChart#update
   */
  update() {
    this.#assertNotDestroyed('update');
    if (!this.#rendered) {
      throw new Error('VolumeChart.update: call render() first.');
    }
    this.#sync();
    return this;
  }

  /**
   * Disposes the live volume mesh (and its `volumeRaymarch` material, whose
   * `dispose()` frees its density/palette textures), then defers to
   * `GraphChart.destroy()`. Idempotent.
   * @returns {void}
   * @see GraphChart#destroy
   */
  destroy() {
    if (this.#destroyed) return;
    this.#destroyed = true;
    if (this.#mesh) this.#mesh.dispose();
    this.#mesh = null;
    super.destroy();
  }

  /** Shared by `render()`/`update()` (CLAUDE.md §1.1 DRY two-strike rule). */
  #sync() {
    const grid = this.#sampleGrid();
    if (this.#mesh) this.#mesh.dispose();

    const raymarchMaterial = material.volumeRaymarch({
      data: grid,
      resolution: this.#resolution,
      palette: this.#paletteFn,
      steps: this.#steps,
      densityScale: this.#densityScale,
      opacity: this.#opacityValue,
    });
    this.#mesh = GraphObjectFactory.createTriangleMesh(MESH_NAME, {
      scene: this.scene,
      ...buildUnitCubeBuffers(),
      material: raymarchMaterial,
    });

    const [x0, x1] = this.#xDomain;
    const [y0, y1] = this.#yDomain;
    const [z0, z1] = this.#zDomain;
    this.#mesh.setPosition((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2).setScale(x1 - x0, y1 - y0, z1 - z0);
  }

  /**
   * Samples `.values(fn)` across `.resolution()`^3 grid cells spanning the
   * three domains, then normalizes the raw values to `[0, 1]` across their
   * own sampled `[min, max]` (CLAUDE.md §1.1 DRY — the same min-max-normalize
   * idea `chart/colorField.js`'s `applyColorField` already uses, inlined
   * since there's no per-datum `Selection` here to route it through).
   * Index order (`x` fastest, then `y`, then `z`) matches
   * `material.volumeRaymarch`'s `Data3DTexture` upload layout exactly.
   * @returns {Float32Array}
   */
  #sampleGrid() {
    const r = this.#resolution;
    const [x0, x1] = this.#xDomain;
    const [y0, y1] = this.#yDomain;
    const [z0, z1] = this.#zDomain;
    const lerp = (a, b, t) => a + (b - a) * t;
    const sampleAt = (i) => (r > 1 ? i / (r - 1) : 0.5);

    const raw = new Float32Array(r * r * r);
    let min = Infinity;
    let max = -Infinity;
    let index = 0;
    for (let zi = 0; zi < r; zi++) {
      const wz = lerp(z0, z1, sampleAt(zi));
      for (let yi = 0; yi < r; yi++) {
        const wy = lerp(y0, y1, sampleAt(yi));
        for (let xi = 0; xi < r; xi++) {
          const wx = lerp(x0, x1, sampleAt(xi));
          const value = this.#valuesFn(wx, wy, wz);
          raw[index] = value;
          if (value < min) min = value;
          if (value > max) max = value;
          index++;
        }
      }
    }

    const range = max - min || 1;
    const normalized = new Float32Array(raw.length);
    for (let i = 0; i < raw.length; i++) normalized[i] = (raw[i] - min) / range;
    return normalized;
  }

  /** @param {string} method @throws {Error} */
  #assertNotDestroyed(method) {
    if (this.#destroyed) {
      throw new Error(`VolumeChart.${method}: this chart has been destroyed.`);
    }
  }
}
