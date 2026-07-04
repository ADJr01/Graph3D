import * as THREE from 'three';

/**
 * Bundled Roboto MSDF atlas — requires `roboto-msdf.png` (the multi-channel
 * signed-distance atlas image) and `roboto-msdf.json` (BMFont-style glyph
 * metrics: `chars[]`, `common.{scaleW,scaleH,lineHeight}`, `info.size`,
 * optional `kernings[]`) to be present under `src/material/text/assets/`.
 * See this file's `.claude/TODO.md` entry — as of Prompt 108 these two files
 * have not been generated yet (no MSDF font tool / Roboto TTF was available
 * to produce them in this environment), so `SDFText.create()` throws a clear
 * error identifying exactly what's missing until they're added.
 */
const ATLAS_IMAGE_URL = new URL('./assets/roboto-msdf.png', import.meta.url).href;
const ATLAS_METRICS_URL = new URL('./assets/roboto-msdf.json', import.meta.url).href;

const DEFAULT_FONT_SIZE = 1;
const DEFAULT_LETTER_SPACING = 0;
const DEFAULT_COLOR = '#ffffff';
const ALIGNMENTS = new Set(['left', 'center', 'right']);

/** Memoized across every `SDFText.create()` call — the atlas is one small (<100KB), shared, read-only resource. */
let atlasLoadPromise = null;

/**
 * Lazy-loads (and caches) the bundled MSDF atlas texture + glyph metrics.
 * Every `SDFText` instance shares the same texture — individual instances'
 * `dispose()` must never dispose it (see `SDFText.dispose`'s own note).
 * @returns {Promise<{ texture: THREE.Texture, metrics: object }>}
 * @throws {Error} If the atlas image or metrics file fails to load.
 */
function loadAtlas() {
  if (!atlasLoadPromise) {
    atlasLoadPromise = (async () => {
      let metrics;
      try {
        const response = await fetch(ATLAS_METRICS_URL);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        metrics = await response.json();
      } catch (cause) {
        atlasLoadPromise = null; // allow a retry once the asset is actually added
        throw new Error(
          `SDFText: failed to load the bundled Roboto MSDF atlas metrics from '${ATLAS_METRICS_URL}'. ` +
            'This asset has not been generated for this repository yet — run an MSDF font tool ' +
            "(e.g. msdf-bmfont-xml) against a Roboto TTF and place its output at " +
            "src/material/text/assets/roboto-msdf.{png,json} (see .claude/TODO.md).",
          { cause },
        );
      }

      let texture;
      try {
        texture = await new Promise((resolve, reject) => {
          new THREE.TextureLoader().load(ATLAS_IMAGE_URL, resolve, undefined, reject);
        });
      } catch (cause) {
        atlasLoadPromise = null;
        throw new Error(
          `SDFText: failed to load the bundled Roboto MSDF atlas image from '${ATLAS_IMAGE_URL}'. ` +
            'Same missing-asset gap as the metrics file (see .claude/TODO.md).',
          { cause },
        );
      }
      texture.generateMipmaps = false;
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;

      return { texture, metrics };
    })();
  }
  return atlasLoadPromise;
}

/**
 * @param {string} text
 * @param {object} metrics BMFont-style glyph metrics.
 * @param {{ fontSize: number, letterSpacing: number, align: 'left'|'center'|'right' }} layout
 * @returns {{ geometry: THREE.BufferGeometry, width: number, height: number }}
 */
function buildTextGeometry(text, metrics, { fontSize, letterSpacing, align }) {
  const glyphsById = new Map(metrics.chars.map((glyph) => [glyph.id, glyph]));
  const kerningByPair = new Map((metrics.kernings ?? []).map((k) => [`${k.first},${k.second}`, k.amount]));
  const scaleWidth = metrics.common.scaleW;
  const scaleHeight = metrics.common.scaleH;
  const baseSize = metrics.info.size;
  const unitScale = fontSize / baseSize;
  const lineHeight = metrics.common.lineHeight * unitScale;

  const lines = text.split('\n').map((line) => {
    let penX = 0;
    const glyphPlacements = [];
    for (let i = 0; i < line.length; i++) {
      const code = line.codePointAt(i);
      const glyph = glyphsById.get(code);
      if (!glyph) {
        console.warn(`SDFText: no glyph for character '${line[i]}' (code ${code}) in the bundled atlas — skipped.`);
        continue;
      }
      if (i > 0) {
        const kern = kerningByPair.get(`${line.codePointAt(i - 1)},${code}`) ?? 0;
        penX += kern * unitScale;
      }
      glyphPlacements.push({ glyph, x: penX });
      penX += (glyph.xadvance * unitScale) + letterSpacing;
    }
    return { glyphPlacements, width: Math.max(0, penX - letterSpacing) };
  });

  const blockWidth = Math.max(0, ...lines.map((l) => l.width));
  const blockHeight = lines.length * lineHeight;

  const positions = [];
  const uvs = [];
  const indices = [];
  let vertexCount = 0;

  lines.forEach((line, lineIndex) => {
    const lineOffsetX = align === 'center' ? (blockWidth - line.width) / 2 : align === 'right' ? blockWidth - line.width : 0;
    const y = -lineIndex * lineHeight;

    for (const { glyph, x } of line.glyphPlacements) {
      const gx = lineOffsetX + x + glyph.xoffset * unitScale;
      const gy = y - glyph.yoffset * unitScale;
      const gw = glyph.width * unitScale;
      const gh = glyph.height * unitScale;

      const u0 = glyph.x / scaleWidth;
      const v0 = glyph.y / scaleHeight;
      const u1 = (glyph.x + glyph.width) / scaleWidth;
      const v1 = (glyph.y + glyph.height) / scaleHeight;

      positions.push(gx, gy, 0, gx + gw, gy, 0, gx + gw, gy - gh, 0, gx, gy - gh, 0);
      uvs.push(u0, v0, u1, v0, u1, v1, u0, v1);
      indices.push(vertexCount, vertexCount + 1, vertexCount + 2, vertexCount, vertexCount + 2, vertexCount + 3);
      vertexCount += 4;
    }
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);

  return { geometry, width: blockWidth, height: blockHeight };
}

const VERTEX_SHADER = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const FRAGMENT_SHADER = `
uniform sampler2D atlas;
uniform vec3 color;
uniform vec3 outlineColor;
uniform float outlineWidth;
uniform vec3 glowColor;
uniform float glowWidth;
uniform float glowIntensity;

varying vec2 vUv;

float median(float r, float g, float b) {
  return max(min(r, g), min(max(r, g), b));
}

void main() {
  vec3 msdf = texture2D(atlas, vUv).rgb;
  float sigDist = median(msdf.r, msdf.g, msdf.b) - 0.5;
  float fw = fwidth(sigDist);

  float fillAlpha = clamp(sigDist / fw + 0.5, 0.0, 1.0);
  vec3 rgb = color;
  float finalAlpha = fillAlpha;

  if (outlineWidth > 0.0) {
    float outlineAlpha = clamp((sigDist + outlineWidth) / fw + 0.5, 0.0, 1.0);
    rgb = mix(outlineColor, color, fillAlpha);
    finalAlpha = max(fillAlpha, outlineAlpha);
  }

  if (glowWidth > 0.0) {
    float glowAlpha = clamp((sigDist + glowWidth) / fw + 0.5, 0.0, 1.0) * glowIntensity;
    rgb = mix(glowColor, rgb, finalAlpha);
    finalAlpha = max(finalAlpha, glowAlpha);
  }

  if (finalAlpha < 0.001) discard;
  gl_FragColor = vec4(rgb, finalAlpha);
}
`;

/**
 * @param {THREE.Texture} atlasTexture
 * @param {{ color: string, outline: {color?: string, width?: number}|false, glow: {color?: string, width?: number, intensity?: number}|false }} style
 * @returns {THREE.ShaderMaterial}
 */
function buildTextMaterial(atlasTexture, { color, outline, glow }) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: {
      atlas: { value: atlasTexture },
      color: { value: new THREE.Color(color) },
      outlineColor: { value: new THREE.Color(outline ? (outline.color ?? '#000000') : '#000000') },
      outlineWidth: { value: outline ? (outline.width ?? 0.15) : 0 },
      glowColor: { value: new THREE.Color(glow ? (glow.color ?? color) : '#000000') },
      glowWidth: { value: glow ? (glow.width ?? 0.4) : 0 },
      glowIntensity: { value: glow ? (glow.intensity ?? 1) : 0 },
    },
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
  });
}

/** @param {*} v @throws {TypeError} */
function assertFiniteNumber(name, v) {
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new TypeError(`SDFText.create: ${name} must be a finite number, received ${JSON.stringify(v)}.`);
  }
}

/**
 * GPU-rendered, resolution-independent text — samples a bundled MSDF
 * (multi-channel signed distance field) Roboto atlas, staying crisp at any
 * viewing distance (no blur, no pixelation), unlike canvas-sprite text
 * (banned after Phase 6, CLAUDE.md §2). Not a `GraphObject` subclass — plain
 * composition, exposing the raw `THREE.Mesh` via `.mesh`/`.three` for the
 * caller to `scene.add()` directly, or wrap in their own `GraphMesh` if they
 * want registry/disposal-tracking (`new GraphMesh({ scene, name,
 * geometry: text.mesh.geometry, material: text.mesh.material })`).
 *
 * @example
 * const label = await SDFText.create('42%', { fontSize: 0.5, color: '#39ff14' });
 * scene.add(label.mesh);
 * // ... later:
 * label.dispose();
 *
 * @example
 * const title = await SDFText.create('Revenue', {
 *   outline: { color: '#000000', width: 0.2 },
 *   glow: { color: '#66ccff', intensity: 1.5 },
 *   align: 'center',
 * });
 */
export class SDFText {
  /** @type {THREE.Mesh} */
  #mesh;

  /** @type {number} */
  #width;

  /** @type {number} */
  #height;

  /** @type {boolean} */
  #disposed = false;

  /** @param {THREE.Mesh} mesh @param {number} width @param {number} height */
  constructor(mesh, width, height) {
    this.#mesh = mesh;
    this.#width = width;
    this.#height = height;
  }

  /**
   * The rendered `THREE.Mesh` — add it to a scene yourself (`scene.add(text.mesh)`).
   * @returns {THREE.Mesh}
   * @throws {Error} If called after `dispose()`.
   */
  get mesh() {
    this.#assertNotDisposed('mesh');
    return this.#mesh;
  }

  /** Alias for `.mesh`, matching `object/`'s wrapper classes' `.three` escape hatch. @returns {THREE.Mesh} */
  get three() {
    return this.mesh;
  }

  /** This text block's total rendered width, in world units (`fontSize`-scaled). @returns {number} */
  get width() {
    this.#assertNotDisposed('width');
    return this.#width;
  }

  /** This text block's total rendered height, in world units (`fontSize`-scaled). @returns {number} */
  get height() {
    this.#assertNotDisposed('height');
    return this.#height;
  }

  /**
   * Dispose this text block's own geometry and material. Does **not**
   * dispose the shared MSDF atlas texture — every `SDFText` instance reuses
   * the same cached texture (loaded once, see `loadAtlas`), so disposing it
   * per-instance would break every other still-alive `SDFText`.
   * Idempotent.
   * @example text.dispose();
   */
  dispose() {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#mesh.geometry.dispose();
    this.#mesh.material.dispose();
  }

  /** @param {string} method @throws {Error} */
  #assertNotDisposed(method) {
    if (this.#disposed) {
      throw new Error(`SDFText.${method}: instance has been disposed.`);
    }
  }

  /**
   * Build a text mesh. Async because loading the (lazily-fetched, cached)
   * MSDF atlas is inherently asynchronous.
   * @param {string} text
   * @param {{
   *   fontSize?: number,
   *   letterSpacing?: number,
   *   align?: 'left'|'center'|'right',
   *   color?: (string|number|THREE.Color),
   *   outline?: ({ color?: (string|number|THREE.Color), width?: number }|false),
   *   glow?: ({ color?: (string|number|THREE.Color), width?: number, intensity?: number }|false),
   * }} [options]
   * @returns {Promise<SDFText>}
   * @throws {TypeError} If `text` is not a string, or a numeric option isn't a finite number.
   * @throws {TypeError} If `align` is not `'left'|'center'|'right'`.
   * @throws {Error} If the bundled atlas fails to load (see `loadAtlas`).
   * @example const label = await SDFText.create('Hello', { fontSize: 0.4 });
   */
  static async create(text, options = {}) {
    if (typeof text !== 'string') {
      throw new TypeError(`SDFText.create: text must be a string, received ${JSON.stringify(text)}.`);
    }
    if (options === null || typeof options !== 'object') {
      throw new TypeError(`SDFText.create: options must be a plain object, received ${JSON.stringify(options)}.`);
    }
    const {
      fontSize = DEFAULT_FONT_SIZE,
      letterSpacing = DEFAULT_LETTER_SPACING,
      align = 'left',
      color = DEFAULT_COLOR,
      outline = false,
      glow = false,
    } = options;
    assertFiniteNumber('fontSize', fontSize);
    if (fontSize <= 0) throw new TypeError(`SDFText.create: fontSize must be greater than 0, received ${fontSize}.`);
    assertFiniteNumber('letterSpacing', letterSpacing);
    if (!ALIGNMENTS.has(align)) {
      throw new TypeError(`SDFText.create: align must be one of ${[...ALIGNMENTS].join(', ')}, received ${JSON.stringify(align)}.`);
    }
    if (outline && outline.width !== undefined) assertFiniteNumber('outline.width', outline.width);
    if (glow) {
      if (glow.width !== undefined) assertFiniteNumber('glow.width', glow.width);
      if (glow.intensity !== undefined) assertFiniteNumber('glow.intensity', glow.intensity);
    }

    const { texture, metrics } = await loadAtlas();
    const { geometry, width, height } = buildTextGeometry(text, metrics, { fontSize, letterSpacing, align });
    const material = buildTextMaterial(texture, { color, outline, glow });
    const mesh = new THREE.Mesh(geometry, material);
    return new SDFText(mesh, width, height);
  }
}
