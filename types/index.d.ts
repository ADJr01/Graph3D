// Hand-authored TypeScript declarations for Graph3D.js's public surface
// (Prompt 173) — mirrors exactly what `src/index.js` re-exports, nothing
// more. Generics flow from two entry points: `GraphChart<T>`/its chart
// subclasses (`.data()` and every per-datum accessor is typed against `T`)
// and `Selection<T>` (`.attr/.style/.filter/.each/.on/.transition` all
// thread `T` through). Every other layer keeps its datum-shaped parameters
// as `unknown`/inline generics only where the source itself is generic
// (e.g. `GraphInstancedObject<T>`, `DataStream<T>`) — see prompts.md #173's
// own wording, which only asks for those two generic flows.
//
// Every D3-style "read with no args, write and return `this` with one" method
// is declared as two overloads (a no-arg getter, and an arg-taking setter
// returning `this`) rather than one combined `X | this` signature — a single
// combined signature can't be resolved by TS at a call site with an argument
// present, which breaks exactly the fluent chaining
// (`chart.x(...).y(...).material(...)`) this API exists for.
//
// JSDoc across `src/` is the source of truth this file was transcribed
// from (CLAUDE.md §1.6: "the JSDoc is the contract"); Prompt 174 wires a
// `tsc --noEmit --allowJs` drift check so the two can't silently diverge.

import type * as THREE from 'three';

// ============================================================================
// Shared helper types
// ============================================================================

export type Predicate<T> = (datum: T, index: number) => boolean;
export type Comparator<T> = (a: T, b: T) => number;
export type EasingFn = (t: number) => number;
export type EasingInput = string | EasingFn;

/**
 * The input `GraphChart.color/size/shape/opacity`-style accessor setters
 * accept — a constant or a per-datum accessor. Deliberately does NOT union
 * in `AnyScale` (unlike `x/y/z`, see below): a union of two differently-
 * shaped call signatures defeats TS's contextual typing for an arrow
 * function argument, forcing every `(d) => ...` callback at the call site
 * to fall back to implicit `any` instead of inferring `d: T`.
 */
export type ValueOrAccessor<T> = number | string | boolean | ((datum: T, index: number) => unknown);
/** `GraphChart.x/y/z`'s first argument — a constant, an accessor, or a scale (scales are callable) — kept for reference; `x/y/z` themselves use two non-unioned overloads instead of this directly, for the same contextual-typing reason as `ValueOrAccessor`. */
export type AxisInput<T> = ValueOrAccessor<T> | AnyScale;

/** Minimal shared shape every `compose/scale`/`compose/color` instance satisfies — enough to pass as `GraphChart.x(accessor, scaleObj)`'s second argument. */
export interface AnyScale {
  (value: any): any;
  domain?(...args: any[]): any;
  range?(...args: any[]): any;
  copy?(): AnyScale;
}

export interface ComputedBuffers {
  positions: Float32Array;
  scales?: Float32Array;
  colors?: Float32Array | null;
  attributes?: Record<string, Float32Array>;
  indices?: Uint32Array;
  normals?: Float32Array;
  rows?: number;
  cols?: number;
}

/** Duck-typed `compose/generator` instance — the second argument `GraphChart`'s constructor requires. */
export interface GeneratorLike<T = any> {
  compute(data: T[]): ComputedBuffers;
  x?(accessorOrScale?: unknown): unknown;
  y?(accessorOrScale?: unknown): unknown;
  z?(accessorOrScale?: unknown): unknown;
  shape?(type?: string): unknown;
}

export const VERSION: string;

// ============================================================================
// compose/selection — Selection<T>, JoinResult<T>, SelectionTransition<T>
// ============================================================================

export interface MeshesBackend {
  type: 'meshes';
  meshes: GraphMesh[];
  template?: { scene: THREE.Scene; name: string; geometry: THREE.BufferGeometry; material: THREE.Material | THREE.Material[] };
}
export interface InstancedBackend {
  type: 'instanced';
  object: GraphInstancedObject<unknown>;
  indices: Uint32Array;
}
export type SelectionBackend = MeshesBackend | InstancedBackend;

export interface SelectionHit<T = unknown> {
  mesh: THREE.Object3D;
  instanceIndex: number | null;
  datum: T;
  worldPoint: THREE.Vector3;
  domEvent: unknown;
}

/** A per-datum handle to one member of a `Selection` — returned by `Selection.nodes()`. */
export class SelectionNode<T = unknown> {
  private constructor(selection: Selection<T>, index: number);
  get index(): number;
  get datum(): T;
}

/**
 * A uniform per-datum handle set over either rendering backend a chart uses
 * (individual `GraphMesh`es, or one `GraphInstancedObject`). Not constructed
 * directly by user code — obtained from `GraphChart.selection()`,
 * `GraphScene.selectAll()`, or a data join's `JoinResult`.
 */
export class Selection<T = unknown> {
  constructor(backend: SelectionBackend);
  get backend(): SelectionBackend;
  size(): number;
  empty(): boolean;
  datum(index: number): T;
  data(): T[];
  data(newData: T[], keyFn?: (datum: T, index: number) => unknown): JoinResult<T>;
  nodes(): SelectionNode<T>[];
  attr<R = unknown>(path: string, valueOrFn: R | ((datum: T, index: number) => R)): this;
  style<R = unknown>(materialProp: string, valueOrFn: R | ((datum: T, index: number) => R)): this;
  filter(predicateFn: Predicate<T>): Selection<T>;
  each(fn: (datum: T, index: number, handle: SelectionNode<T>) => void): this;
  sort(comparator: Comparator<T>): Selection<T>;
  call(fn: (selection: Selection<T>, ...args: any[]) => void, ...args: any[]): this;
  merge(other: Selection<T>): Selection<T>;
  remove(animationName?: string, options?: { system?: { preset(name: string, opts: object): void } }): this;
  dispose(): void;
  transition(): SelectionTransition<T>;
  on(event: string, handler: (datum: T, index: number, event: unknown, worldPoint: THREE.Vector3) => void): this;
  static dispatch(eventName: string, hit: SelectionHit): void;
}

/**
 * The result of `Selection.data(newData, keyFn)` — *is* the update
 * selection, extended with `.enter()`/`.exit()`/`.join()`.
 */
export class JoinResult<T = unknown> extends Selection<T> {
  private constructor(updateBackend: SelectionBackend, enterEntries: { datum: T; newIndex: number }[], exitBackend: SelectionBackend);
  enter(): Selection<T>;
  exit(): Selection<T>;
  join(
    enterFn?: (enterSelection: Selection<T>) => void,
    updateFn?: (updateSelection: this) => void,
    exitFn?: (exitSelection: Selection<T>) => void,
  ): Selection<T>;
}

/** `Selection.transition()`'s return value — an animated counterpart to `.attr()`/`.style()`/`.remove()`. Not constructed directly. */
export class SelectionTransition<T = unknown> {
  private constructor(backend: SelectionBackend, size: number, datumAt: (index: number) => T);
  duration(ms: number): this;
  delay(msOrFn: number | ((datum: T, index: number) => number)): this;
  easing(nameOrFn: EasingInput): this;
  on(event: 'start' | 'end' | 'interrupt', handler: () => void): this;
  attr<R = unknown>(path: string, valueOrFn: R | ((datum: T, index: number) => R)): this;
  style<R = unknown>(materialProp: string, valueOrFn: R | ((datum: T, index: number) => R)): this;
  remove(): this;
  stop(): void;
}

// ============================================================================
// compose/ — scale, color, palette, generator, layout, transform, Axis, annotation
// ============================================================================

export interface ContinuousScale {
  (value: number): number;
  domain(): number[];
  domain(values: number[]): this;
  range(): number[];
  range(values: number[]): this;
  clamp(): boolean;
  clamp(enabled: boolean): this;
  nice(count?: number): this;
  invert(value: number): number;
  ticks(count?: number): number[];
  tickFormat(count?: number, specifier?: string): (value: number) => string;
  copy(): ContinuousScale;
}
export interface PowScale extends ContinuousScale {
  exponent(): number;
  exponent(value: number): this;
  copy(): PowScale;
}
export interface LogScale {
  (value: number): number;
  domain(): number[];
  domain(values: number[]): this;
  range(): number[];
  range(values: number[]): this;
  clamp(): boolean;
  clamp(enabled: boolean): this;
  nice(count?: number): this;
  invert(value: number): number;
  base(): number;
  base(value: number): this;
  ticks(count?: number): number[];
  tickFormat(count?: number, specifier?: string): (value: number) => string;
  copy(): LogScale;
}
export interface TimeScale {
  (value: number): number;
  domain(): Date[];
  domain(values: Array<Date | number>): this;
  range(): number[];
  range(values: number[]): this;
  clamp(): boolean;
  clamp(enabled: boolean): this;
  invert(value: number): Date;
  ticks(count?: number): Date[];
  tickFormat(count?: number, specifier?: string): (date: Date) => string;
  copy(): TimeScale;
}
export interface OrdinalScale<T = unknown, U = unknown> {
  (value: T): U;
  domain(): T[];
  domain(values: T[]): this;
  range(): U[];
  range(values: U[]): this;
  copy(): OrdinalScale<T, U>;
}
export interface BandScale<T = unknown> {
  (value: T): number;
  domain(): T[];
  domain(values: T[]): this;
  range(): [number, number];
  range(values: [number, number]): this;
  bandwidth(): number;
  padding(): number;
  padding(value: number): this;
  paddingInner(): number;
  paddingInner(value: number): this;
  paddingOuter(): number;
  paddingOuter(value: number): this;
  align(): number;
  align(value: number): this;
  copy(): BandScale<T>;
}
export interface PointScale<T = unknown> {
  (value: T): number;
  domain(): T[];
  domain(values: T[]): this;
  range(): [number, number];
  range(values: [number, number]): this;
  bandwidth(): number;
  padding(): number;
  padding(value: number): this;
  align(): number;
  align(value: number): this;
  copy(): PointScale<T>;
}

export const scale: {
  linear(): ContinuousScale;
  pow(exponentInit?: number): PowScale;
  sqrt(): PowScale;
  log(base?: number): LogScale;
  time(): TimeScale;
  ordinal<T = unknown, U = unknown>(): OrdinalScale<T, U>;
  band<T = unknown>(): BandScale<T>;
  point<T = unknown>(): PointScale<T>;
};

export interface SequentialColorScale<T = string> {
  (value: number): T;
  domain(): [number, number];
  domain(values: [number, number]): this;
  copy(): SequentialColorScale<T>;
}
export interface DivergingColorScale<T = string> {
  (value: number): T;
  domain(): [number, number, number];
  domain(values: [number, number, number]): this;
  copy(): DivergingColorScale<T>;
}
export interface QuantizeScale<T = string> {
  (value: number): T;
  domain(): [number, number];
  domain(values: [number, number]): this;
  range(): T[];
  range(values: T[]): this;
  copy(): QuantizeScale<T>;
}
export interface QuantileScale<T = string> {
  (value: number): T;
  domain(): number[];
  domain(values: number[]): this;
  range(): T[];
  range(values: T[]): this;
  quantiles(): number[];
  copy(): QuantileScale<T>;
}
export interface ThresholdScale<T = string> {
  (value: number): T;
  domain(): number[];
  domain(values: number[]): this;
  range(): T[];
  range(values: T[]): this;
  copy(): ThresholdScale<T>;
}

export const color: {
  sequential<T = string>(palette: ((t: number) => T) | T[], domain?: [number, number]): SequentialColorScale<T>;
  diverging<T = string>(palette: ((t: number) => T) | T[], domain?: [number, number, number]): DivergingColorScale<T>;
  categorical<T = string>(colors: T[]): OrdinalScale<unknown, T>;
  quantize<T = string>(): QuantizeScale<T>;
  quantile<T = string>(): QuantileScale<T>;
  threshold<T = string>(): ThresholdScale<T>;
};

/** A precomputed 256-step color ramp — every `palette.*` sequential/diverging entry. */
export interface PaletteRamp {
  (t: number): string;
  colors: string[];
}
/** A cycling categorical palette — every `palette.category10`-style entry. */
export interface CategoricalPalette<T = unknown> {
  (value: T): string;
  colors: string[];
  categorical: true;
}

export const palette: {
  viridis: PaletteRamp; inferno: PaletteRamp; magma: PaletteRamp; plasma: PaletteRamp; cividis: PaletteRamp; turbo: PaletteRamp;
  warm: PaletteRamp; cool: PaletteRamp; rainbow: PaletteRamp; sinebow: PaletteRamp;
  spectral: PaletteRamp; RdYlBu: PaletteRamp; RdBu: PaletteRamp; BrBG: PaletteRamp; PiYG: PaletteRamp;
  blues: PaletteRamp; greens: PaletteRamp; oranges: PaletteRamp; purples: PaletteRamp; reds: PaletteRamp; greys: PaletteRamp;
  category10: CategoricalPalette; tableau10: CategoricalPalette; accent: CategoricalPalette; dark2: CategoricalPalette;
  paired: CategoricalPalette; pastel: CategoricalPalette; set1: CategoricalPalette; set2: CategoricalPalette; set3: CategoricalPalette;
  interpolateRGB(colors: string[]): PaletteRamp;
  interpolateHSL(colors: string[]): PaletteRamp;
  interpolateLAB(colors: string[]): PaletteRamp;
  fromCSS(colors: string[]): PaletteRamp;
};

export function accessor<T = unknown, R = unknown>(valueOrFn: R | ((datum: T, index: number) => R)): (datum: T, index: number) => R;
export function accessorField<T = unknown, R = unknown>(
  target: object,
  initial: R | ((datum: T, index: number) => R),
): (valueOrFn?: R | ((datum: T, index: number) => R)) => ((datum: T, index: number) => R) | object;
export function buildBuffers<T = unknown>(
  data: T[],
  resolve: (datum: T, index: number) => {
    position: [number, number, number];
    scale?: [number, number, number];
    color?: [number, number, number];
    attributes?: Record<string, number | number[]>;
  },
): { positions: Float32Array; scales: Float32Array; colors: Float32Array | null; attributes: Record<string, Float32Array> };

export interface BarGenerator {
  x(): unknown;
  x(accessorOrScale: ValueOrAccessor<unknown>): this;
  y(): unknown;
  y(accessorOrScale: ValueOrAccessor<unknown>): this;
  width(): unknown;
  width(accessorOrScale: ValueOrAccessor<unknown>): this;
  depth(): unknown;
  depth(accessorOrScale: ValueOrAccessor<unknown>): this;
  baseline(): unknown;
  baseline(accessorOrScale: ValueOrAccessor<unknown>): this;
  compute(data: unknown[]): ComputedBuffers;
}
export interface LineGenerator {
  x(): unknown;
  x(accessorOrScale: ValueOrAccessor<unknown>): this;
  y(): unknown;
  y(accessorOrScale: ValueOrAccessor<unknown>): this;
  z(): unknown;
  z(accessorOrScale: ValueOrAccessor<unknown>): this;
  curve(): CurveType;
  curve(type: CurveType): this;
  tension(): number;
  tension(value: number): this;
  compute(data: unknown[]): { positions: Float32Array };
}
export interface PointGenerator {
  x(): unknown;
  x(accessorOrScale: ValueOrAccessor<unknown>): this;
  y(): unknown;
  y(accessorOrScale: ValueOrAccessor<unknown>): this;
  z(): unknown;
  z(accessorOrScale: ValueOrAccessor<unknown>): this;
  size(): unknown;
  size(accessorOrScale: ValueOrAccessor<unknown>): this;
  shape(): 'sphere' | 'cube' | 'cone' | 'custom';
  shape(type: 'sphere' | 'cube' | 'cone' | 'custom'): this;
  compute(data: unknown[]): ComputedBuffers & { shape: string };
}
export interface SurfaceGenerator {
  values(): ((x: number, z: number) => number) | undefined;
  values(source: number[][] | ((x: number, z: number) => number)): this;
  xDomain(): [number, number];
  xDomain(domain: [number, number]): this;
  zDomain(): [number, number];
  zDomain(domain: [number, number]): this;
  resolution(): number;
  resolution(segments: number): this;
  compute(): { positions: Float32Array; indices: Uint32Array; normals: Float32Array; rows: number; cols: number };
}
export interface ArcGenerator {
  innerRadius(): unknown;
  innerRadius(accessorOrScale: ValueOrAccessor<unknown>): this;
  outerRadius(): unknown;
  outerRadius(accessorOrScale: ValueOrAccessor<unknown>): this;
  startAngle(): unknown;
  startAngle(accessorOrScale: ValueOrAccessor<unknown>): this;
  endAngle(): unknown;
  endAngle(accessorOrScale: ValueOrAccessor<unknown>): this;
  extrude(): unknown;
  extrude(accessorOrScale: ValueOrAccessor<unknown>): this;
  compute(data: unknown[]): { positions: Float32Array; indices: Uint32Array; normals: Float32Array };
}
export interface AreaGenerator {
  x(): unknown;
  x(accessorOrScale: ValueOrAccessor<unknown>): this;
  y(): unknown;
  y(accessorOrScale: ValueOrAccessor<unknown>): this;
  z(): unknown;
  z(accessorOrScale: ValueOrAccessor<unknown>): this;
  baseline(): number;
  baseline(value: number): this;
  curve(): CurveType;
  curve(type: CurveType): this;
  tension(): number;
  tension(value: number): this;
  compute(data: unknown[]): { positions: Float32Array; indices: Uint32Array; normals: Float32Array };
}
export interface HeatmapGenerator {
  x(): unknown;
  x(accessorOrScale: ValueOrAccessor<unknown>): this;
  y(): unknown;
  y(accessorOrScale: ValueOrAccessor<unknown>): this;
  z(): unknown;
  z(accessorOrScale: ValueOrAccessor<unknown>): this;
  width(): unknown;
  width(accessorOrScale: ValueOrAccessor<unknown>): this;
  height(): unknown;
  height(accessorOrScale: ValueOrAccessor<unknown>): this;
  depth(): unknown;
  depth(accessorOrScale: ValueOrAccessor<unknown>): this;
  compute(data: unknown[]): ComputedBuffers;
}

export const generator: {
  bar(): BarGenerator;
  line(): LineGenerator;
  point(): PointGenerator;
  surface(): SurfaceGenerator;
  arc(): ArcGenerator;
  area(): AreaGenerator;
  heatmap(): HeatmapGenerator;
};

export interface StackedSeries extends Array<[number, number]> {
  key: string;
  index: number;
}
export interface StackLayout<T = unknown> {
  (data: T[]): StackedSeries[];
  keys(): string[] | ((data: T[]) => string[]);
  keys(keysOrFn: string[] | ((data: T[]) => string[])): this;
  value(): (datum: T, key: string, index: number, data: T[]) => number;
  value(valueOrFn: (datum: T, key: string, index: number, data: T[]) => number): this;
  order(): (series: StackedSeries[]) => number[];
  order(orderFn: (series: StackedSeries[]) => number[]): this;
  offset(): (series: StackedSeries[], order: number[]) => void;
  offset(offsetFn: (series: StackedSeries[], order: number[]) => void): this;
}
export interface GridLayout {
  (index: number): { x: number; y: number; z: number; row: number; col: number };
  rows: number;
  cols: number;
  cellWidth: number;
  cellDepth: number;
  count: number;
}
export interface ForceNode {
  x: number; y: number; z: number;
  vx?: number; vy?: number; vz?: number;
  fx?: number | null; fy?: number | null; fz?: number | null;
  [key: string]: unknown;
}
export type ForceFn = (nodes: ForceNode[], alpha: number) => void;
export interface ForceLink { source: number | ForceNode; target: number | ForceNode; }
export interface ForceFactory {
  (): ForceSimulation;
  link(links?: ForceLink[], options?: { distance?: number | ((link: ForceLink) => number); strength?: number | ((link: ForceLink) => number) }): ForceFn;
  charge(strength?: number, options?: { distanceMin?: number; distanceMax?: number; theta?: number }): ForceFn;
  center(x?: number, y?: number, z?: number, strength?: number): ForceFn;
  collide(radius?: number | ((node: ForceNode, index: number, nodes: ForceNode[]) => number), strength?: number): ForceFn;
  radial(radius: number | ((node: ForceNode) => number), x?: number, y?: number, z?: number, strength?: number): ForceFn;
  cluster(keyFn: (node: ForceNode) => unknown, strength?: number): ForceFn;
}
export class ForceSimulation {
  nodes(): ForceNode[];
  nodes(nodes: ForceNode[]): this;
  force(name: string): ForceFn | undefined;
  force(name: string, forceInstance: ForceFn | null): this;
  alpha(): number;
  alpha(value: number): this;
  alphaMin(): number;
  alphaMin(value: number): this;
  alphaDecay(): number;
  alphaDecay(value: number): this;
  alphaTarget(): number;
  alphaTarget(value: number): this;
  velocityDecay(): number;
  velocityDecay(value: number): this;
  active(): boolean;
  tick(): boolean;
  restart(): this;
  stop(): this;
}
export interface HierarchyNode<T = unknown> {
  data: T;
  parent: HierarchyNode<T> | null;
  children: HierarchyNode<T>[] | null;
  depth: number;
  height: number;
  value: number;
  x: number;
  y: number;
  z: number;
  r: number;
}
export interface PieSlice<T = unknown> {
  data: T;
  value: number;
  index: number;
  startAngle: number;
  endAngle: number;
  padAngle: number;
}
export interface PieLayout<T = unknown> {
  (data: T[]): PieSlice<T>[];
  value(): (datum: T, index: number) => number;
  value(valueOrFn: (datum: T, index: number) => number): this;
  sort(): Comparator<T> | null;
  sort(compareFn: Comparator<T> | null): this;
  startAngle(): number;
  startAngle(value: number): this;
  endAngle(): number;
  endAngle(value: number): this;
  padAngle(): number;
  padAngle(value: number): this;
}

export const layout: {
  stack<T = unknown>(): StackLayout<T>;
  grid(config: { rows: number; cols: number; cellWidth?: number; cellDepth?: number }): GridLayout;
  force: ForceFactory;
  pack<T = unknown>(options?: { children?: (d: T) => T[] | undefined; value?: (d: T) => number; sort?: Comparator<T>; padding?: number }): (data: T) => HierarchyNode<T>;
  tree<T = unknown>(options?: { children?: (d: T) => T[] | undefined; value?: (d: T) => number; sort?: Comparator<T>; levelHeight?: number; levelRadius?: number }): (data: T) => HierarchyNode<T>;
  pie<T = unknown>(): PieLayout<T>;
};

export const transform: {
  smooth(window: number): (data: number[]) => number[];
  decimate<T = unknown>(target: number): (data: T[]) => T[];
  aggregate<T = unknown, K = unknown, U = unknown>(keyFn: (datum: T, index: number) => K, reducer: (group: T[], key: K) => U): (data: T[]) => U[];
  normalize(field: string): (data: object[]) => object[];
  sort<T = unknown>(compareFn: Comparator<T>): (data: T[]) => T[];
};

export type CurveType = 'linear' | 'monotone' | 'catmullRom' | 'bezier';

export class Axis<T = unknown> {
  constructor();
  scale(): AnyScale | undefined;
  scale(s: AnyScale): this;
  orientation(): 'x' | 'y' | 'z';
  orientation(o: 'x' | 'y' | 'z'): this;
  tickCount(): number;
  tickCount(n: number): this;
  tickFormat(): ((value: T) => string) | undefined;
  tickFormat(fn: (value: T) => string): this;
  tickSize(): number;
  tickSize(n: number): this;
  labelStyle(): object;
  labelStyle(style: object): this;
  readonly labels: object[];
  render(scene: THREE.Scene, name: string): this;
  dispose(): void;
}

export interface LabelAnnotation {
  type: 'label';
  text: string;
  position: { x: number; y: number; z: number };
  style: object;
  on(event: 'click', handler: (...args: any[]) => void): LabelAnnotation;
  emit(event: string, ...args: any[]): void;
}

export const annotation: {
  label(config: { text: string; position?: { x?: number; y?: number; z?: number }; style?: object }): LabelAnnotation;
  callout(config: {
    scene: THREE.Scene; name: string;
    from: { x: number; y: number; z: number }; to: { x: number; y: number; z: number };
    text: string; style?: object;
  }): { type: 'callout'; line: GraphMesh; label: LabelAnnotation; dispose(): void };
  referenceLine<T = number>(scale: (value: T) => number, value: T, config: { scene: THREE.Scene; name: string; orientation?: 'x' | 'y' | 'z'; extent?: number }): GraphMesh;
  referencePlane(axis: 'x' | 'y' | 'z', value: number, config: { scene: THREE.Scene; name: string; size?: number }): GraphMesh;
  region(box: { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } }, config: { scene: THREE.Scene; name: string }): GraphMesh;
};

export function interpolate<T = unknown>(a: T, b: T): (t: number) => T;
export function interpolateNumber(a: number, b: number): (t: number) => number;
export function interpolateRgb(a: string | { r: number; g: number; b: number }, b: string | { r: number; g: number; b: number }): (t: number) => string | { r: number; g: number; b: number };
export function interpolateHsl(a: string | { r: number; g: number; b: number }, b: string | { r: number; g: number; b: number }): (t: number) => string | { r: number; g: number; b: number };
export function interpolateLab(a: string | { r: number; g: number; b: number }, b: string | { r: number; g: number; b: number }): (t: number) => string | { r: number; g: number; b: number };
export function interpolateArray<T = unknown>(a: T[], b: T[]): (t: number) => T[];
export function interpolateObject<T extends object = object>(a: T, b: T): (t: number) => T;

// ============================================================================
// anim/
// ============================================================================

export const curve: {
  linear: EasingFn;
  easeInQuad: EasingFn; easeOutQuad: EasingFn; easeInOutQuad: EasingFn;
  easeInCubic: EasingFn; easeOutCubic: EasingFn; easeInOutCubic: EasingFn;
  easeInQuart: EasingFn; easeOutQuart: EasingFn; easeInOutQuart: EasingFn;
  easeInQuint: EasingFn; easeOutQuint: EasingFn; easeInOutQuint: EasingFn;
  easeInSine: EasingFn; easeOutSine: EasingFn; easeInOutSine: EasingFn;
  easeInExpo: EasingFn; easeOutExpo: EasingFn; easeInOutExpo: EasingFn;
  easeInCirc: EasingFn; easeOutCirc: EasingFn; easeInOutCirc: EasingFn;
  easeInBounce: EasingFn; easeOutBounce: EasingFn; easeInOutBounce: EasingFn;
  easeInBack: EasingFn; easeOutBack: EasingFn; easeInOutBack: EasingFn;
  easeInElastic: EasingFn; easeOutElastic: EasingFn; easeInOutElastic: EasingFn;
};
export function spring(stiffness?: number, damping?: number): EasingFn;
export function bezier(x1: number, y1: number, x2: number, y2: number): EasingFn;
export function noise(seed?: number): EasingFn;
export function resolve(nameOrFn: EasingInput): EasingFn;

export class GraphAnimKeyframe<T = unknown> {
  constructor(path: string, stops: { offset: number; value: T }[]);
  get path(): string;
  valueAt(t: number): T;
  apply(target: object, t: number): this;
}

export class GraphAnimTimeline {
  constructor(target: object);
  get duration(): number;
  get time(): number;
  get isPlaying(): boolean;
  to(props: Record<string, unknown>, options?: { duration?: number; easing?: EasingInput; delay?: number }): this;
  from(props: Record<string, unknown>, options?: { duration?: number; easing?: EasingInput; delay?: number }): this;
  wait(duration: number): this;
  then(): this;
  loop(count?: number, mode?: 'restart' | 'pingpong'): this;
  play(): this;
  pause(): this;
  stop(): this;
  reverse(): this;
  seek(time: number): this;
  interruptPath(path: string): boolean;
  onUpdate(fn: (time: number, timeline: this) => void): this;
  onComplete(fn: (timeline: this) => void): this;
  onGroupComplete(fn: (timeline: this) => void): this;
  update(deltaSeconds: number): void;
  dispose(): void;
}

export class GraphAnim {
  timeline(target: object): GraphAnimTimeline;
  add(timeline: GraphAnimTimeline): GraphAnimTimeline;
  remove(timeline: GraphAnimTimeline): void;
  tween<T = unknown>(from: T, to: T, options: { duration?: number; easing?: EasingInput; delay?: number }, onUpdate: (value: T) => void): GraphAnimTimeline;
  get respectReducedMotion(): boolean;
  set respectReducedMotion(value: boolean);
  pause(): void;
  resume(): void;
  get isPaused(): boolean;
  get size(): number;
  get timelines(): GraphAnimTimeline[];
  dispose(): void;
}

/** The shared `GraphAnim` singleton every `Transition`/`SelectionTransition` schedules against. */
export const anim: GraphAnim;

export class Transition {
  constructor(target: object);
  duration(ms: number): this;
  delay(msOrFn: number | (() => number)): this;
  easing(nameOrFn: EasingInput): this;
  on(event: 'start' | 'end' | 'interrupt', handler: () => void): this;
  to(props: Record<string, unknown>): GraphAnimTimeline;
  static runningOn(target: object): number;
  static cancelAllOn(target: object): number;
}

export interface CameraWaypoint {
  at: number[];
  lookAt: number[];
  fov?: number;
  duration?: number;
  easing?: EasingInput;
}

export class CameraTour {
  constructor(camera: THREE.Camera, waypoints: CameraWaypoint[]);
  get isPlaying(): boolean;
  get currentWaypointIndex(): number;
  play(): this;
  pause(): this;
  resume(): this;
  skipToNext(): this;
  onComplete(handler: () => void): this;
  cancel(): this;
  static orbit(camera: THREE.Camera, options?: { center?: number[]; radius?: number; height?: number; duration?: number; segments?: number; easing?: EasingInput }): CameraTour;
  static flyTo(camera: THREE.Camera, options: CameraWaypoint): CameraTour;
  static cinematicReveal(camera: THREE.Camera, options?: {
    target?: number[]; startRadius?: number; endRadius?: number; startHeight?: number; endHeight?: number;
    startFov?: number; endFov?: number; duration?: number; easing?: EasingInput;
  }): CameraTour;
}

// ============================================================================
// material/
// ============================================================================

export class GraphObjectMaterial {
  constructor(target: GraphMesh | GraphInstancedObject<unknown>);
  get material(): THREE.Material;
  set(material: THREE.Material): this;
  applyShader(shaderMaterial: THREE.ShaderMaterial, options?: { preserveUniforms?: boolean }): this;
  bindUniforms(uniforms: Record<string, 'auto' | unknown>): this;
  setMap(slot: 'map' | 'normal' | 'roughness' | 'metalness' | 'emissive' | 'ao' | 'env' | 'displacement' | 'clearcoat', texture: THREE.Texture): this;
  dispose(): void;
}

export class SDFText {
  private constructor(mesh: THREE.Mesh, width: number, height: number);
  get mesh(): THREE.Mesh;
  get three(): THREE.Mesh;
  get width(): number;
  get height(): number;
  dispose(): void;
  static create(text: string, options?: {
    fontSize?: number; letterSpacing?: number; align?: 'left' | 'center' | 'right';
    color?: string | number | THREE.Color;
    outline?: { color?: string | number | THREE.Color; width?: number } | false;
    glow?: { color?: string | number | THREE.Color; width?: number; intensity?: number } | false;
  }): Promise<SDFText>;
}

export interface EffectPreset {
  name: string;
  defaultOptions: object;
  schema: Record<string, string>;
  needsLocalPosition: boolean;
  uniformDecls(slot: string): string;
  buildUniforms(slot: string, options: object): Record<string, { value: unknown }>;
  vertexChunk?(slot: string): string;
  fragmentChunk(slot: string): string;
}

export const effects: {
  list(): { name: string; options: Record<string, string> }[];
  has(name: string): boolean;
  get(name: string): EffectPreset;
};

export const texture: {
  gradient(options?: { type?: 'linear' | 'radial'; from?: string | number | THREE.Color; to?: string | number | THREE.Color; angle?: number; size?: number }): THREE.DataTexture;
  noise(options?: { scale?: number; seed?: number; size?: number; color1?: string | number | THREE.Color; color2?: string | number | THREE.Color }): THREE.DataTexture;
  voronoi(options?: { cellCount?: number; seed?: number; size?: number; color1?: string | number | THREE.Color; color2?: string | number | THREE.Color }): THREE.DataTexture;
  checkerboard(options?: { tiles?: number; size?: number; color1?: string | number | THREE.Color; color2?: string | number | THREE.Color }): THREE.DataTexture;
  dots(options?: { tiles?: number; radius?: number; size?: number; color1?: string | number | THREE.Color; color2?: string | number | THREE.Color }): THREE.DataTexture;
  lines(options?: { tiles?: number; thickness?: number; angle?: number; size?: number; color1?: string | number | THREE.Color; color2?: string | number | THREE.Color }): THREE.DataTexture;
  cellular(options?: { cellCount?: number; seed?: number; edgeWidth?: number; size?: number; color1?: string | number | THREE.Color; color2?: string | number | THREE.Color }): THREE.DataTexture;
  paletteTexture(palette: PaletteRamp): THREE.DataTexture;
};

export const material: {
  standard(options?: THREE.MeshStandardMaterialParameters): THREE.MeshStandardMaterial;
  physical(options?: THREE.MeshPhysicalMaterialParameters): THREE.MeshPhysicalMaterial;
  basic(options?: THREE.MeshBasicMaterialParameters): THREE.MeshBasicMaterial;
  lambert(options?: THREE.MeshLambertMaterialParameters): THREE.MeshLambertMaterial;
  phong(options?: THREE.MeshPhongMaterialParameters): THREE.MeshPhongMaterial;
  toon(options?: THREE.MeshToonMaterialParameters): THREE.MeshToonMaterial;
  matcap(options?: THREE.MeshMatcapMaterialParameters): THREE.MeshMatcapMaterial;
  holographic(options?: { intensity?: number; scanlineFrequency?: number; color1?: string | number | THREE.Color; color2?: string | number | THREE.Color } & THREE.ShaderMaterialParameters): THREE.ShaderMaterial;
  crystal(options: { envMap: THREE.CubeTexture; ior?: number; dispersion?: number; causticIntensity?: number; color?: string | number | THREE.Color } & THREE.ShaderMaterialParameters): THREE.ShaderMaterial;
  glass(options?: THREE.MeshPhysicalMaterialParameters): THREE.MeshPhysicalMaterial;
  frostedGlass(options?: THREE.MeshPhysicalMaterialParameters): THREE.MeshPhysicalMaterial;
  neon(options?: { emissive?: string | number | THREE.Color; emissiveIntensity?: number; pulse?: boolean | { min?: number; max?: number; speed?: number } } & THREE.MeshStandardMaterialParameters): THREE.MeshStandardMaterial;
  pulse(material: THREE.Material, options?: { property?: string; min?: number; max?: number; speed?: number }): { dispose(): void };
  glow(options?: { color?: string | number | THREE.Color; intensity?: number; power?: number } & THREE.ShaderMaterialParameters): THREE.ShaderMaterial;
  velvet(options?: THREE.MeshPhysicalMaterialParameters): THREE.MeshPhysicalMaterial;
  liquidMercury(options?: THREE.MeshStandardMaterialParameters): THREE.MeshStandardMaterial;
  chrome(options?: THREE.MeshStandardMaterialParameters): THREE.MeshStandardMaterial;
  gold(options?: THREE.MeshStandardMaterialParameters): THREE.MeshStandardMaterial;
  copper(options?: THREE.MeshStandardMaterialParameters): THREE.MeshStandardMaterial;
  pearl(options?: THREE.MeshPhysicalMaterialParameters): THREE.MeshPhysicalMaterial;
  obsidian(options?: THREE.MeshPhysicalMaterialParameters): THREE.MeshPhysicalMaterial;
  dataDriven(options: { palette: PaletteRamp; valueAttribute?: string; perInstanceOpacity?: boolean; perInstanceEmissiveIntensity?: boolean; opacity?: number; emissiveIntensity?: number } & THREE.ShaderMaterialParameters): THREE.ShaderMaterial;
  freshness(decayMs: number, options?: { color?: string | number | THREE.Color; baseOpacity?: number } & THREE.ShaderMaterialParameters): THREE.ShaderMaterial;
  dataStream(options: { trailLength: number; palette: PaletteRamp } & THREE.ShaderMaterialParameters): THREE.ShaderMaterial;
  volumeRaymarch(options: { data: Float32Array; resolution: number; palette: PaletteRamp; steps?: number; densityScale?: number; opacity?: number } & THREE.ShaderMaterialParameters): THREE.ShaderMaterial;
  addPlanarReflection(plane: GraphMesh, options?: { textureWidth?: number; textureHeight?: number; color?: number | string; clipBias?: number; multisample?: number; ssrPass?: unknown }): Promise<THREE.Mesh>;
  setPaletteForAttribute(object: GraphInstancedObject<unknown>, attrName: string, palette: PaletteRamp, options?: object): GraphObjectMaterial;
};

// ============================================================================
// postfx/
// ============================================================================

export class PostFX {
  constructor(options: { renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.Camera; capabilities?: Capabilities });
  static registerPass(name: string, definition: {
    order: number;
    create: (ctx: object, opts: object) => unknown;
    configure?: (pass: unknown, opts: object) => void;
    canEnable?: (ctx: object, opts: object) => boolean;
  }): void;
  static registerPreset(name: string, passOpts: Record<string, object>): void;
  enable(name: string, opts?: object): this;
  disable(name: string): this;
  configure(name: string, opts: object): this;
  preset(name: string): this;
  enabled(): string[];
  pipeline(order: string[] | null): this;
  setSceneCamera(scene: THREE.Scene, camera: THREE.Camera): void;
  setSize(width: number, height: number): void;
  render(deltaSeconds?: number): void;
  dispose(): void;
}

export class ParticleSystem {
  constructor(options: { scene: THREE.Scene; camera: THREE.Camera; renderer: THREE.WebGLRenderer; capacity?: number; geometry?: THREE.BufferGeometry; billboard?: boolean; capabilities?: Capabilities });
  static registerPreset(name: string, factory: (system: ParticleSystem, opts: object) => void): void;
  preset(name: string, opts?: object): this;
  addBehavior(name: 'gravity' | 'wind' | 'attract' | 'repel' | 'curl' | 'swirl', opts?: object): this;
  removeBehavior(name: string): this;
  configureBehavior(name: string, opts: object): this;
  get activeBehaviors(): string[];
  spawnAt(source: THREE.Mesh | { three: THREE.Mesh }, options?: {
    count?: number; speed?: number;
    velocity?: THREE.Vector3 | ((index: number) => THREE.Vector3);
    lifetime?: number | ((index: number) => number);
    size?: number | ((index: number) => number);
    color?: number | string | THREE.Color | ((index: number) => number | string | THREE.Color);
    blending?: THREE.Blending;
  }): this;
  emit(options: {
    count: number;
    position?: THREE.Vector3 | ((index: number) => THREE.Vector3);
    velocity?: THREE.Vector3 | ((index: number) => THREE.Vector3);
    lifetime?: number | ((index: number) => number);
    size?: number | ((index: number) => number);
    color?: number | string | THREE.Color | ((index: number) => number | string | THREE.Color);
    blending?: THREE.Blending;
  }): this;
  update(deltaSeconds: number): void;
  get simMode(): 'gpu' | 'cpu';
  get billboard(): boolean;
  get capacity(): number;
  get object(): THREE.Mesh;
  dispose(): void;
}

// ============================================================================
// object/
// ============================================================================

export class GraphObject {
  constructor(options: { scene: THREE.Scene; name: string; three: THREE.Object3D });
  get scene(): THREE.Scene;
  get name(): string;
  get three(): THREE.Object3D;
  get isInstanced(): boolean;
  setName(name: string): this;
  setUserData(key: string, value: unknown): this;
  getUserData(key: string): unknown;
  dispose(): void;
}

export class GraphInstancedObject<T = unknown> extends GraphObject {
  constructor(options: { scene: THREE.Scene; name: string; geometry: THREE.BufferGeometry; material: THREE.Material | THREE.Material[]; count: number; octreeBounds?: THREE.Box3 });
  get material(): THREE.Material | THREE.Material[];
  get capacity(): number;
  get count(): number;
  get isInstanced(): true;
  get octree(): Octree;
  setInstanceCount(n: number): this;
  setInstanceMatrix(index: number, matrix4: THREE.Matrix4): this;
  setInstancePosition(index: number, x: number, y: number, z: number): this;
  setInstanceRotation(index: number, euler: THREE.Euler): this;
  setInstanceScale(index: number, sx: number, sy: number, sz: number): this;
  getInstancePosition(index: number): THREE.Vector3;
  getInstanceRotation(index: number): THREE.Euler;
  getInstanceScale(index: number): THREE.Vector3;
  setInstanceVisible(index: number, visible: boolean): this;
  setAllPositions(positions: Float32Array, options?: { duration?: number; easing?: EasingInput }): this;
  setAllScales(scales: Float32Array, options?: { duration?: number; easing?: EasingInput }): this;
  setInstanceColor(index: number, color: THREE.Color | number | string): this;
  getInstanceColor(index: number): THREE.Color;
  setAllColors(colors: Float32Array, options?: { duration?: number; easing?: EasingInput }): this;
  hasAttribute(name: string): boolean;
  defineAttribute(name: string, itemSize: number): this;
  setInstanceAttribute(index: number, name: string, value: number | number[] | Float32Array): this;
  getInstanceAttribute(index: number, name: string): number | number[];
  pick(raycaster: THREE.Raycaster): number | null;
  pickDetailed(raycaster: THREE.Raycaster): { instanceIndex: number; point: THREE.Vector3; distance: number } | null;
  enableInstanceCulling(options: { camera: THREE.Camera; everyNthFrame?: number }): this;
  disableInstanceCulling(): this;
  updateCulling(): this;
  setInstanceUserData(index: number, datum: T): this;
  getInstanceUserData(index: number): T;
  commitMatrix(): this;
  commitColor(): this;
  commitAttribute(name: string): this;
  dispose(): void;
}

export class GraphMesh extends GraphObject {
  constructor(options: { scene: THREE.Scene; name: string; geometry: THREE.BufferGeometry; material: THREE.Material | THREE.Material[] });
  get material(): THREE.Material | THREE.Material[];
  getPosition(): THREE.Vector3;
  getRotation(): THREE.Euler;
  getScale(): THREE.Vector3;
  setPosition(x: number, y: number, z: number): this;
  setRotation(euler: THREE.Euler): this;
  setRotationDegrees(x: number, y: number, z: number): this;
  setScale(sx: number, sy: number, sz: number): this;
  translate(dx: number, dy: number, dz: number): this;
  rotateBy(euler: THREE.Euler): this;
  lookAt(x: number, y: number, z: number): this;
  setVisible(visible: boolean): this;
  getVertices(): THREE.Vector3[];
  setVertex(index: number, x: number, y: number, z: number): this;
  setVertices(vertices: Array<{ x: number; y: number; z: number }>): this;
  commit(): this;
  clone(name?: string): GraphMesh;
  deepClone(name?: string): GraphMesh;
  dispose(): void;
}

export class GraphLine extends GraphObject {
  constructor(options: { scene: THREE.Scene; name: string; color?: number | string; linewidth?: number });
  get material(): THREE.Material;
  setResolution(width: number, height: number): this;
  setPositions(positions: Float32Array): this;
  dispose(): void;
}

export interface GraphObjectFactoryOptions {
  scene: THREE.Scene;
  name: string;
  geometry?: THREE.BufferGeometry;
  material?: THREE.Material | THREE.Material[];
  instancingThreshold?: number;
}

export const GraphObjectFactory: {
  createMesh(name: string, options: { scene: THREE.Scene; geometry: THREE.BufferGeometry; material: THREE.Material | THREE.Material[] }): GraphMesh;
  createBars(count: number, options?: GraphObjectFactoryOptions): GraphMesh[] | GraphInstancedObject<unknown>;
  createPoints(count: number, options?: GraphObjectFactoryOptions): GraphMesh[] | GraphInstancedObject<unknown>;
  createLineSegments(count: number, options?: GraphObjectFactoryOptions): GraphMesh[] | GraphInstancedObject<unknown>;
  createSurfaceTiles(count: number, options?: GraphObjectFactoryOptions): GraphMesh[] | GraphInstancedObject<unknown>;
  createNodes(count: number, options?: GraphObjectFactoryOptions): GraphMesh[] | GraphInstancedObject<unknown>;
  createTriangleMesh(name: string, options: { scene: THREE.Scene; positions: Float32Array; indices: Uint32Array; normals: Float32Array; material?: THREE.Material | THREE.Material[] }): GraphMesh;
};

export const INSTANCING_THRESHOLD: number;

export const GraphObjectLoader: {
  configureDracoDecoder(path: string): void;
  configureKTX2Transcoder(path: string, renderer: THREE.WebGLRenderer): void;
  loadGLTF(url: string, options?: { scene: THREE.Scene; name: string }): Promise<GraphObject>;
  loadOBJ(url: string, mtlUrl?: string | null, options?: { scene: THREE.Scene; name: string }): Promise<GraphObject>;
  loadFBX(url: string, options?: { scene: THREE.Scene; name: string }): Promise<GraphObject>;
};

export class Octree {
  constructor(options: { bounds: THREE.Box3; maxItemsPerNode?: number; maxDepth?: number });
  insert(id: string | number, position: THREE.Vector3, radius?: number): void;
  remove(id: string | number): void;
  queryFrustum(frustum: THREE.Frustum): Array<string | number>;
  queryRay(ray: THREE.Ray): Array<string | number>;
  queryRadius(point: THREE.Vector3, radius: number): Array<string | number>;
  queryAABB(box: THREE.Box3): Array<string | number>;
  dumpBounds(): { bounds: THREE.Box3; depth: number; itemCount: number; isLeaf: boolean }[];
}

export function assignDepthJitter<T = unknown>(
  selection: { backend: unknown; data(): T[] },
  keyFn: (datum: T, index: number) => unknown,
  options?: { spacing?: number },
): Map<unknown, number>;
export function validateGeometry(geometry: THREE.BufferGeometry, options?: { degenerateEpsilon?: number }): {
  valid: boolean;
  issues: Array<{ type: string; message: string; [key: string]: unknown }>;
};
export function recomputeNormals(geometry: THREE.BufferGeometry, options?: { smooth?: boolean }): THREE.BufferGeometry;
export function fixWinding(geometry: THREE.BufferGeometry): THREE.BufferGeometry;

// ============================================================================
// scene/
// ============================================================================

export class GraphSceneCamera {
  constructor(options?: { preset?: string });
  get three(): THREE.Camera;
  get preset(): string | null;
  get target(): THREE.Vector3;
  setPreset(name: string): this;
  lookAt(x: number, y: number, z: number): this;
  setPosition(x: number, y: number, z: number): this;
  useCustom(camera: THREE.Camera): this;
  dollyZoom(targetFOV: number, duration?: number): CameraTour;
  tour(waypoints: CameraWaypoint[], options?: object): CameraTour;
  follow(target: THREE.Object3D): CameraTour;
  focusOn(boundingBox: THREE.Box3, padding?: number, duration?: number): CameraTour;
  enableOrbitControls(domElement: HTMLElement): Promise<this>;
  disableOrbitControls(): this;
  dispose(): void;
}

export class GraphSceneClipping {
  constructor(options: { renderer: THREE.WebGLRenderer });
  get planes(): THREE.Plane[];
  addClipPlane(normal: THREE.Vector3 | [number, number, number], constant: number): THREE.Plane;
  removeClipPlane(plane: THREE.Plane): this;
  clearClipPlanes(): this;
  dispose(): void;
}

export class GraphSceneEnvironment {
  constructor(options: { renderer: THREE.WebGLRenderer; scene: THREE.Scene });
  get fogPreset(): string | null;
  setHDR(url: string, options?: { asBackground?: boolean }): Promise<this>;
  setBackground(value: null | number | string | THREE.Color | THREE.Texture | THREE.CubeTexture): this;
  setFog(input: string | { type: 'linear' | 'exponential'; color?: number; near?: number; far?: number; density?: number }): this;
  setSkybox(input: string[] | string): Promise<this>;
  clear(): this;
  dispose(): void;
}

export class GraphSceneLight {
  constructor(options: { scene: THREE.Scene });
  get preset(): string;
  setPreset(name: string): this;
  setKeyIntensity(value: number): this;
  setFillIntensity(value: number): this;
  setRimIntensity(value: number): this;
  setAmbientIntensity(value: number): this;
  addLight(light: THREE.Light, name?: string): this;
  removeLight(lightOrName: string | THREE.Light): this;
  dispose(): void;
}

export class GraphSceneShadows {
  constructor(options: { renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.Camera });
  get mode(): string | null;
  get quality(): string;
  enable(mode: 'pcf' | 'pcf-soft' | 'vsm' | 'csm' | 'contact'): Promise<this>;
  disable(): this;
  setQuality(level: 'low' | 'medium' | 'high' | 'ultra'): this;
  dispose(): void;
}

export const GraphSceneSetup: {
  ensureDefaults(scene: GraphScene, options?: { renderer?: THREE.WebGLRenderer; lightPreset?: string; shadowMode?: string }): Promise<{
    camera: GraphSceneCamera;
    light: GraphSceneLight | null;
    environment: GraphSceneEnvironment | null;
    shadows: GraphSceneShadows | null;
  }>;
};

export class GraphScene {
  constructor(options: { graph3d: Graph3D; name: string });
  get name(): string;
  get three(): THREE.Scene;
  get camera(): GraphSceneCamera;
  get light(): GraphSceneLight | null;
  get environment(): GraphSceneEnvironment | null;
  get shadows(): GraphSceneShadows | null;
  get clipping(): GraphSceneClipping | null;
  get viewports(): Array<{ x: number; y: number; width: number; height: number }>;
  get theme(): string | null;
  get palette(): number[] | null;
  applyTheme(name: string, options?: { renderer?: THREE.WebGLRenderer }): Promise<this>;
  useCamera(camera: THREE.Camera): this;
  useLights(lights: THREE.Light[]): this;
  add(...objects: THREE.Object3D[]): this;
  remove(...objects: THREE.Object3D[]): this;
  traverse(callback: (object: THREE.Object3D) => void): this;
  findByName(name: string): THREE.Object3D | null;
  selectByName(name: string): GraphObject[];
  selectAll<T = unknown>(name: string): Selection<T>;
  selectInstance(name: string, index: number): { object: GraphObject; index: number };
  setViewports(viewports: Array<{ x: number; y: number; width: number; height: number }>): this;
  dispose(): void;
}

// ============================================================================
// chart/
// ============================================================================

export type LifecycleEvent = 'enter' | 'update' | 'exit';
export type InteractionEvent =
  | 'hover' | 'select' | 'deselect'
  | 'brushStart' | 'brushEnd'
  | 'lassoStart' | 'lassoEnd'
  | 'dragStart' | 'dragEnd'
  | 'focus';

export interface InteractionPayload<T = unknown> {
  chart?: GraphChart<T>;
  datum?: T;
  mesh?: THREE.Object3D;
  instanceIndex?: number | null;
  worldPoint?: THREE.Vector3;
  domEvent?: unknown;
}

export interface AxisField<T = unknown> {
  accessor: (datum: T, index: number) => unknown;
  scale: AnyScale | null;
}
export interface ColorField<T = unknown> {
  accessor: ((datum: T, index: number) => unknown) | null;
  palette: unknown;
}
export interface MaterialConfig { presetName: string; options: object; }
export interface LegendConfig { container: HTMLElement; }
export interface EffectConfig { name: string; options: object; }
export interface TransitionConfig { durationMs: number; easing: EasingInput; }
export interface ExitAnimationConfig { name: string; options: { system?: { preset(name: string, opts: object): void } } & object; }
export interface LODOptions { levels: { maxDistance: number; maxPoints: number }[]; camera: { position: { distanceTo(v: object): number } }; }

/**
 * Fluent, chainable base class every chart type extends. `T` is the datum
 * type threaded through `.data()` and every per-datum accessor
 * (`.x/.y/.z/.color/.size/.shape/.opacity/.visible/.filter/.sort/...`). `R`
 * is `.data(arr, keyFn)`'s return type for the "surviving array join"
 * overload — concrete subclasses set it via `extends GraphChart<T, Self<T>>`
 * (see `LineChart`) when their real runtime behavior returns `this` rather
 * than a `JoinResult<T>`; array-joining chart types (`BarChart`,
 * `ScatterChart`, ...) leave it at the default. `TreeChart`/`PackChart` bind
 * a single hierarchy root rather than an array — `data(datum: T): this`
 * covers their real usage; their inherited no-arg getter is typed `T[]` for
 * lack of a third type parameter, which is imprecise but harmless (an
 * edge-case read, not a chain-breaking write).
 */
export class GraphChart<T = any, R = JoinResult<T>> {
  constructor(scene: THREE.Scene, generator: GeneratorLike<T>);
  get scene(): THREE.Scene;
  get generator(): GeneratorLike<T>;

  data(): T[];
  data(arr: T[], keyFn?: (datum: T, index: number) => unknown): R;
  data(datum: T): this;

  x(): AxisField<T>;
  x(accessorOrScale: ValueOrAccessor<T>, scaleObj?: AnyScale): this;
  x(scale: AnyScale): this;
  y(): AxisField<T>;
  y(accessorOrScale: ValueOrAccessor<T>, scaleObj?: AnyScale): this;
  y(scale: AnyScale): this;
  z(): AxisField<T>;
  z(accessorOrScale: ValueOrAccessor<T>, scaleObj?: AnyScale): this;
  z(scale: AnyScale): this;

  color(): ColorField<T>;
  color(accessorOrConstant: ValueOrAccessor<T>, palette?: unknown): this;
  size(): ((datum: T, index: number) => unknown) | null;
  size(valueOrFn: ValueOrAccessor<T>): this;
  shape(): ((datum: T, index: number) => unknown) | null;
  shape(valueOrFn: ValueOrAccessor<T>): this;
  opacity(): ((datum: T, index: number) => number) | null;
  opacity(valueOrFn: number | ((datum: T, index: number) => number)): this;
  visible(): ((datum: T, index: number) => boolean) | null;
  visible(valueOrFn: boolean | ((datum: T, index: number) => boolean)): this;

  material(): MaterialConfig | null;
  material(presetName: string, options?: object): this;
  legend(): LegendConfig | null;
  legend(options: { container: HTMLElement }): this;
  tooltip(): ((datum: T, index: number) => unknown) | null;
  tooltip(handlerFn: (datum: T, index: number) => unknown): this;
  setAriaLabel(label: string, options?: { container?: HTMLElement }): this;
  setLongDescription(text: string, options?: { container?: HTMLElement }): this;
  hoverEffect(): EffectConfig | null;
  hoverEffect(presetName: string, options?: object): this;
  selectEffect(): EffectConfig | null;
  selectEffect(presetName: string, options?: object): this;

  filter(): Predicate<T> | null;
  filter(predicateFn: Predicate<T>): this;
  sort(): Comparator<T> | null;
  sort(compareFn: Comparator<T>): this;
  use(middlewareFn: (data: T[]) => T[]): this;

  transition(): TransitionConfig | null;
  transition(durationMs: number, easingNameOrFn?: EasingInput): this;
  exitAnimation(): ExitAnimationConfig | null;
  exitAnimation(name: string, options?: { system?: { preset(name: string, opts: object): void } }): this;

  draggable(): boolean;
  draggable(value: boolean): this;
  pickingEnabled(): boolean;
  pickingEnabled(value: boolean): this;

  stream(dataStream: AsyncIterable<StreamChunk<T>>): this;
  enableLOD(options: LODOptions): this;
  disableLOD(): this;
  compact(): this;
  window(): number | null;
  window(size: number): this;

  exportSelection(selectedData: T[]): unknown[];
  importSelection(keys: unknown[]): T[];

  exportPNG(options: { renderer: THREE.WebGLRenderer; camera: THREE.Camera }): string;
  exportSVG(options: { camera: THREE.Camera; width: number; height: number }): Promise<string>;

  on(event: LifecycleEvent, handler: (selection: Selection<T>) => void): this;
  on(event: InteractionEvent, handler: (payload: InteractionPayload<T>) => void): this;
  dispatch(event: InteractionEvent, payload: InteractionPayload<T>): this;
  handlers(): { enter: Function[]; update: Function[]; exit: Function[] };
  onEnter(fn: (selection: Selection<T>) => void): this;
  onUpdate(fn: (selection: Selection<T>) => void): this;
  onExit(fn: (selection: Selection<T>) => void): this;

  selection(): Selection<T>;
  render(): this;
  update(): this;
  destroy(): void;
}

export class BarChart<T = any> extends GraphChart<T> {
  constructor(scene: THREE.Scene);
  grouped(keyFn: (datum: T, index: number) => unknown): this;
  stacked(keyFn: (datum: T, index: number) => unknown): this;
  horizontal(): this;
  vertical(): this;
  depthSeries(): this;
}

export class LineChart<T = any> extends GraphChart<T, LineChart<T>> {
  constructor(scene: THREE.Scene);
  series(): ((datum: T, index: number) => unknown) | null;
  series(keyFn: (datum: T, index: number) => unknown): this;
  curve(): CurveType;
  curve(type: CurveType): this;
  setResolution(width: number, height: number): this;
}

export class ScatterChart<T = any> extends GraphChart<T> {
  constructor(scene: THREE.Scene);
  pick(raycaster: THREE.Raycaster): T | null;
}

export class AreaChart<T = any> extends GraphChart<T, AreaChart<T>> {
  constructor(scene: THREE.Scene);
  baseline(): number;
  baseline(value: number): this;
  curve(): CurveType;
  curve(type: CurveType): this;
}

export class SurfaceChart<T = any> extends GraphChart<T> {
  constructor(scene: THREE.Scene);
  values(): ((x: number, z: number) => number) | undefined;
  values(source: number[][] | ((x: number, z: number) => number)): this;
  xDomain(): [number, number];
  xDomain(domain: [number, number]): this;
  zDomain(): [number, number];
  zDomain(domain: [number, number]): this;
  resolution(): number;
  resolution(segments: number): this;
  contours(): number[] | null;
  contours(levels: number[] | null): this;
}

export class HeatmapChart<T = any> extends GraphChart<T> {
  constructor(scene: THREE.Scene);
  mode(): 'plane' | 'voxel';
  mode(name: 'plane' | 'voxel'): this;
}

export class NetworkChart<T = any> extends GraphChart<T, NetworkChart<T>> {
  constructor(scene: THREE.Scene);
  links(): Array<{ source: number | T; target: number | T }>;
  links(arr: Array<{ source: number | T; target: number | T }>): this;
  linkDistance(): number | ((link: { source: number | T; target: number | T }) => number) | undefined;
  linkDistance(value: number | ((link: { source: number | T; target: number | T }) => number)): this;
  cluster(): ((node: T) => unknown) | null;
  cluster(keyFn: ((node: T) => unknown) | null, strength?: number): this;
  pin(node: T, position?: { x?: number; y?: number; z?: number }): this;
  unpin(node: T): this;
  tick(): boolean;
}

export class TreeChart<T = any> extends GraphChart<T> {
  constructor(scene: THREE.Scene);
  children(): ((datum: T, node: HierarchyNode<T>) => T[] | undefined) | undefined;
  children(fn: (datum: T, node: HierarchyNode<T>) => T[] | undefined): this;
  value(): ((datum: T, node: HierarchyNode<T>) => number) | undefined;
  value(fn: (datum: T, node: HierarchyNode<T>) => number): this;
  sortChildren(): Comparator<HierarchyNode<T>> | undefined;
  sortChildren(fn: Comparator<HierarchyNode<T>>): this;
  levelHeight(): number | undefined;
  levelHeight(value: number): this;
  levelRadius(): number | undefined;
  levelRadius(value: number): this;
}

export class PackChart<T = any> extends GraphChart<T> {
  constructor(scene: THREE.Scene);
  children(): ((datum: T, node: HierarchyNode<T>) => T[] | undefined) | undefined;
  children(fn: (datum: T, node: HierarchyNode<T>) => T[] | undefined): this;
  value(): ((datum: T, node: HierarchyNode<T>) => number) | undefined;
  value(fn: (datum: T, node: HierarchyNode<T>) => number): this;
  sortChildren(): Comparator<HierarchyNode<T>> | undefined;
  sortChildren(fn: Comparator<HierarchyNode<T>>): this;
  padding(): number | undefined;
  padding(value: number): this;
}

export class PieChart<T = any> extends GraphChart<T, PieChart<T>> {
  constructor(scene: THREE.Scene);
  value(): (datum: T, index: number) => number;
  value(fn: (datum: T, index: number) => number): this;
  sortSlices(): Comparator<T> | null;
  sortSlices(fn: Comparator<T> | null): this;
  padAngle(): number;
  padAngle(value: number): this;
  innerRadius(): number | ((datum: T, index: number) => number);
  innerRadius(value: number | ((datum: T, index: number) => number)): this;
  outerRadius(): number | ((datum: T, index: number) => number);
  outerRadius(value: number | ((datum: T, index: number) => number)): this;
  extrude(): number | ((datum: T, index: number) => number);
  extrude(value: number | ((datum: T, index: number) => number)): this;
  explodeOffset(): number;
  explodeOffset(value: number): this;
  explode(datum: T, exploded?: boolean): this;
  pick(raycaster: THREE.Raycaster): T | null;
}

export class VolumeChart<T = any> extends GraphChart<T> {
  constructor(scene: THREE.Scene);
  values(): ((x: number, y: number, z: number) => number) | null;
  values(fn: (x: number, y: number, z: number) => number): this;
  xDomain(): [number, number];
  xDomain(domain: [number, number]): this;
  yDomain(): [number, number];
  yDomain(domain: [number, number]): this;
  zDomain(): [number, number];
  zDomain(domain: [number, number]): this;
  resolution(): number;
  resolution(value: number): this;
  steps(): number;
  steps(value: number): this;
  densityScale(): number;
  densityScale(value: number): this;
  palette(): PaletteRamp;
  palette(fn: PaletteRamp): this;
}

// ============================================================================
// interact/
// ============================================================================

export interface PickResult<T = unknown> {
  chart: GraphChart<T>;
  mesh: THREE.Object3D;
  instanceIndex: number | null;
  datum: T;
  worldPoint: THREE.Vector3;
}

export class Picker {
  constructor(options: { camera: THREE.Camera; domElement: { width: number; height: number } });
  get camera(): THREE.Camera;
  get domElement(): { width: number; height: number };
  register<T = unknown>(chart: GraphChart<T>): this;
  unregister<T = unknown>(chart: GraphChart<T>): this;
  pickAt<T = unknown>(x: number, y: number): PickResult<T> | null;
  dispose(): void;
}

export type InteractionState = 'default' | 'hovered' | 'focused' | 'selected' | 'dragging';

export class StateMachine<T = unknown> {
  constructor(chart: GraphChart<T>);
  get chart(): GraphChart<T>;
  style(state: InteractionState): ((selection: Selection<T>, datum: T) => void) | null;
  style(state: InteractionState, responseFn: (selection: Selection<T>, datum: T) => void): this;
  hoverStyle(): { effect: { name: string; options: object } | null; scale: number };
  hoverStyle(options: { effect?: { name: string; options?: object } | null; scale?: number }): this;
  selectStyle(): { effect: { name: string; options: object } | null; scale: number };
  selectStyle(options: { effect?: { name: string; options?: object } | null; scale?: number }): this;
  stateOf(datum: T): InteractionState;
  setState(datum: T, state: InteractionState): this;
}

export class PointerRouter {
  constructor(options: { picker: Picker; domElement: { addEventListener: Function; removeEventListener: Function } });
  stateMachineFor<T = unknown>(chart: GraphChart<T>): StateMachine<T>;
  selectedEntries<T = unknown>(): { chart: GraphChart<T>; datum: T }[];
  registerLabel(label: LabelAnnotation): this;
  unregisterLabel(label: LabelAnnotation): this;
  dispose(): void;
}

export class Brush {
  constructor(options: { camera: THREE.Camera; domElement: { width: number; height: number; addEventListener: Function; removeEventListener: Function } });
  register<T = unknown>(chart: GraphChart<T>): this;
  unregister<T = unknown>(chart: GraphChart<T>): this;
  on(event: 'brushStart' | 'brush' | 'brushEnd' | 'select', handler: (...args: any[]) => void): this;
  dispose(): void;
}

export class Lasso {
  constructor(options: { camera: THREE.Camera; domElement: { width: number; height: number; addEventListener: Function; removeEventListener: Function } });
  register<T = unknown>(chart: GraphChart<T>): this;
  unregister<T = unknown>(chart: GraphChart<T>): this;
  on(event: 'lassoStart' | 'lasso' | 'lassoEnd' | 'select', handler: (...args: any[]) => void): this;
  dispose(): void;
}

export function link<T = unknown>(
  source: { on(event: string, handler: (...args: any[]) => void): void },
  target: { data(arr?: T[], keyFn?: (datum: T, index: number) => unknown): T[]; render(): unknown },
  options?: { transform?: (selectedData: T[]) => (datum: T) => boolean },
): void;

export class KeyboardNav {
  constructor(options: { domElement: { addEventListener: Function; removeEventListener: Function }; describe?: (datum: unknown, chart: GraphChart<unknown>) => string });
  get liveRegion(): HTMLElement;
  register<T = unknown>(chart: GraphChart<T>): this;
  unregister<T = unknown>(chart: GraphChart<T>): this;
  stateMachineFor<T = unknown>(chart: GraphChart<T>): StateMachine<T>;
  dispose(): void;
}

export class FocusFollower {
  constructor(options: { camera: THREE.Camera; radius?: number; height?: number; durationMs?: number; segments?: number; easing?: EasingInput });
  get isFollowing(): boolean;
  follow<T = unknown>(chart: GraphChart<T>, datum: T): this;
  stop(): this;
  dispose(): void;
}

// ============================================================================
// stream/
// ============================================================================

export interface StreamChunk<T = unknown> { added: T[]; updated: T[]; removed: T[]; }

export class DataStream<T = unknown> {
  private constructor();
  static from<T = unknown>(asyncIterable: AsyncIterable<StreamChunk<T> | T[]>): DataStream<T>;
  static fromArray<T = unknown>(arr: T[], chunkSize: number, ms: number): DataStream<T>;
  static fromInterval<T = unknown>(producer: () => (T[] | StreamChunk<T>), ms: number): DataStream<T>;
  static fromWebSocket<T = unknown>(url: string, transform: (rawData: unknown) => (T[] | StreamChunk<T>)): DataStream<T>;
  [Symbol.asyncIterator](): AsyncIterator<StreamChunk<T>>;
  dispose(): void;
}

export class Aggregator {
  constructor();
  run<T = unknown>(data: T[], options?: { groupKey?: string; valueKey?: string; fn?: 'sum' | 'mean' | 'max' | 'min' | 'count' | 'percentile'; p?: number }): Promise<Record<string, number>>;
  dispose(): void;
}

export class LOD<T = unknown> {
  constructor(options: {
    chart: { data: Function; update: Function; scene: THREE.Object3D };
    camera: { position: THREE.Vector3 };
    levels: { maxDistance: number; maxPoints: number }[];
    keyFn?: (datum: T, index: number) => unknown;
  });
  get currentMaxPoints(): number | null;
  dispose(): void;
}

export class OriginShift {
  constructor(options: { scene: THREE.Scene; camera: THREE.Camera; threshold?: number });
  get worldOffset(): { x: number; y: number; z: number };
  dispose(): void;
}

export class GPGPU {
  constructor(options?: { renderer?: THREE.WebGLRenderer; capabilities?: Capabilities; threshold?: number });
  get backend(): 'gpu' | 'worker';
  computeCharge(positions: Float32Array, options?: { strength?: number; distanceMin?: number; distanceMax?: number }): Promise<Float32Array>;
  attach(sim: ForceSimulation, options?: { strength?: number; distanceMin?: number; distanceMax?: number }): this;
  dispose(): void;
}

export class JoinDiff<T = unknown> {
  constructor(options?: { threshold?: number });
  diff(oldData: T[], newData: T[], keyFn?: (datum: T, index: number) => unknown): Promise<{
    enter: { datum: T; newIndex: number }[];
    update: { datum: T; oldIndex: number; newIndex: number }[];
    exit: { datum: T; oldIndex: number }[];
  }>;
  dispose(): void;
}

export function memoryPressure(): number | null;

export const middleware: {
  decimate<T = unknown>(options: { target: number; x?: string; y?: string }): ((data: T[]) => Promise<T[]>) & { dispose(): void };
};

// ============================================================================
// core/
// ============================================================================

export interface Capabilities {
  webgl2: boolean;
  timerQuery: boolean;
  floatTextures: boolean;
  instancedArrays: boolean;
  maxTextureSize: number;
  maxVertexAttribs: number;
  maxInstanceCount: number;
  vendor: string;
  renderer: string;
}

export class CapabilityProbe {
  constructor(canvas?: HTMLCanvasElement);
  capabilities: Capabilities;
}

export interface SlowFrameDetail {
  chartId: string | null;
  drawCalls: number;
  triangleCount: number;
  meshCount: number;
  fps: number;
}

export class FrameBudget extends EventTarget {
  constructor(options?: { budgetMs?: number; windowSize?: number });
  get budgetMs(): number;
  get windowSize(): number;
  record(frameMs: number, context?: { chartId?: string | null; drawCalls?: number; triangleCount?: number; meshCount?: number }): void;
  reset(): void;
  dispose(): void;
}

export class WorkerPool {
  constructor(options: { workerFactory: () => Worker; size?: number; idleTimeoutMs?: number });
  get size(): number;
  get idleTimeoutMs(): number;
  get pendingCount(): number;
  get queueLength(): number;
  exec<T = unknown>(taskName: string, payload: unknown, transferList?: Transferable[]): Promise<T>;
  register(name: string, fn: (payload: unknown) => unknown | Promise<unknown>): this;
  dispose(): void;
}

export function registerWorkerTask(name: string, fn: (payload: unknown) => unknown | Promise<unknown>): void;
export function createWorkerFactory(): () => Worker;

export class Graph3DRenderer {
  constructor(options: {
    canvas: HTMLCanvasElement;
    antialias?: boolean;
    pixelRatio?: number;
    alpha?: boolean;
    toneMapping?: 'None' | 'Linear' | 'Reinhard' | 'Cineon' | 'ACESFilmic' | 'AgX' | 'Neutral';
    toneMappingExposure?: number;
    shadowMap?: 'basic' | 'pcf' | 'pcfsoft' | 'vsm';
    powerPreference?: 'high-performance' | 'low-power' | 'default';
  });
  three: THREE.WebGLRenderer;
  setSize(width: number, height: number, updateStyle?: boolean): void;
  setPixelRatio(ratio: number): void;
  setToneMapping(name: 'None' | 'Linear' | 'Reinhard' | 'Cineon' | 'ACESFilmic' | 'AgX' | 'Neutral'): void;
  render(scene: THREE.Scene, camera: THREE.Camera): void;
  dispose(): void;
}

/** SSR-safe stand-in for `Graph3DRenderer`, used automatically when `Graph3D` is constructed with no `window` (server-side). Every method is an inert no-op except `render()`, which throws. */
export class SSRGraph3DRenderer {
  constructor();
  three: null;
  setSize(width: number, height: number, updateStyle?: boolean): void;
  setPixelRatio(ratio: number): void;
  setToneMapping(name: 'None' | 'Linear' | 'Reinhard' | 'Cineon' | 'ACESFilmic' | 'AgX' | 'Neutral'): void;
  render(scene: THREE.Scene, camera: THREE.Camera): never;
  dispose(): void;
}

/** Dev-only debugging surface (Prompt 178), reached via `Graph3D.devtools` — throws in production. */
export class GraphDevTools {
  constructor(graph3d: Graph3D);
  dumpSceneGraph(scene?: GraphScene): { name: string; type: string; uuid: string; visible: boolean; children: unknown[] };
  listActiveTimelines(): { isPlaying: boolean; time: number; duration: number }[];
  memorySnapshot(): { geometries: number; textures: number; calls: number; triangles: number; points: number; lines: number };
  pickingDebugOverlay(hit: { worldPoint: THREE.Vector3; chart?: unknown; instanceIndex: number | null; datum: unknown } | null): THREE.Mesh | null;
  frustumDebugOverlay(camera?: THREE.Camera): THREE.CameraHelper;
  octreeDebugOverlay(instancedObject: GraphInstancedObject): THREE.Group;
  selectionDebugOverlay(selection: Selection): THREE.Group;
}

export class Graph3DLoop {
  constructor();
  get isRunning(): boolean;
  add(callback: (deltaSec: number, elapsedSec: number) => void): void;
  remove(callback: (deltaSec: number, elapsedSec: number) => void): void;
  start(): void;
  stop(): void;
  dispose(): void;
}
/** The shared `Graph3DLoop` singleton every `Graph3D` instance ticks against. */
export const loop: Graph3DLoop;

export class Graph3DRegistry {
  constructor();
  register(instance: Graph3D): void;
  unregister(instance: Graph3D): void;
  all(): Graph3D[];
  disposeAll(): void;
  pauseAll(): void;
  resumeAll(): void;
  panicDispose(): void;
}
/** The shared page-level `Graph3DRegistry` singleton every `Graph3D` instance registers with. */
export const registry: Graph3DRegistry;

export type RegisteredChartType = 'bar' | 'line' | 'scatter' | 'area' | 'surface' | 'heatmap' | 'network' | 'tree' | 'pack' | 'pie' | 'volume';

export interface Graph3DOptions {
  /** Required in a browser; optional under SSR (no `window`), where a mock renderer is used automatically. */
  canvas?: HTMLCanvasElement;
  hdr?: string;
  antialias?: boolean;
  pixelRatio?: number;
  autoResize?: boolean;
  theme?: string;
  respectReducedMotion?: boolean;
}

/** A `Graph3D.serialize()` snapshot — scene/camera composition only, not chart config or data. See `Graph3D.serialize()`'s doc comment. */
export interface Graph3DSnapshot {
  version: number;
  theme: string | null;
  hdr: string | null;
  activeScene: string | null;
  scenes: Array<{
    name: string;
    theme: string | null;
    camera: {
      preset: string | null;
      position: [number, number, number];
      target: [number, number, number];
      fov: number | null;
    };
  }>;
}

/** Top-level Graph3D entry point — composes the renderer, animation loop, capability probe, frame budget, and lazily-created worker pool/PostFX pipeline. */
export class Graph3D {
  constructor(options: Graph3DOptions);
  get renderer(): Graph3DRenderer | SSRGraph3DRenderer;
  get capabilities(): Capabilities;
  get frameBudget(): FrameBudget;
  get workers(): WorkerPool;
  get postfx(): PostFX;
  get devtools(): GraphDevTools;
  get scenes(): Map<string, GraphScene>;
  get activeScene(): GraphScene | null;

  hdr: string | undefined;
  theme: string | undefined;
  autoResize: boolean;
  respectReducedMotion: boolean;
  static readonly version: string;

  setSize(width: number, height: number): void;
  pause(): void;
  resume(): void;
  createScene(name: string): GraphScene;
  setActiveScene(nameOrScene: string | GraphScene): void;

  chart<T = any>(typeName: 'bar'): BarChart<T>;
  chart<T = any>(typeName: 'line'): LineChart<T>;
  chart<T = any>(typeName: 'scatter'): ScatterChart<T>;
  chart<T = any>(typeName: 'area'): AreaChart<T>;
  chart<T = any>(typeName: 'surface'): SurfaceChart<T>;
  chart<T = any>(typeName: 'heatmap'): HeatmapChart<T>;
  chart<T = any>(typeName: 'network'): NetworkChart<T>;
  chart<T = any>(typeName: 'tree'): TreeChart<T>;
  chart<T = any>(typeName: 'pack'): PackChart<T>;
  chart<T = any>(typeName: 'pie'): PieChart<T>;
  chart<T = any>(typeName: 'volume'): VolumeChart<T>;
  chart<T = any>(typeName: string): GraphChart<T>;

  exportScene(options?: { binary?: true }): Promise<Blob>;
  exportScene(options: { binary: false }): Promise<object>;
  serialize(): Graph3DSnapshot;
  static deserialize(json: Graph3DSnapshot, options?: Graph3DOptions): Promise<Graph3D>;

  static disposeAll(): void;
  dispose(): void;
}
