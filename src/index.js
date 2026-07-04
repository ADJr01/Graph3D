export const VERSION = '0.1.0';

export { Graph3D } from './core/Graph3D.js';
export { GraphScene, GraphSceneCamera, GraphSceneClipping, GraphSceneEnvironment, GraphSceneLight, GraphSceneShadows, GraphSceneSetup } from './scene/index.js';
export { GraphObject, GraphInstancedObject, GraphMesh, GraphObjectFactory, INSTANCING_THRESHOLD, GraphObjectLoader, Octree } from './object/index.js';
export { Graph3DRenderer } from './core/Graph3DRenderer.js';
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
  Selection,
  SelectionTransition,
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
export { GraphObjectMaterial, material, SDFText, texture } from './material/index.js';
export { PostFX, ParticleSystem } from './postfx/index.js';
export { GraphChart } from './chart/index.js';
