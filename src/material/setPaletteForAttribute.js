import { GraphInstancedObject } from '../object/GraphInstancedObject.js';
import { GraphObjectMaterial } from './GraphObjectMaterial.js';
import { dataDriven } from './presets/dataDriven.js';

/**
 * The 90%-case convenience over `dataDriven` (Prompt 106): color an
 * instanced object's members by a per-instance attribute through a palette,
 * in one call, instead of hand-assembling `GraphObjectMaterial` +
 * `material.dataDriven({ valueAttribute, palette })` yourself.
 * @param {GraphInstancedObject} object
 * @param {string} attrName - The per-instance attribute to read (already written via `Selection.attr(attrName, ...)`).
 * @param {((t: number) => string) & { colors: string[] }} palette - e.g. `palette.viridis`.
 * @param {Omit<Parameters<typeof dataDriven>[0], 'palette' | 'valueAttribute'>} [options] - Forwarded to `dataDriven` (e.g. `perInstanceOpacity`).
 * @returns {GraphObjectMaterial} A fresh wrapper around `object`, already carrying the `dataDriven` shader.
 * @throws {TypeError} If `object` is not a `GraphInstancedObject`, or `attrName` is not a non-empty string.
 * @throws {TypeError} If `palette`/`options` fail `dataDriven`'s own validation.
 * @example
 * selection.attr('value', (d) => magnitudeScale(d.temperature));
 * material.setPaletteForAttribute(bars, 'value', palette.viridis);
 */
export function setPaletteForAttribute(object, attrName, palette, options = {}) {
  if (!(object instanceof GraphInstancedObject)) {
    throw new TypeError(
      `material.setPaletteForAttribute: object must be a GraphInstancedObject instance, received ${object?.constructor?.name ?? typeof object}.`,
    );
  }
  if (typeof attrName !== 'string' || attrName.length === 0) {
    throw new TypeError(`material.setPaletteForAttribute: attrName must be a non-empty string, received ${JSON.stringify(attrName)}.`);
  }
  const wrapper = new GraphObjectMaterial(object);
  wrapper.applyShader(dataDriven({ ...options, palette, valueAttribute: attrName }));
  return wrapper;
}
