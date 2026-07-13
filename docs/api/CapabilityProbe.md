# CapabilityProbe

<a name="module_CapabilityProbe.CapabilityProbe"></a>

## CapabilityProbe
Probes the available WebGL capabilities of the current environment on construction.
The result is exposed as a frozen [Capabilities](Capabilities) object and drives all later
decisions about which rendering code paths are safe to use.

No Three.js dependency — safe to instantiate before the renderer exists.
SSR-safe: outside a browser (no `document`) this returns `NULL_CAPABILITIES`
immediately without touching the DOM.

**Kind**: static class of [<code>CapabilityProbe</code>](#module_CapabilityProbe)  

* [.CapabilityProbe](#module_CapabilityProbe.CapabilityProbe)
    * [new exports.CapabilityProbe([canvas])](#new_module_CapabilityProbe.CapabilityProbe_new)
    * [.capabilities](#module_CapabilityProbe.CapabilityProbe+capabilities) : <code>\*</code>

<a name="new_module_CapabilityProbe.CapabilityProbe_new"></a>

### new exports.CapabilityProbe([canvas])

| Param | Type | Description |
| --- | --- | --- |
| [canvas] | <code>HTMLCanvasElement</code> | Canvas to probe against.   When omitted a temporary canvas is created and immediately discarded.   Pass the renderer's canvas to avoid allocating a second WebGL context. |

**Example**  
```js
const probe = new CapabilityProbe();
if (!probe.capabilities.webgl2) throw new Error('WebGL2 required');
```
**Example**  
```js
// Reuse the renderer's canvas to avoid a second GL context.
const probe = new CapabilityProbe(renderer.domElement);
```
<a name="module_CapabilityProbe.CapabilityProbe+capabilities"></a>

### capabilityProbe.capabilities : <code>\*</code>
**Kind**: instance property of [<code>CapabilityProbe</code>](#module_CapabilityProbe.CapabilityProbe)  
