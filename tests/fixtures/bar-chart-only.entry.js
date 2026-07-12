// Prompt 176: tree-shake verification fixture. A consumer app that only
// imports BarChart should not pay for the other eleven chart types — this
// entry point is what scripts/bundle-budget.js bundles and inspects.
export { BarChart } from '../../src/index.js';
