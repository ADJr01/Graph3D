# Custom HDRI Environment

`GraphSceneEnvironment.setHDR()` (reached via `scene.environment`) accepts
three kinds of input: a built-in preset name, a URL to your own `.hdr`/`.exr`
file, or an object URL from a user-uploaded file. All three go through the
same ref-counted loader — the same file loaded by two scenes fetches once,
and textures are only disposed once the last reference releases them.

```js
import { Graph3D } from 'graph3d.js';

const canvas = document.querySelector('canvas');
const g = new Graph3D({ canvas });
const scene = g.createScene('main');
g.setActiveScene(scene);

// Built-in presets — no asset URL needed:
await scene.environment.setHDR('studio-1k');
// 'cinema-night' and 'daylight' are the other two bundled presets.
```

## Your own `.hdr`/`.exr` file

```js
// A file you host yourself (or a remote URL) — resolved by extension:
// '.hdr' -> RGBELoader, '.exr' -> EXRLoader, anything else -> THREE.TextureLoader.
await scene.environment.setHDR('/env/rooftop-noon.hdr');

// Skip using it as the visible background (keeps only the PBR reflections):
await scene.environment.setHDR('/env/rooftop-noon.hdr', { asBackground: false });
```

## Letting a user upload their own HDRI

Object URLs from an `<input type="file">` picker carry no extension of their
own, so hint the real filename via a `#name.ext` fragment — it's never sent
over the wire, it only tells the loader which parser to use:

```js
const input = document.querySelector('input[type="file"]');
input.addEventListener('change', async () => {
  const file = input.files[0];
  const objectUrl = URL.createObjectURL(file) + '#' + file.name;
  try {
    await scene.environment.setHDR(objectUrl);
  } catch (error) {
    console.error('Failed to load the uploaded HDRI:', error);
  } finally {
    URL.revokeObjectURL(objectUrl.split('#')[0]);
  }
});
```

## Swapping HDRIs live

Calling `setHDR()` again — with a different URL or a different preset —
supersedes the previous one. The old texture is only released once the new
one has finished loading, so a failed load (bad URL, missing file) leaves
whatever was already applied fully intact instead of leaving the scene with
no environment at all:

```js
await scene.environment.setHDR('studio-1k');
// ... later, in response to a user action:
await scene.environment.setHDR('cinema-night'); // old texture released only after this resolves
```

## Background vs. reflections only

`setHDR()`'s `asBackground` option controls whether the HDR image is also
visible as the scene background. To keep the PBR lighting/reflections from
an HDRI while showing a plain color or a different image behind everything,
set `asBackground: false` and call `setBackground()` separately:

```js
await scene.environment.setHDR('studio-1k', { asBackground: false });
scene.environment.setBackground(0x0a0a0a); // solid dark background, HDR reflections still active
```

`setBackground()` also accepts a `THREE.Color`, a `THREE.Texture`, or `null`
to clear it back to transparent — see `GraphSceneEnvironment.setBackground`'s
own JSDoc for the full list.

## Cleaning up

`scene.environment.clear()` removes the environment map, background, and fog
and releases the HDR texture's reference. `GraphScene.dispose()` (and by
extension `Graph3D.dispose()`) already calls into this — you only need to
call `clear()` yourself if you want to blank out one scene's environment
without disposing the scene entirely.

See [Concepts: Scene Composition](/concepts/scene#environment-—-hdr-background-fog-skybox)
for HDR ref-counting internals and the fog/skybox APIs that live alongside
`setHDR()` on the same `scene.environment` object.
