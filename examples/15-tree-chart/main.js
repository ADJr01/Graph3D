import { Graph3D, TreeChart, palette } from '../../src/index.js';

// Phase 8 example (Prompt 138): TreeChart's layout.tree radial hierarchy —
// instanced node spheres colored by depth (chart/colorField.js, same helper
// every other chart type uses), one Line2 per parent-child edge (the same
// GraphLine wrapper NetworkChart's edges already established). Unlike
// NetworkChart, layout.tree() is a deterministic one-shot computation, so
// there's no simulation to tick — render()/update() are the whole lifecycle.

const MAX_DEPTH = 3;
const BRANCH_MIN = 2;
const BRANCH_MAX = 3;

const canvas = document.createElement('canvas');
document.body.appendChild(canvas);

const g = new Graph3D({ canvas, autoResize: false });
const scene = g.createScene('main');
g.setActiveScene(scene);

const nodeCountEl = document.getElementById('nodeCount');
const depthCountEl = document.getElementById('depthCount');
const regenerateEl = document.getElementById('regenerate');

let nextId = 0;

function buildRandomTree(depth) {
  // Only leaves carry their own value — an internal node's radius should
  // reflect its subtree's leaf count (buildHierarchy sums bottom-up
  // regardless), not add extra weight of its own on top of that.
  const node = depth < MAX_DEPTH ? { id: nextId++, value: 0 } : { id: nextId++, value: 1 };
  if (depth < MAX_DEPTH) {
    const branchCount = BRANCH_MIN + Math.floor(Math.random() * (BRANCH_MAX - BRANCH_MIN + 1));
    node.children = Array.from({ length: branchCount }, () => buildRandomTree(depth + 1));
  }
  return node;
}

function countNodes(node) {
  if (!node.children) return 1;
  return 1 + node.children.reduce((sum, child) => sum + countNodes(child), 0);
}

const chart = new TreeChart(scene.three)
  .levelHeight(2.2)
  .levelRadius(3)
  .color((d) => d.depth, palette.viridis)
  .material('standard');

function refreshPanel(root) {
  nodeCountEl.textContent = String(countNodes(root));
  depthCountEl.textContent = String(MAX_DEPTH);
}

function regenerate() {
  nextId = 0;
  const root = buildRandomTree(0);
  chart.data(root);
  chart.render(); // routes to update() after the first call
  refreshPanel(root);
}

regenerate();
regenerateEl.addEventListener('click', regenerate);

// ── Camera ───────────────────────────────────────────────────────────────

scene.camera.three.position.set(0, 15, 32);
scene.camera.lookAt(0, -3.3, 0);
scene.camera.enableOrbitControls(g.renderer.three.domElement).catch((error) => console.error('enableOrbitControls failed:', error));

// ── Resize ───────────────────────────────────────────────────────────────

function handleResize() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  g.setSize(width, height);
  const camera = scene.camera.three;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', handleResize);
handleResize();
