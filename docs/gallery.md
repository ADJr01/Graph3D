---
layout: page
aside: false
---

<script setup>
import GalleryDemo from './.vitepress/theme/components/GalleryDemo.vue';
</script>

<div class="vp-doc" style="padding: 24px;">

# Gallery

One of every chart type — `BarChart`, `LineChart`, `ScatterChart`,
`AreaChart`, `SurfaceChart`, `HeatmapChart`, `NetworkChart`, `TreeChart`,
`PackChart`, `PieChart`, `VolumeChart` — on one live scene. Switch the
theme or PostFX preset below; both apply to the whole gallery at once,
exactly as `scene.applyTheme()`/`graph3d.postfx.preset()` would in your own
code. Drag to orbit, scroll to zoom.

<ClientOnly>
  <GalleryDemo />
</ClientOnly>

Each chart's own construction code is a trimmed copy of `examples/19-gallery/main.js`
— open that file (or run `npx vite examples/19-gallery --config vite.config.js`)
to see it standalone, without the theme/postfx controls this page adds.

</div>
