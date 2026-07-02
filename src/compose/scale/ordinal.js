/**
 * Creates an ordinal scale: maps discrete domain values to range values by
 * position. Querying a value not yet in the domain appends it and assigns
 * the next range slot (cycling via modulo once the range is exhausted) —
 * the standard implicit-domain behavior used for categorical color scales.
 * @returns {{
 *   (value: *): *,
 *   domain: (arr?: Array) => (Array|object),
 *   range: (arr?: Array) => (Array|object),
 *   copy: () => object,
 * }}
 * @example
 * const s = scale.ordinal().range(['red', 'green', 'blue']);
 * s('a'); // 'red'
 * s('b'); // 'green'
 */
export function ordinal() {
  let domainArr = [];
  let index = new Map();
  let rangeArr = [];

  function scale(value) {
    let i = index.get(value);
    if (i === undefined) {
      i = domainArr.push(value) - 1;
      index.set(value, i);
    }
    return rangeArr[i % rangeArr.length];
  }

  /**
   * Get (no args) or set (chainable) the explicit domain. Setting replaces
   * any values learned implicitly through prior `scale(value)` calls.
   * @param {Array} [arr]
   * @returns {Array|object}
   */
  scale.domain = function (arr) {
    if (arguments.length === 0) return domainArr.slice();
    domainArr = [];
    index = new Map();
    for (const value of arr) {
      if (index.has(value)) continue;
      index.set(value, domainArr.push(value) - 1);
    }
    return scale;
  };

  /**
   * Get (no args) or set (chainable) the range values cycled through by domain index.
   * @param {Array} [arr]
   * @returns {Array|object}
   */
  scale.range = function (arr) {
    if (arguments.length === 0) return rangeArr.slice();
    rangeArr = arr.slice();
    return scale;
  };

  /**
   * An independent clone with the same domain/range state.
   * @returns {object}
   */
  scale.copy = function () {
    return ordinal().domain(domainArr).range(rangeArr);
  };

  return scale;
}
