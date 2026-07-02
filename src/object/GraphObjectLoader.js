import { GraphObject } from './GraphObject.js';
import { disposeObjectTree } from '../scene/index.js';

/**
 * Ref-counted per-format model cache: the network fetch + parse for a given
 * URL happens once; every caller gets its own clone of the resolved root, so
 * disposing one clone never affects another. Mirrors `GraphSceneEnvironment`'s
 * HDR ref-counting — the underlying root is only disposed once every
 * acquirer has released it.
 * @type {Map<string, Map<string, { root: THREE.Object3D|null, refCount: number, loadPromise: Promise<THREE.Object3D>|null }>>}
 */
const caches = { gltf: new Map(), obj: new Map(), fbx: new Map() };

/**
 * @param {Map<string, *>} cache
 * @param {string} key
 * @param {() => Promise<THREE.Object3D>} loadRoot
 * @returns {Promise<THREE.Object3D>}
 */
async function acquire(cache, key, loadRoot) {
  let entry = cache.get(key);
  if (entry) {
    entry.refCount++;
    return entry.loadPromise ?? entry.root;
  }
  entry = { root: null, refCount: 1, loadPromise: null };
  cache.set(key, entry);
  entry.loadPromise = loadRoot()
    .then((root) => {
      entry.root = root;
      entry.loadPromise = null;
      return root;
    })
    .catch((err) => {
      cache.delete(key);
      throw err;
    });
  return entry.loadPromise;
}

/** @param {Map<string, *>} cache @param {string} key */
function release(cache, key) {
  const entry = cache.get(key);
  if (!entry) return;
  entry.refCount--;
  if (entry.refCount <= 0) {
    if (entry.root) disposeObjectTree(entry.root);
    cache.delete(key);
  }
}

// ── Draco / KTX2 (configured lazily — see configureDracoDecoder/configureKTX2Transcoder) ──

let dracoDecoderPath = null;
let dracoLoaderPromise = null;

function getDracoLoader() {
  if (!dracoDecoderPath) return null;
  dracoLoaderPromise ??= (async () => {
    const { DRACOLoader } = await import('three/examples/jsm/loaders/DRACOLoader.js');
    const loader = new DRACOLoader();
    loader.setDecoderPath(dracoDecoderPath);
    return loader;
  })();
  return dracoLoaderPromise;
}

let ktx2TranscoderPath = null;
let ktx2Renderer = null;
let ktx2LoaderPromise = null;

function getKTX2Loader() {
  if (!ktx2TranscoderPath || !ktx2Renderer) return null;
  ktx2LoaderPromise ??= (async () => {
    const { KTX2Loader } = await import('three/examples/jsm/loaders/KTX2Loader.js');
    const loader = new KTX2Loader();
    loader.setTranscoderPath(ktx2TranscoderPath);
    loader.detectSupport(ktx2Renderer);
    return loader;
  })();
  return ktx2LoaderPromise;
}

// ── Per-format root loaders ──────────────────────────────────────────────────

/** @param {string} url @returns {Promise<THREE.Object3D>} */
async function loadGLTFRoot(url) {
  const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
  const gltfLoader = new GLTFLoader();

  const dracoLoader = await getDracoLoader();
  if (dracoLoader) gltfLoader.setDRACOLoader(dracoLoader);

  const ktx2Loader = await getKTX2Loader();
  if (ktx2Loader) gltfLoader.setKTX2Loader(ktx2Loader);

  const gltf = await new Promise((resolve, reject) => gltfLoader.load(url, resolve, undefined, reject));
  return gltf.scene;
}

/** @param {string} url @param {string|null} mtlUrl @returns {Promise<THREE.Object3D>} */
async function loadOBJRoot(url, mtlUrl) {
  const { OBJLoader } = await import('three/examples/jsm/loaders/OBJLoader.js');
  const objLoader = new OBJLoader();

  if (mtlUrl) {
    const { MTLLoader } = await import('three/examples/jsm/loaders/MTLLoader.js');
    const materials = await new Promise((resolve, reject) =>
      new MTLLoader().load(mtlUrl, resolve, undefined, reject),
    );
    materials.preload();
    objLoader.setMaterials(materials);
  }

  return new Promise((resolve, reject) => objLoader.load(url, resolve, undefined, reject));
}

/** @param {string} url @returns {Promise<THREE.Object3D>} */
async function loadFBXRoot(url) {
  const { FBXLoader } = await import('three/examples/jsm/loaders/FBXLoader.js');
  return new Promise((resolve, reject) => new FBXLoader().load(url, resolve, undefined, reject));
}

/**
 * A `GraphObject` produced by `GraphObjectLoader`. Its `three` is an
 * independent clone of the cached, ref-counted template root — `dispose()`
 * releases this clone's reference and only disposes the shared
 * geometry/material once every other clone of the same URL has too.
 */
class LoadedGraphObject extends GraphObject {
  /** @type {() => void} */
  #onDispose;

  /** @type {boolean} */
  #disposed = false;

  /** @param {{ scene: THREE.Scene, name: string, three: THREE.Object3D, onDispose: () => void }} options */
  constructor({ scene, name, three, onDispose }) {
    super({ scene, name, three });
    this.#onDispose = onDispose;
  }

  dispose() {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#onDispose();
    super.dispose();
  }
}

/**
 * Clone the resolved template and wrap it as a `LoadedGraphObject`.
 * @param {Map<string, *>} cache
 * @param {string} key
 * @param {() => Promise<THREE.Object3D>} loadRoot
 * @param {{ scene: THREE.Scene, name: string }} options
 * @returns {Promise<GraphObject>}
 */
async function load(cache, key, loadRoot, { scene, name } = {}) {
  const root = await acquire(cache, key, loadRoot);
  const { clone } = await import('three/examples/jsm/utils/SkeletonUtils.js');
  const three = clone(root);
  return new LoadedGraphObject({ scene, name, three, onDispose: () => release(cache, key) });
}

/** @param {string} method @param {string} url @throws {TypeError} */
function assertUrl(method, url) {
  if (typeof url !== 'string' || url.length === 0) {
    throw new TypeError(`GraphObjectLoader.${method}: url must be a non-empty string, received ${JSON.stringify(url)}.`);
  }
}

/**
 * Loads GLTF/GLB, OBJ, and FBX models into `GraphObject`s.
 *
 * Every `loadX(url)` call for a URL already in flight or already loaded
 * shares the same network fetch + parse (ref-counted, per format) — each
 * call still returns its own independently-positionable,
 * independently-disposable clone.
 *
 * Draco/KTX2 decoding requires `configureDracoDecoder`/
 * `configureKTX2Transcoder` to be called first — this package does not bundle
 * decoder/transcoder binaries, since the correct path depends on how the
 * consuming app hosts them. Without configuration, GLTFLoader throws its own
 * clear error if a file actually needs one of them.
 *
 * @example
 * const model = await GraphObjectLoader.loadGLTF('/models/tree.glb', { scene, name: 'tree' });
 * @example
 * const model = await GraphObjectLoader.loadOBJ('/models/chair.obj', '/models/chair.mtl', { scene, name: 'chair' });
 */
export class GraphObjectLoader {
  /**
   * Configure the Draco decoder path used by `loadGLTF` for
   * Draco-compressed meshes. Takes effect on the next `loadGLTF` call.
   * @param {string} path - Directory containing `draco_decoder.wasm`/`draco_wasm_wrapper.js`.
   * @throws {TypeError} If `path` is not a non-empty string.
   * @example GraphObjectLoader.configureDracoDecoder('/decoders/draco/');
   */
  static configureDracoDecoder(path) {
    if (typeof path !== 'string' || path.length === 0) {
      throw new TypeError(
        `GraphObjectLoader.configureDracoDecoder: path must be a non-empty string, received ${JSON.stringify(path)}.`,
      );
    }
    dracoDecoderPath = path;
    dracoLoaderPromise = null;
  }

  /**
   * Configure the KTX2 transcoder path and renderer used by `loadGLTF` for
   * Basis Universal (KTX2) compressed textures. Takes effect on the next
   * `loadGLTF` call.
   * @param {string} path - Directory containing the Basis transcoder files.
   * @param {THREE.WebGLRenderer} renderer - Used to detect supported GPU texture formats.
   * @throws {TypeError} If `path` is not a non-empty string, or `renderer` looks invalid.
   * @example GraphObjectLoader.configureKTX2Transcoder('/decoders/basis/', renderer);
   */
  static configureKTX2Transcoder(path, renderer) {
    if (typeof path !== 'string' || path.length === 0) {
      throw new TypeError(
        `GraphObjectLoader.configureKTX2Transcoder: path must be a non-empty string, received ${JSON.stringify(path)}.`,
      );
    }
    if (!renderer || typeof renderer !== 'object' || !renderer.domElement) {
      throw new TypeError(
        'GraphObjectLoader.configureKTX2Transcoder: renderer must be a THREE.WebGLRenderer instance.',
      );
    }
    ktx2TranscoderPath = path;
    ktx2Renderer = renderer;
    ktx2LoaderPromise = null;
  }

  /**
   * Load a GLTF/GLB model.
   * @param {string} url
   * @param {{ scene: THREE.Scene, name: string }} options
   * @returns {Promise<GraphObject>}
   * @throws {TypeError} If `url` is not a non-empty string.
   * @throws {Error} If the file cannot be loaded or parsed.
   * @example await GraphObjectLoader.loadGLTF('/models/tree.glb', { scene, name: 'tree' });
   */
  static async loadGLTF(url, options = {}) {
    assertUrl('loadGLTF', url);
    return load(caches.gltf, url, () => loadGLTFRoot(url), options);
  }

  /**
   * Load an OBJ model, optionally with its companion MTL material file.
   * @param {string} url
   * @param {string|null} [mtlUrl] - URL of a `.mtl` file, or omit for the OBJ's default material.
   * @param {{ scene: THREE.Scene, name: string }} options
   * @returns {Promise<GraphObject>}
   * @throws {TypeError} If `url` is not a non-empty string, or `mtlUrl` is provided but not a non-empty string.
   * @throws {Error} If the file cannot be loaded or parsed.
   * @example await GraphObjectLoader.loadOBJ('/models/chair.obj', '/models/chair.mtl', { scene, name: 'chair' });
   */
  static async loadOBJ(url, mtlUrl = null, options = {}) {
    assertUrl('loadOBJ', url);
    if (mtlUrl !== null && mtlUrl !== undefined) {
      if (typeof mtlUrl !== 'string' || mtlUrl.length === 0) {
        throw new TypeError(
          `GraphObjectLoader.loadOBJ: mtlUrl must be a non-empty string when provided, received ${JSON.stringify(mtlUrl)}.`,
        );
      }
    }
    const key = mtlUrl ? `${url}::${mtlUrl}` : url;
    return load(caches.obj, key, () => loadOBJRoot(url, mtlUrl), options);
  }

  /**
   * Load an FBX model.
   * @param {string} url
   * @param {{ scene: THREE.Scene, name: string }} options
   * @returns {Promise<GraphObject>}
   * @throws {TypeError} If `url` is not a non-empty string.
   * @throws {Error} If the file cannot be loaded or parsed.
   * @example await GraphObjectLoader.loadFBX('/models/robot.fbx', { scene, name: 'robot' });
   */
  static async loadFBX(url, options = {}) {
    assertUrl('loadFBX', url);
    return load(caches.fbx, url, () => loadFBXRoot(url), options);
  }
}
