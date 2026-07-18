# Cinematic Camera

`CameraTour` flies a real `THREE.Camera` through a sequence of waypoints —
position, look-at target, and field of view all tween together, driven by
the shared render loop (never a second `requestAnimationFrame`). The
[Entry Animation + Camera Tour](/recipes/entry-animation-camera-tour) recipe
already covers `CameraTour.flyTo()`'s single-shot reframing; this one covers
multi-waypoint tours and the two canned cinematic shots built on top of it.

```js
import { Graph3D, CameraTour } from 'graph3d.js';

const canvas = document.querySelector('canvas');
const g = new Graph3D({ canvas });
const scene = g.createScene('main');
g.setActiveScene(scene);

// A full multi-waypoint fly-through — each leg has its own duration/easing:
const tour = new CameraTour(scene.camera.three, [
  { at: [10, 10, 10], lookAt: [0, 0, 0], duration: 2000, easing: 'easeOutCubic' },
  { at: [-10, 5, 10], lookAt: [0, 0, 0], duration: 1500 },
  { at: [0, 20, 0], lookAt: [0, 0, 0], fov: 35, duration: 1800, easing: 'easeInOutCubic' },
]);
```

`new CameraTour(camera, waypoints)` auto-plays on construction — same "call
it, it starts" convention as `Transition.to()`. Each waypoint's `at`/`lookAt`
(and optional `fov`, for perspective cameras) tweens from the *previous*
waypoint's end state, so the first entry's start state is wherever the
camera already was.

## Playback control

```js
tour.pause();
tour.resume();
tour.skipToNext();              // jump straight to the next waypoint's end state
tour.onComplete(() => console.log('tour finished'));
tour.isPlaying;                 // boolean
tour.currentWaypointIndex;      // which leg is currently in flight

tour.cancel(); // stop wherever it currently is — the camera does not snap back
```

Starting a new tour while one is still running cancels the old one
automatically (every `GraphSceneCamera`/`CameraTour` entry point does this —
see the [Entry Animation recipe](/recipes/entry-animation-camera-tour)'s
`activeCameraTour?.cancel()` pattern for the manual equivalent when you're
holding your own reference across multiple possible triggers).

## `orbit()` — a continuous fly-around

Generates an evenly-spaced circular tour for you — useful for an idle/hero
shot or a "spin around the dataset" showcase:

```js
CameraTour.orbit(scene.camera.three, {
  center: [0, 0, 0],
  radius: 15,
  height: 6,
  duration: 8000,  // total time for one full revolution
  segments: 12,     // more segments = smoother arc
});
```

## `cinematicReveal()` — a canned establishing shot

A two-beat "sweep down into the scene" opening: a wide, high, narrow-FOV
opening view easing into a closer, lower, wider-FOV framing — useful as the
very first thing a viewer sees before any orbit controls take over:

```js
CameraTour.cinematicReveal(scene.camera.three, {
  target: [0, 4, 0],
  startRadius: 30, endRadius: 8,
  startHeight: 20, endHeight: 3,
  startFov: 75, endFov: 45,
  duration: 4000,
}).onComplete(() => {
  scene.camera.enableOrbitControls(g.renderer.three.domElement);
});
```

## Cinematic camera properties

The `cinematic-low`/`cinematic-high` presets on `scene.camera` (a
`GraphSceneCamera`) start you with a narrow, film-like field of view instead
of the wider default `orbit`/`fixed` presets:

```js
scene.camera.setPreset('cinematic-low');  // fov 25, low/close framing
scene.camera.setPreset('cinematic-high'); // fov 25, elevated framing
```

Both are perspective presets — `scene.camera.three` is a real
`THREE.PerspectiveCamera`, so anything not covered by `GraphSceneCamera`'s
own API (a custom `near`/`far` clip range, for instance) is a normal
property set directly on `scene.camera.three`:

```js
scene.camera.three.near = 0.5;
scene.camera.three.far = 500;
scene.camera.three.updateProjectionMatrix(); // required after manual near/far/fov edits
```

See [Concepts: Scene Composition — Camera](/concepts/scene#camera) for the
full preset list (including the orthographic `isometric`/`top-down`
presets) and [Concepts: Anim — CameraTour](/concepts/anim#cameratour-—-flying-the-camera-through-waypoints)
for the underlying waypoint-interpolation contract.
