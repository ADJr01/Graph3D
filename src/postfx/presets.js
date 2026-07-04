import { PostFX } from './PostFX.js';

/**
 * Seven named "look" presets (Prompt 119), each a tuned bundle of the
 * general-purpose stylistic passes (`bloom`/`ssao`/`dof`/`vignette`/
 * `chromaticAberration`/`filmGrain`/`fxaa`/`smaa`). `godRays`/`outline`/`ssr`
 * are deliberately excluded — they need scene-specific setup (a light, a
 * selection, a reflector) that a generic preset can't safely assume exists
 * (see `skipping_list.md`). `colorGrading` is excluded too: without a
 * hand-authored tinted LUT asset it only has its neutral identity default,
 * which is a visual no-op regardless of `intensity` — nothing for a preset
 * to tune yet.
 */

PostFX.registerPreset('cinematic', {
  dof: { focus: 15, aperture: 0.00008, maxblur: 0.01 },
  bloom: { strength: 0.6, radius: 0.5, threshold: 0.9 },
  vignette: { offset: 1.0, darkness: 1.1 },
  filmGrain: { intensity: 0.3, grayscale: false },
  chromaticAberration: { amount: 0.0012 },
  smaa: {},
});

PostFX.registerPreset('clean', {
  ssao: { kernelRadius: 8, minDistance: 0.005, maxDistance: 0.1 },
  smaa: {},
});

PostFX.registerPreset('dramatic', {
  ssao: { kernelRadius: 12, minDistance: 0.002, maxDistance: 0.15 },
  bloom: { strength: 1.4, radius: 0.6, threshold: 0.75 },
  vignette: { offset: 1.2, darkness: 1.4 },
  smaa: {},
});

PostFX.registerPreset('dreamy', {
  bloom: { strength: 1.8, radius: 0.9, threshold: 0.6 },
  dof: { focus: 8, aperture: 0.00015, maxblur: 0.02 },
  vignette: { offset: 0.8, darkness: 0.8 },
  filmGrain: { intensity: 0.15, grayscale: false },
});

PostFX.registerPreset('editorial', {
  ssao: { kernelRadius: 8, minDistance: 0.005, maxDistance: 0.1 },
  vignette: { offset: 1.0, darkness: 0.6 },
  smaa: {},
});

PostFX.registerPreset('cyberpunk', {
  bloom: { strength: 2.0, radius: 0.7, threshold: 0.6 },
  chromaticAberration: { amount: 0.004 },
  filmGrain: { intensity: 0.4, grayscale: false },
  vignette: { offset: 1.1, darkness: 1.3 },
});

PostFX.registerPreset('minimal', {
  fxaa: {},
});
