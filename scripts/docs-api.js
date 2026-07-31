// Prompt 186: auto-generated API Reference via jsdoc-to-markdown, scoped to
// this codebase's public class surface (src/index.js's own exports).
//
// jsdoc-to-markdown's underlying parser (classic jsdoc / Closure-Compiler
// type syntax) cannot read this codebase's TS-flavored JSDoc types — arrow
// function types ((d, i) => v) and inline object shapes ({a: number}) — and
// a single unparseable tag anywhere in a batch makes the whole jsdoc run
// fail with zero output (verified directly: one broken file poisons every
// other file passed in the same invocation). That syntax is used in ~80% of
// src/, so this script sanitizes a throwaway temp copy of src/ before
// handing it to jsdoc-to-markdown — real source files are never touched,
// and every method's prose/@throws/@example content survives unchanged;
// only the displayed *type* of an unparseable expression is flattened to
// Function/Object. types/index.d.ts remains the precise, authoritative type
// signature for the same members (cross-referenced from site/api/index.md).
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import jsdoc2md from 'jsdoc-to-markdown';
import { publicExportNames } from './publicExportNames.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const SRC_DIR = path.join(ROOT, 'src');
const API_DOCS_DIR = path.join(ROOT, 'site', 'api');
const INDEX_FILE = path.join(SRC_DIR, 'index.js');

// Matches CLAUDE.md §1.4's layer table — order used for site/api/index.md's grouping.
const LAYER_ORDER = ['core', 'scene', 'object', 'compose', 'anim', 'material', 'postfx', 'chart', 'interact', 'stream'];
const LAYER_TITLE = {
  core: 'Core Engine',
  scene: 'Scene Composition',
  object: 'Object & Mesh',
  compose: 'Compose',
  anim: 'Anim',
  material: 'Material',
  postfx: 'PostFX & Particles',
  chart: 'Chart',
  interact: 'Interaction',
  stream: 'Stream',
};

// Where each non-class export is actually documented in prose — classes get
// an auto-generated /api/<Name> page (below), but a namespace/function export
// has no `@class` to anchor one, so this table is the one place that maps it
// to its real home on the Concepts pages (CLAUDE.md §1.1 DRY: manifest.json
// re-exports this same table for ApiSearch.vue, rather than a second
// hand-maintained copy there). Anchors are verified against `npm run
// docs:build`'s rendered heading ids, not hand-slugified — VitePress's
// slugifier keeps unicode dashes literally and doesn't always match a naive
// guess (see e.g. `material`'s `101–106` en-dash below).
const NON_CLASS_DOC_LINKS = {
  VERSION: '/concepts/core#version',
  INSTANCING_THRESHOLD: '/concepts/object#the-instancing-decision-graphmesh-vs-graphinstancedobject',
  accessor: '/concepts/compose#generators-—-generator',
  accessorField: '/concepts/compose#generators-—-generator',
  anim: '/concepts/anim#graphanim-—-the-engine-root',
  annotation: '/concepts/compose#annotation-—-annotation',
  assignDepthJitter: '/concepts/object#assigndepthjitter-—-z-fighting-mitigation',
  bezier: '/concepts/anim#graphanimcurve-—-curve-spring-bezier-noise-resolve',
  buildBuffers: '/concepts/compose#generators-—-generator',
  color: '/concepts/compose#color-palettes-—-color-palette',
  createWorkerFactory: '/concepts/core#building-a-workerpool-directly',
  curve: '/concepts/anim#graphanimcurve-—-curve-spring-bezier-noise-resolve',
  effects: '/concepts/interact#material-effects-—-premade-glsl-hover-select-shader-effects-prompt-150',
  fixWinding: '/concepts/object#recomputenormals-fixwinding-—-normals-shading-fixes',
  generator: '/concepts/compose#generators-—-generator',
  graphHTML: '/concepts/material#graphhtml-—-experimental-html-in-canvas-labels-user-requested-not-part-of-prompts-md-s-numbered-sequence',
  graphIcon: '/concepts/material#graphicon-—-image-svg-icons-riding-an-animated-bar',
  interpolate: '/concepts/compose#interpolation-—-interpolate-interpolatenumber-interpolatergb-interpolatehsl-interpolatelab-interpolatearray-interpolateobject',
  interpolateArray: '/concepts/compose#interpolation-—-interpolate-interpolatenumber-interpolatergb-interpolatehsl-interpolatelab-interpolatearray-interpolateobject',
  interpolateHsl: '/concepts/compose#interpolation-—-interpolate-interpolatenumber-interpolatergb-interpolatehsl-interpolatelab-interpolatearray-interpolateobject',
  interpolateLab: '/concepts/compose#interpolation-—-interpolate-interpolatenumber-interpolatergb-interpolatehsl-interpolatelab-interpolatearray-interpolateobject',
  interpolateNumber: '/concepts/compose#interpolation-—-interpolate-interpolatenumber-interpolatergb-interpolatehsl-interpolatelab-interpolatearray-interpolateobject',
  interpolateObject: '/concepts/compose#interpolation-—-interpolate-interpolatenumber-interpolatergb-interpolatehsl-interpolatelab-interpolatearray-interpolateobject',
  interpolateRgb: '/concepts/compose#interpolation-—-interpolate-interpolatenumber-interpolatergb-interpolatehsl-interpolatelab-interpolatearray-interpolateobject',
  isHTMLInCanvasSupported: '/concepts/material#graphhtml-—-experimental-html-in-canvas-labels-user-requested-not-part-of-prompts-md-s-numbered-sequence',
  label: '/concepts/material#label-—-the-shared-gpu-text-primitive-improvement-md-initiative-c',
  layout: '/concepts/compose#layouts-—-layout',
  link: '/concepts/interact#link-—-cross-filtering-prompt-153',
  loop: '/concepts/core#how-it-works',
  material: '/concepts/material#the-material-namespace-—-presets-prompts-101–106-111–112',
  memoryPressure: '/concepts/stream#memorypressure-prompt-168',
  middleware: '/concepts/stream#aggregator-middleware-decimate-prompt-162',
  noise: '/concepts/anim#graphanimcurve-—-curve-spring-bezier-noise-resolve',
  palette: '/concepts/compose#color-palettes-—-color-palette',
  recomputeNormals: '/concepts/object#recomputenormals-fixwinding-—-normals-shading-fixes',
  registerWorkerTask: '/concepts/core#registering-custom-tasks',
  registry: '/concepts/core#the-registry-singleton',
  resolve: '/concepts/anim#graphanimcurve-—-curve-spring-bezier-noise-resolve',
  removeLabels: '/concepts/compose#bulk-labeling-synclabels-removelabels-improvement-md-initiative-c',
  scale: '/concepts/compose#scales-—-scale',
  syncLabels: '/concepts/compose#bulk-labeling-synclabels-removelabels-improvement-md-initiative-c',
  spring: '/concepts/anim#graphanimcurve-—-curve-spring-bezier-noise-resolve',
  texture: '/concepts/material#the-texture-namespace-—-procedural-textures-prompt-110',
  transform: '/concepts/chart#chart-use-middleware-data-transforms-prompt-142',
  validateGeometry: '/concepts/object#validategeometry-—-structural-topological-mesh-diagnostics',
};

const TYPE_TAGS = ['type', 'param', 'returns', 'return', 'throws', 'property', 'yields', 'typedef'];
const TAG_RE = new RegExp(`@(${TYPE_TAGS.join('|')})(\\s*)\\{`, 'g');

/** Index of the `}` matching the `{` at `openIdx`, honoring nested braces. */
function findMatchingBrace(str, openIdx) {
  let depth = 1;
  for (let i = openIdx + 1; i < str.length; i++) {
    if (str[i] === '{') depth++;
    else if (str[i] === '}' && --depth === 0) return i;
  }
  return -1;
}

// A "simple" type: a bare dotted identifier (`string`, `THREE.Object3D`), or
// a `|`-union of those — nothing classic jsdoc's Closure-Compiler-derived
// parser is known to choke on. Deliberately conservative: even valid-looking
// constructs this codebase doesn't actually use (bracket generics, `Type[]`
// array shorthand — confirmed by direct testing that plain jsdoc rejects
// `*[]` too, wanting `Array.<Type>` instead) are treated as "not simple" and
// flattened, trading a little type precision for never crashing the batch.
const SIMPLE_SEGMENT_RE = /^[A-Za-z_$][\w$.]*$/;

/** @param {string} expr @returns {boolean} */
function isSimpleType(expr) {
  return expr.split('|').every((part) => SIMPLE_SEGMENT_RE.test(part.trim()));
}

/**
 * Flattens one JSDoc type expression to something classic jsdoc's
 * Closure-Compiler-derived parser can read. Already-simple types pass
 * through untouched; everything else is classified by shape:
 * arrow function types (`(d, i) => v`) become `Function`; inline object
 * shapes (`{a: number}`, `{a?: string}`) become `Object`; TS-style inline
 * import types (`import('./X.js').Y`) resolve to their bare type name `Y`
 * (still simple and correct, not just a placeholder); anything else
 * (tuples, nested generics, ...) falls back to `*` (jsdoc's "any").
 * @param {string} expr
 * @returns {string}
 */
function sanitizeTypeExpr(expr) {
  const trimmed = expr.trim();
  if (isSimpleType(trimmed)) return expr;
  if (trimmed.includes('=>')) return 'Function';
  const importMatch = trimmed.match(/^import\([^)]*\)\.(\w+)$/);
  if (importMatch) return importMatch[1];
  if (trimmed.startsWith('{') || /[a-zA-Z_$][\w$]*\??\s*:/.test(trimmed)) return 'Object';
  return '*';
}

/** Rewrites every `@tag {...}` type expression in `source` via `sanitizeTypeExpr`. */
function sanitizeSource(source) {
  let out = '';
  let last = 0;
  TAG_RE.lastIndex = 0;
  let match;
  while ((match = TAG_RE.exec(source))) {
    const openIdx = match.index + match[0].length - 1;
    const closeIdx = findMatchingBrace(source, openIdx);
    if (closeIdx === -1) continue;
    const inner = source.slice(openIdx + 1, closeIdx);
    const safe = sanitizeTypeExpr(inner);
    if (safe !== inner) {
      out += source.slice(last, openIdx + 1) + safe;
      last = closeIdx;
    }
    TAG_RE.lastIndex = closeIdx;
  }
  out += source.slice(last);
  return out;
}

/**
 * Recursively copies every `.js` file under `srcDir` into `destDir`,
 * sanitizing JSDoc types along the way and prepending a synthetic
 * `@module <basename>` doc comment to each file.
 *
 * The `@module` tag isn't decorative: without it, jsdoc-to-markdown's
 * default class template renders a class's own doc comment but silently
 * drops every one of its members (verified directly against a from-scratch
 * minimal ES class with zero private fields — jsdoc-to-markdown itself
 * warns "Jsdoc data looks malformed... ensuring the sourcecode file has a
 * `@module` tag" when this happens). This codebase's real source files
 * don't declare `@module` (CLAUDE.md's public-surface convention is
 * per-layer `index.js` re-exports, not per-file ES module docs), so this
 * copy adds one purely so jsdoc-to-markdown's templates can find the
 * members — it changes doclet `longname`s (module-nested) but not the bare
 * `.name` this script's own class-page generation matches on below.
 */
function copySanitized(srcDir, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      copySanitized(srcPath, destPath);
    } else if (entry.name.endsWith('.js')) {
      const moduleName = entry.name.slice(0, -'.js'.length);
      const sanitized = sanitizeSource(fs.readFileSync(srcPath, 'utf8'));
      fs.writeFileSync(destPath, `/** @module ${moduleName} */\n\n${sanitized}`);
    }
  }
}

/** The top-level `src/` layer directory a class doclet's original source file lives under, or `null`. */
function layerOf(doclet, tempSrcDir) {
  if (!doclet.meta?.path) return null;
  const rel = path.relative(tempSrcDir, doclet.meta.path);
  const first = rel.split(path.sep)[0];
  return LAYER_ORDER.includes(first) ? first : null;
}

/** Writes `site/api/index.md`, embedding the filterable `ApiSearch` component (sourced from manifest.json) — it covers both auto-generated class pages and the namespace/function cross-reference below. */
function writeIndexPage() {
  const lines = [
    '# API Reference',
    '',
    'Auto-generated from this codebase\'s own JSDoc (`npm run docs:api`, via',
    '`jsdoc-to-markdown`) — one page per exported class, always regenerated',
    'from source rather than hand-maintained, so it never drifts from the',
    'real public API. The namespace/function portion of the public surface',
    '(`scale`, `generator`, `palette`, `layout`, `material`, `color`, `curve`,',
    '`noise`, `texture`, `effects`, `transform`, `middleware`, `interpolate`,',
    '`anim`, and standalone helpers) has no `@class` to anchor a generated page',
    'on, so the search box below links each one straight to its prose',
    'documentation (with runnable examples) on the [Concepts](/concepts/)',
    'pages instead. `types/index.d.ts` in the repository remains the exact,',
    'authoritative type signature for every member on this page.',
    '',
    '<script setup>',
    "import ApiSearch from '../.vitepress/theme/components/ApiSearch.vue';",
    '</script>',
    '',
    '<ApiSearch />',
    '',
  ];
  fs.writeFileSync(path.join(API_DOCS_DIR, 'index.md'), lines.join('\n'));
}

async function main() {
  const publicNames = publicExportNames(INDEX_FILE);

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'graph3d-docs-api-'));
  const tempSrcDir = path.join(tempRoot, 'src');
  try {
    copySanitized(SRC_DIR, tempSrcDir);

    const globPattern = path.join(tempSrcDir, '**', '*.js').split(path.sep).join('/');
    const rawTemplateData = await jsdoc2md.getTemplateData({ files: globPattern });

    // classic jsdoc mis-parses ES private methods (`#method() {}`, used
    // pervasively across this codebase) when they carry their own JSDoc
    // comment: it emits an anonymous doclet (empty name/longname) instead
    // of attaching the comment to the method. dmd's render step throws
    // outright on those ("cannot create a link without an id") rather than
    // skipping them — verified directly against anim/CameraTour.js's
    // `#advanceBy`. Dropping any nameless doclet sidesteps the crash; it
    // also happens to be the right scope anyway, since a private method
    // was never going into a *public* API reference regardless.
    const templateData = rawTemplateData.filter((d) => d.name && d.longname);

    const classDoclets = templateData.filter((d) => d.kind === 'class' && publicNames.has(d.name));

    fs.rmSync(API_DOCS_DIR, { recursive: true, force: true });
    fs.mkdirSync(API_DOCS_DIR, { recursive: true });

    const classesByLayer = {};
    for (const doclet of classDoclets) {
      const layer = layerOf(doclet, tempSrcDir) ?? 'core';
      (classesByLayer[layer] ??= []).push(doclet.name);
    }
    for (const layer of LAYER_ORDER) classesByLayer[layer]?.sort();

    for (const doclet of classDoclets) {
      const template = `{{#class name="${doclet.name}"}}{{>docs}}{{/class}}`;
      const rendered = await jsdoc2md.render({ data: templateData, template });
      // The synthetic `@module <ClassName>` (see copySanitized's own doc
      // comment) renders dmd's class heading as "ClassName.ClassName" —
      // module-qualified, redundant when the module and class share a name
      // (true for every file here). Collapse it back to the bare name.
      const deduped = rendered.replace(new RegExp(`^## ${doclet.name}\\.${doclet.name}$`, 'm'), `## ${doclet.name}`);
      fs.writeFileSync(path.join(API_DOCS_DIR, `${doclet.name}.md`), `# ${doclet.name}\n\n${deduped}`);
    }

    const documentedNames = new Set(classDoclets.map((d) => d.name));
    const nonClassExportNames = [...publicNames].filter((name) => !documentedNames.has(name)).sort();

    // Fail Fast (CLAUDE.md §1.5): a namespace/function export with no entry
    // in NON_CLASS_DOC_LINKS would otherwise silently vanish from both the
    // generated index page and ApiSearch's results the moment someone adds
    // a new one to src/index.js — exactly the discoverability gap this
    // table exists to close.
    const undocumented = nonClassExportNames.filter((name) => !(name in NON_CLASS_DOC_LINKS));
    if (undocumented.length > 0) {
      throw new Error(
        `docs-api: ${undocumented.join(', ')} ${undocumented.length === 1 ? 'is a' : 'are'} public export(s) with ` +
          'no NON_CLASS_DOC_LINKS entry in scripts/docs-api.js. Add a prose section documenting it on the ' +
          'relevant site/concepts/*.md page, then add its anchor to NON_CLASS_DOC_LINKS.',
      );
    }
    const nonClassLinks = Object.fromEntries(nonClassExportNames.map((name) => [name, NON_CLASS_DOC_LINKS[name]]));

    writeIndexPage();

    // site/.vitepress/config.mjs reads this to build the `/api/` sidebar,
    // and ApiSearch.vue reads it to make both classes and namespaces/
    // functions filterable — one source of truth for the layer grouping
    // and the namespace/function link table (CLAUDE.md §1.1 DRY), rather
    // than hand-maintaining second copies that would silently drift from
    // what's actually generated.
    fs.writeFileSync(
      path.join(API_DOCS_DIR, 'manifest.json'),
      JSON.stringify({ layerOrder: LAYER_ORDER, layerTitle: LAYER_TITLE, classesByLayer, nonClassLinks }, null, 2),
    );

    console.log(`docs:api — generated ${classDoclets.length} class page(s) under site/api/`);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
