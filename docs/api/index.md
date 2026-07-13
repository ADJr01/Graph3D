# API Reference

Auto-generated from this codebase's own JSDoc (`npm run docs:api`, via
`jsdoc-to-markdown`) — one page per exported class, always regenerated
from source rather than hand-maintained, so it never drifts from the
real public API.

**Scope:** classes only. The namespace/function portion of the public
surface (`scale`, `generator`, `palette`, `layout`, `material`, `color`,
`curve`, `noise`, `texture`, `effects`, `transform`, `middleware`,
`interpolate`, `anim`, and standalone helpers) is plain-object/function
exports without a `@class` to anchor a page on — those are documented in
prose with runnable examples on the [Concepts](/concepts/) pages instead
of being thinly auto-extracted here. `types/index.d.ts` in the
repository remains the exact, authoritative type signature for every
member on this page.

## Core Engine

- [CapabilityProbe](/api/CapabilityProbe)
- [FrameBudget](/api/FrameBudget)
- [Graph3D](/api/Graph3D)
- [Graph3DLoop](/api/Graph3DLoop)
- [Graph3DRegistry](/api/Graph3DRegistry)
- [Graph3DRenderer](/api/Graph3DRenderer)
- [GraphDevTools](/api/GraphDevTools)
- [SSRGraph3DRenderer](/api/SSRGraph3DRenderer)
- [WorkerPool](/api/WorkerPool)

## Scene Composition

- [GraphScene](/api/GraphScene)
- [GraphSceneCamera](/api/GraphSceneCamera)
- [GraphSceneClipping](/api/GraphSceneClipping)
- [GraphSceneEnvironment](/api/GraphSceneEnvironment)
- [GraphSceneLight](/api/GraphSceneLight)
- [GraphSceneSetup](/api/GraphSceneSetup)
- [GraphSceneShadows](/api/GraphSceneShadows)

## Object & Mesh

- [GraphInstancedObject](/api/GraphInstancedObject)
- [GraphLine](/api/GraphLine)
- [GraphMesh](/api/GraphMesh)
- [GraphObject](/api/GraphObject)
- [GraphObjectFactory](/api/GraphObjectFactory)
- [GraphObjectLoader](/api/GraphObjectLoader)
- [Octree](/api/Octree)

## Compose

- [Axis](/api/Axis)
- [Selection](/api/Selection)
- [SelectionTransition](/api/SelectionTransition)

## Anim

- [CameraTour](/api/CameraTour)
- [GraphAnim](/api/GraphAnim)
- [GraphAnimKeyframe](/api/GraphAnimKeyframe)
- [GraphAnimTimeline](/api/GraphAnimTimeline)
- [Transition](/api/Transition)

## Material

- [GraphObjectMaterial](/api/GraphObjectMaterial)
- [SDFText](/api/SDFText)

## PostFX & Particles

- [ParticleSystem](/api/ParticleSystem)
- [PostFX](/api/PostFX)

## Chart

- [AreaChart](/api/AreaChart)
- [BarChart](/api/BarChart)
- [GraphChart](/api/GraphChart)
- [HeatmapChart](/api/HeatmapChart)
- [LineChart](/api/LineChart)
- [NetworkChart](/api/NetworkChart)
- [PackChart](/api/PackChart)
- [PieChart](/api/PieChart)
- [ScatterChart](/api/ScatterChart)
- [SurfaceChart](/api/SurfaceChart)
- [TreeChart](/api/TreeChart)
- [VolumeChart](/api/VolumeChart)

## Interaction

- [Brush](/api/Brush)
- [FocusFollower](/api/FocusFollower)
- [KeyboardNav](/api/KeyboardNav)
- [Lasso](/api/Lasso)
- [Picker](/api/Picker)
- [PointerRouter](/api/PointerRouter)
- [StateMachine](/api/StateMachine)

## Stream

- [Aggregator](/api/Aggregator)
- [DataStream](/api/DataStream)
- [GPGPU](/api/GPGPU)
- [JoinDiff](/api/JoinDiff)
- [LOD](/api/LOD)
- [OriginShift](/api/OriginShift)

## Namespaces & Functions (see Concepts)

`INSTANCING_THRESHOLD`, `VERSION`, `accessor`, `accessorField`, `anim`, `annotation`, `assignDepthJitter`, `bezier`, `buildBuffers`, `color`, `createWorkerFactory`, `curve`, `effects`, `fixWinding`, `generator`, `interpolate`, `interpolateArray`, `interpolateHsl`, `interpolateLab`, `interpolateNumber`, `interpolateObject`, `interpolateRgb`, `layout`, `link`, `loop`, `material`, `memoryPressure`, `middleware`, `noise`, `palette`, `recomputeNormals`, `registerWorkerTask`, `registry`, `resolve`, `scale`, `spring`, `texture`, `transform`, `validateGeometry`
