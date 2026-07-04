import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { BEHAVIOR_DEFAULTS, BEHAVIOR_NAMES, CPU_BEHAVIOR_ACCEL, accumulateCPUAcceleration } from '../../../src/postfx/particles/behaviors.js';

const ORIGIN = new THREE.Vector3(0, 0, 0);
const OUT = new THREE.Vector3();

describe('BEHAVIOR_DEFAULTS / BEHAVIOR_NAMES', () => {
  it('lists all six required behaviors', () => {
    expect(BEHAVIOR_NAMES.sort()).toEqual(['attract', 'curl', 'gravity', 'repel', 'swirl', 'wind'].sort());
  });

  it('every behavior name has a matching default entry', () => {
    for (const name of BEHAVIOR_NAMES) {
      expect(BEHAVIOR_DEFAULTS[name]).toBeDefined();
    }
  });
});

describe('CPU_BEHAVIOR_ACCEL.gravity / wind', () => {
  it('gravity produces acceleration = direction * strength', () => {
    CPU_BEHAVIOR_ACCEL.gravity(ORIGIN, { strength: 9.8, direction: new THREE.Vector3(0, -1, 0) }, OUT);
    expect(OUT.x).toBeCloseTo(0);
    expect(OUT.y).toBeCloseTo(-9.8);
    expect(OUT.z).toBeCloseTo(0);
  });

  it('wind produces acceleration = direction * strength', () => {
    CPU_BEHAVIOR_ACCEL.wind(ORIGIN, { strength: 2, direction: new THREE.Vector3(1, 0, 0) }, OUT);
    expect(OUT.x).toBeCloseTo(2);
    expect(OUT.y).toBeCloseTo(0);
  });
});

describe('CPU_BEHAVIOR_ACCEL.attract / repel', () => {
  it('attract pulls toward the target, strongest near the target and fading to zero at radius', () => {
    const opts = { strength: 10, target: new THREE.Vector3(10, 0, 0), radius: 10 };
    const nearTarget = new THREE.Vector3();
    const farFromTarget = new THREE.Vector3();
    CPU_BEHAVIOR_ACCEL.attract(new THREE.Vector3(9, 0, 0), opts, nearTarget); // dist = 1
    CPU_BEHAVIOR_ACCEL.attract(new THREE.Vector3(0, 0, 0), opts, farFromTarget); // dist = 10 (== radius)
    expect(nearTarget.x).toBeGreaterThan(0); // pulled toward +x
    expect(nearTarget.length()).toBeGreaterThan(farFromTarget.length());
    expect(farFromTarget.length()).toBe(0); // falloff reaches exactly zero at the radius boundary
  });

  it('produces zero acceleration exactly at the target (avoids division by zero / NaN)', () => {
    CPU_BEHAVIOR_ACCEL.attract(new THREE.Vector3(5, 0, 0), { strength: 10, target: new THREE.Vector3(5, 0, 0), radius: 10 }, OUT);
    expect(OUT.x).toBe(0);
    expect(OUT.y).toBe(0);
    expect(OUT.z).toBe(0);
  });

  it('produces zero acceleration beyond radius', () => {
    CPU_BEHAVIOR_ACCEL.attract(new THREE.Vector3(100, 0, 0), { strength: 10, target: new THREE.Vector3(0, 0, 0), radius: 5 }, OUT);
    expect(OUT.length()).toBe(0);
  });

  it('repel is attract with the sign flipped', () => {
    const position = new THREE.Vector3(2, 0, 0);
    const opts = { strength: 5, target: new THREE.Vector3(0, 0, 0), radius: 10 };
    const attractOut = new THREE.Vector3();
    const repelOut = new THREE.Vector3();
    CPU_BEHAVIOR_ACCEL.attract(position, opts, attractOut);
    CPU_BEHAVIOR_ACCEL.repel(position, opts, repelOut);
    expect(repelOut.x).toBeCloseTo(-attractOut.x);
    expect(repelOut.y).toBeCloseTo(-attractOut.y);
    expect(repelOut.z).toBeCloseTo(-attractOut.z);
  });
});

describe('CPU_BEHAVIOR_ACCEL.swirl', () => {
  it('produces acceleration perpendicular to both the axis and the radius vector', () => {
    const opts = { strength: 1, center: new THREE.Vector3(0, 0, 0), axis: new THREE.Vector3(0, 1, 0) };
    CPU_BEHAVIOR_ACCEL.swirl(new THREE.Vector3(1, 0, 0), opts, OUT);
    // axis (0,1,0) cross (1,0,0) = (0*0-1*0, 1*1-0*0, 0*0-1*1) = (0,1,-1)... verify via dot products instead:
    expect(OUT.dot(opts.axis)).toBeCloseTo(0);
    const radial = new THREE.Vector3(1, 0, 0);
    expect(OUT.dot(radial)).toBeCloseTo(0);
  });

  it('is zero at the center (no radius vector to cross)', () => {
    CPU_BEHAVIOR_ACCEL.swirl(new THREE.Vector3(0, 0, 0), { strength: 5, center: new THREE.Vector3(0, 0, 0), axis: new THREE.Vector3(0, 1, 0) }, OUT);
    expect(OUT.length()).toBe(0);
  });
});

describe('CPU_BEHAVIOR_ACCEL.curl', () => {
  it('returns a finite, deterministic vector for a given position', () => {
    const opts = { strength: 1, scale: 1 };
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    CPU_BEHAVIOR_ACCEL.curl(new THREE.Vector3(1.234, 5.678, -2.5), opts, a);
    CPU_BEHAVIOR_ACCEL.curl(new THREE.Vector3(1.234, 5.678, -2.5), opts, b);
    expect(Number.isFinite(a.x)).toBe(true);
    expect(Number.isFinite(a.y)).toBe(true);
    expect(Number.isFinite(a.z)).toBe(true);
    expect(a.x).toBe(b.x); // deterministic (hash-based noise, not Math.random)
    expect(a.y).toBe(b.y);
    expect(a.z).toBe(b.z);
  });

  it('strength scales the output magnitude linearly', () => {
    const position = new THREE.Vector3(3, 4, 5);
    const base = new THREE.Vector3();
    const doubled = new THREE.Vector3();
    CPU_BEHAVIOR_ACCEL.curl(position, { strength: 1, scale: 1 }, base);
    CPU_BEHAVIOR_ACCEL.curl(position, { strength: 2, scale: 1 }, doubled);
    expect(doubled.x).toBeCloseTo(base.x * 2);
    expect(doubled.y).toBeCloseTo(base.y * 2);
    expect(doubled.z).toBeCloseTo(base.z * 2);
  });
});

describe('accumulateCPUAcceleration', () => {
  it('sums contributions from every active behavior', () => {
    const behaviors = new Map([
      ['gravity', { strength: 1, direction: new THREE.Vector3(0, -1, 0) }],
      ['wind', { strength: 1, direction: new THREE.Vector3(1, 0, 0) }],
    ]);
    accumulateCPUAcceleration(behaviors, new THREE.Vector3(0, 0, 0), OUT);
    expect(OUT.x).toBeCloseTo(1);
    expect(OUT.y).toBeCloseTo(-1);
  });

  it('returns zero for an empty behavior map', () => {
    accumulateCPUAcceleration(new Map(), new THREE.Vector3(1, 2, 3), OUT);
    expect(OUT.x).toBe(0);
    expect(OUT.y).toBe(0);
    expect(OUT.z).toBe(0);
  });
});
