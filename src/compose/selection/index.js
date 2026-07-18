export { Selection } from './Selection.js';
export { SelectionTransition } from './SelectionTransition.js';
// diffData is exposed here (not just used internally by Selection/join.js)
// because GraphChart.update() (Prompt 130) is the "future GraphChartDataBinding"
// consumer diff.js's own header already anticipated — it needs the precise
// enter/update/exit newIndex/oldIndex metadata directly, not just the
// Selection/JoinResult wrapper, to map generator-computed buffers onto the
// right members (CLAUDE.md §1.1 DRY: reuse the single diff authority rather
// than reimplementing diffing in chart/).
export { diffData } from './diff.js';
export { syncLabels, removeLabels } from './labels.js';
