<template>
  <div class="playground-demo">
    <div class="playground-toolbar">
      <button class="run-button" @click="run">Run ▶ (Ctrl/Cmd+Enter)</button>
      <button @click="reset">Reset</button>
      <span v-if="errorText" class="playground-error">{{ errorText }}</span>
    </div>
    <div class="playground-panes">
      <div ref="editorContainer" class="playground-editor"></div>
      <!-- allow-same-origin is required, not just allow-scripts: an ES
           module import is always a CORS-mode fetch, and a sandboxed iframe
           with no allow-same-origin gets an opaque ("null") origin that
           can't satisfy CORS for either the esm.sh CDN or this site's own
           /dist/graph3d.esm.js — a srcdoc iframe with allow-same-origin
           instead inherits the parent document's real origin, so both
           resolve as ordinary fetches. -->
      <iframe ref="previewFrame" class="playground-preview" title="Playground preview" sandbox="allow-scripts allow-same-origin"></iframe>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue';

// Monaco needs `window`/`self` at import time, so every import of it is
// dynamic and deferred to onMounted() — never a static top-level import —
// so this component stays safe to statically analyze during `vitepress
// build`'s SSR pass (this component itself only ever actually mounts inside
// <ClientOnly>, but a stray top-level `import 'monaco-editor/...'` would
// still be part of the SSR module graph regardless of where it's used).

const STARTER_CODE = `import { Graph3D, BarChart, scale } from 'graph3d.js';

const canvas = document.querySelector('canvas');
const g = new Graph3D({ canvas });
const scene = g.createScene('main');
g.setActiveScene(scene);

const x = scale.band().domain(['A', 'B', 'C', 'D']).range([-6, 6]).paddingInner(0.3);
const y = scale.linear().domain([0, 100]).range([0, 6]);

const chart = new BarChart(scene.three)
  .x((d) => d.category, x)
  .y((d) => d.value, y)
  .color((d) => d.value);

chart.data(
  [
    { category: 'A', value: 42 },
    { category: 'B', value: 88 },
    { category: 'C', value: 15 },
    { category: 'D', value: 67 },
  ],
  (d) => d.category,
);
chart.render();

scene.camera.three.position.set(0, 8, 14);
scene.camera.lookAt(0, 2, 0);
scene.camera.enableOrbitControls(g.renderer.three.domElement);
`;

const editorContainer = ref(null);
const previewFrame = ref(null);
const errorText = ref('');

let editor = null;
let messageHandler = null;

// Built from concatenated fragments so this file's own raw source text never
// contains a literal opening or closing script-element tag anywhere outside
// this block's real boundaries — Vue's SFC parser scans for those tags at a
// lexical level, even inside a plain JS string or a `//` comment, and a
// stray literal one anywhere below would desync this file's own block
// boundaries (confirmed the hard way: a `//` comment merely *describing*
// the fix, spelled out literally, reproduced the exact same parse failure).
const SCRIPT_OPEN = '<' + 'script';
const SCRIPT_CLOSE = '<' + '/script>';

/** Builds the iframe document that runs the editor's current code as a real ES module. */
function buildPreviewHTML(userCode) {
  const importMap = JSON.stringify({
    imports: {
      three: 'https://esm.sh/three@0.185.0',
      'three/': 'https://esm.sh/three@0.185.0/',
      'graph3d.js': '/dist/graph3d.esm.js',
    },
  });
  // Escaping a literal closing script tag inside userCode prevents it from
  // prematurely ending the module script block below, if typed/pasted code
  // happens to contain that substring (e.g. inside a string or comment).
  const safeCode = userCode.split(SCRIPT_CLOSE).join('<' + '\\/script>');
  // Not wrapped in try/catch: a module script's top-level `import` statements
  // (which every playground snippet starts with, matching every other doc
  // example) are only legal at the top level of the module, not inside a
  // block statement — window.addEventListener('error', ...) below already
  // catches any uncaught synchronous error the snippet throws, import
  // failures included, without needing a wrapping try/catch at all.
  const runtime = `
window.addEventListener('error', (e) => {
  parent.postMessage({ source: 'graph3d-playground', type: 'error', message: e.message }, '*');
});
window.addEventListener('unhandledrejection', (e) => {
  parent.postMessage({ source: 'graph3d-playground', type: 'error', message: String(e.reason?.message ?? e.reason) }, '*');
});
${safeCode}
`;
  return [
    '<!doctype html><html><head><meta charset="utf-8" />',
    '<style>html,body{margin:0;height:100%;background:#000;overflow:hidden;} canvas{display:block;width:100%;height:100%;}</style>',
    `${SCRIPT_OPEN} type="importmap">${importMap}${SCRIPT_CLOSE}`,
    '</head><body><canvas></canvas>',
    `${SCRIPT_OPEN} type="module">${runtime}${SCRIPT_CLOSE}`,
    '</body></html>',
  ].join('\n');
}

function run() {
  errorText.value = '';
  const code = editor ? editor.getValue() : STARTER_CODE;
  previewFrame.value.srcdoc = buildPreviewHTML(code);
}

function reset() {
  editor?.setValue(STARTER_CODE);
  run();
}

onMounted(async () => {
  const monaco = await import('monaco-editor/esm/vs/editor/editor.api');
  const [{ default: EditorWorker }, { default: TsWorker }] = await Promise.all([
    import('monaco-editor/esm/vs/editor/editor.worker?worker'),
    import('monaco-editor/esm/vs/language/typescript/ts.worker?worker'),
  ]);
  self.MonacoEnvironment = {
    getWorker(_workerId, label) {
      if (label === 'typescript' || label === 'javascript') return new TsWorker();
      return new EditorWorker();
    },
  };

  editor = monaco.editor.create(editorContainer.value, {
    value: STARTER_CODE,
    language: 'javascript',
    theme: 'vs-dark',
    automaticLayout: true,
    minimap: { enabled: false },
    fontSize: 13,
  });
  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, run);

  messageHandler = (event) => {
    if (event.source !== previewFrame.value?.contentWindow) return;
    if (event.data?.source !== 'graph3d-playground') return;
    if (event.data.type === 'error') errorText.value = event.data.message;
  };
  window.addEventListener('message', messageHandler);

  run();
});

onUnmounted(() => {
  if (messageHandler) window.removeEventListener('message', messageHandler);
  editor?.getModel()?.dispose();
  editor?.dispose();
  editor = null;
});
</script>

<style scoped>
.playground-demo {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  height: 80vh;
  min-height: 560px;
}
.playground-toolbar {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}
.run-button {
  font-weight: 600;
}
.playground-error {
  color: var(--vp-c-danger-1);
  font-size: 0.85rem;
  font-family: var(--vp-font-family-mono);
}
.playground-panes {
  flex: 1;
  display: flex;
  gap: 0.5rem;
  min-height: 0;
}
.playground-editor {
  flex: 1 1 50%;
  min-width: 0;
  border-radius: 8px;
  overflow: hidden;
}
.playground-preview {
  flex: 1 1 50%;
  min-width: 0;
  border: none;
  border-radius: 8px;
  background: #000;
}
</style>
