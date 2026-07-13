/**
 * @typedef {Object} Capabilities
 * @property {boolean} webgl2 - True if WebGL2 context is available.
 * @property {boolean} timerQuery - True if EXT_disjoint_timer_query_webgl2 is available.
 * @property {boolean} floatTextures - True if float texture rendering is supported.
 * @property {boolean} instancedArrays - True if instanced drawing is supported (built-in on WebGL2; ANGLE_instanced_arrays on WebGL1).
 * @property {number} maxTextureSize - Maximum 1D/2D texture dimension in texels.
 * @property {number} maxVertexAttribs - Maximum number of vertex attributes.
 * @property {number} maxInstanceCount - Maximum instance count for instanced draws (0 if instancing is unavailable).
 * @property {string} vendor - GPU vendor string (unmasked when WEBGL_debug_renderer_info is available).
 * @property {string} renderer - GPU renderer string (unmasked when WEBGL_debug_renderer_info is available).
 */

// Practical ceiling for WebGL1 instanced draws — no spec limit exists, so we use the 32-bit index space.
const WEBGL1_MAX_INSTANCES = 2 ** 32 - 1;

/** @type {Readonly<Capabilities>} */
const NULL_CAPABILITIES = Object.freeze({
  webgl2: false,
  timerQuery: false,
  floatTextures: false,
  instancedArrays: false,
  maxTextureSize: 0,
  maxVertexAttribs: 0,
  maxInstanceCount: 0,
  vendor: 'unavailable',
  renderer: 'unavailable',
});

/**
 * @param {WebGLRenderingContext|WebGL2RenderingContext} gl
 * @param {boolean} webgl2
 * @returns {Readonly<Capabilities>}
 */
function probeGl(gl, webgl2) {
  const timerQuery = webgl2
    ? gl.getExtension('EXT_disjoint_timer_query_webgl2') !== null
    : false;

  const floatTextures = webgl2
    ? gl.getExtension('EXT_color_buffer_float') !== null
    : gl.getExtension('OES_texture_float') !== null;

  const hasInstancedArrays = webgl2 || gl.getExtension('ANGLE_instanced_arrays') !== null;

  const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
  const vendor = debugInfo
    ? gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL)
    : gl.getParameter(gl.VENDOR);
  const renderer = debugInfo
    ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)
    : gl.getParameter(gl.RENDERER);

  const maxInstanceCount = webgl2
    ? gl.getParameter(gl.MAX_ELEMENT_INDEX)
    : hasInstancedArrays
      ? WEBGL1_MAX_INSTANCES
      : 0;

  return Object.freeze({
    webgl2,
    timerQuery,
    floatTextures,
    instancedArrays: hasInstancedArrays,
    maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
    maxVertexAttribs: gl.getParameter(gl.MAX_VERTEX_ATTRIBS),
    maxInstanceCount,
    vendor,
    renderer,
  });
}

/**
 * Probes the available WebGL capabilities of the current environment on construction.
 * The result is exposed as a frozen {@link Capabilities} object and drives all later
 * decisions about which rendering code paths are safe to use.
 *
 * No Three.js dependency — safe to instantiate before the renderer exists.
 * SSR-safe: outside a browser (no `document`) this returns `NULL_CAPABILITIES`
 * immediately without touching the DOM.
 *
 * @example
 * const probe = new CapabilityProbe();
 * if (!probe.capabilities.webgl2) throw new Error('WebGL2 required');
 *
 * @example
 * // Reuse the renderer's canvas to avoid a second GL context.
 * const probe = new CapabilityProbe(renderer.domElement);
 */
export class CapabilityProbe {
  /** @type {Readonly<Capabilities>} */
  capabilities;

  /**
   * @param {HTMLCanvasElement} [canvas] - Canvas to probe against.
   *   When omitted a temporary canvas is created and immediately discarded.
   *   Pass the renderer's canvas to avoid allocating a second WebGL context.
   */
  constructor(canvas) {
    // SSR-safe: no browser means no WebGL, full stop — this is an expected,
    // normal state server-side (not a degraded-capability warning case).
    if (typeof document === 'undefined') {
      this.capabilities = NULL_CAPABILITIES;
      return;
    }

    const ownCanvas = canvas == null;
    if (ownCanvas) canvas = document.createElement('canvas');

    const gl2 = canvas.getContext('webgl2');
    if (gl2) {
      this.capabilities = probeGl(gl2, true);
      return;
    }

    const gl1 = canvas.getContext('webgl') ?? canvas.getContext('experimental-webgl');
    if (gl1) {
      console.warn(
        'CapabilityProbe: WebGL2 unavailable, falling back to WebGL1. ' +
          'Timer queries and float render targets will be disabled.',
      );
      this.capabilities = probeGl(gl1, false);
      return;
    }

    console.warn('CapabilityProbe: No WebGL context available. All capabilities disabled.');
    this.capabilities = NULL_CAPABILITIES;
  }
}
