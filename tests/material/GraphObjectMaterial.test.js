import { describe, it, expect, vi, afterEach } from 'vitest';
import * as THREE from 'three';
import { GraphObjectMaterial } from '../../src/material/GraphObjectMaterial.js';
import { GraphMesh } from '../../src/object/GraphMesh.js';
import { GraphInstancedObject } from '../../src/object/GraphInstancedObject.js';
import { loop } from '../../src/core/Graph3DLoop.js';
import { retainTexture } from '../../src/core/GraphDisposal.js';

// vi.spyOn(loop, ...) accumulates call history across tests unless restored —
// see tests/object/GraphInstancedObject.test.js's identical note.
afterEach(() => {
  vi.restoreAllMocks();
});

function makeMesh({ scene = new THREE.Scene(), name = 'a', material = new THREE.MeshBasicMaterial() } = {}) {
  return new GraphMesh({ scene, name, geometry: new THREE.BoxGeometry(), material });
}

function makeInstanced({ scene = new THREE.Scene(), name = 'a', material = new THREE.MeshBasicMaterial(), count = 4 } = {}) {
  return new GraphInstancedObject({ scene, name, geometry: new THREE.BoxGeometry(), material, count });
}

function makeShaderMaterial(extraUniforms = {}) {
  return new THREE.ShaderMaterial({
    uniforms: { ...extraUniforms },
    vertexShader: 'void main() { gl_Position = vec4(position, 1.0); }',
    fragmentShader: 'void main() { gl_FragColor = vec4(1.0); }',
  });
}

// ── Constructor ───────────────────────────────────────────────────────────────

describe('GraphObjectMaterial constructor', () => {
  it('wraps a GraphMesh', () => {
    const wrapper = new GraphObjectMaterial(makeMesh());
    expect(wrapper.material).toBeInstanceOf(THREE.MeshBasicMaterial);
  });

  it('wraps a GraphInstancedObject', () => {
    const wrapper = new GraphObjectMaterial(makeInstanced());
    expect(wrapper.material).toBeInstanceOf(THREE.MeshBasicMaterial);
  });

  it('throws TypeError for a non-GraphMesh/GraphInstancedObject target', () => {
    expect(() => new GraphObjectMaterial({})).toThrow(TypeError);
    expect(() => new GraphObjectMaterial(new THREE.Mesh())).toThrow(TypeError);
  });

  it('throws TypeError for a multi-material target', () => {
    const mesh = makeMesh({ material: [new THREE.MeshBasicMaterial(), new THREE.MeshBasicMaterial()] });
    expect(() => new GraphObjectMaterial(mesh)).toThrow(TypeError);
  });

  it('throws if the target has already been disposed', () => {
    const mesh = makeMesh();
    mesh.dispose();
    expect(() => new GraphObjectMaterial(mesh)).toThrow(/disposed/);
  });
});

// ── set() ──────────────────────────────────────────────────────────────────────

describe('GraphObjectMaterial.set', () => {
  it('replaces the target material and returns this for chaining', () => {
    const mesh = makeMesh();
    const wrapper = new GraphObjectMaterial(mesh);
    const next = new THREE.MeshStandardMaterial({ color: 'crimson' });
    expect(wrapper.set(next)).toBe(wrapper);
    expect(mesh.material).toBe(next);
    expect(mesh.three.material).toBe(next);
  });

  it('disposes the material being replaced', () => {
    const mesh = makeMesh();
    const previous = mesh.material;
    const disposeSpy = vi.spyOn(previous, 'dispose');
    new GraphObjectMaterial(mesh).set(new THREE.MeshStandardMaterial());
    expect(disposeSpy).toHaveBeenCalledOnce();
  });

  it('throws TypeError for a non-THREE.Material value', () => {
    const wrapper = new GraphObjectMaterial(makeMesh());
    expect(() => wrapper.set({})).toThrow(TypeError);
  });

  it('works identically on a GraphInstancedObject target', () => {
    const object = makeInstanced();
    const wrapper = new GraphObjectMaterial(object);
    const next = new THREE.MeshStandardMaterial();
    wrapper.set(next);
    expect(object.material).toBe(next);
  });
});

// ── Texture ref-counting (Prompt 111) ───────────────────────────────────────────

describe('GraphObjectMaterial texture ref-counting', () => {
  it('an explicitly retainTexture()-d texture, shared by two independent meshes, survives one being disposed', () => {
    // Two GraphMeshes independently sharing sharedMap from construction —
    // GraphObjectMaterial itself can't detect this on its own (see the
    // class doc's note); the advanced caller marks the sharing explicitly.
    const sharedMap = new THREE.Texture();
    const disposeSpy = vi.spyOn(sharedMap, 'dispose');
    retainTexture(sharedMap);

    const meshA = makeMesh({ material: new THREE.MeshBasicMaterial({ map: sharedMap }) });
    const meshB = makeMesh({ material: new THREE.MeshBasicMaterial({ map: sharedMap }) });

    meshA.dispose();
    expect(disposeSpy).not.toHaveBeenCalled(); // meshB's material still uses sharedMap

    meshB.dispose();
    expect(disposeSpy).toHaveBeenCalledOnce();
  });

  it('a texture shared between the old and new material in set() is not disposed mid-swap', () => {
    const sharedMap = new THREE.Texture();
    const disposeSpy = vi.spyOn(sharedMap, 'dispose');
    const mesh = makeMesh({ material: new THREE.MeshBasicMaterial({ map: sharedMap }) });
    const wrapper = new GraphObjectMaterial(mesh);

    wrapper.set(new THREE.MeshStandardMaterial({ map: sharedMap }));
    expect(disposeSpy).not.toHaveBeenCalled();
    expect(mesh.material.map).toBe(sharedMap);
  });

  it('an unshared texture still disposes immediately on set(), matching the pre-ref-counting default', () => {
    const mesh = makeMesh();
    const oldMap = mesh.material.map ?? new THREE.Texture();
    mesh.three.material.map = oldMap;
    const disposeSpy = vi.spyOn(oldMap, 'dispose');
    new GraphObjectMaterial(mesh).set(new THREE.MeshStandardMaterial());
    expect(disposeSpy).toHaveBeenCalledOnce();
  });
});

// ── applyShader() ──────────────────────────────────────────────────────────────

describe('GraphObjectMaterial.applyShader', () => {
  it('assigns a THREE.ShaderMaterial as the new material', () => {
    const mesh = makeMesh();
    const wrapper = new GraphObjectMaterial(mesh);
    const shader = makeShaderMaterial();
    wrapper.applyShader(shader);
    expect(mesh.material).toBe(shader);
  });

  it('accepts a THREE.RawShaderMaterial (a ShaderMaterial subclass)', () => {
    const wrapper = new GraphObjectMaterial(makeMesh());
    const raw = new THREE.RawShaderMaterial({ vertexShader: 'void main(){}', fragmentShader: 'void main(){}' });
    expect(() => wrapper.applyShader(raw)).not.toThrow();
  });

  it('throws TypeError for a non-shader material', () => {
    const wrapper = new GraphObjectMaterial(makeMesh());
    expect(() => wrapper.applyShader(new THREE.MeshBasicMaterial())).toThrow(TypeError);
  });

  it('throws TypeError for a non-plain-object options argument', () => {
    const wrapper = new GraphObjectMaterial(makeMesh({ material: makeShaderMaterial({ intensity: { value: 1 } }) }));
    expect(() => wrapper.applyShader(makeShaderMaterial(), null)).toThrow(TypeError);
  });

  describe('preserveUniforms (dev-mode hot-reload)', () => {
    it('defaults to false — swapping shaders does not carry over matching uniform values', () => {
      const wrapper = new GraphObjectMaterial(makeMesh({ material: makeShaderMaterial({ intensity: { value: 9 } }) }));
      wrapper.applyShader(makeShaderMaterial({ intensity: { value: 1 } }));
      expect(wrapper.material.uniforms.intensity.value).toBe(1);
    });

    it('true: copies matching-name uniform values from the old material onto the new one', () => {
      const wrapper = new GraphObjectMaterial(makeMesh({ material: makeShaderMaterial({ intensity: { value: 9 } }) }));
      wrapper.applyShader(makeShaderMaterial({ intensity: { value: 1 } }), { preserveUniforms: true });
      expect(wrapper.material.uniforms.intensity.value).toBe(9);
    });

    it('true: ignores old uniform names absent from the new material, without throwing', () => {
      const wrapper = new GraphObjectMaterial(makeMesh({ material: makeShaderMaterial({ onlyOld: { value: 1 } }) }));
      expect(() => wrapper.applyShader(makeShaderMaterial({ onlyNew: { value: 2 } }), { preserveUniforms: true })).not.toThrow();
      expect(wrapper.material.uniforms.onlyNew.value).toBe(2);
    });

    it('true: carries over a texture-valued uniform safely (ref-counted, no premature dispose)', () => {
      const sharedTexture = new THREE.Texture();
      const disposeSpy = vi.spyOn(sharedTexture, 'dispose');
      const wrapper = new GraphObjectMaterial(makeMesh({ material: makeShaderMaterial({ map: { value: sharedTexture } }) }));
      wrapper.applyShader(makeShaderMaterial({ map: { value: null } }), { preserveUniforms: true });
      expect(wrapper.material.uniforms.map.value).toBe(sharedTexture);
      expect(disposeSpy).not.toHaveBeenCalled();
    });
  });
});

// ── applyShader() dev warning (Prompt 179) ──────────────────────────────────────

describe('GraphObjectMaterial.applyShader dev warning: shader without bindUniforms', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('warns on the next microtask when bindUniforms() never follows a shader with uniforms', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const wrapper = new GraphObjectMaterial(makeMesh());
    wrapper.applyShader(makeShaderMaterial({ intensity: { value: 1 } }));

    await Promise.resolve();

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('bindUniforms() was never called'));
  });

  it('does not warn when bindUniforms() is called right after applyShader() (still synchronous)', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const wrapper = new GraphObjectMaterial(makeMesh());
    wrapper.applyShader(makeShaderMaterial({ intensity: { value: 1 } }));
    wrapper.bindUniforms({ intensity: 2 });

    await Promise.resolve();

    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('does not warn when the shader declares no uniforms', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const wrapper = new GraphObjectMaterial(makeMesh());
    wrapper.applyShader(makeShaderMaterial());

    await Promise.resolve();

    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('does not warn if the wrapper was disposed before the microtask fires', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const wrapper = new GraphObjectMaterial(makeMesh());
    wrapper.applyShader(makeShaderMaterial({ intensity: { value: 1 } }));
    wrapper.dispose();

    await Promise.resolve();

    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('a later applyShader() re-arms the check independently of an earlier bindUniforms()', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const wrapper = new GraphObjectMaterial(makeMesh());
    wrapper.applyShader(makeShaderMaterial({ intensity: { value: 1 } }));
    wrapper.bindUniforms({ intensity: 2 });
    wrapper.applyShader(makeShaderMaterial({ glow: { value: 1 } })); // never bound

    await Promise.resolve();

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('bindUniforms() was never called'));
  });
});

// ── bindUniforms() ─────────────────────────────────────────────────────────────

describe('GraphObjectMaterial.bindUniforms', () => {
  it('throws if the current material has no uniforms object', () => {
    const wrapper = new GraphObjectMaterial(makeMesh());
    expect(() => wrapper.bindUniforms({ intensity: 1 })).toThrow(/uniforms/);
  });

  it('throws TypeError for a non-object argument', () => {
    const wrapper = new GraphObjectMaterial(makeMesh({ material: makeShaderMaterial() }));
    expect(() => wrapper.bindUniforms(null)).toThrow(TypeError);
    expect(() => wrapper.bindUniforms('nope')).toThrow(TypeError);
  });

  it('assigns a static value, creating the uniform entry if absent', () => {
    const wrapper = new GraphObjectMaterial(makeMesh({ material: makeShaderMaterial() }));
    wrapper.bindUniforms({ intensity: 2.5 });
    expect(wrapper.material.uniforms.intensity.value).toBe(2.5);
  });

  it('mutates an existing uniform value in place rather than replacing the wrapper', () => {
    const wrapper = new GraphObjectMaterial(makeMesh({ material: makeShaderMaterial({ intensity: { value: 1 } }) }));
    const holder = wrapper.material.uniforms.intensity;
    wrapper.bindUniforms({ intensity: 9 });
    expect(wrapper.material.uniforms.intensity).toBe(holder);
    expect(holder.value).toBe(9);
  });

  it('returns this for chaining', () => {
    const wrapper = new GraphObjectMaterial(makeMesh({ material: makeShaderMaterial() }));
    expect(wrapper.bindUniforms({ intensity: 1 })).toBe(wrapper);
  });

  describe("'auto' — time", () => {
    it('registers a loop callback and drives uniforms.time.value from elapsed seconds', () => {
      const addSpy = vi.spyOn(loop, 'add');
      const wrapper = new GraphObjectMaterial(makeMesh({ material: makeShaderMaterial() }));
      wrapper.bindUniforms({ time: 'auto' });
      expect(wrapper.material.uniforms.time.value).toBe(0);

      expect(addSpy).toHaveBeenCalledOnce();
      const tick = addSpy.mock.calls[0][0];
      tick(0.016, 1.5);
      expect(wrapper.material.uniforms.time.value).toBe(1.5);
    });

    it('is idempotent — a second bindUniforms({time:"auto"}) does not double-subscribe', () => {
      const addSpy = vi.spyOn(loop, 'add');
      const wrapper = new GraphObjectMaterial(makeMesh({ material: makeShaderMaterial() }));
      wrapper.bindUniforms({ time: 'auto' });
      wrapper.bindUniforms({ time: 'auto' });
      expect(addSpy).toHaveBeenCalledOnce();
    });

    it('unsubscribes when overridden by a static value afterward', () => {
      const removeSpy = vi.spyOn(loop, 'remove');
      const wrapper = new GraphObjectMaterial(makeMesh({ material: makeShaderMaterial() }));
      wrapper.bindUniforms({ time: 'auto' });
      wrapper.bindUniforms({ time: 3 });
      expect(removeSpy).toHaveBeenCalledOnce();
      expect(wrapper.material.uniforms.time.value).toBe(3);
    });
  });

  describe("'auto' — resolution", () => {
    it('registers a window resize listener and seeds uniforms.resolution.value from window size', () => {
      const addEventSpy = vi.spyOn(window, 'addEventListener');
      const wrapper = new GraphObjectMaterial(makeMesh({ material: makeShaderMaterial() }));
      wrapper.bindUniforms({ resolution: 'auto' });

      expect(addEventSpy).toHaveBeenCalledWith('resize', expect.any(Function));
      expect(wrapper.material.uniforms.resolution.value).toBeInstanceOf(THREE.Vector2);
      expect(wrapper.material.uniforms.resolution.value.x).toBeGreaterThan(0);
    });

    it('refreshes uniforms.resolution.value on resize without replacing the Vector2 instance', () => {
      const wrapper = new GraphObjectMaterial(makeMesh({ material: makeShaderMaterial() }));
      wrapper.bindUniforms({ resolution: 'auto' });
      const vector = wrapper.material.uniforms.resolution.value;

      window.innerWidth = 640;
      window.innerHeight = 480;
      window.dispatchEvent(new Event('resize'));

      expect(wrapper.material.uniforms.resolution.value).toBe(vector);
      expect(vector.x).toBe(640 * (window.devicePixelRatio || 1));
    });
  });

  it("throws for an unrecognized 'auto' uniform name", () => {
    const wrapper = new GraphObjectMaterial(makeMesh({ material: makeShaderMaterial() }));
    expect(() => wrapper.bindUniforms({ nonsense: 'auto' })).toThrow(/only supported for/);
  });
});

// ── setMap() ───────────────────────────────────────────────────────────────────

describe('GraphObjectMaterial.setMap', () => {
  it('assigns a texture to a recognized slot and bumps the material version', () => {
    const wrapper = new GraphObjectMaterial(makeMesh({ material: new THREE.MeshStandardMaterial() }));
    const texture = new THREE.Texture();
    const versionBefore = wrapper.material.version;
    wrapper.setMap('roughness', texture);
    expect(wrapper.material.roughnessMap).toBe(texture);
    // needsUpdate is write-only on THREE.Material (bumps .version); there's
    // no boolean to read back directly.
    expect(wrapper.material.version).toBeGreaterThan(versionBefore);
  });

  it('returns this for chaining', () => {
    const wrapper = new GraphObjectMaterial(makeMesh({ material: new THREE.MeshStandardMaterial() }));
    expect(wrapper.setMap('map', new THREE.Texture())).toBe(wrapper);
  });

  it('throws TypeError for an unknown slot', () => {
    const wrapper = new GraphObjectMaterial(makeMesh({ material: new THREE.MeshStandardMaterial() }));
    expect(() => wrapper.setMap('bogus', new THREE.Texture())).toThrow(TypeError);
  });

  it('throws TypeError for a non-THREE.Texture value', () => {
    const wrapper = new GraphObjectMaterial(makeMesh({ material: new THREE.MeshStandardMaterial() }));
    expect(() => wrapper.setMap('map', {})).toThrow(TypeError);
  });

  it("throws when the current material has no property for that slot", () => {
    const wrapper = new GraphObjectMaterial(makeMesh({ material: new THREE.MeshBasicMaterial() }));
    expect(() => wrapper.setMap('clearcoat', new THREE.Texture())).toThrow(/no 'clearcoatMap' property/);
  });

  it('releases the texture it replaces at that slot, disposing it if unshared', () => {
    const previousMap = new THREE.Texture();
    const disposeSpy = vi.spyOn(previousMap, 'dispose');
    const wrapper = new GraphObjectMaterial(makeMesh({ material: new THREE.MeshStandardMaterial({ map: previousMap }) }));
    wrapper.setMap('map', new THREE.Texture());
    expect(disposeSpy).toHaveBeenCalledOnce();
  });

  it('does not dispose the texture it replaces if another material still shares it (explicitly retained)', () => {
    const sharedMap = new THREE.Texture();
    const disposeSpy = vi.spyOn(sharedMap, 'dispose');
    retainTexture(sharedMap); // advanced-caller signal: a second material also uses sharedMap
    const meshA = makeMesh({ material: new THREE.MeshStandardMaterial({ map: sharedMap }) });
    const wrapperA = new GraphObjectMaterial(meshA);
    makeMesh({ material: new THREE.MeshStandardMaterial({ map: sharedMap }) }); // the second consumer

    wrapperA.setMap('map', new THREE.Texture());
    expect(disposeSpy).not.toHaveBeenCalled();
  });
});

// ── dispose() ──────────────────────────────────────────────────────────────────

describe('GraphObjectMaterial.dispose', () => {
  it('unsubscribes the auto-time loop callback', () => {
    const removeSpy = vi.spyOn(loop, 'remove');
    const wrapper = new GraphObjectMaterial(makeMesh({ material: makeShaderMaterial() }));
    wrapper.bindUniforms({ time: 'auto' });
    wrapper.dispose();
    expect(removeSpy).toHaveBeenCalledOnce();
  });

  it('unsubscribes the auto-resolution resize listener', () => {
    const removeEventSpy = vi.spyOn(window, 'removeEventListener');
    const wrapper = new GraphObjectMaterial(makeMesh({ material: makeShaderMaterial() }));
    wrapper.bindUniforms({ resolution: 'auto' });
    wrapper.dispose();
    expect(removeEventSpy).toHaveBeenCalledWith('resize', expect.any(Function));
  });

  it('does not dispose the wrapped material — that stays the target’s responsibility', () => {
    const mesh = makeMesh();
    const disposeSpy = vi.spyOn(mesh.material, 'dispose');
    new GraphObjectMaterial(mesh).dispose();
    expect(disposeSpy).not.toHaveBeenCalled();
  });

  it('is idempotent', () => {
    const wrapper = new GraphObjectMaterial(makeMesh({ material: makeShaderMaterial() }));
    wrapper.bindUniforms({ time: 'auto', resolution: 'auto' });
    wrapper.dispose();
    expect(() => wrapper.dispose()).not.toThrow();
  });

  it('all public methods throw after dispose with a descriptive error', () => {
    const wrapper = new GraphObjectMaterial(makeMesh({ material: makeShaderMaterial() }));
    wrapper.dispose();
    const pattern = /GraphObjectMaterial\.\w+: instance has been disposed/;
    expect(() => wrapper.material).toThrow(pattern);
    expect(() => wrapper.set(new THREE.MeshBasicMaterial())).toThrow(pattern);
    expect(() => wrapper.applyShader(makeShaderMaterial())).toThrow(pattern);
    expect(() => wrapper.bindUniforms({ intensity: 1 })).toThrow(pattern);
    expect(() => wrapper.setMap('map', new THREE.Texture())).toThrow(pattern);
  });
});
