import { ClampToEdgeWrapping, Data3DTexture, LinearFilter, RGBAFormat, UnsignedByteType } from 'three';
import { LUTPass } from 'three/addons/postprocessing/LUTPass.js';
import { PostFX } from '../PostFX.js';

const IDENTITY_LUT_SIZE = 16;

/**
 * A no-op 3D LUT (`lut(rgb) === rgb`) used as `colorGrading`'s default so
 * `enable('colorGrading')` works with no asset — pass a real graded `.cube`
 * LUT's `Data3DTexture` via `opts.lut` for an actual look.
 * @returns {Data3DTexture}
 */
function createIdentityLUT() {
  const size = IDENTITY_LUT_SIZE;
  const data = new Uint8Array(size * size * size * 4);
  let i = 0;
  for (let b = 0; b < size; b++) {
    for (let g = 0; g < size; g++) {
      for (let r = 0; r < size; r++) {
        data[i++] = Math.round((r / (size - 1)) * 255);
        data[i++] = Math.round((g / (size - 1)) * 255);
        data[i++] = Math.round((b / (size - 1)) * 255);
        data[i++] = 255;
      }
    }
  }
  const texture = new Data3DTexture(data, size, size, size);
  texture.format = RGBAFormat;
  texture.type = UnsignedByteType;
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.wrapS = ClampToEdgeWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  texture.wrapR = ClampToEdgeWrapping;
  texture.needsUpdate = true;
  return texture;
}

/**
 * `colorGrading` — 3D LUT color grading. Defaults to a neutral identity LUT;
 * pass `opts.lut` (a `THREE.Data3DTexture`) for an actual graded look.
 *
 * @example graph3d.postfx.enable('colorGrading', { lut: myData3DTexture, intensity: 1.0 });
 */
PostFX.registerPass('colorGrading', {
  order: 50,
  create: (_ctx, opts) => {
    // Only dispose the LUT texture on pass teardown if we created it
    // ourselves — a caller-supplied `opts.lut` outlives this pass.
    const ownedLut = opts.lut ? null : createIdentityLUT();
    const pass = new LUTPass({ lut: opts.lut ?? ownedLut, intensity: opts.intensity ?? 1.0 });
    if (ownedLut) {
      const disposePass = pass.dispose.bind(pass);
      pass.dispose = () => {
        ownedLut.dispose();
        disposePass();
      };
    }
    return pass;
  },
});
