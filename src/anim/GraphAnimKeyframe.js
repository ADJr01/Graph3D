import { interpolate } from '../compose/interpolate/index.js';

/**
 * Reads a dot-path (e.g. `'position.y'`) off a target object.
 * @param {object} target
 * @param {string} path
 * @returns {*}
 * @throws {TypeError} If an intermediate segment resolves to `null`/`undefined`.
 * @example getPath(mesh, 'position.y'); // 0
 */
export function getPath(target, path) {
  let value = target;
  for (const segment of path.split('.')) {
    if (value === null || value === undefined) {
      throw new TypeError(`getPath: path '${path}' does not resolve on the given target (stopped at '${segment}').`);
    }
    value = value[segment];
  }
  return value;
}

/**
 * Writes `value` at a dot-path (e.g. `'position.y'`) on a target object.
 * @param {object} target
 * @param {string} path
 * @param {*} value
 * @returns {void}
 * @throws {TypeError} If an intermediate segment resolves to `null`/`undefined`.
 * @example setPath(mesh, 'position.y', 5);
 */
export function setPath(target, path, value) {
  const segments = path.split('.');
  let container = target;
  for (let i = 0; i < segments.length - 1; i++) {
    container = container[segments[i]];
    if (container === null || container === undefined) {
      throw new TypeError(`setPath: path '${path}' does not resolve on the given target (stopped at '${segments[i]}').`);
    }
  }
  container[segments[segments.length - 1]] = value;
}

/**
 * A per-property animation track: a dot-path plus one or more `{offset,
 * value}` stops (`offset ∈ [0, 1]`). All value interpolation between
 * consecutive stops delegates to `compose/interpolate` (CLAUDE.md §1.1 DRY —
 * no local lerp lives here); the interpolator for each stop pair is built
 * once at construction, so `valueAt` is just a segment lookup.
 * @example
 * const track = new GraphAnimKeyframe('position.y', [
 *   { offset: 0, value: 0 },
 *   { offset: 1, value: 10 },
 * ]);
 * track.valueAt(0.5); // 5
 */
export class GraphAnimKeyframe {
  /** @type {string} */
  #path;
  /** @type {{offset: number, value: *}[]} */
  #stops;
  /** @type {{start: number, end: number, fn: (t: number) => *}[]} */
  #segments;

  /**
   * @param {string} path A dot-path, e.g. `'position.y'` or `'material.opacity'`.
   * @param {{offset: number, value: *}[]} stops At least one stop; sorted by `offset` internally.
   * @throws {TypeError} If `path` isn't a non-empty string, `stops` isn't a non-empty array,
   *   or two stop values at adjacent offsets aren't interpolatable (see `compose/interpolate`).
   * @throws {RangeError} If any stop's `offset` is outside `[0, 1]`.
   */
  constructor(path, stops) {
    if (typeof path !== 'string' || path.length === 0) {
      throw new TypeError(`GraphAnimKeyframe: path must be a non-empty string, received ${JSON.stringify(path)}.`);
    }
    if (!Array.isArray(stops) || stops.length === 0) {
      throw new TypeError(`GraphAnimKeyframe: stops must be a non-empty array, received ${JSON.stringify(stops)}.`);
    }
    const sorted = [...stops].sort((a, b) => a.offset - b.offset);
    for (const stop of sorted) {
      if (typeof stop.offset !== 'number' || stop.offset < 0 || stop.offset > 1) {
        throw new RangeError(
          `GraphAnimKeyframe: stop offsets must be within [0, 1], received ${JSON.stringify(stop.offset)}.`,
        );
      }
    }
    this.#path = path;
    this.#stops = sorted;
    this.#segments = [];
    for (let i = 0; i < sorted.length - 1; i++) {
      this.#segments.push({
        start: sorted[i].offset,
        end: sorted[i + 1].offset,
        fn: interpolate(sorted[i].value, sorted[i + 1].value),
      });
    }
  }

  /** @returns {string} The dot-path this track writes to. */
  get path() {
    return this.#path;
  }

  /**
   * The interpolated value at normalized progress `t`, clamped to `[0, 1]`
   * (values before the first stop or after the last hold at that stop's value).
   * @param {number} t
   * @returns {*}
   * @example track.valueAt(0.5);
   */
  valueAt(t) {
    const clamped = Math.max(0, Math.min(1, t));
    if (this.#segments.length === 0) return this.#stops[0].value;
    let segment = this.#segments[this.#segments.length - 1];
    for (const candidate of this.#segments) {
      if (clamped <= candidate.end) {
        segment = candidate;
        break;
      }
    }
    const span = segment.end - segment.start;
    const localT = span === 0 ? 1 : (clamped - segment.start) / span;
    return segment.fn(localT);
  }

  /**
   * Writes {@link valueAt}`(t)` onto `target` at this track's path.
   * @param {object} target
   * @param {number} t
   * @returns {this}
   * @example track.apply(mesh, 0.5);
   */
  apply(target, t) {
    setPath(target, this.#path, this.valueAt(t));
    return this;
  }
}
