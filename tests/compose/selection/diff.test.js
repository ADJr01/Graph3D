import { describe, it, expect } from 'vitest';
import { diffData } from '../../../src/compose/selection/diff.js';

describe('diffData: unkeyed (positional) join', () => {
  it('all-overlap: every entry updates, none enter or exit', () => {
    const result = diffData([{ v: 1 }, { v: 2 }], [{ v: 10 }, { v: 20 }]);
    expect(result.enter).toEqual([]);
    expect(result.exit).toEqual([]);
    expect(result.update).toEqual([
      { datum: { v: 10 }, oldIndex: 0, newIndex: 0 },
      { datum: { v: 20 }, oldIndex: 1, newIndex: 1 },
    ]);
  });

  it('newData longer: extra tail entries enter', () => {
    const result = diffData([{ v: 1 }], [{ v: 1 }, { v: 2 }, { v: 3 }]);
    expect(result.update).toEqual([{ datum: { v: 1 }, oldIndex: 0, newIndex: 0 }]);
    expect(result.enter).toEqual([
      { datum: { v: 2 }, newIndex: 1 },
      { datum: { v: 3 }, newIndex: 2 },
    ]);
    expect(result.exit).toEqual([]);
  });

  it('oldData longer: extra tail entries exit', () => {
    const result = diffData([{ v: 1 }, { v: 2 }, { v: 3 }], [{ v: 1 }]);
    expect(result.update).toEqual([{ datum: { v: 1 }, oldIndex: 0, newIndex: 0 }]);
    expect(result.enter).toEqual([]);
    expect(result.exit).toEqual([
      { datum: { v: 2 }, oldIndex: 1 },
      { datum: { v: 3 }, oldIndex: 2 },
    ]);
  });

  it('both empty: no enter, update, or exit', () => {
    expect(diffData([], [])).toEqual({ enter: [], update: [], exit: [] });
  });
});

describe('diffData: keyed join', () => {
  const key = (d) => d.id;

  it('matches by key regardless of position', () => {
    const oldData = [{ id: 'a', v: 1 }, { id: 'b', v: 2 }];
    const newData = [{ id: 'b', v: 20 }, { id: 'a', v: 10 }];
    const result = diffData(oldData, newData, key);
    expect(result.enter).toEqual([]);
    expect(result.exit).toEqual([]);
    expect(result.update).toEqual([
      { datum: { id: 'b', v: 20 }, oldIndex: 1, newIndex: 0 },
      { datum: { id: 'a', v: 10 }, oldIndex: 0, newIndex: 1 },
    ]);
  });

  it('a new key enters, a missing key exits', () => {
    const oldData = [{ id: 'a' }, { id: 'b' }];
    const newData = [{ id: 'a' }, { id: 'c' }];
    const result = diffData(oldData, newData, key);
    expect(result.update).toEqual([{ datum: { id: 'a' }, oldIndex: 0, newIndex: 0 }]);
    expect(result.enter).toEqual([{ datum: { id: 'c' }, newIndex: 1 }]);
    expect(result.exit).toEqual([{ datum: { id: 'b' }, oldIndex: 1 }]);
  });

  it('entirely fresh keys: everything enters, nothing updates or exits from an empty oldData', () => {
    const result = diffData([], [{ id: 1 }, { id: 2 }], key);
    expect(result.enter).toHaveLength(2);
    expect(result.update).toEqual([]);
    expect(result.exit).toEqual([]);
  });

  it('entirely stale keys: everything exits when newData is empty', () => {
    const result = diffData([{ id: 1 }, { id: 2 }], [], key);
    expect(result.exit).toHaveLength(2);
    expect(result.enter).toEqual([]);
    expect(result.update).toEqual([]);
  });

  it('keyFn receives (datum, index)', () => {
    const seen = [];
    diffData([{}], [{}, {}], (d, i) => {
      seen.push(i);
      return i;
    });
    expect(seen).toEqual([0, 0, 1]); // old[0] once, then new[0], new[1]
  });

  it('throws on a duplicate key within newData', () => {
    expect(() => diffData([], [{ id: 1 }, { id: 1 }], key)).toThrow(/duplicate key/);
  });
});

describe('diffData: input validation', () => {
  it('throws TypeError when oldData or newData is not an array', () => {
    expect(() => diffData(null, [])).toThrow(TypeError);
    expect(() => diffData([], null)).toThrow(TypeError);
  });

  it('throws TypeError when keyFn is provided but not a function', () => {
    expect(() => diffData([], [], 'nope')).toThrow(TypeError);
  });
});
