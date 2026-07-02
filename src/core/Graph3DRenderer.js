import {
  WebGLRenderer,
  SRGBColorSpace,
  NoToneMapping,
  LinearToneMapping,
  ReinhardToneMapping,
  CineonToneMapping,
  ACESFilmicToneMapping,
  AgXToneMapping,
  NeutralToneMapping,
  BasicShadowMap,
  PCFShadowMap,
  PCFSoftShadowMap,
  VSMShadowMap,
} from 'three';

/** @enum {number} — string keys accepted by setToneMapping / constructor */
const TONE_MAPPING = Object.freeze({
  None: NoToneMapping,
  Linear: LinearToneMapping,
  Reinhard: ReinhardToneMapping,
  Cineon: CineonToneMapping,
  ACESFilmic: ACESFilmicToneMapping,
  AgX: AgXToneMapping,
  Neutral: NeutralToneMapping,
});

/** @enum {number} — string keys accepted by constructor */
const SHADOW_MAP_TYPE = Object.freeze({
  basic: BasicShadowMap,
  pcf: PCFShadowMap,
  pcfsoft: PCFSoftShadowMap,
  vsm: VSMShadowMap,
});

/**
 * @param {string} name
 * @returns {number}
 * @throws {TypeError}
 */
function resolveToneMapping(name) {
  if (Object.prototype.hasOwnProperty.call(TONE_MAPPING, name)) return TONE_MAPPING[name];
  throw new TypeError(
    `Graph3DRenderer: unknown toneMapping '${name}'. ` +
      `Expected one of: ${Object.keys(TONE_MAPPING).join(', ')}.`,
  );
}

/**
 * @param {string} name
 * @returns {number}
 * @throws {TypeError}
 */
function resolveShadowMap(name) {
  if (Object.prototype.hasOwnProperty.call(SHADOW_MAP_TYPE, name)) return SHADOW_MAP_TYPE[name];
  throw new TypeError(
    `Graph3DRenderer: unknown shadowMap '${name}'. ` +
      `Expected one of: ${Object.keys(SHADOW_MAP_TYPE).join(', ')}.`,
  );
}

/**
 * @typedef {Object} Graph3DRendererOptions
 * @property {HTMLCanvasElement} canvas - Target canvas element. Required.
 * @property {boolean} [antialias=true]
 * @property {number} [pixelRatio=devicePixelRatio] - Defaults to `window.devicePixelRatio` (or 1 outside a browser).
 * @property {boolean} [alpha=false]
 * @property {keyof TONE_MAPPING} [toneMapping='ACESFilmic']
 * @property {number} [toneMappingExposure=1.0]
 * @property {keyof SHADOW_MAP_TYPE} [shadowMap='pcfsoft']
 * @property {'high-performance'|'low-power'|'default'} [powerPreference='high-performance']
 */

/**
 * Thin wrapper around `THREE.WebGLRenderer` that enforces the project's
 * baseline rendering configuration: sRGB output, ACESFilmic tone mapping,
 * PCF-soft shadows, and high-performance power preference.
 *
 * Exposes `.three` for full Three.js access. All public methods guard against
 * use after disposal or context loss.
 *
 * @example
 * const canvas = document.getElementById('canvas');
 * const renderer = new Graph3DRenderer({ canvas });
 * renderer.setSize(window.innerWidth, window.innerHeight);
 * renderer.three.render(scene, camera);
 *
 * @example
 * // Custom tone mapping:
 * const renderer = new Graph3DRenderer({ canvas, toneMapping: 'AgX', toneMappingExposure: 1.2 });
 */
export class Graph3DRenderer {
  /** @type {THREE.WebGLRenderer} The underlying Three.js renderer. Never null while alive. */
  three;

  /** @type {string|null} Non-null once disposed or context-lost; names the cause. */
  _deadReason = null;

  /** @type {EventListener} Stored so we can remove it in dispose(). */
  _onContextLost;

  /** @type {EventListener} Stored so we can remove it in dispose(). */
  _onContextRestored;

  /**
   * @param {Graph3DRendererOptions} options
   * @throws {TypeError} If `canvas` is missing.
   * @throws {TypeError} If `toneMapping` or `shadowMap` is not a recognised key.
   */
  constructor({
    canvas,
    antialias = true,
    pixelRatio = typeof window !== 'undefined' ? window.devicePixelRatio : 1,
    alpha = false,
    toneMapping = 'ACESFilmic',
    toneMappingExposure = 1.0,
    shadowMap = 'pcfsoft',
    powerPreference = 'high-performance',
  } = {}) {
    if (!canvas) {
      throw new TypeError(
        'Graph3DRenderer: canvas is required. Pass an HTMLCanvasElement.',
      );
    }

    // Resolve string keys before creating the renderer so we throw before
    // allocating any GPU resources on a bad config.
    const toneMappingEnum = resolveToneMapping(toneMapping);
    const shadowMapEnum = resolveShadowMap(shadowMap);

    this.three = new WebGLRenderer({ canvas, antialias, alpha, powerPreference });
    this.three.setPixelRatio(pixelRatio);

    // sRGB is the default in r155+ but we set it explicitly to document intent.
    this.three.outputColorSpace = SRGBColorSpace;

    // Physically-correct lighting is the Three.js default since r155; no flag needed.

    this.three.toneMapping = toneMappingEnum;
    this.three.toneMappingExposure = toneMappingExposure;
    this.three.shadowMap.enabled = true;
    this.three.shadowMap.type = shadowMapEnum;

    this._onContextLost = () => {
      this._deadReason = 'webglcontextlost';
      console.error(
        'Graph3DRenderer: WebGL context lost. All rendering is halted. ' +
          'The loop will resume automatically if the context is restored.',
      );
      this.three.domElement.dispatchEvent(new CustomEvent('graph3d:context-lost'));
    };

    // Fires when the browser recovers the context; clears dead state so the loop can resume.
    this._onContextRestored = () => {
      this._deadReason = null;
      this.three.domElement.dispatchEvent(new CustomEvent('graph3d:context-restored'));
    };

    canvas.addEventListener('webglcontextlost', this._onContextLost, false);
    canvas.addEventListener('webglcontextrestored', this._onContextRestored, false);
  }

  /**
   * @param {string} method - Caller name for the error message.
   * @throws {Error} If the renderer is disposed or the context is lost.
   */
  _assertAlive(method) {
    if (this._deadReason === 'disposed') {
      throw new Error(`Graph3DRenderer.${method}: renderer has been disposed.`);
    }
    if (this._deadReason === 'webglcontextlost') {
      throw new Error(`Graph3DRenderer.${method}: WebGL context is lost.`);
    }
  }

  /**
   * Resize the drawing buffer. Automatically updates the canvas CSS size unless
   * `updateStyle` is false.
   *
   * @param {number} width - Width in physical pixels.
   * @param {number} height - Height in physical pixels.
   * @param {boolean} [updateStyle=true]
   * @throws {Error} If disposed or context-lost.
   * @example renderer.setSize(window.innerWidth, window.innerHeight);
   */
  setSize(width, height, updateStyle = true) {
    this._assertAlive('setSize');
    this.three.setSize(width, height, updateStyle);
  }

  /**
   * Update the device pixel ratio without resizing the logical canvas dimensions.
   *
   * @param {number} ratio
   * @throws {Error} If disposed or context-lost.
   * @example renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
   */
  setPixelRatio(ratio) {
    this._assertAlive('setPixelRatio');
    this.three.setPixelRatio(ratio);
  }

  /**
   * Swap the tone mapping operator at runtime.
   *
   * @param {keyof TONE_MAPPING} name - One of: None, Linear, Reinhard, Cineon, ACESFilmic, AgX, Neutral.
   * @throws {Error} If disposed or context-lost.
   * @throws {TypeError} If `name` is not a recognised key.
   * @example renderer.setToneMapping('AgX');
   */
  setToneMapping(name) {
    this._assertAlive('setToneMapping');
    this.three.toneMapping = resolveToneMapping(name);
  }

  /**
   * Release all GPU resources and remove the context-loss listener.
   * Safe to call multiple times (idempotent).
   *
   * @example renderer.dispose();
   */
  dispose() {
    if (this._deadReason === 'disposed') return;
    this.three.domElement.removeEventListener('webglcontextlost', this._onContextLost, false);
    this.three.domElement.removeEventListener('webglcontextrestored', this._onContextRestored, false);
    this.three.dispose();
    this._deadReason = 'disposed';
  }
}
