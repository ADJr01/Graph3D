import { Graph3D, PackChart, palette } from '../../src/index.js';

// Phase 8 example (Prompt 138): PackChart's layout.pack sphere-packing
// hierarchy — value-sized, non-overlapping node spheres nested inside their
// parent, colored by depth (chart/colorField.js, same helper every other
// chart type uses). No edges — nesting itself conveys structure. Like
// TreeChart, layout.pack() is a deterministic one-shot computation, so
// there's no simulation to tick.

const GROUP_COUNT = 5;
const LEAVES_PER_GROUP_MIN = 3;
const LEAVES_PER_GROUP_MAX = 9;
const PADDING_ON = 0.15;
const PADDING_OFF = 0.02;

const canvas = document.createElement('canvas');
document.body.appendChild(canvas);

const g = new Graph3D({ canvas, autoResize: false });
const scene = g.createScene('main');
g.setActiveScene(scene);

const nodeCountEl = document.getElementById('nodeCount');
const paddingValueEl = document.getElementById('paddingValue');
const regenerateEl = document.getElementById('regenerate');
const togglePaddingEl = document.getElementById('togglePadding');

let nextId = 0;

function buildRandomHierarchy() {
  return {
    id: nextId++,
    children: Array.from({ length: GROUP_COUNT }, () => {
      const leafCount = LEAVES_PER_GROUP_MIN + Math.floor(Math.random() * (LEAVES_PER_GROUP_MAX - LEAVES_PER_GROUP_MIN + 1));
      return {
        id: nextId++,
        children: Array.from({ length: leafCount }, () => ({ id: nextId++, value: 1 + Math.random() * 9 })),
      };
    }),
  };
}

function countNodes(node) {
  if (!node.children) return 1;
  return 1 + node.children.reduce((sum, child) => sum + countNodes(child), 0);
}

let paddingOn = true;

const chart = new PackChart(scene.three)
  .padding(PADDING_ON)
  // Negated depth (not `d.depth` directly): the root — the single largest,
  // outermost sphere — needs viridis's bright end, not its near-black one,
  // or it's indistinguishable from the black background.
  .color((d) => -d.depth, palette.viridis)
  // Nested spheres are otherwise fully hidden inside their opaque parent from
  // any outside viewing angle — transparency is what actually makes a 3D
  // pack chart's nesting readable (the 2D d3.pack analogue has this for free
  // since its circles are flat).
  .material('standard', { transparent: true, opacity: 0.45 });

function refreshPanel(root) {
  nodeCountEl.textContent = String(countNodes(root));
  paddingValueEl.textContent = paddingOn ? `${PADDING_ON} (on)` : `${PADDING_OFF} (off)`;
}

// The root's packed enclosing radius (layout.pack()'s own computed `.r`)
// varies a lot with the random data — framing the camera at a fixed distance
// either strands it inside the root sphere (nothing visible — you're inside
// an opaque-ish surface) or leaves it a speck. Reading the real radius back
// via `chart.selection().data()` after each render()/update() keeps the
// whole hierarchy in view regardless.
const CAMERA_DISTANCE_FACTOR = 2.2;

function frameCamera() {
  const rootNode = chart.selection().data().find((node) => node.depth === 0);
  const distance = rootNode.r * CAMERA_DISTANCE_FACTOR;
  scene.camera.three.position.set(0, 0, distance);
  scene.camera.lookAt(0, 0, 0);
}

let root = buildRandomHierarchy();

function regenerate() {
  nextId = 0;
  root = buildRandomHierarchy();
  chart.data(root);
  chart.render(); // routes to update() after the first call
  frameCamera();
  refreshPanel(root);
}

regenerate();
regenerateEl.addEventListener('click', regenerate);

togglePaddingEl.addEventListener('click', () => {
  paddingOn = !paddingOn;
  chart.padding(paddingOn ? PADDING_ON : PADDING_OFF);
  chart.update();
  frameCamera();
  refreshPanel(root);
});

// ── Camera ───────────────────────────────────────────────────────────────

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
