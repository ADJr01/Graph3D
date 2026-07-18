# GraphSceneCamera

<a name="module_GraphSceneCamera.GraphSceneCamera"></a>

## GraphSceneCamera
Manages the active camera for a [GraphScene](GraphScene).

Wraps either a `THREE.PerspectiveCamera` or `THREE.OrthographicCamera`
depending on the active preset. Provides one-line preset switching,
optional OrbitControls (lazy-loaded on first call to `enableOrbitControls`),
and a `useCustom` escape hatch for raw THREE cameras.

**Kind**: static class of [<code>GraphSceneCamera</code>](#module_GraphSceneCamera)  

* [.GraphSceneCamera](#module_GraphSceneCamera.GraphSceneCamera)
    * [new exports.GraphSceneCamera([options])](#new_module_GraphSceneCamera.GraphSceneCamera_new)
    * [.three](#module_GraphSceneCamera.GraphSceneCamera+three) ⇒ <code>THREE.PerspectiveCamera</code> \| <code>THREE.OrthographicCamera</code> \| <code>THREE.Camera</code>
    * [.preset](#module_GraphSceneCamera.GraphSceneCamera+preset) ⇒ <code>string</code> \| <code>null</code>
    * [.target](#module_GraphSceneCamera.GraphSceneCamera+target) ⇒ <code>THREE.Vector3</code>
    * [.setPreset(name)](#module_GraphSceneCamera.GraphSceneCamera+setPreset) ⇒ <code>this</code>
    * [.lookAt(x, y, z)](#module_GraphSceneCamera.GraphSceneCamera+lookAt) ⇒ <code>this</code>
    * [.setPosition(x, y, z)](#module_GraphSceneCamera.GraphSceneCamera+setPosition) ⇒ <code>this</code>
    * [.useCustom(camera)](#module_GraphSceneCamera.GraphSceneCamera+useCustom) ⇒ <code>this</code>
    * [.setMaxZoomIn(value)](#module_GraphSceneCamera.GraphSceneCamera+setMaxZoomIn) ⇒ <code>this</code>
    * [.setMaxZoomOut(value)](#module_GraphSceneCamera.GraphSceneCamera+setMaxZoomOut) ⇒ <code>this</code>
    * [.dollyZoom(targetFOV, [duration])](#module_GraphSceneCamera.GraphSceneCamera+dollyZoom) ⇒ <code>CameraController</code>
    * [.tour(waypoints, [options])](#module_GraphSceneCamera.GraphSceneCamera+tour) ⇒ <code>CameraController</code>
    * [.follow(target)](#module_GraphSceneCamera.GraphSceneCamera+follow) ⇒ <code>CameraController</code>
    * [.focusOn(boundingBox, [padding], [duration])](#module_GraphSceneCamera.GraphSceneCamera+focusOn) ⇒ <code>CameraController</code>
    * [.enableOrbitControls(domElement)](#module_GraphSceneCamera.GraphSceneCamera+enableOrbitControls) ⇒ <code>\*</code>
    * [.disableOrbitControls()](#module_GraphSceneCamera.GraphSceneCamera+disableOrbitControls) ⇒ <code>this</code>
    * [.dispose()](#module_GraphSceneCamera.GraphSceneCamera+dispose)

<a name="new_module_GraphSceneCamera.GraphSceneCamera_new"></a>

### new exports.GraphSceneCamera([options])
**Throws**:

- <code>TypeError</code> If `preset` is not a recognised preset name.


| Param | Type |
| --- | --- |
| [options] | <code>Object</code> | 

**Example**  
```js
const cam = new GraphSceneCamera();
cam.setPreset('isometric').setPosition(15, 15, 15);
```
**Example**  
```js
await cam.enableOrbitControls(renderer.domElement);
cam.lookAt(0, 0, 0);
```
<a name="module_GraphSceneCamera.GraphSceneCamera+three"></a>

### graphSceneCamera.three ⇒ <code>THREE.PerspectiveCamera</code> \| <code>THREE.OrthographicCamera</code> \| <code>THREE.Camera</code>
The underlying THREE camera. The exact type depends on the active preset:
- Perspective presets (`orbit`, `fixed`, `cinematic-*`) → `THREE.PerspectiveCamera`
- Orthographic presets (`isometric`, `top-down`) → `THREE.OrthographicCamera`
- After `useCustom()` → whatever was passed in.

**Kind**: instance property of [<code>GraphSceneCamera</code>](#module_GraphSceneCamera.GraphSceneCamera)  
<a name="module_GraphSceneCamera.GraphSceneCamera+preset"></a>

### graphSceneCamera.preset ⇒ <code>string</code> \| <code>null</code>
The name of the currently active preset, or `null` when a custom camera
was installed via `useCustom()`.

**Kind**: instance property of [<code>GraphSceneCamera</code>](#module_GraphSceneCamera.GraphSceneCamera)  
<a name="module_GraphSceneCamera.GraphSceneCamera+target"></a>

### graphSceneCamera.target ⇒ <code>THREE.Vector3</code>
The last world-space point passed to `lookAt()` (or the active preset's
default target). A fresh clone — mutating it has no effect on the camera.

**Kind**: instance property of [<code>GraphSceneCamera</code>](#module_GraphSceneCamera.GraphSceneCamera)  
<a name="module_GraphSceneCamera.GraphSceneCamera+setPreset"></a>

### graphSceneCamera.setPreset(name) ⇒ <code>this</code>
Switch to a named camera preset, rebuilding the underlying THREE camera.
Any active OrbitControls are disposed first.

Valid presets: `orbit`, `fixed`, `isometric`, `top-down`,
`cinematic-low`, `cinematic-high`.

**Kind**: instance method of [<code>GraphSceneCamera</code>](#module_GraphSceneCamera.GraphSceneCamera)  
**Throws**:

- <code>TypeError</code> If `name` is not a recognised preset.
- <code>Error</code> If called after `dispose()`.


| Param | Type |
| --- | --- |
| name | <code>string</code> | 

**Example**  
```js
cam.setPreset('isometric');
```
<a name="module_GraphSceneCamera.GraphSceneCamera+lookAt"></a>

### graphSceneCamera.lookAt(x, y, z) ⇒ <code>this</code>
Point the camera at the given world-space coordinates.
When OrbitControls are active, also updates the orbit target so the
controls and camera stay in sync.

**Kind**: instance method of [<code>GraphSceneCamera</code>](#module_GraphSceneCamera.GraphSceneCamera)  
**Throws**:

- <code>Error</code> If called after `dispose()`.


| Param | Type |
| --- | --- |
| x | <code>number</code> | 
| y | <code>number</code> | 
| z | <code>number</code> | 

**Example**  
```js
cam.lookAt(0, 0, 0);
```
<a name="module_GraphSceneCamera.GraphSceneCamera+setPosition"></a>

### graphSceneCamera.setPosition(x, y, z) ⇒ <code>this</code>
Set the camera's world-space position.
When OrbitControls are active, also triggers a controls update.

**Kind**: instance method of [<code>GraphSceneCamera</code>](#module_GraphSceneCamera.GraphSceneCamera)  
**Throws**:

- <code>Error</code> If called after `dispose()`.


| Param | Type |
| --- | --- |
| x | <code>number</code> | 
| y | <code>number</code> | 
| z | <code>number</code> | 

**Example**  
```js
cam.setPosition(10, 5, 10);
```
<a name="module_GraphSceneCamera.GraphSceneCamera+useCustom"></a>

### graphSceneCamera.useCustom(camera) ⇒ <code>this</code>
Replace the internal camera with a custom THREE camera.
Disposes any active OrbitControls. Sets `preset` to `null`.

**Kind**: instance method of [<code>GraphSceneCamera</code>](#module_GraphSceneCamera.GraphSceneCamera)  
**Throws**:

- <code>TypeError</code> If `camera` is not a `THREE.Camera`.
- <code>Error</code> If called after `dispose()`.


| Param | Type |
| --- | --- |
| camera | <code>THREE.Camera</code> | 

**Example**  
```js
cam.useCustom(new THREE.PerspectiveCamera(45, aspect, 0.1, 1000));
```
<a name="module_GraphSceneCamera.GraphSceneCamera+setMaxZoomIn"></a>

### graphSceneCamera.setMaxZoomIn(value) ⇒ <code>this</code>
Set how far in the user may zoom via OrbitControls (mouse wheel / pinch).
On a perspective preset this is the closest dolly distance
(OrbitControls' `minDistance`); on an orthographic preset it's the
highest magnification (OrbitControls' `maxZoom`). Takes effect
immediately if OrbitControls are active, and is reapplied automatically
on every future `enableOrbitControls()` call (including after a
`setPreset()` switch between perspective and orthographic).

**Kind**: instance method of [<code>GraphSceneCamera</code>](#module_GraphSceneCamera.GraphSceneCamera)  
**Throws**:

- <code>TypeError</code> If `value` is not a positive finite number.
- <code>Error</code> If called after `dispose()`.


| Param | Type | Description |
| --- | --- | --- |
| value | <code>number</code> | A positive distance (perspective) or zoom factor (orthographic). |

**Example**  
```js
cam.setMaxZoomIn(2); // never let the user dolly closer than 2 units
```
<a name="module_GraphSceneCamera.GraphSceneCamera+setMaxZoomOut"></a>

### graphSceneCamera.setMaxZoomOut(value) ⇒ <code>this</code>
Set how far out the user may zoom via OrbitControls (mouse wheel / pinch).
On a perspective preset this is the farthest dolly distance
(OrbitControls' `maxDistance`); on an orthographic preset it's the
lowest magnification (OrbitControls' `minZoom`). Takes effect
immediately if OrbitControls are active, and is reapplied automatically
on every future `enableOrbitControls()` call (including after a
`setPreset()` switch between perspective and orthographic).

**Kind**: instance method of [<code>GraphSceneCamera</code>](#module_GraphSceneCamera.GraphSceneCamera)  
**Throws**:

- <code>TypeError</code> If `value` is not a positive finite number.
- <code>Error</code> If called after `dispose()`.


| Param | Type | Description |
| --- | --- | --- |
| value | <code>number</code> | A positive distance (perspective) or zoom factor (orthographic). |

**Example**  
```js
cam.setMaxZoomOut(50); // never let the user dolly past 50 units away
```
<a name="module_GraphSceneCamera.GraphSceneCamera+dollyZoom"></a>

### graphSceneCamera.dollyZoom(targetFOV, [duration]) ⇒ <code>CameraController</code>
Tween the camera's field of view from its current value to `targetFOV`.
Only valid on perspective cameras (`orbit`, `fixed`, `cinematic-*` presets).
Cancels any currently running animation.

**Kind**: instance method of [<code>GraphSceneCamera</code>](#module_GraphSceneCamera.GraphSceneCamera)  
**Throws**:

- <code>TypeError</code> If the active camera is not a PerspectiveCamera or `targetFOV` is out of range.
- <code>Error</code> If called after `dispose()`.


| Param | Type | Default | Description |
| --- | --- | --- | --- |
| targetFOV | <code>number</code> |  | Target FOV in degrees (0 < targetFOV < 180). |
| [duration] | <code>number</code> | <code>1000</code> | Duration in milliseconds. |

**Example**  
```js
cam.dollyZoom(25, 2000);
```
<a name="module_GraphSceneCamera.GraphSceneCamera+tour"></a>

### graphSceneCamera.tour(waypoints, [options]) ⇒ <code>CameraController</code>
Fly the camera through a sequence of waypoints in order.
Each waypoint specifies `at` (position), `lookAt` (target), and optionally
`fov` (degrees), `duration` (ms, default 1000), `easing` (default `'easeInOutCubic'`).
Cancels any currently running animation.

**Kind**: instance method of [<code>GraphSceneCamera</code>](#module_GraphSceneCamera.GraphSceneCamera)  
**Throws**:

- <code>TypeError</code> If `waypoints` is not a non-empty array or entries are malformed.
- <code>Error</code> If called after `dispose()`.


| Param | Type | Description |
| --- | --- | --- |
| waypoints | <code>Object</code> |  |
| [options] | <code>object</code> | Reserved for future use. |

**Example**  
```js
cam.tour([
  { at: [10, 10, 10], lookAt: [0, 0, 0], duration: 2000, easing: 'easeOutCubic' },
  { at: [-10,  5, 10], lookAt: [0, 0, 0], duration: 1500 },
]);
```
<a name="module_GraphSceneCamera.GraphSceneCamera+follow"></a>

### graphSceneCamera.follow(target) ⇒ <code>CameraController</code>
Smoothly pivot the camera toward a moving `THREE.Object3D` every frame.
Runs until `.cancel()` is called on the returned controller.
Cancels any currently running animation.

**Kind**: instance method of [<code>GraphSceneCamera</code>](#module_GraphSceneCamera.GraphSceneCamera)  
**Throws**:

- <code>TypeError</code> If `target` does not have `getWorldPosition`.
- <code>Error</code> If called after `dispose()`.


| Param | Type |
| --- | --- |
| target | <code>THREE.Object3D</code> | 

**Example**  
```js
const ctrl = cam.follow(ship);
// later:
ctrl.cancel();
```
<a name="module_GraphSceneCamera.GraphSceneCamera+focusOn"></a>

### graphSceneCamera.focusOn(boundingBox, [padding], [duration]) ⇒ <code>CameraController</code>
Animate the camera to frame the given bounding box.
Perspective cameras are moved to the correct viewing distance;
orthographic cameras have their frustum resized to fit the bounding sphere.
Cancels any currently running animation.

**Kind**: instance method of [<code>GraphSceneCamera</code>](#module_GraphSceneCamera.GraphSceneCamera)  
**Throws**:

- <code>TypeError</code> If `boundingBox` is not a `THREE.Box3`.
- <code>Error</code> If called after `dispose()`.


| Param | Type | Default | Description |
| --- | --- | --- | --- |
| boundingBox | <code>THREE.Box3</code> |  |  |
| [padding] | <code>number</code> | <code>1.2</code> | Multiplier applied to the bounding sphere radius. |
| [duration] | <code>number</code> | <code>600</code> | Duration in milliseconds. |

**Example**  
```js
const box = new THREE.Box3().setFromObject(group);
cam.focusOn(box, 1.5, 800);
```
<a name="module_GraphSceneCamera.GraphSceneCamera+enableOrbitControls"></a>

### graphSceneCamera.enableOrbitControls(domElement) ⇒ <code>\*</code>
Enable OrbitControls bound to the given DOM element.

OrbitControls is lazy-loaded from
`three/examples/jsm/controls/OrbitControls.js` on the first call — it is
NOT bundled unless this method is actually called. Any previously active
controls are disposed before the new ones are created.

**Kind**: instance method of [<code>GraphSceneCamera</code>](#module_GraphSceneCamera.GraphSceneCamera)  
**Throws**:

- <code>TypeError</code> If `domElement` is falsy.
- <code>Error</code> If called after `dispose()`.


| Param | Type | Description |
| --- | --- | --- |
| domElement | <code>HTMLElement</code> | Canvas or container to receive pointer events. |

**Example**  
```js
await cam.enableOrbitControls(renderer.domElement);
```
<a name="module_GraphSceneCamera.GraphSceneCamera+disableOrbitControls"></a>

### graphSceneCamera.disableOrbitControls() ⇒ <code>this</code>
Dispose and remove any active OrbitControls. No-op if controls are not active.

**Kind**: instance method of [<code>GraphSceneCamera</code>](#module_GraphSceneCamera.GraphSceneCamera)  
**Example**  
```js
cam.disableOrbitControls();
```
<a name="module_GraphSceneCamera.GraphSceneCamera+dispose"></a>

### graphSceneCamera.dispose()
Release all resources held by this camera (primarily OrbitControls event
listeners). The underlying THREE camera holds no GPU resources.
Idempotent — safe to call twice.

**Kind**: instance method of [<code>GraphSceneCamera</code>](#module_GraphSceneCamera.GraphSceneCamera)  
**Example**  
```js
cam.dispose();
```
