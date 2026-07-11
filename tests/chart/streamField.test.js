import { describe, it, expect } from 'vitest';
import { applyStreamChunk } from '../../src/chart/streamField.js';

const keyFn = (d) => d?.id;

describe('applyStreamChunk(currentData, chunk, keyFn)', () => {
  it('appends added entries with a new key', () => {
    const next = applyStreamChunk([{ id: 1 }], { added: [{ id: 2 }], updated: [], removed: [] }, keyFn);
    expect(next).toEqual([{ id: 1 }, { id: 2 }]);
  });

  it('replaces an existing entry when updated matches an existing key', () => {
    const next = applyStreamChunk([{ id: 1, v: 'a' }, { id: 2, v: 'b' }], { added: [], updated: [{ id: 1, v: 'z' }], removed: [] }, keyFn);
    expect(next).toEqual([{ id: 1, v: 'z' }, { id: 2, v: 'b' }]);
  });

  it('treats an updated entry with an unknown key as an upsert (appended)', () => {
    const next = applyStreamChunk([{ id: 1 }], { added: [], updated: [{ id: 9 }], removed: [] }, keyFn);
    expect(next).toEqual([{ id: 1 }, { id: 9 }]);
  });

  it('removes entries matching a removed key', () => {
    const next = applyStreamChunk([{ id: 1 }, { id: 2 }, { id: 3 }], { added: [], updated: [], removed: [{ id: 2 }] }, keyFn);
    expect(next).toEqual([{ id: 1 }, { id: 3 }]);
  });

  it('is a no-op for a removed key that has no match', () => {
    const next = applyStreamChunk([{ id: 1 }], { added: [], updated: [], removed: [{ id: 99 }] }, keyFn);
    expect(next).toEqual([{ id: 1 }]);
  });

  it('applies removed before added/updated, so a chunk can remove and re-add the same key', () => {
    const next = applyStreamChunk([{ id: 1, v: 'old' }], { added: [{ id: 1, v: 'new' }], updated: [], removed: [{ id: 1 }] }, keyFn);
    expect(next).toEqual([{ id: 1, v: 'new' }]);
  });

  it('treats a duplicate added key (already present) as a replace, not a second entry', () => {
    const next = applyStreamChunk([{ id: 1, v: 'old' }], { added: [{ id: 1, v: 'new' }], updated: [], removed: [] }, keyFn);
    expect(next).toEqual([{ id: 1, v: 'new' }]);
  });

  it('does not mutate the input array', () => {
    const current = [{ id: 1 }];
    applyStreamChunk(current, { added: [{ id: 2 }], updated: [], removed: [] }, keyFn);
    expect(current).toEqual([{ id: 1 }]);
  });

  it('handles a fully-empty chunk as a no-op', () => {
    const current = [{ id: 1 }];
    expect(applyStreamChunk(current, { added: [], updated: [], removed: [] }, keyFn)).toEqual([{ id: 1 }]);
  });
});
