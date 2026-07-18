import { standard, physical, basic, lambert, phong, toon, matcap } from './presets/pbr.js';
import { holographic } from './presets/holographic.js';
import { crystal } from './presets/crystal.js';
import { glass, frostedGlass } from './presets/glass.js';
import { neon, pulse } from './presets/neon.js';
import { glow } from './presets/glow.js';
import { velvet } from './presets/velvet.js';
import { liquidMercury } from './presets/liquidMercury.js';
import { chrome } from './presets/chrome.js';
import { gold } from './presets/gold.js';
import { copper } from './presets/copper.js';
import { pearl } from './presets/pearl.js';
import { obsidian } from './presets/obsidian.js';
import { dataDriven } from './presets/dataDriven.js';
import { freshness, dataStream } from './presets/freshness.js';
import { volumeRaymarch } from './presets/volumeRaymarch.js';
import { gradient, noise, voronoi, checkerboard, dots, lines, cellular, paletteTexture } from './texture/procedural.js';
import { addPlanarReflection } from './planarReflection.js';
import { setPaletteForAttribute } from './setPaletteForAttribute.js';

export { GraphObjectMaterial } from './GraphObjectMaterial.js';
export { SDFText } from './text/SDFText.js';
export { graphHTML, isHTMLInCanvasSupported } from './text/GraphHTML.js';
export { effects, applyEffect, removeEffect } from './effects/index.js';
export { Label, label } from './label/index.js';

/**
 * The `texture` namespace (CLAUDE.md §5) — procedural `THREE.Texture`
 * generators (Prompt 110), separate from `material`'s material-factory
 * namespace since these return textures, not materials, for use as any
 * material's `map`/`roughnessMap`/etc. (`GraphObjectMaterial.setMap`) or as
 * `dataDriven`'s palette lookup.
 */
export const texture = { gradient, noise, voronoi, checkerboard, dots, lines, cellular, paletteTexture };

/**
 * The `material` namespace (CLAUDE.md §5) — every Phase 6 material preset
 * factory, mirroring `compose/scale`/`compose/color`/`compose/palette`'s own
 * `index.js` convention: build once here, re-export the namespace object
 * from `src/index.js`, no individual flat exports alongside it.
 */
export const material = {
  standard,
  physical,
  basic,
  lambert,
  phong,
  toon,
  matcap,
  holographic,
  crystal,
  glass,
  frostedGlass,
  neon,
  pulse,
  glow,
  velvet,
  liquidMercury,
  chrome,
  gold,
  copper,
  pearl,
  obsidian,
  dataDriven,
  freshness,
  dataStream,
  volumeRaymarch,
  addPlanarReflection,
  setPaletteForAttribute,
};
