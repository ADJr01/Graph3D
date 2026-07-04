import * as THREE from 'three';
import { ParticleSystem } from './ParticleSystem.js';

/**
 * Six named particle "recipes" (Prompt 121), each a tuned `emit()` call
 * (plus a continuous behavior where the look calls for one — `dust`'s drift,
 * `smoke`'s rise-and-curl). None animate opacity over lifetime — the render
 * shader only supports a hard discard at death (Prompt 120's scope), so
 * every preset here reads as a hard pop out rather than a fade; see
 * `skipping_list.md`.
 *
 * `opts` is shallow-merged over each preset's own tuned defaults — pass
 * anything `emit()`/`spawnAt()` accepts (`count`, `position`, `lifetime`,
 * `size`, `color`, `speed`, `mesh`, etc.) to override just that field.
 */

function mergeOpts(defaults, opts) {
  return { ...defaults, ...opts };
}

/** A random direction (uniform-ish, not perfectly sphere-uniform) scaled to a random speed up to `maxSpeed` — good enough for a scatter-burst look. */
function randomVelocity(maxSpeed) {
  const v = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5);
  if (v.lengthSq() < 1e-8) return v.set(0, 1, 0);
  return v.normalize().multiplyScalar(maxSpeed * Math.random());
}

ParticleSystem.registerPreset('dust', (system, opts) => {
  const o = mergeOpts({ count: 300, spread: 8, lifetime: 8, size: 0.03, color: 0xcabf9e }, opts);
  system.addBehavior('wind', { strength: 0.15, direction: new THREE.Vector3(1, 0.1, 0) });
  system.emit({
    count: o.count,
    position: o.position ?? (() => new THREE.Vector3((Math.random() - 0.5) * o.spread, Math.random() * o.spread, (Math.random() - 0.5) * o.spread)),
    velocity: () => new THREE.Vector3((Math.random() - 0.5) * 0.05, (Math.random() - 0.5) * 0.05, (Math.random() - 0.5) * 0.05),
    lifetime: o.lifetime,
    size: o.size,
    color: o.color,
    blending: THREE.NormalBlending,
  });
});

ParticleSystem.registerPreset('sparks', (system, opts) => {
  const o = mergeOpts({ count: 200, position: new THREE.Vector3(), speed: 6, lifetime: 0.8, size: 0.02, color: 0xffaa33 }, opts);
  system.addBehavior('gravity', { strength: 9.8 });
  system.emit({
    count: o.count,
    position: o.position,
    velocity: () => randomVelocity(o.speed),
    lifetime: o.lifetime,
    size: o.size,
    color: o.color,
    blending: THREE.AdditiveBlending,
  });
});

ParticleSystem.registerPreset('smoke', (system, opts) => {
  const o = mergeOpts({ count: 150, position: new THREE.Vector3(), rise: 1.5, lifetime: 4, size: 0.4, color: 0x888888 }, opts);
  system.addBehavior('wind', { strength: 0.1, direction: new THREE.Vector3(1, 0, 0) });
  system.addBehavior('curl', { strength: 0.3, scale: 0.3 });
  system.emit({
    count: o.count,
    position: o.position,
    velocity: () => new THREE.Vector3((Math.random() - 0.5) * 0.2, o.rise * (0.5 + Math.random() * 0.5), (Math.random() - 0.5) * 0.2),
    lifetime: o.lifetime,
    size: o.size,
    color: o.color,
    blending: THREE.NormalBlending,
  });
});

ParticleSystem.registerPreset('confetti', (system, opts) => {
  const palette = [0xff4d6d, 0xffd166, 0x06d6a0, 0x118ab2, 0xef476f];
  const o = mergeOpts({ count: 400, position: new THREE.Vector3(), speed: 4, lifetime: 3, size: 0.05, color: null }, opts);
  system.addBehavior('gravity', { strength: 4 });
  system.emit({
    count: o.count,
    position: o.position,
    velocity: () => new THREE.Vector3((Math.random() - 0.5) * o.speed, Math.random() * o.speed, (Math.random() - 0.5) * o.speed),
    lifetime: o.lifetime,
    size: o.size,
    color: o.color ?? (() => palette[Math.floor(Math.random() * palette.length)]),
    blending: THREE.NormalBlending,
  });
});

ParticleSystem.registerPreset('dataStream', (system, opts) => {
  const o = mergeOpts({ count: 100, position: new THREE.Vector3(), target: new THREE.Vector3(0, 0, -10), speed: 4, lifetime: 2.5, size: 0.03, color: 0x66ccff }, opts);
  system.addBehavior('attract', { strength: 6, target: o.target, radius: 50 });
  system.emit({
    count: o.count,
    position: () => o.position.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.5)),
    velocity: () => o.target.clone().sub(o.position).normalize().multiplyScalar(o.speed),
    lifetime: o.lifetime,
    size: o.size,
    color: o.color,
    blending: THREE.AdditiveBlending,
  });
});

ParticleSystem.registerPreset('dissolve', (system, opts) => {
  const o = mergeOpts({ count: 500, speed: 1.5, lifetime: 1.5, size: 0.03, color: 0xffffff }, opts);
  if (o.mesh) {
    system.spawnAt(o.mesh, { count: o.count, speed: o.speed, lifetime: o.lifetime, size: o.size, color: o.color, blending: THREE.AdditiveBlending });
    return;
  }
  const origin = o.position ?? new THREE.Vector3();
  system.emit({
    count: o.count,
    position: origin,
    velocity: () => randomVelocity(o.speed),
    lifetime: o.lifetime,
    size: o.size,
    color: o.color,
    blending: THREE.AdditiveBlending,
  });
});
