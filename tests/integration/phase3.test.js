import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { GraphInstancedObject } from '../../src/object/GraphInstancedObject.js';
import { GraphObjectFactory, INSTANCING_THRESHOLD } from '../../src/object/GraphObjectFactory.js';
import { GraphMesh } from '../../src/object/GraphMesh.js';
import { Octree } from '../../src/object/Octree.js';

/**
 * Integration tests for Phase 3 (Object & Mesh), covering the exit criteria
 * from prompts.md Prompt 52:
 * (a) 1M instance create+dispose leak-free, (b) instance picking correct for
 * known positions, (c) octree matches brute-force on 10K points, (d) capacity
 * grow preserves all attributes, (e) <=50 -> meshes / >50 -> InstancedObject
 * boundary honored.
 */

// ── (a) 1M instance create+dispose leak-free ─────────────────────────────────

describe('Phase 3 / (a) 1M instance create+dispose', () => {
  it('constructs and disposes a 1,000,000-instance batch without throwing or leaking', () => {
    const scene = new THREE.Scene();
    const obj = new GraphInstancedObject({
      scene,
      name: 'million',
      geometry: new THREE.SphereGeometry(0.1, 3, 2),
      material: new THREE.MeshBasicMaterial(),
      count: 1_000_000,
    });
    expect(obj.three.count).toBe(1_000_000);

    const geometrySpy = vi.spyOn(obj.three.geometry, 'dispose');
    const materialSpy = vi.spyOn(obj.three.material, 'dispose');
    const disposeListener = vi.fn();
    obj.three.addEventListener('dispose', disposeListener);

    obj.dispose();

    expect(geometrySpy).toHaveBeenCalledOnce();
    expect(materialSpy).toHaveBeenCalledOnce();
    expect(disposeListener).toHaveBeenCalledOnce();
    expect(scene.children.length).toBe(0);

    // Idempotent — a second dispose must not re-release already-freed GPU resources.
    obj.dispose();
    expect(geometrySpy).toHaveBeenCalledOnce();
    expect(materialSpy).toHaveBeenCalledOnce();
  }, 20_000);
});

// ── (b) instance picking correct for known positions ─────────────────────────

describe('Phase 3 / (b) instance picking at known positions', () => {
  it('picks the correct instance out of 1,000 laid out on a known grid', () => {
    const scene = new THREE.Scene();
    const count = 1_000;
    const obj = new GraphInstancedObject({
      scene,
      name: 'grid',
      geometry: new THREE.BoxGeometry(1, 1, 1),
      material: new THREE.MeshBasicMaterial(),
      count,
    });

    // A known 10x10x10 grid, 2 units apart — index i sits at (x, y, z) below.
    const positions = [];
    for (let i = 0; i < count; i++) {
      const x = (i % 10) * 2;
      const y = (Math.floor(i / 10) % 10) * 2;
      const z = Math.floor(i / 100) * 2;
      positions.push([x, y, z]);
      obj.setInstanceMatrix(i, new THREE.Matrix4().makeTranslation(x, y, z));
    }
    obj.commitMatrix();

    // Every (x, y) column holds 10 boxes 2 units apart along z, so the ray
    // must start just outside the target box's own face (0.5 half-extent)
    // rather than far away — starting far would cross whichever box in the
    // same column is nearest the ray origin first, not necessarily the target.
    for (const index of [0, 42, 250, 731, 999]) {
      const [x, y, z] = positions[index];
      const raycaster = new THREE.Raycaster();
      raycaster.set(new THREE.Vector3(x, y, z + 0.6), new THREE.Vector3(0, 0, -1));
      expect(obj.pick(raycaster)).toBe(index);
    }

    // A ray through empty space between grid cells hits nothing.
    const miss = new THREE.Raycaster();
    miss.set(new THREE.Vector3(1, 1, 5), new THREE.Vector3(0, 0, -1));
    expect(obj.pick(miss)).toBeNull();

    obj.dispose();
  });
});

// ── (c) octree matches brute-force on 10K points ─────────────────────────────

/** Deterministic PRNG (mulberry32) so the 10K-point fixture is reproducible. */
function makeRng(seed) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function bruteForceQuery(points, boxTest, sphereTest) {
  const results = [];
  for (const { id, position, radius } of points) {
    if (sphereTest(new THREE.Sphere(position, radius))) results.push(id);
  }
  return results;
}

describe('Phase 3 / (c) octree matches brute-force on 10K points', () => {
  const rng = makeRng(1234);
  const bounds = new THREE.Box3(new THREE.Vector3(-100, -100, -100), new THREE.Vector3(100, 100, 100));
  const points = [];
  const octree = new Octree({ bounds });
  for (let i = 0; i < 10_000; i++) {
    const position = new THREE.Vector3(
      (rng() * 2 - 1) * 90,
      (rng() * 2 - 1) * 90,
      (rng() * 2 - 1) * 90,
    );
    const radius = rng() * 0.5;
    points.push({ id: i, position, radius });
    octree.insert(i, position, radius);
  }

  it('queryRadius matches a brute-force sphere scan', () => {
    const center = new THREE.Vector3(10, -5, 20);
    const radius = 15;
    const expected = bruteForceQuery(points, null, (s) => new THREE.Sphere(center, radius).intersectsSphere(s)).sort(
      (a, b) => a - b,
    );
    const actual = octree.queryRadius(center, radius).sort((a, b) => a - b);
    expect(actual).toEqual(expected);
  });

  it('queryRay matches a brute-force ray scan', () => {
    const ray = new THREE.Ray(new THREE.Vector3(-100, 3, 3), new THREE.Vector3(1, 0, 0));
    const expected = bruteForceQuery(points, null, (s) => ray.intersectsSphere(s)).sort((a, b) => a - b);
    const actual = octree.queryRay(ray).sort((a, b) => a - b);
    expect(actual).toEqual(expected);
  });

  it('queryAABB matches a brute-force box scan', () => {
    const box = new THREE.Box3(new THREE.Vector3(-20, -20, -20), new THREE.Vector3(20, 20, 20));
    const expected = bruteForceQuery(points, null, (s) => box.intersectsSphere(s)).sort((a, b) => a - b);
    const actual = octree.queryAABB(box).sort((a, b) => a - b);
    expect(actual).toEqual(expected);
  });

  it('queryFrustum matches a brute-force frustum scan', () => {
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 200);
    camera.position.set(0, 0, 100);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    const projScreenMatrix = new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    const frustum = new THREE.Frustum().setFromProjectionMatrix(projScreenMatrix);

    const expected = bruteForceQuery(points, null, (s) => frustum.intersectsSphere(s)).sort((a, b) => a - b);
    const actual = octree.queryFrustum(frustum).sort((a, b) => a - b);
    expect(actual).toEqual(expected);
  });
});

// ── (d) capacity grow preserves all attributes ───────────────────────────────

describe('Phase 3 / (d) capacity grow preserves all attributes', () => {
  it('preserves positions, colors, and every custom attribute across two sequential grows', () => {
    const scene = new THREE.Scene();
    const obj = new GraphInstancedObject({
      scene,
      name: 'growable',
      geometry: new THREE.BoxGeometry(1, 1, 1),
      material: new THREE.MeshBasicMaterial(),
      count: 10,
    });
    obj.defineAttribute('phase', 1);
    obj.defineAttribute('offset', 2);

    for (let i = 0; i < 10; i++) {
      obj.setInstanceMatrix(i, new THREE.Matrix4().makeTranslation(i, i * 2, i * 3));
      obj.setInstanceColor(i, new THREE.Color(i / 10, 0, 1 - i / 10));
      obj.setInstanceAttribute(i, 'phase', i * 0.1);
      obj.setInstanceAttribute(i, 'offset', [i, -i]);
    }
    obj.commitMatrix().commitColor().commitAttribute('phase').commitAttribute('offset');

    // First grow: 10 -> 16 (ceilPowerOfTwo).
    obj.setInstanceCount(12);
    expect(obj.capacity).toBe(16);

    // Second grow, past the first grow's capacity: 16 -> 32.
    obj.setInstanceCount(20);
    expect(obj.capacity).toBe(32);
    obj.setInstanceCount(20);

    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const color = new THREE.Color();
    for (let i = 0; i < 10; i++) {
      obj.three.getMatrixAt(i, matrix);
      position.setFromMatrixPosition(matrix);
      expect([position.x, position.y, position.z]).toEqual([i, i * 2, i * 3]);

      obj.three.getColorAt(i, color);
      expect(color.r).toBeCloseTo(i / 10, 5);
      expect(color.b).toBeCloseTo(1 - i / 10, 5);

      expect(obj.three.geometry.getAttribute('phase').getX(i)).toBeCloseTo(i * 0.1, 5);
      expect(obj.three.geometry.getAttribute('offset').getX(i)).toBe(i);
      expect(obj.three.geometry.getAttribute('offset').getY(i)).toBe(-i);
    }

    // instanceId stays sequential across the whole grown capacity, not just the copied range.
    const instanceId = obj.three.geometry.getAttribute('instanceId');
    for (let i = 0; i < 32; i++) expect(instanceId.getX(i)).toBe(i);

    obj.dispose();
  });
});

// ── (e) <=50 -> meshes / >50 -> InstancedObject boundary honored ─────────────

describe('Phase 3 / (e) instancing threshold boundary', () => {
  it('createBars returns GraphMesh[] at exactly the threshold and GraphInstancedObject one past it', () => {
    const scene = new THREE.Scene();

    const atThreshold = GraphObjectFactory.createBars(INSTANCING_THRESHOLD, { scene, name: 'at' });
    expect(Array.isArray(atThreshold)).toBe(true);
    expect(atThreshold).toHaveLength(INSTANCING_THRESHOLD);
    for (const obj of atThreshold) expect(obj).toBeInstanceOf(GraphMesh);

    const pastThreshold = GraphObjectFactory.createBars(INSTANCING_THRESHOLD + 1, { scene, name: 'past' });
    expect(pastThreshold).toBeInstanceOf(GraphInstancedObject);
    expect(pastThreshold.three.count).toBe(INSTANCING_THRESHOLD + 1);

    for (const obj of atThreshold) obj.dispose();
    pastThreshold.dispose();
  });
});
