/**
 * Module-level singleton registry of all live Graph3D instances.
 * Enables page-wide lifecycle control (dispose, pause, resume) and
 * provides a stable HMR teardown hook via `panicDispose`.
 *
 * @example
 * import { registry } from './Graph3DRegistry.js';
 * registry.register(myGraph);
 * // later:
 * registry.disposeAll();
 */
export class Graph3DRegistry {
  /** @type {Set<object>} */
  #instances = new Set();

  /**
   * Register a Graph3D instance. No-op if already registered.
   *
   * @param {object} instance - A live Graph3D instance.
   * @throws {TypeError} If `instance` is not an object.
   * @example registry.register(graph);
   */
  register(instance) {
    if (instance === null || typeof instance !== 'object') {
      throw new TypeError(
        `Graph3DRegistry.register: expected an object, received ${instance === null ? 'null' : typeof instance}.`,
      );
    }
    this.#instances.add(instance);
  }

  /**
   * Unregister a Graph3D instance. No-op if not registered.
   *
   * @param {object} instance - The instance to remove.
   * @example registry.unregister(graph);
   */
  unregister(instance) {
    this.#instances.delete(instance);
  }

  /**
   * Return a snapshot array of all currently registered instances.
   *
   * @returns {object[]} Live instances in registration order.
   * @example const all = registry.all();
   */
  all() {
    return [...this.#instances];
  }

  /**
   * Call `dispose()` on every registered instance, then clear the registry.
   * Instances are disposed in reverse-registration order to respect
   * typical parent-before-child teardown patterns.
   *
   * @throws {Error} Re-throws the first disposal error after attempting all disposals.
   * @example registry.disposeAll();
   */
  disposeAll() {
    const instances = [...this.#instances].reverse();
    this.#instances.clear();
    let firstError = null;
    for (const inst of instances) {
      try {
        inst.dispose?.();
      } catch (err) {
        if (firstError === null) firstError = err;
        console.error('Graph3DRegistry.disposeAll: disposal error on instance', inst, err);
      }
    }
    if (firstError !== null) throw firstError;
  }

  /**
   * Call `pause()` on every registered instance that implements it.
   *
   * @example registry.pauseAll();
   */
  pauseAll() {
    for (const inst of this.#instances) inst.pause?.();
  }

  /**
   * Call `resume()` on every registered instance that implements it.
   *
   * @example registry.resumeAll();
   */
  resumeAll() {
    for (const inst of this.#instances) inst.resume?.();
  }

  /**
   * Emergency teardown for HMR scenarios. Disposes every instance
   * without re-throwing — errors are swallowed and logged so the HMR
   * replacement module can mount cleanly regardless of prior state.
   * Clears the registry even if individual disposals fail.
   *
   * @example
   * // vite HMR hook
   * if (import.meta.hot) {
   *   import.meta.hot.dispose(() => registry.panicDispose());
   * }
   */
  panicDispose() {
    for (const inst of this.#instances) {
      try {
        inst.dispose?.();
      } catch (err) {
        // ponytail: swallow intentionally — panic path must not throw; HMR would abort
        console.error('Graph3DRegistry.panicDispose: swallowed disposal error', err);
      }
    }
    this.#instances.clear();
  }
}

/** Shared singleton — one registry per page. */
export const registry = new Graph3DRegistry();
