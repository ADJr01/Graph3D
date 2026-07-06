import { Graph3D, NetworkChart, palette, loop } from '../../src/index.js';

// Phase 8 example (Prompt 137): NetworkChart's layout.force simulation —
// instanced node spheres colored by group, one Line2 per edge, .cluster()
// grouping, and the simulation's built-in auto-pause once it stabilizes.

const GROUP_COUNT = 3;
const INITIAL_NODE_COUNT = 30;
const LINK_DISTANCE = 2;

const canvas = document.createElement('canvas');
document.body.appendChild(canvas);

const g = new Graph3D({ canvas, autoResize: false });
const scene = g.createScene('main');
g.setActiveScene(scene);

const nodeCountEl = document.getElementById('nodeCount');
const simStateEl = document.getElementById('simState');
const clusterStateEl = document.getElementById('clusterState');
const addNodeEl = document.getElementById('addNode');
const toggleClusterEl = document.getElementById('toggleCluster');

let nextId = 0;
const nodes = [];
const links = [];

function addRandomNode() {
  const node = { id: nextId++, group: `group-${Math.floor(Math.random() * GROUP_COUNT)}` };
  nodes.push(node);
  // Link to 1-2 existing nodes so the graph stays connected as it grows.
  const linkCount = Math.min(nodes.length - 1, 1 + Math.floor(Math.random() * 2));
  for (let i = 0; i < linkCount; i++) {
    links.push({ source: node, target: nodes[Math.floor(Math.random() * (nodes.length - 1))] });
  }
  return node;
}

for (let i = 0; i < INITIAL_NODE_COUNT; i++) addRandomNode();

const chart = new NetworkChart(scene.three)
  .data(nodes)
  .links(links)
  .linkDistance(LINK_DISTANCE)
  .color((d) => d.group, palette.category10)
  .material('standard');

let clustered = false;

function refreshPanel() {
  nodeCountEl.textContent = String(nodes.length);
  clusterStateEl.textContent = clustered ? 'on' : 'off';
}

chart.render();
refreshPanel();

addNodeEl.addEventListener('click', () => {
  addRandomNode();
  chart.data(nodes).links(links).update();
  refreshPanel();
});

toggleClusterEl.addEventListener('click', () => {
  clustered = !clustered;
  chart.cluster(clustered ? (d) => d.group : null);
  chart.update();
  refreshPanel();
});

// ── Camera ───────────────────────────────────────────────────────────────

scene.camera.three.position.set(0, 4, 16);
scene.camera.lookAt(0, 0, 0);
scene.camera.enableOrbitControls(g.renderer.three.domElement).catch((error) => console.error('enableOrbitControls failed:', error));

// ── Simulation loop — the sim auto-pauses once it stabilizes ─────────────

loop.add(() => {
  simStateEl.textContent = chart.tick() ? 'settling' : 'stable';
});

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
