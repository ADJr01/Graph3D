import { describe, it, expect, vi, afterEach } from 'vitest';
import * as THREE from 'three';
import { GraphDevTools } from '../../src/core/GraphDevTools.js';
import { GraphInstancedObject } from '../../src/object/GraphInstancedObject.js';
import { GraphMesh } from '../../src/object/GraphMesh.js';
import { Selection } from '../../src/compose/selection/Selection.js';
import { anim } from '../../src/anim/GraphAnim.js';

function makeGraph3d({ withScene = true, withRenderer = true } = {}) {
  const three = new THREE.Scene();
  three.name = 'main';
  const camera = new THREE.PerspectiveCamera();
  const activeScene = withScene ? { name: 'main', three, camera: { three: camera } } : null;
  const renderer = withRenderer
    ? { three: { info: { memory: { geometries: 3, textures: 2 }, render: { calls: 5, triangles: 100, points: 0, lines: 0 } } } }
    : { three: null };
  return { activeScene, renderer };
}

function makeInstanced(count = 4) {
  return new GraphInstancedObject({
    scene: new THREE.Scene(),
    name: 'bars',
    geometry: new THREE.BoxGeometry(),
    material: new THREE.MeshBasicMaterial(),
    count,
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

// ── dumpSceneGraph ────────────────────────────────────────────────────────────

describe('GraphDevTools.dumpSceneGraph', () => {
  it('throws when no scene is active and none is given', () => {
    const devtools = new GraphDevTools(makeGraph3d({ withScene: false }));
    expect(() => devtools.dumpSceneGraph()).toThrow(/no active scene/);
  });

  it('returns a tree matching the scene structure', () => {
    const graph3d = makeGraph3d();
    graph3d.activeScene.three.name = 'main';
    const child = new THREE.Object3D();
    child.name = 'bar_0';
    graph3d.activeScene.three.add(child);

    const devtools = new GraphDevTools(graph3d);
    const tree = devtools.dumpSceneGraph();
    expect(tree.name).toBe('main');
    expect(tree.children).toHaveLength(1);
    expect(tree.children[0]).toMatchObject({ name: 'bar_0', visible: true });
  });

  it('logs the tree to the console', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const devtools = new GraphDevTools(makeGraph3d());
    devtools.dumpSceneGraph();
    expect(logSpy).toHaveBeenCalled();
  });
});

// ── listActiveTimelines ───────────────────────────────────────────────────────

describe('GraphDevTools.listActiveTimelines', () => {
  it('returns an entry per registered timeline on the shared anim engine', () => {
    const tableSpy = vi.spyOn(console, 'table').mockImplementation(() => {});
    const tl = anim.timeline({ x: 0 }).to({ x: 1 }, { duration: 1 }).play();
    try {
      const devtools = new GraphDevTools(makeGraph3d());
      const list = devtools.listActiveTimelines();
      expect(list).toContainEqual({ isPlaying: true, time: 0, duration: 1 });
      expect(tableSpy).toHaveBeenCalled();
    } finally {
      anim.remove(tl);
    }
  });
});

// ── memorySnapshot ────────────────────────────────────────────────────────────

describe('GraphDevTools.memorySnapshot', () => {
  it('reads counts from renderer.info', () => {
    const devtools = new GraphDevTools(makeGraph3d());
    expect(devtools.memorySnapshot()).toEqual({
      geometries: 3,
      textures: 2,
      calls: 5,
      triangles: 100,
      points: 0,
      lines: 0,
    });
  });

  it('throws when there is no browser renderer (SSR)', () => {
    const devtools = new GraphDevTools(makeGraph3d({ withRenderer: false }));
    expect(() => devtools.memorySnapshot()).toThrow(/no browser renderer/);
  });
});

// ── pickingDebugOverlay ───────────────────────────────────────────────────────

describe('GraphDevTools.pickingDebugOverlay', () => {
  it('returns null and logs when there is no hit', () => {
    const graph3d = makeGraph3d();
    const devtools = new GraphDevTools(graph3d);
    expect(devtools.pickingDebugOverlay(null)).toBeNull();
    expect(graph3d.activeScene.three.children).toHaveLength(0);
  });

  it('adds a marker at the hit world point', () => {
    const graph3d = makeGraph3d();
    const devtools = new GraphDevTools(graph3d);
    const marker = devtools.pickingDebugOverlay({
      worldPoint: new THREE.Vector3(1, 2, 3),
      instanceIndex: 0,
      datum: { value: 42 },
    });
    expect(marker.position).toEqual(new THREE.Vector3(1, 2, 3));
    expect(graph3d.activeScene.three.children).toContain(marker);
  });

  it('throws when no scene is active', () => {
    const devtools = new GraphDevTools(makeGraph3d({ withScene: false }));
    expect(() => devtools.pickingDebugOverlay(null)).toThrow(/no active scene/);
  });
});

// ── frustumDebugOverlay ───────────────────────────────────────────────────────

describe('GraphDevTools.frustumDebugOverlay', () => {
  it('adds a CameraHelper for the active scene camera by default', () => {
    const graph3d = makeGraph3d();
    const devtools = new GraphDevTools(graph3d);
    const helper = devtools.frustumDebugOverlay();
    expect(helper).toBeInstanceOf(THREE.CameraHelper);
    expect(graph3d.activeScene.three.children).toContain(helper);
  });

  it('uses an explicitly given camera instead of the scene default', () => {
    const graph3d = makeGraph3d();
    const otherCamera = new THREE.PerspectiveCamera();
    const devtools = new GraphDevTools(graph3d);
    const helper = devtools.frustumDebugOverlay(otherCamera);
    expect(helper.camera).toBe(otherCamera);
  });
});

// ── octreeDebugOverlay ────────────────────────────────────────────────────────

describe('GraphDevTools.octreeDebugOverlay', () => {
  it('throws for a non-GraphInstancedObject argument', () => {
    const devtools = new GraphDevTools(makeGraph3d());
    expect(() => devtools.octreeDebugOverlay({})).toThrow(TypeError);
  });

  it('adds one Box3Helper per populated octree leaf', () => {
    const graph3d = makeGraph3d();
    const obj = makeInstanced(2);
    obj.setInstancePosition(0, 5, 5, 5);
    const devtools = new GraphDevTools(graph3d);
    const group = devtools.octreeDebugOverlay(obj);
    expect(group.children.length).toBeGreaterThan(0);
    for (const child of group.children) expect(child).toBeInstanceOf(THREE.Box3Helper);
    expect(graph3d.activeScene.three.children).toContain(group);
  });
});

// ── selectionDebugOverlay ─────────────────────────────────────────────────────

describe('GraphDevTools.selectionDebugOverlay', () => {
  it('throws for a non-Selection argument', () => {
    const devtools = new GraphDevTools(makeGraph3d());
    expect(() => devtools.selectionDebugOverlay({})).toThrow(TypeError);
  });

  it('logs backend type and indices, and adds one marker per member (instanced backend)', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const graph3d = makeGraph3d();
    const obj = makeInstanced(3);
    obj.setInstancePosition(0, 1, 0, 0);
    obj.setInstancePosition(1, 2, 0, 0);
    obj.setInstanceUserData(0, { value: 1 });
    obj.setInstanceUserData(1, { value: 2 });
    const selection = new Selection({ type: 'instanced', object: obj, indices: Uint32Array.from([0, 1]) });

    const devtools = new GraphDevTools(graph3d);
    const group = devtools.selectionDebugOverlay(selection);

    expect(group.children).toHaveLength(2);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('backend=instanced size=2 indices=[0, 1]'));
  });

  it('adds one marker per member (meshes backend)', () => {
    const graph3d = makeGraph3d();
    const mesh = new GraphMesh({
      scene: graph3d.activeScene.three,
      name: 'mesh_0',
      geometry: new THREE.BoxGeometry(),
      material: new THREE.MeshBasicMaterial(),
    });
    mesh.setUserData('datum', { value: 1 });
    mesh.setPosition(4, 5, 6);
    const selection = new Selection({ type: 'meshes', meshes: [mesh] });

    const devtools = new GraphDevTools(graph3d);
    const group = devtools.selectionDebugOverlay(selection);
    expect(group.children).toHaveLength(1);
    expect(group.children[0].position.x).toBeCloseTo(4);
  });
});
