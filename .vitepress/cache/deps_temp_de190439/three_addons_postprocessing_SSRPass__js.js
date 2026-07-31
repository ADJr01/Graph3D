import {
  CopyShader
} from "./chunk-EZRCSUXT.js";
import {
  FullScreenQuad,
  Pass
} from "./chunk-FLHGFGX7.js";
import {
  AddEquation,
  Color,
  DepthTexture,
  HalfFloatType,
  Matrix4,
  MeshBasicMaterial,
  MeshNormalMaterial,
  NearestFilter,
  NoBlending,
  NormalBlending,
  OneMinusSrcAlphaFactor,
  ShaderMaterial,
  SrcAlphaFactor,
  UniformsUtils,
  UnsignedShortType,
  Vector2,
  WebGLRenderTarget
} from "./chunk-JW6MTNZR.js";

// node_modules/three/examples/jsm/shaders/SSRShader.js
var SSRShader = {
  name: "SSRShader",
  defines: {
    MAX_STEP: 0,
    PERSPECTIVE_CAMERA: true,
    DISTANCE_ATTENUATION: true,
    FRESNEL: true,
    INFINITE_THICK: false,
    SELECTIVE: false
  },
  uniforms: {
    "tDiffuse": { value: null },
    "tNormal": { value: null },
    "tMetalness": { value: null },
    "tDepth": { value: null },
    "cameraNear": { value: null },
    "cameraFar": { value: null },
    "resolution": { value: new Vector2() },
    "cameraProjectionMatrix": { value: new Matrix4() },
    "cameraInverseProjectionMatrix": { value: new Matrix4() },
    "opacity": { value: 0.5 },
    "maxDistance": { value: 180 },
    "cameraRange": { value: 0 },
    "thickness": { value: 0.018 }
  },
  vertexShader: (
    /* glsl */
    `

		varying vec2 vUv;

		void main() {

			vUv = uv;

			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

		}

	`
  ),
  fragmentShader: (
    /* glsl */
    `
		// precision highp float;
		precision highp sampler2D;
		varying vec2 vUv;
		uniform sampler2D tDepth;
		uniform sampler2D tNormal;
		uniform sampler2D tMetalness;
		uniform sampler2D tDiffuse;
		uniform float cameraRange;
		uniform vec2 resolution;
		uniform float opacity;
		uniform float cameraNear;
		uniform float cameraFar;
		uniform float maxDistance;
		uniform float thickness;
		uniform mat4 cameraProjectionMatrix;
		uniform mat4 cameraInverseProjectionMatrix;
		#include <packing>
		float pointToLineDistance(vec3 x0, vec3 x1, vec3 x2) {
			//x0: point, x1: linePointA, x2: linePointB
			//https://mathworld.wolfram.com/Point-LineDistance3-Dimensional.html
			return length(cross(x0-x1,x0-x2))/length(x2-x1);
		}
		float pointPlaneDistance(vec3 point,vec3 planePoint,vec3 planeNormal){
			// https://mathworld.wolfram.com/Point-PlaneDistance.html
			//// https://en.wikipedia.org/wiki/Plane_(geometry)
			//// http://paulbourke.net/geometry/pointlineplane/
			float a=planeNormal.x,b=planeNormal.y,c=planeNormal.z;
			float x0=point.x,y0=point.y,z0=point.z;
			float x=planePoint.x,y=planePoint.y,z=planePoint.z;
			float d=-(a*x+b*y+c*z);
			float distance=a*x0+b*y0+c*z0+d;
			return distance;
		}
		float getDepth( const in vec2 uv ) {
			return texture2D( tDepth, uv ).x;
		}
		float getViewZ( const in float depth ) {
			#ifdef PERSPECTIVE_CAMERA
				return perspectiveDepthToViewZ( depth, cameraNear, cameraFar );
			#else
				return orthographicDepthToViewZ( depth, cameraNear, cameraFar );
			#endif
		}
		vec3 getViewPosition( const in vec2 uv, const in float depth/*clip space*/, const in float clipW ) {
			vec4 clipPosition = vec4( ( vec3( uv, depth ) - 0.5 ) * 2.0, 1.0 );//ndc
			clipPosition *= clipW; //clip
			return ( cameraInverseProjectionMatrix * clipPosition ).xyz;//view
		}
		vec3 getViewNormal( const in vec2 uv ) {
			return unpackRGBToNormal( texture2D( tNormal, uv ).xyz );
		}
		vec2 viewPositionToXY(vec3 viewPosition){
			vec2 xy;
			vec4 clip=cameraProjectionMatrix*vec4(viewPosition,1);
			xy=clip.xy;//clip
			float clipW=clip.w;
			xy/=clipW;//NDC
			xy=(xy+1.)/2.;//uv
			xy*=resolution;//screen
			return xy;
		}
		void main(){
			#ifdef SELECTIVE
				float metalness=texture2D(tMetalness,vUv).r;
				if(metalness==0.) return;
			#endif

			float depth = getDepth( vUv );
			float viewZ = getViewZ( depth );
			if(-viewZ>=cameraFar) return;

			float clipW = cameraProjectionMatrix[2][3] * viewZ+cameraProjectionMatrix[3][3];
			vec3 viewPosition=getViewPosition( vUv, depth, clipW );

			vec2 d0=gl_FragCoord.xy;
			vec2 d1;

			vec3 viewNormal=getViewNormal( vUv );

			#ifdef PERSPECTIVE_CAMERA
				vec3 viewIncidentDir=normalize(viewPosition);
				vec3 viewReflectDir=reflect(viewIncidentDir,viewNormal);
			#else
				vec3 viewIncidentDir=vec3(0,0,-1);
				vec3 viewReflectDir=reflect(viewIncidentDir,viewNormal);
			#endif

			float maxReflectRayLen=maxDistance/dot(-viewIncidentDir,viewNormal);
			// dot(a,b)==length(a)*length(b)*cos(theta) // https://www.mathsisfun.com/algebra/vectors-dot-product.html
			// if(a.isNormalized&&b.isNormalized) dot(a,b)==cos(theta)
			// maxDistance/maxReflectRayLen=cos(theta)
			// maxDistance/maxReflectRayLen==dot(a,b)
			// maxReflectRayLen==maxDistance/dot(a,b)

			vec3 d1viewPosition=viewPosition+viewReflectDir*maxReflectRayLen;
			#ifdef PERSPECTIVE_CAMERA
				if(d1viewPosition.z>-cameraNear){
					//https://tutorial.math.lamar.edu/Classes/CalcIII/EqnsOfLines.aspx
					float t=(-cameraNear-viewPosition.z)/viewReflectDir.z;
					d1viewPosition=viewPosition+viewReflectDir*t;
				}
			#endif
			d1=viewPositionToXY(d1viewPosition);

			float xLen=d1.x-d0.x;
			float yLen=d1.y-d0.y;
			float totalStep=max(abs(xLen),abs(yLen));
			float xSpan=xLen/totalStep;
			float ySpan=yLen/totalStep;
			float sStep=1./totalStep;
			float s=sStep; // start at sStep since loop starts at i=1
			for(float i=1.;i<float(MAX_STEP);i++){
				if(i>=totalStep) break;
				vec2 xy=vec2(d0.x+i*xSpan,d0.y+i*ySpan);
				if(xy.x<0.||xy.x>resolution.x||xy.y<0.||xy.y>resolution.y) break;
				vec2 uv=xy/resolution;

				float d = getDepth(uv);
				float vZ = getViewZ( d );
				if(-vZ>=cameraFar) continue;
				float cW = cameraProjectionMatrix[2][3] * vZ+cameraProjectionMatrix[3][3];
				vec3 vP=getViewPosition( uv, d, cW );

				#ifdef PERSPECTIVE_CAMERA
					// https://comp.nus.edu.sg/~lowkl/publications/lowk_persp_interp_techrep.pdf
					float recipVPZ=1./viewPosition.z;
					float viewReflectRayZ=1./(recipVPZ+s*(1./d1viewPosition.z-recipVPZ));
				#else
					float viewReflectRayZ=viewPosition.z+s*(d1viewPosition.z-viewPosition.z);
				#endif

				// if(viewReflectRayZ>vZ) continue; // will cause "npm run make-screenshot webgl_postprocessing_ssr" high probability hang.
				// https://github.com/mrdoob/three.js/pull/21539#issuecomment-821061164
				if(viewReflectRayZ<=vZ){

					bool hit;
					#ifdef INFINITE_THICK
						hit=true;
					#else
						float away=pointToLineDistance(vP,viewPosition,d1viewPosition);

						float minThickness;
						vec2 xyNeighbor=xy;
						xyNeighbor.x+=1.;
						vec2 uvNeighbor=xyNeighbor/resolution;
						vec3 vPNeighbor=getViewPosition(uvNeighbor,d,cW);
						minThickness=vPNeighbor.x-vP.x;
						minThickness*=3.;
						float tk=max(minThickness,thickness);

						hit=away<=tk;
					#endif

					if(hit){
						vec3 vN=getViewNormal( uv );
						if(dot(viewReflectDir,vN)>=0.) break; // treat backfaces as opaque
						float distance=pointPlaneDistance(vP,viewPosition,viewNormal);
						if(distance>maxDistance) break;
						float op=opacity;
						#ifdef DISTANCE_ATTENUATION
							float ratio=1.-(distance/maxDistance);
							float attenuation=ratio*ratio;
							op=opacity*attenuation;
						#endif
						#ifdef FRESNEL
							float fresnelCoe=(dot(viewIncidentDir,viewReflectDir)+1.)/2.;
							op*=fresnelCoe;
						#endif
						vec4 reflectColor=texture2D(tDiffuse,uv);
						gl_FragColor.xyz=reflectColor.xyz;
						gl_FragColor.a=op;
						break;
					}
				}
				s+=sStep;
			}
		}
	`
  )
};
var SSRDepthShader = {
  name: "SSRDepthShader",
  defines: {
    "PERSPECTIVE_CAMERA": 1
  },
  uniforms: {
    "tDepth": { value: null },
    "cameraNear": { value: null },
    "cameraFar": { value: null }
  },
  vertexShader: (
    /* glsl */
    `

		varying vec2 vUv;

		void main() {

			vUv = uv;
			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

		}

	`
  ),
  fragmentShader: (
    /* glsl */
    `

		uniform sampler2D tDepth;

		uniform float cameraNear;
		uniform float cameraFar;

		varying vec2 vUv;

		#include <packing>

		float getLinearDepth( const in vec2 uv ) {

			#if PERSPECTIVE_CAMERA == 1

				float fragCoordZ = texture2D( tDepth, uv ).x;
				float viewZ = perspectiveDepthToViewZ( fragCoordZ, cameraNear, cameraFar );
				return viewZToOrthographicDepth( viewZ, cameraNear, cameraFar );

			#else

				return texture2D( tDepth, uv ).x;

			#endif

		}

		void main() {

			float depth = getLinearDepth( vUv );
			float d = 1.0 - depth;
			// d=(d-.999)*1000.;
			gl_FragColor = vec4( vec3( d ), 1.0 );

		}

	`
  )
};
var SSRBlurShader = {
  name: "SSRBlurShader",
  uniforms: {
    "tDiffuse": { value: null },
    "resolution": { value: new Vector2() },
    "opacity": { value: 0.5 }
  },
  vertexShader: (
    /* glsl */
    `

		varying vec2 vUv;

		void main() {

			vUv = uv;
			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

		}

	`
  ),
  fragmentShader: (
    /* glsl */
    `

		uniform sampler2D tDiffuse;
		uniform vec2 resolution;
		varying vec2 vUv;
		void main() {
			//reverse engineering from PhotoShop blur filter, then change coefficient

			vec2 texelSize = ( 1.0 / resolution );

			vec4 c=texture2D(tDiffuse,vUv);

			vec2 offset;

			offset=(vec2(-1,0))*texelSize;
			vec4 cl=texture2D(tDiffuse,vUv+offset);

			offset=(vec2(1,0))*texelSize;
			vec4 cr=texture2D(tDiffuse,vUv+offset);

			offset=(vec2(0,-1))*texelSize;
			vec4 cb=texture2D(tDiffuse,vUv+offset);

			offset=(vec2(0,1))*texelSize;
			vec4 ct=texture2D(tDiffuse,vUv+offset);

			// float coeCenter=.5;
			// float coeSide=.125;
			float coeCenter=.2;
			float coeSide=.2;
			float a=c.a*coeCenter+cl.a*coeSide+cr.a*coeSide+cb.a*coeSide+ct.a*coeSide;
			vec3 rgb=(c.rgb*c.a*coeCenter+cl.rgb*cl.a*coeSide+cr.rgb*cr.a*coeSide+cb.rgb*cb.a*coeSide+ct.rgb*ct.a*coeSide)/a;
			gl_FragColor=vec4(rgb,a);

		}
	`
  )
};

// node_modules/three/examples/jsm/postprocessing/SSRPass.js
var SSRPass = class _SSRPass extends Pass {
  /**
   * Constructs a new SSR pass.
   *
   * @param {SSRPass~Options} options - The pass options.
   */
  constructor({ renderer, scene, camera, width = 512, height = 512, selects = null, bouncing = false, groundReflector = null }) {
    super();
    this.width = width;
    this.height = height;
    this.clear = true;
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.groundReflector = groundReflector;
    this.opacity = SSRShader.uniforms.opacity.value;
    this.output = 0;
    this.maxDistance = SSRShader.uniforms.maxDistance.value;
    this.thickness = SSRShader.uniforms.thickness.value;
    this.tempColor = new Color();
    this._selects = selects;
    this._resolutionScale = 1;
    this.selective = Array.isArray(this._selects);
    Object.defineProperty(this, "selects", {
      get() {
        return this._selects;
      },
      set(val) {
        if (this._selects === val) return;
        this._selects = val;
        if (Array.isArray(val)) {
          this.selective = true;
          this.ssrMaterial.defines.SELECTIVE = true;
          this.ssrMaterial.needsUpdate = true;
        } else {
          this.selective = false;
          this.ssrMaterial.defines.SELECTIVE = false;
          this.ssrMaterial.needsUpdate = true;
        }
      }
    });
    this._bouncing = bouncing;
    Object.defineProperty(this, "bouncing", {
      get() {
        return this._bouncing;
      },
      set(val) {
        if (this._bouncing === val) return;
        this._bouncing = val;
        if (val) {
          this.ssrMaterial.uniforms["tDiffuse"].value = this.prevRenderTarget.texture;
        } else {
          this.ssrMaterial.uniforms["tDiffuse"].value = this.beautyRenderTarget.texture;
        }
      }
    });
    this.blur = true;
    this._distanceAttenuation = SSRShader.defines.DISTANCE_ATTENUATION;
    Object.defineProperty(this, "distanceAttenuation", {
      get() {
        return this._distanceAttenuation;
      },
      set(val) {
        if (this._distanceAttenuation === val) return;
        this._distanceAttenuation = val;
        this.ssrMaterial.defines.DISTANCE_ATTENUATION = val;
        this.ssrMaterial.needsUpdate = true;
      }
    });
    this._fresnel = SSRShader.defines.FRESNEL;
    Object.defineProperty(this, "fresnel", {
      get() {
        return this._fresnel;
      },
      set(val) {
        if (this._fresnel === val) return;
        this._fresnel = val;
        this.ssrMaterial.defines.FRESNEL = val;
        this.ssrMaterial.needsUpdate = true;
      }
    });
    this._infiniteThick = SSRShader.defines.INFINITE_THICK;
    Object.defineProperty(this, "infiniteThick", {
      get() {
        return this._infiniteThick;
      },
      set(val) {
        if (this._infiniteThick === val) return;
        this._infiniteThick = val;
        this.ssrMaterial.defines.INFINITE_THICK = val;
        this.ssrMaterial.needsUpdate = true;
      }
    });
    const depthTexture = new DepthTexture();
    depthTexture.type = UnsignedShortType;
    depthTexture.minFilter = NearestFilter;
    depthTexture.magFilter = NearestFilter;
    this.beautyRenderTarget = new WebGLRenderTarget(this.width, this.height, {
      minFilter: NearestFilter,
      magFilter: NearestFilter,
      type: HalfFloatType,
      depthTexture,
      depthBuffer: true
    });
    this.prevRenderTarget = new WebGLRenderTarget(this.width, this.height, {
      minFilter: NearestFilter,
      magFilter: NearestFilter
    });
    this.normalRenderTarget = new WebGLRenderTarget(this.width, this.height, {
      minFilter: NearestFilter,
      magFilter: NearestFilter,
      type: HalfFloatType
    });
    this.metalnessRenderTarget = new WebGLRenderTarget(this.width, this.height, {
      minFilter: NearestFilter,
      magFilter: NearestFilter,
      type: HalfFloatType
    });
    this.ssrRenderTarget = new WebGLRenderTarget(this.width, this.height, {
      minFilter: NearestFilter,
      magFilter: NearestFilter
    });
    this.blurRenderTarget = this.ssrRenderTarget.clone();
    this.blurRenderTarget2 = this.ssrRenderTarget.clone();
    this.ssrMaterial = new ShaderMaterial({
      defines: Object.assign({}, SSRShader.defines, {
        MAX_STEP: Math.sqrt(this.width * this.width + this.height * this.height)
      }),
      uniforms: UniformsUtils.clone(SSRShader.uniforms),
      vertexShader: SSRShader.vertexShader,
      fragmentShader: SSRShader.fragmentShader,
      blending: NoBlending
    });
    this.ssrMaterial.uniforms["tDiffuse"].value = this.beautyRenderTarget.texture;
    this.ssrMaterial.uniforms["tNormal"].value = this.normalRenderTarget.texture;
    this.ssrMaterial.defines.SELECTIVE = this.selective;
    this.ssrMaterial.needsUpdate = true;
    this.ssrMaterial.uniforms["tMetalness"].value = this.metalnessRenderTarget.texture;
    this.ssrMaterial.uniforms["tDepth"].value = this.beautyRenderTarget.depthTexture;
    this.ssrMaterial.uniforms["cameraNear"].value = this.camera.near;
    this.ssrMaterial.uniforms["cameraFar"].value = this.camera.far;
    this.ssrMaterial.uniforms["thickness"].value = this.thickness;
    this.ssrMaterial.uniforms["resolution"].value.set(this.width, this.height);
    this.ssrMaterial.uniforms["cameraProjectionMatrix"].value.copy(this.camera.projectionMatrix);
    this.ssrMaterial.uniforms["cameraInverseProjectionMatrix"].value.copy(this.camera.projectionMatrixInverse);
    this.normalMaterial = new MeshNormalMaterial();
    this.normalMaterial.blending = NoBlending;
    this.metalnessOnMaterial = new MeshBasicMaterial({
      color: "white"
    });
    this.metalnessOffMaterial = new MeshBasicMaterial({
      color: "black"
    });
    this.blurMaterial = new ShaderMaterial({
      defines: Object.assign({}, SSRBlurShader.defines),
      uniforms: UniformsUtils.clone(SSRBlurShader.uniforms),
      vertexShader: SSRBlurShader.vertexShader,
      fragmentShader: SSRBlurShader.fragmentShader
    });
    this.blurMaterial.uniforms["tDiffuse"].value = this.ssrRenderTarget.texture;
    this.blurMaterial.uniforms["resolution"].value.set(this.width, this.height);
    this.blurMaterial2 = new ShaderMaterial({
      defines: Object.assign({}, SSRBlurShader.defines),
      uniforms: UniformsUtils.clone(SSRBlurShader.uniforms),
      vertexShader: SSRBlurShader.vertexShader,
      fragmentShader: SSRBlurShader.fragmentShader
    });
    this.blurMaterial2.uniforms["tDiffuse"].value = this.blurRenderTarget.texture;
    this.blurMaterial2.uniforms["resolution"].value.set(this.width, this.height);
    this.depthRenderMaterial = new ShaderMaterial({
      defines: Object.assign({}, SSRDepthShader.defines),
      uniforms: UniformsUtils.clone(SSRDepthShader.uniforms),
      vertexShader: SSRDepthShader.vertexShader,
      fragmentShader: SSRDepthShader.fragmentShader,
      blending: NoBlending
    });
    this.depthRenderMaterial.uniforms["tDepth"].value = this.beautyRenderTarget.depthTexture;
    this.depthRenderMaterial.uniforms["cameraNear"].value = this.camera.near;
    this.depthRenderMaterial.uniforms["cameraFar"].value = this.camera.far;
    this.copyMaterial = new ShaderMaterial({
      uniforms: UniformsUtils.clone(CopyShader.uniforms),
      vertexShader: CopyShader.vertexShader,
      fragmentShader: CopyShader.fragmentShader,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blendSrc: SrcAlphaFactor,
      blendDst: OneMinusSrcAlphaFactor,
      blendEquation: AddEquation,
      blendSrcAlpha: SrcAlphaFactor,
      blendDstAlpha: OneMinusSrcAlphaFactor,
      blendEquationAlpha: AddEquation
      // premultipliedAlpha:true,
    });
    this.fsQuad = new FullScreenQuad(null);
    this.originalClearColor = new Color();
  }
  /**
   * The resolution scale. Valid values are in the range
   * `[0,1]`. `1` means best quality but also results in
   * more computational overhead. Setting to `0.5` means
   * the effect is computed in half-resolution.
   *
   * @type {number}
   * @default 1
   */
  get resolutionScale() {
    return this._resolutionScale;
  }
  set resolutionScale(value) {
    this._resolutionScale = value;
    this.setSize(this.width, this.height);
  }
  /**
   * Frees the GPU-related resources allocated by this instance. Call this
   * method whenever the pass is no longer used in your app.
   */
  dispose() {
    this.beautyRenderTarget.dispose();
    this.prevRenderTarget.dispose();
    this.normalRenderTarget.dispose();
    this.metalnessRenderTarget.dispose();
    this.ssrRenderTarget.dispose();
    this.blurRenderTarget.dispose();
    this.blurRenderTarget2.dispose();
    this.normalMaterial.dispose();
    this.metalnessOnMaterial.dispose();
    this.metalnessOffMaterial.dispose();
    this.blurMaterial.dispose();
    this.blurMaterial2.dispose();
    this.copyMaterial.dispose();
    this.depthRenderMaterial.dispose();
    this.fsQuad.dispose();
  }
  /**
   * Performs the SSR pass.
   *
   * @param {WebGLRenderer} renderer - The renderer.
   * @param {WebGLRenderTarget} writeBuffer - The write buffer. This buffer is intended as the rendering
   * destination for the pass.
   * @param {WebGLRenderTarget} readBuffer - The read buffer. The pass can access the result from the
   * previous pass from this buffer.
   * @param {number} deltaTime - The delta time in seconds.
   * @param {boolean} maskActive - Whether masking is active or not.
   */
  render(renderer, writeBuffer) {
    renderer.setRenderTarget(this.beautyRenderTarget);
    renderer.clear();
    if (this.groundReflector) {
      this.groundReflector.visible = false;
      this.groundReflector.doRender(this.renderer, this.scene, this.camera);
      this.groundReflector.visible = true;
    }
    renderer.render(this.scene, this.camera);
    if (this.groundReflector) this.groundReflector.visible = false;
    this._renderOverride(renderer, this.normalMaterial, this.normalRenderTarget, 0, 0);
    if (this.selective) {
      this._renderMetalness(renderer, this.metalnessOnMaterial, this.metalnessRenderTarget, 0, 0);
    }
    this.ssrMaterial.uniforms["opacity"].value = this.opacity;
    this.ssrMaterial.uniforms["maxDistance"].value = this.maxDistance;
    this.ssrMaterial.uniforms["thickness"].value = this.thickness;
    this._renderPass(renderer, this.ssrMaterial, this.ssrRenderTarget);
    if (this.blur) {
      this._renderPass(renderer, this.blurMaterial, this.blurRenderTarget);
      this._renderPass(renderer, this.blurMaterial2, this.blurRenderTarget2);
    }
    switch (this.output) {
      case _SSRPass.OUTPUT.Default:
        if (this.bouncing) {
          this.copyMaterial.uniforms["tDiffuse"].value = this.beautyRenderTarget.texture;
          this.copyMaterial.blending = NoBlending;
          this._renderPass(renderer, this.copyMaterial, this.prevRenderTarget);
          if (this.blur)
            this.copyMaterial.uniforms["tDiffuse"].value = this.blurRenderTarget2.texture;
          else
            this.copyMaterial.uniforms["tDiffuse"].value = this.ssrRenderTarget.texture;
          this.copyMaterial.blending = NormalBlending;
          this._renderPass(renderer, this.copyMaterial, this.prevRenderTarget);
          this.copyMaterial.uniforms["tDiffuse"].value = this.prevRenderTarget.texture;
          this.copyMaterial.blending = NoBlending;
          this._renderPass(renderer, this.copyMaterial, this.renderToScreen ? null : writeBuffer);
        } else {
          this.copyMaterial.uniforms["tDiffuse"].value = this.beautyRenderTarget.texture;
          this.copyMaterial.blending = NoBlending;
          this._renderPass(renderer, this.copyMaterial, this.renderToScreen ? null : writeBuffer);
          if (this.blur)
            this.copyMaterial.uniforms["tDiffuse"].value = this.blurRenderTarget2.texture;
          else
            this.copyMaterial.uniforms["tDiffuse"].value = this.ssrRenderTarget.texture;
          this.copyMaterial.blending = NormalBlending;
          this._renderPass(renderer, this.copyMaterial, this.renderToScreen ? null : writeBuffer);
        }
        break;
      case _SSRPass.OUTPUT.SSR:
        if (this.blur)
          this.copyMaterial.uniforms["tDiffuse"].value = this.blurRenderTarget2.texture;
        else
          this.copyMaterial.uniforms["tDiffuse"].value = this.ssrRenderTarget.texture;
        this.copyMaterial.blending = NoBlending;
        this._renderPass(renderer, this.copyMaterial, this.renderToScreen ? null : writeBuffer);
        if (this.bouncing) {
          if (this.blur)
            this.copyMaterial.uniforms["tDiffuse"].value = this.blurRenderTarget2.texture;
          else
            this.copyMaterial.uniforms["tDiffuse"].value = this.beautyRenderTarget.texture;
          this.copyMaterial.blending = NoBlending;
          this._renderPass(renderer, this.copyMaterial, this.prevRenderTarget);
          this.copyMaterial.uniforms["tDiffuse"].value = this.ssrRenderTarget.texture;
          this.copyMaterial.blending = NormalBlending;
          this._renderPass(renderer, this.copyMaterial, this.prevRenderTarget);
        }
        break;
      case _SSRPass.OUTPUT.Beauty:
        this.copyMaterial.uniforms["tDiffuse"].value = this.beautyRenderTarget.texture;
        this.copyMaterial.blending = NoBlending;
        this._renderPass(renderer, this.copyMaterial, this.renderToScreen ? null : writeBuffer);
        break;
      case _SSRPass.OUTPUT.Depth:
        this._renderPass(renderer, this.depthRenderMaterial, this.renderToScreen ? null : writeBuffer);
        break;
      case _SSRPass.OUTPUT.Normal:
        this.copyMaterial.uniforms["tDiffuse"].value = this.normalRenderTarget.texture;
        this.copyMaterial.blending = NoBlending;
        this._renderPass(renderer, this.copyMaterial, this.renderToScreen ? null : writeBuffer);
        break;
      case _SSRPass.OUTPUT.Metalness:
        this.copyMaterial.uniforms["tDiffuse"].value = this.metalnessRenderTarget.texture;
        this.copyMaterial.blending = NoBlending;
        this._renderPass(renderer, this.copyMaterial, this.renderToScreen ? null : writeBuffer);
        break;
      default:
        console.warn("THREE.SSRPass: Unknown output type.");
    }
  }
  /**
   * Sets the size of the pass.
   *
   * @param {number} width - The width to set.
   * @param {number} height - The height to set.
   */
  setSize(width, height) {
    this.width = width;
    this.height = height;
    const effectiveWidth = Math.round(this.resolutionScale * width);
    const effectiveHeight = Math.round(this.resolutionScale * height);
    this.ssrMaterial.defines.MAX_STEP = Math.sqrt(effectiveWidth * effectiveWidth + effectiveHeight * effectiveHeight);
    this.ssrMaterial.needsUpdate = true;
    this.beautyRenderTarget.setSize(width, height);
    this.normalRenderTarget.setSize(width, height);
    this.metalnessRenderTarget.setSize(width, height);
    this.ssrRenderTarget.setSize(effectiveWidth, effectiveHeight);
    this.prevRenderTarget.setSize(effectiveWidth, effectiveHeight);
    this.blurRenderTarget.setSize(effectiveWidth, effectiveHeight);
    this.blurRenderTarget2.setSize(effectiveWidth, effectiveHeight);
    this.ssrMaterial.uniforms["resolution"].value.set(effectiveWidth, effectiveHeight);
    this.ssrMaterial.uniforms["cameraProjectionMatrix"].value.copy(this.camera.projectionMatrix);
    this.ssrMaterial.uniforms["cameraInverseProjectionMatrix"].value.copy(this.camera.projectionMatrixInverse);
    this.blurMaterial.uniforms["resolution"].value.set(effectiveWidth, effectiveHeight);
    this.blurMaterial2.uniforms["resolution"].value.set(effectiveWidth, effectiveHeight);
  }
  // internals
  _renderPass(renderer, passMaterial, renderTarget, clearColor, clearAlpha) {
    this.originalClearColor.copy(renderer.getClearColor(this.tempColor));
    const originalClearAlpha = renderer.getClearAlpha(this.tempColor);
    const originalAutoClear = renderer.autoClear;
    renderer.setRenderTarget(renderTarget);
    renderer.autoClear = false;
    if (clearColor !== void 0 && clearColor !== null) {
      renderer.setClearColor(clearColor);
      renderer.setClearAlpha(clearAlpha || 0);
      renderer.clear();
    }
    this.fsQuad.material = passMaterial;
    this.fsQuad.render(renderer);
    renderer.autoClear = originalAutoClear;
    renderer.setClearColor(this.originalClearColor);
    renderer.setClearAlpha(originalClearAlpha);
  }
  _renderOverride(renderer, overrideMaterial, renderTarget, clearColor, clearAlpha) {
    this.originalClearColor.copy(renderer.getClearColor(this.tempColor));
    const originalClearAlpha = renderer.getClearAlpha(this.tempColor);
    const originalAutoClear = renderer.autoClear;
    renderer.setRenderTarget(renderTarget);
    renderer.autoClear = false;
    clearColor = overrideMaterial.clearColor || clearColor;
    clearAlpha = overrideMaterial.clearAlpha || clearAlpha;
    if (clearColor !== void 0 && clearColor !== null) {
      renderer.setClearColor(clearColor);
      renderer.setClearAlpha(clearAlpha || 0);
      renderer.clear();
    }
    this.scene.overrideMaterial = overrideMaterial;
    renderer.render(this.scene, this.camera);
    this.scene.overrideMaterial = null;
    renderer.autoClear = originalAutoClear;
    renderer.setClearColor(this.originalClearColor);
    renderer.setClearAlpha(originalClearAlpha);
  }
  _renderMetalness(renderer, overrideMaterial, renderTarget, clearColor, clearAlpha) {
    this.originalClearColor.copy(renderer.getClearColor(this.tempColor));
    const originalClearAlpha = renderer.getClearAlpha(this.tempColor);
    const originalAutoClear = renderer.autoClear;
    const originalBackground = this.scene.background;
    const originalFog = this.scene.fog;
    renderer.setRenderTarget(renderTarget);
    renderer.autoClear = false;
    this.scene.background = null;
    this.scene.fog = null;
    clearColor = overrideMaterial.clearColor || clearColor;
    clearAlpha = overrideMaterial.clearAlpha || clearAlpha;
    if (clearColor !== void 0 && clearColor !== null) {
      renderer.setClearColor(clearColor);
      renderer.setClearAlpha(clearAlpha || 0);
      renderer.clear();
    }
    this.scene.traverseVisible((child) => {
      child._SSRPassBackupMaterial = child.material;
      if (this._selects.includes(child)) {
        child.material = this.metalnessOnMaterial;
      } else {
        child.material = this.metalnessOffMaterial;
      }
    });
    renderer.render(this.scene, this.camera);
    this.scene.traverseVisible((child) => {
      child.material = child._SSRPassBackupMaterial;
    });
    renderer.autoClear = originalAutoClear;
    renderer.setClearColor(this.originalClearColor);
    renderer.setClearAlpha(originalClearAlpha);
    this.scene.background = originalBackground;
    this.scene.fog = originalFog;
  }
};
SSRPass.OUTPUT = {
  "Default": 0,
  "SSR": 1,
  "Beauty": 3,
  "Depth": 4,
  "Normal": 5,
  "Metalness": 7
};
export {
  SSRPass
};
//# sourceMappingURL=three_addons_postprocessing_SSRPass__js.js.map
