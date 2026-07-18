import * as THREE from 'three';
import { loop } from '../../core/Graph3DLoop.js';
import { resolveBillboardTarget, assertPositiveFiniteNumber, buildTexturedPlane } from '../billboardTarget.js';

const DEFAULT_WIDTH = 0.6;
const DEFAULT_HEIGHT = 0.6;
const DEFAULT_OFFSET = { x: 0, y: 0, z: 0 };

/** @param {*} offset @returns {{x:number,y:number,z:number}} @throws {TypeError} */
function resolveOffset(offset) {
  const resolved = typeof offset === 'function' ? offset() : offset;
  if (
    !resolved ||
    !Number.isFinite(resolved.x ?? 0) ||
    !Number.isFinite(resolved.y ?? 0) ||
    !Number.isFinite(resolved.z ?? 0)
  ) {
    throw new TypeError(`graphIcon: options.offset must resolve to a finite {x,y,z}, received ${JSON.stringify(resolved)}.`);
  }
  return { x: resolved.x ?? 0, y: resolved.y ?? 0, z: resolved.z ?? 0 };
}

/**
 * Attaches a camera-billboarded image (PNG, JPG, or SVG — anything
 * `THREE.TextureLoader` can load, including a `data:` URI) to any targeted
 * object. Built the same way as `text/GraphHTML.js`'s billboard plane
 * (`resolveBillboardTarget`/`buildTexturedPlane`, extracted to
 * `material/billboardTarget.js` for this exact reuse), but for a plain
 * image instead of rasterized HTML — `graphHTML`'s HTML-in-Canvas path is
 * Chrome-experimental-only and its universal fallback strips markup down to
 * plain text, so it cannot reliably show an arbitrary icon; `graphIcon`
 * shows the same `src` in every browser.
 *
 * Unlike `graphHTML`, `graphIcon` re-resolves its target's position every
 * frame by default (`options.follow`, default `true`) instead of snapshotting
 * it once — needed so an icon pinned to an instanced chart bar keeps riding
 * the bar's top through a `chart.update()` transition, not just at the
 * moment `graphIcon()` was called. `options.offset` may also be a callback
 * (re-evaluated every frame alongside the target position when `follow` is
 * on) for the same reason: a bar's "top" offset changes as its height
 * animates. `graphIcon` has no idea what "bar top" means — it only calls
 * `offset()` again, so the caller supplies that meaning (see `@example`).
 *
 * Fire-and-forget, mirroring `graphHTML`'s pattern: the returned handle
 * exists synchronously, but `.mesh` is `null` until `.ready` resolves.
 * Calling `.dispose()` before `.ready` resolves is safe — the in-flight
 * build is discarded instead of added to the scene. There is no fallback
 * path (unlike `graphHTML`'s SDFText fallback) — a failed image load
 * rejects `.ready` instead of silently substituting a placeholder.
 *
 * @param {GraphMesh|{object: GraphInstancedObject, index: number}|{scene: THREE.Scene, position: {x:number,y:number,z:number}}} target
 *   A mesh, one instance of an instanced object, or an explicit scene+position pair.
 * @param {{
 *   src: string,
 *   camera: THREE.Camera,
 *   width?: number,
 *   height?: number,
 *   offset?: ({x?:number,y?:number,z?:number}|(() => {x?:number,y?:number,z?:number})),
 *   follow?: boolean,
 * }} options `width`/`height` default to `0.6`/`0.6` world units. `offset` defaults to
 *   `{x:0,y:0,z:0}` and may be a callback re-evaluated every frame while `follow` is `true`.
 *   `follow` defaults to `true` — re-resolves `target`'s position every frame; set `false`
 *   to snapshot the position once (cheaper for a target that never moves).
 * @returns {{ type: 'graphIcon', mesh: (THREE.Mesh|null), ready: Promise<void>, dispose: () => void }}
 * @throws {TypeError} If `target` doesn't match a recognized shape, or resolves to no
 *   `THREE.Scene` (a `GraphMesh`/instanced object that hasn't been added to a scene yet).
 * @throws {TypeError} If `options.src` isn't a string, `options.camera` isn't a `THREE.Camera`,
 *   `width`/`height` aren't positive finite numbers, or `options.offset` doesn't resolve to a
 *   finite `{x,y,z}`.
 * @example
 * const bars = chart.selection().nodes(); \ instanced bars
 * bars.forEach((bar, i) => graphIcon(bar, { src: '/icons/btc.svg', camera: scene.camera.three }));
 * @example
 * // Ride an animating instanced bar's live top:
 * graphIcon(
 *   { object: bars, index: i },
 *   { src: coinIconUrl, camera, offset: () => ({ y: bars.getInstanceScale(i).y / 2 + 0.15 }) },
 * );
 */
export function graphIcon(target, options = {}) {
  if (options === null || typeof options !== 'object') {
    throw new TypeError(`graphIcon: options must be a plain object, received ${JSON.stringify(options)}.`);
  }
  const { src, camera, width = DEFAULT_WIDTH, height = DEFAULT_HEIGHT, offset = DEFAULT_OFFSET, follow = true } = options;
  if (typeof src !== 'string') {
    throw new TypeError(`graphIcon: options.src must be a string, received ${JSON.stringify(src)}.`);
  }
  if (!(camera instanceof THREE.Camera)) {
    throw new TypeError(`graphIcon: options.camera must be a THREE.Camera instance, received ${JSON.stringify(camera)}.`);
  }
  assertPositiveFiniteNumber('width', width);
  assertPositiveFiniteNumber('height', height);
  if (typeof offset !== 'function') resolveOffset(offset);

  const { position: initialPosition, scene } = resolveBillboardTarget(target);

  let disposed = false;
  const handle = {
    type: 'graphIcon',
    mesh: null,
    ready: null,
    dispose() {
      if (disposed) return;
      disposed = true;
      loop.remove(tick);
      if (handle.mesh) {
        scene.remove(handle.mesh);
        handle.mesh.geometry.dispose();
        handle.mesh.material.dispose();
        handle.mesh.material.map.dispose();
      }
      handle.mesh = null;
    },
  };

  function tick() {
    if (!handle.mesh) return;
    handle.mesh.quaternion.copy(camera.quaternion);
    if (follow) {
      const { position } = resolveBillboardTarget(target);
      const o = resolveOffset(offset);
      handle.mesh.position.set(position.x + o.x, position.y + o.y, position.z + o.z);
    }
  }

  handle.ready = new Promise((resolve, reject) => {
    new THREE.TextureLoader().load(
      src,
      (texture) => {
        if (disposed) {
          texture.dispose();
          resolve();
          return;
        }
        const mesh = buildTexturedPlane(texture, width, height);
        const o = resolveOffset(offset);
        mesh.position.set(initialPosition.x + o.x, initialPosition.y + o.y, initialPosition.z + o.z);
        scene.add(mesh);
        handle.mesh = mesh;
        loop.add(tick);
        tick();
        resolve();
      },
      undefined,
      (error) => {
        reject(new Error(`graphIcon: failed to load options.src (${JSON.stringify(src)}): ${error?.message ?? error}`));
      },
    );
  });

  return handle;
}
