import { defineConfig } from 'vitepress';
import fs from 'node:fs';
import path from 'node:path';

/**
 * The `/api/` sidebar, built from `docs/api/manifest.json` — written by
 * `scripts/docs-api.js` (`npm run docs:api`) alongside the class pages
 * themselves, so the sidebar can't drift from what's actually generated
 * (CLAUDE.md §1.1 DRY — one source of truth for the layer grouping, not a
 * hand-maintained second copy here). Falls back to just the index page if
 * `docs:api` hasn't been run yet, rather than failing the whole site build.
 */
function apiSidebar() {
  const manifestPath = path.join(import.meta.dirname, '..', 'api', 'manifest.json');
  const fallback = [{ text: 'Overview', link: '/api/' }];
  if (!fs.existsSync(manifestPath)) return fallback;
  const { layerOrder, layerTitle, classesByLayer } = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const items = [{ text: 'Overview', link: '/api/' }];
  for (const layer of layerOrder) {
    const names = classesByLayer[layer];
    if (!names || names.length === 0) continue;
    items.push({
      text: layerTitle[layer],
      collapsed: true,
      items: names.map((name) => ({ text: name, link: `/api/${name}` })),
    });
  }
  return items;
}

// Layer order matches CLAUDE.md §1.4's coupling table — the sidebar walks the
// same bottom-to-top dependency order the codebase itself is organized by.
const conceptsSidebar = [
  { text: 'Overview', link: '/concepts/' },
  { text: 'Core Engine', link: '/concepts/core' },
  { text: 'Scene Composition', link: '/concepts/scene' },
  { text: 'Object & Mesh', link: '/concepts/object' },
  { text: 'Compose', link: '/concepts/compose' },
  { text: 'Anim', link: '/concepts/anim' },
  { text: 'Material', link: '/concepts/material' },
  { text: 'PostFX & Particles', link: '/concepts/postfx' },
  { text: 'Chart', link: '/concepts/chart' },
  { text: 'Interaction', link: '/concepts/interact' },
  { text: 'Stream', link: '/concepts/stream' },
  { text: 'Scaling to Millions', link: '/concepts/scale' },
];

export default defineConfig({
  title: 'Graph3D.js',
  description: "A developer-first 3D data visualization framework that treats charts as fully inspectable, fully controllable Three.js scenes — not black-box widgets.",
  srcDir: '.',
  cleanUrls: true,

  // scripts/docs-api.js renders each public class on its own page (one
  // jsdoc-to-markdown run per class), so a JSDoc type reference pointing at
  // a typedef/property that has no page of its own (e.g. CapabilityProbe's
  // `@returns {Capabilities}`) comes out as a dangling `./Capabilities`-style
  // relative link — a known limitation of that one-file-per-class approach,
  // not a real broken link anywhere in this site's hand-written docs (which
  // always use root-absolute `/concepts/...` links, never relative `./`).
  ignoreDeadLinks: [/^\.\//],

  themeConfig: {
    nav: [
      { text: 'Guide', link: '/getting-started' },
      { text: 'Concepts', link: '/concepts/' },
      { text: 'Chart Types', link: '/chart-types/' },
      { text: 'Recipes', link: '/recipes/' },
      { text: 'API Reference', link: '/api/' },
      { text: 'Migration', link: '/migration/' },
      { text: 'Playground', link: '/playground' },
    ],

    sidebar: {
      '/concepts/': conceptsSidebar,
      '/api/': apiSidebar(),
      '/': [
        { text: 'Introduction', link: '/' },
        { text: 'Getting Started', link: '/getting-started' },
      ],
    },

    search: { provider: 'local' },
  },
});
