// CI drift-check (Prompt 174): `tsc --noEmit --allowJs` loads the real
// runtime module (`src/index.js`, via `allowJs`) side by side with the
// hand-authored `types/index.d.ts` and asserts every value `src/index.js`
// actually exports is also declared there — the concrete "someone added a
// new public export and forgot to add its type declaration" drift bug.
//
// This is deliberately one-directional and name-level only:
//
// - One-directional: `types/index.d.ts` legitimately declares plain type
//   helpers with no runtime counterpart (`JoinResult`, `ForceSimulation`,
//   `SelectionNode`, `Predicate`, `AnyScale`, `ComputedBuffers`, etc.) —
//   `class`/`interface` declarations used purely to name a documented shape.
//   Requiring the reverse (every declared name has a matching runtime
//   export) would flag all of those as "missing," which is by design, not
//   drift.
// - Name-level, not structural: Prompt 173 hand-split nearly every D3-style
//   get/set method into overload pairs specifically because plain JSDoc
//   can't express that precision (see types/index.d.ts's own header
//   comment), so a deep structural comparison of each export's full shape
//   would flag the entire public surface as "different" permanently, not
//   just genuine drift. `tsd` (test-d/) verifies that per-method precision,
//   including Selection<T>/GraphChart<T> generics — this check verifies the
//   cheaper, higher-signal invariant that actually catches real drift, with
//   no per-class suppression needed and no false positives.
import * as impl from '../src/index.js';
import type * as declared from '../types/index';

type ImplKeys = keyof typeof impl;
type DeclaredKeys = keyof typeof declared;

// If `src/index.js` exports a name `types/index.d.ts` doesn't declare, this
// constraint fails to compile with the offending name(s) spelled out.
type AssertDeclared<T extends never> = T;
type _allExportsAreDeclared = AssertDeclared<Exclude<ImplKeys, DeclaredKeys>>;
