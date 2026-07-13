import { describe, it, expect, vi, afterEach } from 'vitest';
import { isProductionBuild, devWarn } from '../../src/core/devWarnings.js';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('isProductionBuild', () => {
  it('is false by default in the test environment', () => {
    expect(isProductionBuild()).toBe(false);
  });

  it('is true when process.env.NODE_ENV is "production"', () => {
    vi.stubEnv('NODE_ENV', 'production');
    expect(isProductionBuild()).toBe(true);
  });
});

describe('devWarn', () => {
  it('logs a tagged console.warn outside production', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    devWarn('something to know about');
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('something to know about'));
  });

  it('is a no-op in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    devWarn('should not appear');
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
