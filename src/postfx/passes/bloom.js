import { Vector2 } from 'three';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { PostFX } from '../PostFX.js';

/**
 * `bloom` — Unreal-Engine-style glow on bright pixels. Pairs with
 * `material.neon`/`.glow`/`.pulse` (Phase 6), whose emissive intensities are
 * deliberately tuned above 1.0 to bloom under this pass.
 *
 * @example graph3d.postfx.enable('bloom', { strength: 1.5, radius: 0.4, threshold: 0.85 });
 */
PostFX.registerPass('bloom', {
  order: 20,
  create: ({ size }, opts) => {
    const pass = new UnrealBloomPass(
      new Vector2(size.width, size.height),
      opts.strength ?? 1.0,
      opts.radius ?? 0.4,
      opts.threshold ?? 0.85,
    );
    return pass;
  },
});
