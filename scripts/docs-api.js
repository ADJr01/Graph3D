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
// signature for the same members (cross-referenced from docs/api/index.md).
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import jsdoc2md from 'jsdoc-to-markdown';

const ROOT = path.resolve(import.meta.dirname, '..');
const SRC_DIR = path.join(ROOT, 'src');
const API_DOCS_DIR = path.join(ROOT, 'docs', 'api');
const INDEX_FILE = path.join(SRC_DIR, 'index.js');

/**
 * The public export names declared by `src/index.js` — parsed statically
 * (regex over its own `export { A, B } from '...'`/`export const X` lines)
 * rather than executed, since `src/index.js` imports `virtual:worker-blob`
 * (a Rollup/Vite plugin-resolved specifier — see `vitest.config.js`'s own
 * stub for the same problem) which plain `node` can't resolve. `index.js`
 * is a pure re-export barrel with no other logic, so static parsing is both
 * simpler and doesn't need a real module evaluation at all.
 * @returns {Set<string>}
 */
function publicExportNames() {
  const source = fs.readFileSync(INDEX_FILE, 'utf8');
  const names = new Set();
  for (const match of source.matchAll(/export\s*\{([^}]*)\}/g)) {
    for (const part of match[1].split(',')) {
      const name = part.trim().split(/\s+as\s+/).pop().trim();
      if (name) names.add(name);
    }
  }
  for (const match of source.matchAll(/export\s+const\s+(\w+)/g)) names.add(match[1]);
  return names;
}

// Matches CLAUDE.md §1.4's layer table — order used for docs/api/index.md's grouping.
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

/** Writes `docs/api/index.md`, grouping generated class pages by layer plus a namespaces/functions cross-reference. */
function writeIndexPage(classesByLayer, nonClassExportNames) {
  const lines = [
    '# API Reference',
    '',
    'Auto-generated from this codebase\'s own JSDoc (`npm run docs:api`, via',
    '`jsdoc-to-markdown`) — one page per exported class, always regenerated',
    'from source rather than hand-maintained, so it never drifts from the',
    'real public API.',
    '',
    '**Scope:** classes only. The namespace/function portion of the public',
    'surface (`scale`, `generator`, `palette`, `layout`, `material`, `color`,',
    '`curve`, `noise`, `texture`, `effects`, `transform`, `middleware`,',
    '`interpolate`, `anim`, and standalone helpers) is plain-object/function',
    'exports without a `@class` to anchor a page on — those are documented in',
    'prose with runnable examples on the [Concepts](/concepts/) pages instead',
    'of being thinly auto-extracted here. `types/index.d.ts` in the',
    'repository remains the exact, authoritative type signature for every',
    'member on this page.',
    '',
  ];
  for (const layer of LAYER_ORDER) {
    const names = classesByLayer[layer];
    if (!names || names.length === 0) continue;
    lines.push(`## ${LAYER_TITLE[layer]}`, '');
    for (const name of names) lines.push(`- [${name}](/api/${name})`);
    lines.push('');
  }
  if (nonClassExportNames.length > 0) {
    lines.push('## Namespaces & Functions (see Concepts)', '');
    lines.push(nonClassExportNames.map((name) => `\`${name}\``).join(', '));
    lines.push('');
  }
  fs.writeFileSync(path.join(API_DOCS_DIR, 'index.md'), lines.join('\n'));
}

async function main() {
  const publicNames = publicExportNames();

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
    writeIndexPage(classesByLayer, nonClassExportNames);

    // docs/.vitepress/config.mjs reads this to build the `/api/` sidebar —
    // one source of truth for the layer grouping (CLAUDE.md §1.1 DRY),
    // rather than hand-maintaining a second copy of the class list there
    // that would silently drift from what's actually generated.
    fs.writeFileSync(
      path.join(API_DOCS_DIR, 'manifest.json'),
      JSON.stringify({ layerOrder: LAYER_ORDER, layerTitle: LAYER_TITLE, classesByLayer }, null, 2),
    );

    console.log(`docs:api — generated ${classDoclets.length} class page(s) under docs/api/`);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
