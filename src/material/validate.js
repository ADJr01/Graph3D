/**
 * Shared option-validation helpers for `material/`'s factories — presets
 * (`material/presets/*`) and procedural textures (`material/texture/*`)
 * alike need the same "is this a plain options object" check (CLAUDE.md
 * §1.1 DRY two-strike rule — moved up from `presets/validate.js` once
 * `texture/procedural.js` needed it too, Prompt 110).
 */

/**
 * @param {string} callerName - e.g. `'material.standard'`.
 * @param {*} options
 * @throws {TypeError} If `options` is not a plain object.
 */
export function assertPlainOptions(callerName, options) {
  if (options === null || typeof options !== 'object' || Array.isArray(options)) {
    throw new TypeError(
      `${callerName}: expected a plain options object, received ${JSON.stringify(options)}.`,
    );
  }
}

/**
 * @param {string} callerName - e.g. `'material.holographic'`.
 * @param {string} name - The option's name, for the error message.
 * @param {*} value
 * @throws {TypeError} If `value` is not a finite number.
 */
export function assertFiniteNumber(callerName, name, value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(
      `${callerName}: ${name} must be a finite number, received ${JSON.stringify(value)}.`,
    );
  }
}

/**
 * @param {string} callerName - e.g. `'material.dataDriven'`.
 * @param {*} palette
 * @throws {TypeError} If `palette` is not a palette function with a precomputed `.colors` array.
 */
export function assertPaletteFunction(callerName, palette) {
  if (typeof palette !== 'function' || !Array.isArray(palette.colors) || palette.colors.length === 0) {
    throw new TypeError(
      `${callerName}: palette must be a compose/palette function with a precomputed .colors ` +
        `array (e.g. palette.viridis), received ${JSON.stringify(palette)}.`,
    );
  }
}
