import { describe, it, expect } from 'vitest';
import { layout } from '../../../src/compose/layout/index.js';

describe('layout namespace', () => {
  it('exposes layout.stack/.grid/.force/.pack/.tree/.pie', () => {
    expect(Object.keys(layout).sort()).toEqual(['force', 'grid', 'pack', 'pie', 'stack', 'tree']);
    expect(typeof layout.stack).toBe('function');
    expect(typeof layout.grid).toBe('function');
    expect(typeof layout.force).toBe('function');
    expect(typeof layout.pack).toBe('function');
    expect(typeof layout.tree).toBe('function');
    expect(typeof layout.pie).toBe('function');
  });

  it('exposes layout.force.link/.charge/.center/.collide/.radial/.cluster', () => {
    expect(typeof layout.force.link).toBe('function');
    expect(typeof layout.force.charge).toBe('function');
    expect(typeof layout.force.center).toBe('function');
    expect(typeof layout.force.collide).toBe('function');
    expect(typeof layout.force.radial).toBe('function');
    expect(typeof layout.force.cluster).toBe('function');
  });
});
