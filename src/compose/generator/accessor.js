/**
 * Wraps a constant value or a `(datum, index) => value` accessor function
 * into a uniform `(datum, index) => value` callable — the standard
 * D3-generator idiom (`d3.functor`) used by every chainable field (`x`,
 * `y`, `size`, ...) across the generator layer (CLAUDE.md §1.1 DRY — one
 * place to resolve "constant or function", not re-implemented per generator).
 * @param {*} valueOrFn A constant, or a `(datum: *, index: number) => value` function.
 * @returns {(datum: *, index: number) => *}
 * @example accessor(5)({}, 0); // 5
 * @example accessor((d) => d.x)({ x: 3 }, 0); // 3
 */
export function accessor(valueOrFn) {
  return typeof valueOrFn === 'function' ? valueOrFn : () => valueOrFn;
}

/**
 * Attaches one D3-style chainable get/set field to `target` — e.g.
 * `bar.x = accessorField(bar, (d, i) => i)` makes `bar.x()` return the
 * current resolved accessor and `bar.x(5)`/`bar.x(d => d.value)` set it and
 * return `target` for chaining. Every generator's field methods (`x`, `y`,
 * `width`, `depth`, `baseline`, ...) share this exact shape, so it's
 * factored once here rather than hand-written per field per generator
 * (CLAUDE.md §1.1 DRY — two-strike rule: `bar()` alone needs it 5 times).
 * @param {object} target The chainable object to return from the setter.
 * @param {*} initial Initial constant or `(datum, index) => value` accessor.
 * @returns {(valueOrFn?: *) => (((datum: *, index: number) => *)|object)}
 * @example
 * const bar = {};
 * bar.width = accessorField(bar, 0.8);
 * bar.width(0.5); // returns `bar`
 * bar.width()({}, 0); // 0.5
 */
export function accessorField(target, initial) {
  let current = accessor(initial);
  return function (valueOrFn) {
    if (arguments.length === 0) return current;
    current = accessor(valueOrFn);
    return target;
  };
}
