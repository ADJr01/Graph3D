import { describe, it, expect } from 'vitest';
import { Scene, PerspectiveCamera, DirectionalLight, Vector3 } from 'three';
import { PostFX, ParticleSystem } from '../../src/postfx/index.js';

// Phase 7 cross-cutting integration tests (Prompt 125): (a) pass enable/
// disable cleanliness, (b) preset combinations (PostFX + ParticleSystem),
// (c) a 100K-particle performance proxy, (d) CPU-vs-GPU behavior parity.
// Individual passes/presets/behaviors already have thorough unit coverage in
// tests/postfx/ — this file proves the whole layer holds together under
// combined, repeated use, closer to how a real app would drive it.
//
// (c) can only exercise the CPU sim path here — jsdom's stubbed
// HTMLCanvasElement.getContext() can't back the GPU path's real
// WebGLRenderer calls (copyTextureToTexture/setRenderTarget), so "100K
// particles at 60fps" is proxied by timing the CPU integration loop, not a
// real rendered frame rate. The literal claim was checked by hand instead:
// building examples/07-postfx/main.js (this same prompt) and running its
// rain button in an actual browser is what surfaced and confirmed the fix
// for a real GLSL bug the GPU path had (see skipping_list.md) — the closest
// this codebase gets to an automated GPU test today.
//
// (d) CPU-vs-GPU numerical parity is NOT covered here for the same reason:
// there is no real WebGL context to read GPU sim results back from under
// jsdom. This remains an open, explicitly documented gap (skipping_list.md,
// Phase 7 section) rather than a faked test — revisit once a headless-GL or
// real-browser test harness exists.

function makeFakeRenderer() {
  return {
    domElement: { width: 800, height: 600 },
    getPixelRatio: () => 1,
    getSize: (target) => target.set(800, 600),
  };
}

function makeScene() {
  const scene = new Scene();
  scene.add(new DirectionalLight(0xffffff, 1)); // godRays needs a light to auto-detect
  return scene;
}

function makeFX() {
  return new PostFX({ renderer: makeFakeRenderer(), scene: makeScene(), camera: new PerspectiveCamera() });
}

function makeParticleCtx() {
  return { scene: new Scene(), camera: new PerspectiveCamera(), renderer: makeFakeRenderer() }; // no capabilities → CPU sim path
}

describe('Phase 7 integration', () => {
  // ── (a) pass enable/disable cleanliness ─────────────────────────────────

  describe('(a) every built-in pass enables/disables/disposes cleanly together, repeatedly', () => {
    const ALL_PASSES = [
      'outline', 'ssao', 'ssr', 'godRays', 'bloom', 'dof', 'motionBlur',
      'colorGrading', 'vignette', 'chromaticAberration', 'filmGrain', 'fxaa', 'smaa',
    ];

    it('enabling every pass at once, then disposing, throws nothing — repeated 100x (leak smoke test)', () => {
      for (let i = 0; i < 100; i++) {
        const fx = makeFX();
        for (const name of ALL_PASSES) fx.enable(name);
        expect(fx.enabled()).toHaveLength(ALL_PASSES.length);
        expect(() => fx.dispose()).not.toThrow();
      }
    });

    it('disabling every pass one at a time (not dispose()) empties enabled() with no residue', () => {
      const fx = makeFX();
      for (const name of ALL_PASSES) fx.enable(name);
      for (const name of ALL_PASSES) fx.disable(name);
      expect(fx.enabled()).toEqual([]);
      fx.dispose();
    });

    it('pipeline() can reorder every enabled pass, and disabling one after leaves the rest correctly ordered', () => {
      const fx = makeFX();
      for (const name of ALL_PASSES) fx.enable(name);
      const reversed = [...ALL_PASSES].reverse();
      fx.pipeline(reversed);
      expect(fx.enabled()).toEqual(reversed);

      fx.disable('bloom');
      expect(fx.enabled()).toEqual(reversed.filter((name) => name !== 'bloom'));
      fx.dispose();
    });
  });

  // ── (b) preset combinations ──────────────────────────────────────────────

  describe('(b) preset combinations', () => {
    const POSTFX_PRESET_PASSES = {
      cinematic: ['dof', 'bloom', 'vignette', 'filmGrain', 'chromaticAberration', 'smaa'],
      clean: ['ssao', 'smaa'],
      dramatic: ['ssao', 'bloom', 'vignette', 'smaa'],
      dreamy: ['bloom', 'dof', 'vignette', 'filmGrain'],
      editorial: ['ssao', 'vignette', 'smaa'],
      cyberpunk: ['bloom', 'chromaticAberration', 'filmGrain', 'vignette'],
      minimal: ['fxaa'],
    };

    it('cycling through all 7 PostFX presets on one instance never leaks a pass from the previous preset', () => {
      const fx = makeFX();
      for (const [name, expectedPasses] of Object.entries(POSTFX_PRESET_PASSES)) {
        fx.preset(name);
        expect(fx.enabled().sort()).toEqual([...expectedPasses].sort());
      }
      fx.dispose();
    });

    const PARTICLE_PRESET_NAMES = ['dust', 'sparks', 'smoke', 'confetti', 'dataStream', 'dissolve'];

    it('applying all 6 ParticleSystem presets in sequence on one system throws nothing', () => {
      const system = new ParticleSystem(makeParticleCtx());
      for (const name of PARTICLE_PRESET_NAMES) {
        expect(() => system.preset(name)).not.toThrow();
      }
      system.dispose();
    });

    it('each ParticleSystem preset applied to its own fresh system stays independent (no cross-talk)', () => {
      const systems = PARTICLE_PRESET_NAMES.map((name) => {
        const system = new ParticleSystem(makeParticleCtx());
        system.preset(name);
        return system;
      });
      // dust/smoke both configure 'wind' — independent systems must not share it.
      const dust = systems[PARTICLE_PRESET_NAMES.indexOf('dust')];
      const smoke = systems[PARTICLE_PRESET_NAMES.indexOf('smoke')];
      expect(dust.activeBehaviors).toContain('wind');
      expect(smoke.activeBehaviors).toContain('wind');
      for (const system of systems) system.dispose();
    });

    it('applying dust then smoke on the SAME system reconfigures the shared wind behavior rather than throwing (documented in skipping_list.md)', () => {
      const system = new ParticleSystem(makeParticleCtx());
      system.preset('dust');
      expect(() => system.preset('smoke')).not.toThrow();
      expect(system.activeBehaviors.filter((name) => name === 'wind')).toHaveLength(1);
      system.dispose();
    });
  });

  // ── (c) 100K particles — CPU-path performance proxy ─────────────────────

  describe('(c) 100K particles: CPU-path emit + sustained update() stays within a generous time budget', () => {
    it('emitting 100,000 particles and stepping update() for 60 simulated frames completes in well under 5s', () => {
      const system = new ParticleSystem({ ...makeParticleCtx(), capacity: 100_000 });
      expect(system.simMode).toBe('cpu');
      expect(system.capacity).toBeGreaterThanOrEqual(100_000);

      const start = performance.now();
      system.emit({
        count: 100_000,
        position: () => new Vector3((Math.random() - 0.5) * 20, 20, (Math.random() - 0.5) * 20),
        velocity: new Vector3(0, -10, 0),
        lifetime: 5,
      });
      for (let frame = 0; frame < 60; frame++) system.update(1 / 60);
      const elapsedMs = performance.now() - start;

      expect(elapsedMs).toBeLessThan(5000);
      system.dispose();
    });
  });
});
