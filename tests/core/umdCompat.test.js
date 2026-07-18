import { describe, it, expect, vi } from 'vitest';
import { guardExternalImport } from '../../src/core/umdCompat.js';

describe('guardExternalImport', () => {
  it('returns build()\'s result when it succeeds', () => {
    expect(guardExternalImport('thing', () => 42)).toBe(42);
  });

  it('does not call build() until invoked, and calls it exactly once', () => {
    const build = vi.fn(() => 'result');
    guardExternalImport('thing', build);
    expect(build).toHaveBeenCalledTimes(1);
  });

  it('rethrows a clear, actionable Error when build() throws a TypeError', () => {
    expect(() =>
      guardExternalImport('PostFX', () => {
        throw new TypeError("Cannot read properties of undefined (reading 'EffectComposer')");
      }),
    ).toThrow(/PostFX isn't available in this build/);
  });

  it('rethrows a clear, actionable Error when build() throws a ReferenceError', () => {
    expect(() =>
      guardExternalImport('GraphLine (thick-line rendering)', () => {
        throw new ReferenceError('Line2_js is not defined');
      }),
    ).toThrow(/GraphLine \(thick-line rendering\) isn't available in this build/);
  });

  it('includes the feature name and points at the ESM build', () => {
    try {
      guardExternalImport('PostFX \'bloom\' pass', () => {
        throw new TypeError('boom');
      });
      expect.unreachable();
    } catch (error) {
      expect(error.message).toContain("PostFX 'bloom' pass isn't available in this build");
      expect(error.message).toContain('ESM build');
      expect(error.message).toContain('Original error: boom');
    }
  });

  it('does not catch or rewrap other error types — they propagate unchanged', () => {
    const original = new RangeError('out of range');
    expect(() =>
      guardExternalImport('thing', () => {
        throw original;
      }),
    ).toThrow(original);
  });

  it('propagates a plain Error unchanged (not a missing-global situation)', () => {
    const original = new Error('some unrelated failure');
    expect(() =>
      guardExternalImport('thing', () => {
        throw original;
      }),
    ).toThrow(original);
  });
});
