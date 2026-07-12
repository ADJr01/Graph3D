import { describe, it, expect } from 'vitest';
import * as api from '../src/index.js';

// Prompt 175: freezes the public export surface of src/index.js. A PR that
// adds/removes/renames an export changes this snapshot — update it
// deliberately with `vitest run -u` as part of that PR, not by accident.
describe('public API surface', () => {
  it('matches the frozen export snapshot', () => {
    expect(Object.keys(api).sort()).toMatchSnapshot();
  });
});
