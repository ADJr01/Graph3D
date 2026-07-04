# CLAUDE.md — Graph3D.js Engineering Constitution

**Read this file at the start of every session. Re-read before touching any code you haven't touched today. These rules are not suggestions.**

---

## 0. Project North Star

Graph3D.js is a **D3-flavored, GPU-instanced, cinematically rendered 3D data visualization library**. It targets millions of data points, exposes the full Three.js scene at every layer, and provides a fluent chainable API as the primary surface.

The single source of truth for **what to build and in what order** is `BUILD_PLAN.md` and the numbered prompts in `prompts.md`. Do not invent features outside that plan without explicit user approval (YAGNI — see §1.3).

---

## 1. The Six Non-Negotiable Rules

### 1.1 DRY — Don't Repeat Yourself

Every piece of logic has **exactly one** authoritative representation.

**Strict application in this project:**
- Disposal logic lives in **one** place per class — the class's own `dispose()` method. Higher-level disposers (e.g. `GraphScene.dispose`) call into them; they do not re-implement disposal.
- Scale math (`scale.linear`, `scale.log`, etc.) lives in `src/compose/scale/`. No chart type re-implements domain-to-range mapping inline. If `BarChart` needs to map values, it imports and uses a scale.
- Color palette interpolation lives in `src/compose/color/`. No chart type defines its own gradient logic.
- Instance buffer write patterns live in `GraphInstancedObject`. Chart `update()` methods do not write to `InstancedBufferAttribute` directly; they call the bulk setters.
- Test fixtures live in `tests/fixtures/`. If two tests need the same mock dataset, extract it.

**Concrete check before merging any code:**
> "Is there logic in this file that already exists elsewhere in the codebase, or that another file will need to do the same thing?"
> If yes → extract into a shared module under the appropriate layer.

**The two-strike rule:** the first time you write a piece of logic it can live inline; the **second** time you need it, extract it before writing it the second time. Never write it twice.

### 1.2 KISS — Keep It Simple, Stupid

The simplest design that satisfies the requirement wins.

**Strict application:**
- No clever metaprogramming. No proxies, no `with` statements, no dynamic class generation, no decorators that mutate behavior at runtime. The codebase is plain ESM JavaScript with JSDoc types.
- No abstraction layers added "for future flexibility." Each layer in the architecture must justify its existence with a current concrete use case in `BUILD_PLAN.md`.
- Public API methods do **one** thing. If a method name has "and" in its description, split it into two methods.
- Prefer composition over inheritance. The only inheritance in the codebase is: chart types extend `GraphChart`, instanced objects extend `GraphObject`. That's it. No deep hierarchies.
- A function over 50 lines is a smell. A function over 100 lines is a bug. Split it.
- A file over 300 lines is a smell. Split it by concern.

**The "explain it to a new hire" test:** if you cannot explain what a function does in one sentence without using the word "and," it is too complex. Refactor.

### 1.3 YAGNI — You Aren't Gonna Need It

Implement only what a current prompt in `prompts.md` requires.

**Strict application:**
- No "what if we later want to..." features. If a prompt asks for `BarChart`, build `BarChart`. Do not also build a configuration system for hypothetical future chart subtypes.
- No premature optimization. Profile first, optimize second. The instancing decision at >50 datums is a **measured** decision documented in `BUILD_PLAN.md`, not a guess.
- No "while I'm here" refactors that aren't tied to the current prompt. If you spot a refactor opportunity in adjacent code, **add it to `.claude/TODO.md` and continue with the current task**.
- No public methods added "for completeness." Every public method must be used by an example or test in the same PR.
- No configuration options added without a current consumer. Adding `options.foo` because "users might want to configure it" is forbidden. Wait until a user asks.

**Before adding any function, class, file, or option, answer in writing:**
> "Which prompt number requires this? Which test or example consumes it today?"
> If you cannot answer both, do not add it.

### 1.4 Separation of Concerns — Loose Coupling Mandatory

Every module owns one concern. Modules communicate through explicit, narrow interfaces.

**Strict application to this project's layers:**

| Layer | Owns | Must NOT touch |
|---|---|---|
| `core/` | Renderer, loop, registry, capabilities, workers, frame budget | Scene contents, chart logic, materials |
| `scene/` | Scene composition: cameras, lights, environment, shadows, clip planes | Chart data, instancing decisions, materials beyond environment — **except `GraphScene.selectAll`**, a second sanctioned exception mirroring `compose/selection`'s: it imports `Selection` from `compose/selection` purely to wrap `selectByName`'s existing matches into a join-ready handle (auto-choosing backend), so the fluent `scene.selectAll(name).attr(...)` entry point (Prompts 74+, 81) doesn't require every caller to construct a `Selection` by hand. `GraphScene` still never imports concrete chart/data-binding logic — only the one `compose/selection` re-export. |
| `object/` | Object/mesh wrappers, instancing, octree, loaders | Chart-type-specific logic, data binding, scales — **except `GraphInstancedObject`'s `setAllPositions`/`setAllScales`/`setAllColors`**, a fourth sanctioned exception in the same family as `compose/selection`'s: their `options.easing` (Prompt 92, "wire `Transition` into the bulk setters") resolves through `anim/GraphAnimCurve.resolve` rather than a second easing table living in `object/` (CLAUDE.md §1.1 DRY). `resolve` is a pure, stateless `(name) => (t) => number` function with zero knowledge of THREE.js or `object/`'s types — `object/` still never imports anything else from `anim/`, and `anim/` never imports `object/` back (no cycle; `madge --circular` stays clean). |
| `compose/` | Scales, generators, layouts, palettes, axes, annotations, **and `compose/selection` (`Selection`, data-join — v3 addition, Prompts 74+)** | Direct Three.js API calls (works on plain arrays/numbers) — **except `compose/selection`, which is deliberately exempt**: `Selection` reads/writes through `object/`-layer wrapper instances (`GraphMesh`, `GraphInstancedObject`) so per-datum micro-control works uniformly across both rendering paths. It still never touches raw `THREE.*` classes directly — only the `object/` wrappers, which is the one sanctioned import-from-below inside `compose/`. **`compose/axis` and `compose/annotation` (Prompts 83–84) share the same exemption**: `Axis` renders a real spine/tick scene object and `annotation`'s `callout`/`referenceLine`/`referencePlane`/`region` render real callout/plane/region scene objects — no data-only chart layer exists yet to do this on their behalf, so both import `GraphMesh` from `object/` (mirroring `compose/selection`'s import) and construct `THREE.BufferGeometry`/`THREE.Material` instances directly (the minimum needed to hand `GraphMesh` a concrete geometry+material) — no other Three.js API surface is touched. `annotation.label` and `Axis`'s per-tick labels remain plain metadata (`{text, position}`, no Three.js object at all) until Phase 6's SDF text material exists. **`compose/selection`'s `SelectionTransition` (Prompt 91) is a third, narrower exemption**: `Selection.transition()` needs a timeline/easing engine to drive animated `.attr()`/`.style()` writes, and `anim/` is that engine — rather than build a second one inside `compose/`, `SelectionTransition` imports `GraphAnimTimeline`/`GraphAnim`/`GraphAnimCurve.resolve` from `anim/` directly (an import from a layer listed *after* `compose/` in this table). This doesn't close a cycle (`madge --circular src/` stays clean): `anim/` itself only reaches back into `compose/interpolate` (Prompt 87, a leaf with no further upward imports), never into `compose/selection`, so the two crossings don't meet. Treat this the same as the other two: importing `anim/`'s public exports only, never its internals, and never for anything `anim/` itself needs to know about `Selection`/`object/` types (it still only sees opaque per-frame numbers via `SelectionTransition`'s own dummy timeline target). |
| `anim/` | Animation engine, timelines, transitions | What is being animated (operates on opaque targets via property paths) |
| `material/` | Material presets, SDF text, procedural textures | Scene composition, chart logic |
| `postfx/` | EffectComposer passes, particle systems | Chart-specific behaviors (charts request effects through public PostFX API) |
| `chart/` | Chart types, data binding | Direct Three.js calls (uses the layers above) |
| `interact/` | Picking, state machine, tooltips, brush, lasso | Chart internals (operates on the public chart API) |
| `stream/` | DataStream, workers, LOD, GPGPU, aggregation | Chart-specific rendering |

**Coupling rules:**
- A layer may import from layers **below it** in the table.
- A layer **must not** import from layers above it.
- A layer **must not** import sideways from a sibling unless an `index.js` explicitly re-exports a public boundary.
- No circular dependencies. CI fails on `madge --circular src/`.
- Each layer has its own `index.js` declaring its public surface. Other layers import only from that `index.js`, never from internal files — **except `object/`'s own imports of `scene/`'s registry/disposal leaf files** (`GraphObject.js`, `GraphMesh.js`, `GraphInstancedObject.js`, `GraphObjectLoader.js` import `scene/GraphSceneRegistry.js` and `core/GraphDisposal.js` directly, not `scene/index.js`). This is load-bearing, not a shortcut: `scene/index.js` re-exports `GraphScene`, and `GraphScene` now imports `Selection` from `compose/selection` (the `scene/` carve-out above) — `compose/selection` imports `object/`, so `object/` importing the `scene/` barrel would close a real `scene → compose/selection → object → scene` cycle (`madge --circular` catches this; it doesn't distinguish "sanctioned" from "unsanctioned"). Do not "clean up" these imports back to `scene/index.js`.

**Test for SoC violations before merging:**
> "If I delete this file's parent layer entirely, does any code in another layer fail to compile?"
> If yes for a layer above → SoC is broken. Fix the dependency direction.

### 1.5 Fail Fast — Loudly, with Logs

The system must report failures immediately and never continue in a broken state.

**Strict application:**

- **Validate all public API inputs at the boundary.** A `chart.data(arr)` call with `arr === null` throws immediately with a clear message. It does not silently bind an empty array.
- **No silent fallbacks.** If `setHDR(url)` fails to load the texture, throw. Do not silently use a default. The exception: capability-driven fallbacks (e.g. WebGL2 → WebGL1) are explicit and emit a `console.warn` documenting the fallback.
- **No swallowed promises.** Every `await` either succeeds or throws to a clear catch site. No `.catch(() => {})` patterns. No `try { ... } catch {}` without a `console.error` and a log entry.
- **Assertions in dev, removed in prod.** Use a project-internal `assert(condition, message)` helper. The Rollup `replace` plugin strips assertions in production builds.
- **Type checks at boundaries.** If a public method expects an array, check `Array.isArray(x)` at the entrance. Throw `TypeError` with the method name and expected vs received type.

**The error log protocol — `.claude/errors.log`:**

A common error log lives at `.claude/errors.log` (gitignored — local development only). Macro-level errors (any error not caught by the immediate consumer) must be written to this file in the following format:

```
[ISO8601 timestamp] [severity] [layer/module] [class.method] [error.name]: <message>
  stack: <one-line stack summary>
  context: <relevant runtime state — data length, capability flags, scene name>
  prompt-ref: <the prompts.md prompt number being worked on when this fired, if known>
---
```

Implementation: create `src/core/ErrorLog.js` exporting an `errorLog.write(error, context)` function. Wire it into:
1. The top-level `Graph3D` instance — any uncaught error in a tick callback writes to the log.
2. The `WorkerPool` — worker errors write to the log.
3. The dev-mode `assert` helper — assertion failures write to the log.
4. Public API entry points — validation failures write to the log before throwing.

In production builds (`NODE_ENV=production`), the file write is replaced with a no-op but the throw still occurs. The log is for Claude Code's local debugging — it is never shipped.

**When you (Claude Code) start a session, read `.claude/errors.log` first.** The last entries reveal what broke in the previous session. Fix those before adding new code.

### 1.6 Code for the Maintainer

Write every line assuming the maintainer is hostile, sleep-deprived, and knows where you live.

**Strict application:**

- **Names over comments.** A function named `computeVisibleBarsViaFrustumCull` needs no comment. A function named `process` needs a comment. Prefer the name.
- **JSDoc on every public method.** `@param` types, `@returns`, `@throws`, and at least one `@example` for non-trivial methods. The JSDoc is the contract — it is checked against `types/index.d.ts` in CI.
- **No magic numbers.** `if (count > 50)` is wrong. `if (count > INSTANCING_THRESHOLD)` is right, with `INSTANCING_THRESHOLD` declared at the top of the file with a comment explaining the boundary's rationale.
- **No abbreviations except universally understood ones.** `cfg` is wrong; `config` is right. `idx` is acceptable for loop indices; `i` is acceptable only inside short loops. `cb` is acceptable for callback parameters.
- **Errors describe what was expected and what was received.** Not `"Invalid input"`. Yes `"Graph3D.chart(type): expected one of ['bar','line','scatter',...], received 'barr'. Did you mean 'bar'?"`.
- **Comments explain WHY, never WHAT.** The code shows what. A comment justifies a non-obvious decision: `// Using pow2 capacity grow because re-allocating InstancedMesh attributes every update churns GPU memory; see BUILD_PLAN.md §3.`
- **No dead code.** No commented-out blocks. No "we might want this later" stubs. Git remembers the deleted code.
- **No clever one-liners.** A 4-line clear version beats a 1-line ternary nest. Always.
- **Format with Prettier on save.** No style debates. The config is the config.

**The 2 AM test:** would the maintainer, paged at 2 AM with this code on their screen, understand what it does and where to fix it within 60 seconds? If no, rewrite.

---

## 2. Project-Specific Anti-Patterns — Refuse These

The following patterns must be refused on sight. If a prompt seems to ask for one, push back and clarify.

| Anti-pattern | Why refused | What to do instead |
|---|---|---|
| Per-mesh code for >50 datums | Breaks the million-point design | Use `GraphInstancedObject` with bulk setters |
| Skipping `dispose()` calls | THREE.js leaks are the #1 sink | Disposal is mandatory on every class with GPU/DOM resources |
| Canvas-sprite text after Phase 6 | Looks bad, blocks the SDF goal | Use `SDFText.create` |
| Manual `requestAnimationFrame` outside `Graph3DLoop` | Breaks single-loop guarantee | Subscribe via `loop.add(cb)` |
| Creating multiple `WebGLRenderer` instances | Hits browser context limit | One renderer, many scenes |
| Catching errors and continuing silently | Violates Fail Fast | Throw and log; let the caller decide |
| Adding configuration options speculatively | Violates YAGNI | Wait until a current prompt or user request demands it |
| Re-implementing scale math inside a chart type | Violates DRY | Import from `src/compose/scale/` |
| Materials configured outside `material/` presets | Violates SoC | Add a new preset or use the `applyShader` passthrough |
| `console.log` in source code | Caught by lint | Use `console.warn`/`console.error` only when justified |
| Tests with no assertions | Worse than no tests — they give false confidence | Every test must assert something concrete |
| Snapshot tests of UI text without justification | Brittle, low-value | Assert behaviors, not strings |

---

## 3. The Disposal Contract (THREE.js-Specific, Non-Negotiable)

Any class that creates GPU resources, DOM resources, RAF callbacks, observers, or event listeners must:

1. Implement `dispose()` that releases **all** resources it created.
2. Be idempotent — calling `dispose()` twice must not throw.
3. After `dispose()`, all public methods either throw `"Object disposed"` or are no-ops (documented explicitly per method).
4. Have a leak test in `tests/integration/<class>-disposal.test.js` that creates and disposes the class N times (default 1000) and asserts `renderer.info.memory.geometries` and `.textures` return to baseline.
5. Be referenced by its parent's `dispose()` — `GraphScene.dispose()` disposes all child objects; `Graph3D.dispose()` disposes all scenes.

The phrase "I'll add disposal later" is not allowed. Disposal is part of "done."

---

## 4. Definition of Done

A task (prompt) is **done** when **all** of the following are true:

- [ ] Code is written and passes `npm run lint`.
- [ ] JSDoc covers every public method with `@param`, `@returns`, `@throws`, and ≥1 `@example` for non-trivial methods.
- [ ] Unit tests cover every public method. Coverage thresholds (lines ≥85, branches ≥80, functions ≥85) are not regressed.
- [ ] Integration test exercises the new code in a real scene where applicable.
- [ ] Disposal test passes if the class holds GPU/DOM resources.
- [ ] No new entries appear in `.claude/errors.log` when running the test suite.
- [ ] Public API additions are reflected in `types/index.d.ts`.
- [ ] If a new public class or method was added, it appears in `src/index.js` exports (or the appropriate layer's `index.js`).
- [ ] If a new public concept was introduced, it has a docs page or section under `docs/`.
- [ ] The relevant prompt's exit criteria in `BUILD_PLAN.md` is checked off.
- [ ] No `console.log` introduced. No `.catch(() => {})` introduced. No magic numbers introduced.
- [ ] `npm run build` succeeds. Bundle-size budget is not exceeded.

A task that is "done except for tests" is **not done**.

---

## 5. Adding New Things — The Approved Paths

When a prompt asks to add a new artifact, follow the path exactly:

**New chart type:**
1. Create `src/chart/<Name>Chart.js extending GraphChart`.
2. Compose using existing scales (`compose/scale`), generators (`compose/generator`), layouts (`compose/layout`).
3. Default to instanced rendering (use `GraphInstancedObject` from `object/`).
4. Implement `build`, `update` (diff-based via `GraphChartDataBinding`), `destroy`.
5. Register the type name in `Graph3D.chart(typeName)` dispatch.
6. Add example, tests, docs page.

**New material preset:**
1. Create `src/material/presets/<name>.js` exporting a factory function.
2. Re-export from `src/material/index.js`.
3. Add a gallery entry in `examples/06-materials/`.
4. Add a leak test (material disposal + texture disposal).

**New easing curve:**
1. Add to `src/anim/GraphAnimCurve.js`.
2. Add unit tests covering `t=0`, `t=1`, and monotonicity if applicable.
3. Add to the docs easing-picker.

**New scale, generator, layout, palette, postfx pass, particle behavior, chart type:** same pattern. Add in the right layer's directory, re-export through that layer's `index.js`, add tests, add docs, add an example.

**Anything not on this list:** ask first. Do not invent new layers, new top-level concepts, or new naming conventions.

---

## 6. The Error Log — Operational Protocol

`.claude/errors.log` is the cross-session memory of failures. Treat it as the first thing to read.

**On session start:**
```
1. cat .claude/errors.log | tail -50
2. Are there entries newer than the last commit?
   YES → fix those before doing anything else.
   NO  → proceed to the current prompt.
```

**When an error occurs during development:**
1. The error is automatically written to `.claude/errors.log` via the `errorLog.write` plumbing.
2. Stop, read the entry, understand the cause.
3. Fix the root cause, not the symptom.
4. Add a regression test that would have caught it.
5. Document the fix in the commit message referencing the log entry timestamp.

**When you cannot reproduce an error logged in a previous session:**
1. Note the timestamp.
2. Add a comment in `.claude/TODO.md` describing the unreproducible error.
3. Do not silently delete log entries. The file is append-only.

**Truncation:** the file is truncated by the developer manually (`> .claude/errors.log`) only after the entries have been triaged. Never truncate it automatically.

---

## 7. When in Doubt — The Decision Tree

```
Is this change required by a numbered prompt in prompts.md?
├── NO  → STOP. Add to .claude/TODO.md or ask the user.
└── YES → Continue.

Does the change introduce a new file?
├── YES → Does the file live in the correct layer per §1.4?
│         ├── NO  → Move it.
│         └── YES → Continue.
└── NO  → Continue.

Does the change duplicate logic that exists elsewhere?
├── YES → Extract before proceeding (DRY).
└── NO  → Continue.

Does the change add a configuration option, method, or class
that has no consumer in this PR?
├── YES → Remove it (YAGNI).
└── NO  → Continue.

Does the change add complexity (inheritance, indirection,
metaprogramming) without a current measured need?
├── YES → Simplify (KISS).
└── NO  → Continue.

Does the change handle errors by silencing them?
├── YES → Throw + log instead (Fail Fast).
└── NO  → Continue.

Would a 2 AM maintainer understand this in 60 seconds?
├── NO  → Rewrite for clarity.
└── YES → Run tests. If green and Definition of Done is met, commit.
```

---

## 8. Files Claude Code Must Be Aware Of

| File | Purpose | Read frequency |
|---|---|---|
| `CLAUDE.md` | This file. Engineering constitution. | Every session start. |
| `BUILD_PLAN.md` | Architecture + 13 phases + exit criteria. Source of truth for *what to build*. | Every session start. |
| `prompts.md` | The 244 sequenced prompts. Source of truth for *what to build next*. | Every session start, plus before each new prompt. |
| `.claude/errors.log` | Cross-session error journal. | Every session start. |
| `.claude/TODO.md` | Deferred work, observed refactors, unreproducible bugs. | Every session start. |
| `package.json` | Dependencies, scripts, exports map. | Before adding a dependency or script. |
| `vitest.config.js` | Test config, coverage thresholds. | Before adding/modifying tests. |
| `rollup.config.js` | Build config, bundle outputs. | Before changing public exports. |

---

## 9. Specific Things You Should Never Do

- Never `npm install` a new dependency without first justifying why an existing dependency or hand-written code cannot do the job. The peer dependency on `three` is the only "easy" addition; everything else gets pushback.
- Never delete or rewrite existing tests to make new code pass. If a test fails, the code is wrong unless the test was wrong — and if the test was wrong, the original change that introduced it was wrong, which means git blame is on you, maintainer-of-the-future.
- Never disable a lint rule with `// eslint-disable-line` to ship code. Fix the code.
- Never commit `.claude/errors.log` to git. It is in `.gitignore`.
- Never bypass the layered architecture by importing from `chart/` into `core/` "just this once."
- Never assume the user wants a quick hack. Adnan explicitly wants this library to reach world-class status. Engineering shortcuts are not on the table.

---

## 10. Final Word

When these rules conflict with each other, the priority order is:

1. **Fail Fast** — broken state is worse than a thrown error.
2. **Separation of Concerns** — long-term maintainability over short-term convenience.
3. **DRY** — single source of truth.
4. **KISS** — simplest design that satisfies.
5. **YAGNI** — don't build what no current prompt requires.
6. **Code for the Maintainer** — clarity for the next human.

When these rules conflict with a prompt's instruction, **the rules win**. Push back on the prompt. The prompts in `prompts.md` are correct in intent; if executing one literally would violate a rule, the prompt's intent is satisfiable in a rule-compliant way — find it.

**End of constitution. Re-read on every session start.**
