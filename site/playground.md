---
layout: page
aside: false
---

<script setup>
import PlaygroundDemo from './.vitepress/theme/components/PlaygroundDemo.vue';
</script>

<div class="vp-doc" style="padding: 24px;">

# Playground

Edit Graph3D.js code on the left, click **Run** (or `Ctrl`/`Cmd`+`Enter`) to
render it on the right — no local setup. The preview runs your code as a
real ES module in an isolated iframe; `graph3d.js` resolves to this site's
own built library, `three` to [esm.sh](https://esm.sh/three), so it behaves
exactly like a real project with both installed.

<ClientOnly>
  <PlaygroundDemo />
</ClientOnly>

For a local, hot-reloading sandbox wired to this repository's own source
(not the published package) instead of the browser above:

```bash
git clone <this repository>
cd graph3d.js
npm install
npm run dev
```

Edit `examples/playground/main.js` directly — every change hot-reloads.
Every other folder under `examples/` (`08-bar-chart/`, `09-line-chart/`, …,
`22-million-points/`, `23-live-trading/`) is a complete, runnable example of
one feature; run `npx vite examples/<folder> --config vite.config.js` to see
any of them live, or browse [Recipes](/recipes/) for a guided tour of the
same code.

</div>
