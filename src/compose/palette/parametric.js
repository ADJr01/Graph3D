import { hex, hsl } from '../interpolate/color.js';
import { attachColors } from './ramp.js';

const clamp01 = (v) => Math.max(0, Math.min(1, v));

/**
 * A warm-toned cyclic sweep: magenta → red → orange → yellow-green.
 * Generated directly from HSL — there's no fixed anchor table to reuse
 * `ramp()` for.
 * @param {number} t
 * @returns {string}
 * @example warm(0); // magenta
 */
export const warm = attachColors((t) => hsl(300 + 140 * t, 0.7, 0.5));

/**
 * A cool-toned sweep: yellow-green → cyan → blue → purple.
 * @param {number} t
 * @returns {string}
 * @example cool(0); // yellow-green
 */
export const cool = attachColors((t) => hsl(80 + 180 * t, 0.7, 0.5));

/**
 * A cyclic full-spectrum rainbow, dimmed and desaturated toward `t = 0`
 * and `t = 1` so both ends read as the same color — an HSL approximation
 * of D3's cubehelix-based `interpolateRainbow` shape.
 * @param {number} t
 * @returns {string}
 * @example rainbow(0) === rainbow(1); // true — cyclic
 */
export const rainbow = attachColors((t) => {
  const ts = Math.abs(t - 0.5);
  return hsl(360 * t - 100, clamp01(1.5 - 1.5 * ts), clamp01(0.8 - 0.9 * ts));
});

/** One RGB channel of {@link sinebow}: a squared sine wave, always non-negative. */
function sinebowChannel(t) {
  const s = Math.sin(Math.PI * t);
  return Math.round(255 * s * s);
}

/**
 * A cyclic rainbow built from three sine waves 120° out of phase per
 * channel — smoother and brighter than {@link rainbow}, at the cost of
 * uneven hue spacing.
 * @param {number} t
 * @returns {string}
 * @example sinebow(0) === sinebow(1); // true — cyclic
 */
export const sinebow = attachColors((t) =>
  hex(sinebowChannel(t), sinebowChannel(t + 1 / 3), sinebowChannel(t + 2 / 3)),
);
