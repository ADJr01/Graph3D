export const VERSION = '0.1.0';

export { Graph3D } from './core/Graph3D.js';
export { GraphScene, GraphSceneCamera, GraphSceneClipping, GraphSceneEnvironment, GraphSceneLight, GraphSceneShadows, GraphSceneSetup } from './scene/index.js';
export { GraphObject, GraphInstancedObject, GraphMesh, GraphLine, GraphObjectFactory, INSTANCING_THRESHOLD, GraphObjectLoader, Octree, assignDepthJitter, validateGeometry, recomputeNormals, fixWinding } from './object/index.js';
export { Graph3DRenderer, SSRGraph3DRenderer } from './core/Graph3DRenderer.js';
export { GraphDevTools } from './core/GraphDevTools.js';
export { Graph3DLoop, loop } from './core/Graph3DLoop.js';
export { Graph3DRegistry, registry } from './core/Graph3DRegistry.js';
export { CapabilityProbe } from './core/CapabilityProbe.js';
export { FrameBudget } from './core/FrameBudget.js';
export { WorkerPool } from './core/WorkerPool.js';
export {
  scale,
  color,
  palette,
  generator,
  layout,
  transform,
  Selection,
  SelectionTransition,
  syncLabels,
  removeLabels,
  Axis,
  annotation,
  accessor,
  accessorField,
  buildBuffers,
  interpolate,
  interpolateNumber,
  interpolateRgb,
  interpolateHsl,
  interpolateLab,
  interpolateArray,
  interpolateObject,
} from './compose/index.js';
export { registerWorkerTask, createWorkerFactory } from './core/worker/workerBlob.js';
export {
  curve,
  spring,
  bezier,
  noise,
  resolve,
  GraphAnimKeyframe,
  GraphAnimTimeline,
  GraphAnim,
  anim,
  Transition,
  CameraTour,
} from './anim/index.js';
export { GraphObjectMaterial, material, SDFText, texture, effects, graphHTML, isHTMLInCanvasSupported, Label, label } from './material/index.js';
export { PostFX, ParticleSystem } from './postfx/index.js';
export { GraphChart, BarChart, LineChart, ScatterChart, AreaChart, SurfaceChart, HeatmapChart, NetworkChart, TreeChart, PackChart, PieChart, VolumeChart } from './chart/index.js';
export { Picker, StateMachine, PointerRouter, Brush, Lasso, link, KeyboardNav, FocusFollower } from './interact/index.js';
export { DataStream, Aggregator, LOD, OriginShift, GPGPU, JoinDiff, memoryPressure, middleware } from './stream/index.js';
