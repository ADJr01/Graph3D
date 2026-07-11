// core/Graph3DLoop's shared singleton touches `document`/RAF unconditionally
// at import time (page-visibility pause wiring) even though this bench never
// creates a real DOM element — plain Node has neither global. Minimal stubs,
// not a jsdom environment (KISS: only the two APIs Graph3DLoop touches).
// Must be imported first — ESM evaluates a module's own imports, in listed
// order, before its later statements run, so this has to be the first import
// in any bench file that (transitively) imports chart/ or anim/.
if (typeof globalThis.document === 'undefined') {
  globalThis.document = { hidden: false, addEventListener() {}, removeEventListener() {} };
}
if (typeof globalThis.requestAnimationFrame === 'undefined') {
  globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 16);
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
}
