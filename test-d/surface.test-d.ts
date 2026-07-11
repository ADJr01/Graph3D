// Prompt 174: tsd type tests over the rest of the public surface — the
// generic-bearing non-chart classes (`GraphScene.selectAll<T>`,
// `GraphInstancedObject<T>`, `DataStream<T>`) plus a representative sample
// of the non-generic layers, so this suite covers real consumer usage
// patterns across every layer `types/index.d.ts` declares, not just the two
// headline generic flows (see chart.test-d.ts/selection.test-d.ts for those).
import { expectType, expectAssignable, expectError } from 'tsd';
import * as THREE from 'three';
import {
  GraphScene,
  Selection,
  GraphInstancedObject,
  DataStream,
  StreamChunk,
  scale,
  color,
  palette,
  curve,
  material,
  PostFX,
  Picker,
  GraphChart,
} from '../types/index';

interface Row {
  id: string;
  value: number;
}

// ── scene/GraphScene.selectAll<T> ───────────────────────────────────────
const graphScene = {} as GraphScene;
expectType<Selection<Row>>(graphScene.selectAll<Row>('bars'));

// ── object/GraphInstancedObject<T> user-data round-trips T ─────────────
const instanced = {} as GraphInstancedObject<Row>;
instanced.setInstanceUserData(0, { id: 'a', value: 1 });
expectType<Row>(instanced.getInstanceUserData(0));
expectError(instanced.setInstanceUserData(0, { wrong: true }));

// ── stream/DataStream<T> static factories ───────────────────────────────
expectType<DataStream<Row>>(DataStream.fromArray<Row>([{ id: 'a', value: 1 }], 100, 50));
const liveStream: DataStream<Row> = DataStream.fromInterval<Row>(() => [{ id: 'b', value: 2 }], 200);
for await (const chunk of liveStream) {
  expectType<{ added: Row[]; updated: Row[]; removed: Row[] }>(chunk);
}
type _Chunk = StreamChunk<Row>;

// ── compose/scale, compose/color, compose/palette (non-generic surface) ──
expectType<number>(scale.linear().domain([0, 100]).range([0, 10])(50));
expectType<string>(color.sequential(palette.viridis)(0.5));
expectType<string>(palette.viridis(0.5));

// ── anim/curve — named easing functions are plain (t) => number ─────────
expectType<number>(curve.easeInOutCubic(0.5));

// ── material presets return a usable THREE.Material-typed factory ───────
expectAssignable<THREE.Material>(material.standard({ color: '#4488ff' }));

// ── postfx/PostFX — construction + chained config ────────────────────────
declare const postfx: PostFX;
expectType<PostFX>(postfx.enable('bloom', { strength: 1.2 }));

// ── interact/Picker.register accepts any chart, keyed to its own datum ──
declare const picker: Picker;
declare const someChart: GraphChart<Row>;
expectType<Picker>(picker.register(someChart));
