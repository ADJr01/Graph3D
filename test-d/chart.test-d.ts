// Prompt 174: tsd type tests over the public surface, focused on the
// headline generic flow types/index.d.ts exists to guarantee — Prompt 173's
// `chart.data<T>(arr)` typing every accessor as `(d: T, i: number) => ...`,
// and the CRTP `R` parameter distinguishing chart subclasses whose
// `data(arr)` really returns `this` (LineChart, AreaChart, ...) from ones
// that return a `JoinResult<T>` (BarChart, ScatterChart, ...).
import { expectType, expectAssignable, expectError } from 'tsd';
import * as THREE from 'three';
import {
  Graph3D,
  BarChart,
  LineChart,
  ScatterChart,
  GraphChart,
  Selection,
  JoinResult,
} from '../types/index';

interface Row {
  id: string;
  label: string;
  value: number;
}

const scene = new THREE.Scene();
const rows: Row[] = [{ id: 'a', label: 'Apples', value: 3 }];

// ── BarChart<T>: data(arr) returns JoinResult<T> (default R) ───────────────
const bar = new BarChart<Row>(scene);
expectType<JoinResult<Row>>(bar.data(rows));
expectType<Row[]>(bar.data());

bar.x((datum, index) => {
  expectType<Row>(datum);
  expectType<number>(index);
  return datum.label;
});
bar
  .y((d) => d.value)
  .color((d) => d.value)
  .filter((d) => d.value > 0)
  .sort((a, b) => a.value - b.value)
  .tooltip((d) => `${d.label}: ${d.value}`);

expectAssignable<BarChart<Row>>(bar.y((d) => d.value));

bar.on('select', (payload) => {
  expectType<Row | undefined>(payload.datum);
});
bar.on('enter', (selection) => {
  expectType<Selection<Row>>(selection);
});

expectType<Selection<Row>>(bar.selection());

// ── LineChart<T>: data(arr) returns `this` (R = LineChart<T>) ──────────────
const line = new LineChart<Row>(scene);
expectType<LineChart<Row>>(line.data(rows));
line.series((d) => d.id);

// ── ScatterChart<T>.pick returns the datum type, not `unknown` ─────────────
const scatter = new ScatterChart<Row>(scene);
expectType<Row | null>(scatter.pick(new THREE.Raycaster()));

// ── Graph3D.chart(typeName) infers the right concrete subclass ─────────────
const g3d = {} as Graph3D;
expectType<BarChart<Row>>(g3d.chart<Row>('bar'));
expectType<LineChart<Row>>(g3d.chart<Row>('line'));
expectType<GraphChart<Row>>(g3d.chart<Row>('some-unregistered-name'));

// ── Wrong accessor argument types are rejected, not silently `any` ─────────
expectError(bar.x({ totallyWrong: true }));
expectError(bar.data('not an array'));
