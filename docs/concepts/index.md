# Concepts

Graph3D.js is organized into strict, one-directional layers (CLAUDE.md §1.4 —
a layer may only import from layers listed below it). Each page here covers
one layer's public API, in the same bottom-to-top order the codebase itself
is built in:

| Layer | Owns |
|---|---|
| [Core Engine](/concepts/core) | Renderer, animation loop, registry, capability detection, workers, frame budget |
| [Scene Composition](/concepts/scene) | Cameras, lights, environment, shadows, clip planes |
| [Object & Mesh](/concepts/object) | Mesh/instancing wrappers, octree, model loaders |
| [Compose](/concepts/compose) | Scales, generators, layouts, palettes, Selection & data-join, axes, annotations |
| [Anim](/concepts/anim) | Timelines, keyframes, easing curves, transitions |
| [Material](/concepts/material) | Material presets, SDF text, procedural textures |
| [PostFX & Particles](/concepts/postfx) | EffectComposer passes, particle systems |
| [Chart](/concepts/chart) | The fluent chart API and all eleven chart types |
| [Interaction](/concepts/interact) | Picking, state machine, tooltips, brush, lasso, keyboard nav |
| [Stream](/concepts/stream) | Live data streams, workers, LOD, GPGPU, aggregation |

**[Scaling to Millions](/concepts/scale)** is a separate, practical recipe
page that walks through combining pieces from several of the layers above to
take a chart from thousands to millions of datums — read the layer pages
first for any one piece's own contract.

Every page's code snippets are runnable as written against the public
`graph3d.js` export — see [Getting Started](/getting-started) for how a
`Graph3D` instance, scene, and chart fit together before diving into an
individual layer.
