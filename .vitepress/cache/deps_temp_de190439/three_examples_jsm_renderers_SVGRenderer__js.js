import {
  Box2,
  Box3,
  Camera,
  Color,
  DoubleSide,
  Frustum,
  Matrix3,
  Matrix4,
  Object3D,
  SRGBColorSpace,
  Vector2,
  Vector3,
  Vector4
} from "./chunk-JW6MTNZR.js";

// node_modules/three/examples/jsm/renderers/Projector.js
var RenderableObject = class {
  constructor() {
    this.id = 0;
    this.object = null;
    this.z = 0;
    this.renderOrder = 0;
  }
};
var RenderableFace = class {
  constructor() {
    this.id = 0;
    this.v1 = new RenderableVertex();
    this.v2 = new RenderableVertex();
    this.v3 = new RenderableVertex();
    this.normalModel = new Vector3();
    this.vertexNormalsModel = [new Vector3(), new Vector3(), new Vector3()];
    this.vertexNormalsLength = 0;
    this.color = new Color();
    this.material = null;
    this.uvs = [new Vector2(), new Vector2(), new Vector2()];
    this.z = 0;
    this.renderOrder = 0;
  }
};
var RenderableVertex = class {
  constructor() {
    this.position = new Vector3();
    this.positionWorld = new Vector3();
    this.positionScreen = new Vector4();
    this.visible = true;
  }
  copy(vertex) {
    this.positionWorld.copy(vertex.positionWorld);
    this.positionScreen.copy(vertex.positionScreen);
  }
};
var RenderableLine = class {
  constructor() {
    this.id = 0;
    this.v1 = new RenderableVertex();
    this.v2 = new RenderableVertex();
    this.vertexColors = [new Color(), new Color()];
    this.material = null;
    this.z = 0;
    this.renderOrder = 0;
  }
};
var RenderableSprite = class {
  constructor() {
    this.id = 0;
    this.object = null;
    this.x = 0;
    this.y = 0;
    this.z = 0;
    this.rotation = 0;
    this.scale = new Vector2();
    this.material = null;
    this.renderOrder = 0;
  }
};
var Projector = class {
  /**
   * Constructs a new projector.
   */
  constructor() {
    let _object, _objectCount, _objectPoolLength = 0, _vertex, _vertexCount, _vertexPoolLength = 0, _face, _faceCount, _facePoolLength = 0, _line, _lineCount, _linePoolLength = 0, _sprite, _spriteCount, _spritePoolLength = 0, _modelMatrix, _clipInput = [], _clipOutput = [];
    const _renderData = { objects: [], lights: [], elements: [] }, _vector3 = new Vector3(), _vector4 = new Vector4(), _clipBox = new Box3(new Vector3(-1, -1, -1), new Vector3(1, 1, 1)), _boundingBox = new Box3(), _points3 = new Array(3), _viewMatrix = new Matrix4(), _viewProjectionMatrix = new Matrix4(), _modelViewProjectionMatrix = new Matrix4(), _frustum = new Frustum(), _objectPool = [], _vertexPool = [], _facePool = [], _linePool = [], _spritePool = [], _clipVertexPool = [], _clipPos1 = new Vector4(), _clipPos2 = new Vector4(), _clipPos3 = new Vector4(), _screenVertexPool = [], _clipInputVertices = [null, null, null], _clipPlanes = [
      { sign: 1 },
      { sign: -1 }
    ];
    function RenderList() {
      const normals = [];
      const colors = [];
      const uvs = [];
      let object = null;
      const normalMatrix = new Matrix3();
      function setObject(value) {
        object = value;
        normalMatrix.getNormalMatrix(object.matrixWorld);
        normals.length = 0;
        colors.length = 0;
        uvs.length = 0;
      }
      function projectVertex(vertex) {
        const position = vertex.position;
        const positionWorld = vertex.positionWorld;
        const positionScreen = vertex.positionScreen;
        positionWorld.copy(position).applyMatrix4(_modelMatrix);
        positionScreen.copy(positionWorld).applyMatrix4(_viewProjectionMatrix);
        const invW = 1 / positionScreen.w;
        positionScreen.x *= invW;
        positionScreen.y *= invW;
        positionScreen.z *= invW;
        vertex.visible = positionScreen.x >= -1 && positionScreen.x <= 1 && positionScreen.y >= -1 && positionScreen.y <= 1 && positionScreen.z >= -1 && positionScreen.z <= 1;
      }
      function pushVertex(x, y, z) {
        _vertex = getNextVertexInPool();
        _vertex.position.set(x, y, z);
        projectVertex(_vertex);
      }
      function pushNormal(x, y, z) {
        normals.push(x, y, z);
      }
      function pushColor(r, g, b) {
        colors.push(r, g, b);
      }
      function pushUv(x, y) {
        uvs.push(x, y);
      }
      function checkTriangleVisibility(v1, v2, v3) {
        if (v1.visible === true || v2.visible === true || v3.visible === true) return true;
        _points3[0] = v1.positionScreen;
        _points3[1] = v2.positionScreen;
        _points3[2] = v3.positionScreen;
        return _clipBox.intersectsBox(_boundingBox.setFromPoints(_points3));
      }
      function checkBackfaceCulling(v1, v2, v3) {
        return (v3.positionScreen.x - v1.positionScreen.x) * (v2.positionScreen.y - v1.positionScreen.y) - (v3.positionScreen.y - v1.positionScreen.y) * (v2.positionScreen.x - v1.positionScreen.x) < 0;
      }
      function pushLine(a, b) {
        const v1 = _vertexPool[a];
        const v2 = _vertexPool[b];
        v1.positionScreen.copy(v1.position).applyMatrix4(_modelViewProjectionMatrix);
        v2.positionScreen.copy(v2.position).applyMatrix4(_modelViewProjectionMatrix);
        if (clipLine(v1.positionScreen, v2.positionScreen) === true) {
          v1.positionScreen.multiplyScalar(1 / v1.positionScreen.w);
          v2.positionScreen.multiplyScalar(1 / v2.positionScreen.w);
          _line = getNextLineInPool();
          _line.id = object.id;
          _line.v1.copy(v1);
          _line.v2.copy(v2);
          _line.z = Math.max(v1.positionScreen.z, v2.positionScreen.z);
          _line.renderOrder = object.renderOrder;
          _line.material = object.material;
          if (object.material.vertexColors) {
            _line.vertexColors[0].fromArray(colors, a * 3);
            _line.vertexColors[1].fromArray(colors, b * 3);
          }
          _renderData.elements.push(_line);
        }
      }
      function pushTriangle(a, b, c, material) {
        const v1 = _vertexPool[a];
        const v2 = _vertexPool[b];
        const v3 = _vertexPool[c];
        const w1 = v1.positionScreen.w;
        const w2 = v2.positionScreen.w;
        const w3 = v3.positionScreen.w;
        const nearDist1 = w1 * (v1.positionScreen.z + 1);
        const nearDist2 = w2 * (v2.positionScreen.z + 1);
        const nearDist3 = w3 * (v3.positionScreen.z + 1);
        const farDist1 = w1 * (1 - v1.positionScreen.z);
        const farDist2 = w2 * (1 - v2.positionScreen.z);
        const farDist3 = w3 * (1 - v3.positionScreen.z);
        if (nearDist1 < 0 && nearDist2 < 0 && nearDist3 < 0 || farDist1 < 0 && farDist2 < 0 && farDist3 < 0) {
          return;
        }
        if (nearDist1 >= 0 && nearDist2 >= 0 && nearDist3 >= 0 && farDist1 >= 0 && farDist2 >= 0 && farDist3 >= 0) {
          if (checkTriangleVisibility(v1, v2, v3) === false) return;
          if (material.side === DoubleSide || checkBackfaceCulling(v1, v2, v3) === true) {
            _face = getNextFaceInPool();
            _face.id = object.id;
            _face.v1.copy(v1);
            _face.v2.copy(v2);
            _face.v3.copy(v3);
            _face.z = (v1.positionScreen.z + v2.positionScreen.z + v3.positionScreen.z) / 3;
            _face.renderOrder = object.renderOrder;
            _vector3.subVectors(v3.position, v2.position);
            _vector4.subVectors(v1.position, v2.position);
            _vector3.cross(_vector4);
            _face.normalModel.copy(_vector3);
            _face.normalModel.applyMatrix3(normalMatrix).normalize();
            for (let i = 0; i < 3; i++) {
              const normal = _face.vertexNormalsModel[i];
              normal.fromArray(normals, arguments[i] * 3);
              normal.applyMatrix3(normalMatrix).normalize();
              const uv = _face.uvs[i];
              uv.fromArray(uvs, arguments[i] * 2);
            }
            _face.vertexNormalsLength = 3;
            _face.material = material;
            if (material.vertexColors) {
              _face.color.fromArray(colors, a * 3);
            }
            _renderData.elements.push(_face);
          }
          return;
        }
        _clipPos1.set(v1.positionScreen.x * w1, v1.positionScreen.y * w1, v1.positionScreen.z * w1, w1);
        _clipPos2.set(v2.positionScreen.x * w2, v2.positionScreen.y * w2, v2.positionScreen.z * w2, w2);
        _clipPos3.set(v3.positionScreen.x * w3, v3.positionScreen.y * w3, v3.positionScreen.z * w3, w3);
        _clipInputVertices[0] = _clipPos1;
        _clipInputVertices[1] = _clipPos2;
        _clipInputVertices[2] = _clipPos3;
        const clippedCount = clipTriangle(_clipInputVertices);
        if (clippedCount < 3) return;
        for (let i = 0; i < clippedCount; i++) {
          const cv = _clipInput[i];
          let sv = _screenVertexPool[i];
          if (!sv) {
            sv = new RenderableVertex();
            _screenVertexPool[i] = sv;
          }
          const invW = 1 / cv.w;
          sv.positionScreen.set(cv.x * invW, cv.y * invW, cv.z * invW, 1);
          sv.positionWorld.copy(v1.positionWorld);
          sv.visible = true;
        }
        for (let i = 1; i < clippedCount - 1; i++) {
          const tv1 = _screenVertexPool[0];
          const tv2 = _screenVertexPool[i];
          const tv3 = _screenVertexPool[i + 1];
          if (material.side === DoubleSide || checkBackfaceCulling(tv1, tv2, tv3) === true) {
            _face = getNextFaceInPool();
            _face.id = object.id;
            _face.v1.copy(tv1);
            _face.v2.copy(tv2);
            _face.v3.copy(tv3);
            _face.z = (tv1.positionScreen.z + tv2.positionScreen.z + tv3.positionScreen.z) / 3;
            _face.renderOrder = object.renderOrder;
            _vector3.subVectors(v3.position, v2.position);
            _vector4.subVectors(v1.position, v2.position);
            _vector3.cross(_vector4);
            _face.normalModel.copy(_vector3);
            _face.normalModel.applyMatrix3(normalMatrix).normalize();
            for (let j = 0; j < 3; j++) {
              const normal = _face.vertexNormalsModel[j];
              normal.fromArray(normals, arguments[j] * 3);
              normal.applyMatrix3(normalMatrix).normalize();
              const uv = _face.uvs[j];
              uv.fromArray(uvs, arguments[j] * 2);
            }
            _face.vertexNormalsLength = 3;
            _face.material = material;
            if (material.vertexColors) {
              _face.color.fromArray(colors, a * 3);
            }
            _renderData.elements.push(_face);
          }
        }
      }
      return {
        setObject,
        projectVertex,
        checkTriangleVisibility,
        checkBackfaceCulling,
        pushVertex,
        pushNormal,
        pushColor,
        pushUv,
        pushLine,
        pushTriangle
      };
    }
    const renderList = new RenderList();
    function projectObject(object) {
      if (object.visible === false) return;
      if (object.isLight) {
        _renderData.lights.push(object);
      } else if (object.isMesh || object.isLine || object.isPoints) {
        if (object.material.visible === false) return;
        if (object.frustumCulled === true && _frustum.intersectsObject(object) === false) return;
        addObject(object);
      } else if (object.isSprite) {
        if (object.material.visible === false) return;
        if (object.frustumCulled === true && _frustum.intersectsSprite(object) === false) return;
        addObject(object);
      }
      const children = object.children;
      for (let i = 0, l = children.length; i < l; i++) {
        projectObject(children[i]);
      }
    }
    function addObject(object) {
      _object = getNextObjectInPool();
      _object.id = object.id;
      _object.object = object;
      _vector3.setFromMatrixPosition(object.matrixWorld);
      _vector3.applyMatrix4(_viewProjectionMatrix);
      _object.z = _vector3.z;
      _object.renderOrder = object.renderOrder;
      _renderData.objects.push(_object);
    }
    this.projectScene = function(scene, camera, sortObjects, sortElements) {
      _faceCount = 0;
      _lineCount = 0;
      _spriteCount = 0;
      _renderData.elements.length = 0;
      if (scene.matrixWorldAutoUpdate === true) scene.updateMatrixWorld();
      if (camera.parent === null && camera.matrixWorldAutoUpdate === true) camera.updateMatrixWorld();
      _viewMatrix.copy(camera.matrixWorldInverse);
      _viewProjectionMatrix.multiplyMatrices(camera.projectionMatrix, _viewMatrix);
      _frustum.setFromProjectionMatrix(_viewProjectionMatrix);
      _objectCount = 0;
      _renderData.objects.length = 0;
      _renderData.lights.length = 0;
      projectObject(scene);
      if (sortObjects === true) {
        _renderData.objects.sort(painterSort);
      }
      const objects = _renderData.objects;
      for (let o = 0, ol = objects.length; o < ol; o++) {
        const object = objects[o].object;
        const geometry = object.geometry;
        renderList.setObject(object);
        _modelMatrix = object.matrixWorld;
        _vertexCount = 0;
        if (object.isMesh) {
          let material = object.material;
          const isMultiMaterial = Array.isArray(material);
          const attributes = geometry.attributes;
          const groups = geometry.groups;
          if (attributes.position === void 0) continue;
          const positions = attributes.position.array;
          for (let i = 0, l = positions.length; i < l; i += 3) {
            let x = positions[i];
            let y = positions[i + 1];
            let z = positions[i + 2];
            const morphTargets = geometry.morphAttributes.position;
            if (morphTargets !== void 0) {
              const morphTargetsRelative = geometry.morphTargetsRelative;
              const morphInfluences = object.morphTargetInfluences;
              for (let t = 0, tl = morphTargets.length; t < tl; t++) {
                const influence = morphInfluences[t];
                if (influence === 0) continue;
                const target = morphTargets[t];
                if (morphTargetsRelative) {
                  x += target.getX(i / 3) * influence;
                  y += target.getY(i / 3) * influence;
                  z += target.getZ(i / 3) * influence;
                } else {
                  x += (target.getX(i / 3) - positions[i]) * influence;
                  y += (target.getY(i / 3) - positions[i + 1]) * influence;
                  z += (target.getZ(i / 3) - positions[i + 2]) * influence;
                }
              }
            }
            renderList.pushVertex(x, y, z);
          }
          if (attributes.normal !== void 0) {
            const normals = attributes.normal.array;
            for (let i = 0, l = normals.length; i < l; i += 3) {
              renderList.pushNormal(normals[i], normals[i + 1], normals[i + 2]);
            }
          }
          if (attributes.color !== void 0) {
            const colors = attributes.color.array;
            for (let i = 0, l = colors.length; i < l; i += 3) {
              renderList.pushColor(colors[i], colors[i + 1], colors[i + 2]);
            }
          }
          if (attributes.uv !== void 0) {
            const uvs = attributes.uv.array;
            for (let i = 0, l = uvs.length; i < l; i += 2) {
              renderList.pushUv(uvs[i], uvs[i + 1]);
            }
          }
          if (geometry.index !== null) {
            const indices = geometry.index.array;
            if (groups.length > 0) {
              for (let g = 0; g < groups.length; g++) {
                const group = groups[g];
                material = isMultiMaterial === true ? object.material[group.materialIndex] : object.material;
                if (material === void 0) continue;
                for (let i = group.start, l = group.start + group.count; i < l; i += 3) {
                  renderList.pushTriangle(indices[i], indices[i + 1], indices[i + 2], material);
                }
              }
            } else {
              for (let i = 0, l = indices.length; i < l; i += 3) {
                renderList.pushTriangle(indices[i], indices[i + 1], indices[i + 2], material);
              }
            }
          } else {
            if (groups.length > 0) {
              for (let g = 0; g < groups.length; g++) {
                const group = groups[g];
                material = isMultiMaterial === true ? object.material[group.materialIndex] : object.material;
                if (material === void 0) continue;
                for (let i = group.start, l = group.start + group.count; i < l; i += 3) {
                  renderList.pushTriangle(i, i + 1, i + 2, material);
                }
              }
            } else {
              for (let i = 0, l = positions.length / 3; i < l; i += 3) {
                renderList.pushTriangle(i, i + 1, i + 2, material);
              }
            }
          }
        } else if (object.isLine) {
          _modelViewProjectionMatrix.multiplyMatrices(_viewProjectionMatrix, _modelMatrix);
          const attributes = geometry.attributes;
          if (attributes.position !== void 0) {
            const positions = attributes.position.array;
            for (let i = 0, l = positions.length; i < l; i += 3) {
              renderList.pushVertex(positions[i], positions[i + 1], positions[i + 2]);
            }
            if (attributes.color !== void 0) {
              const colors = attributes.color.array;
              for (let i = 0, l = colors.length; i < l; i += 3) {
                renderList.pushColor(colors[i], colors[i + 1], colors[i + 2]);
              }
            }
            if (geometry.index !== null) {
              const indices = geometry.index.array;
              for (let i = 0, l = indices.length; i < l; i += 2) {
                renderList.pushLine(indices[i], indices[i + 1]);
              }
            } else {
              const step = object.isLineSegments ? 2 : 1;
              for (let i = 0, l = positions.length / 3 - 1; i < l; i += step) {
                renderList.pushLine(i, i + 1);
              }
            }
          }
        } else if (object.isPoints) {
          _modelViewProjectionMatrix.multiplyMatrices(_viewProjectionMatrix, _modelMatrix);
          const attributes = geometry.attributes;
          if (attributes.position !== void 0) {
            const positions = attributes.position.array;
            for (let i = 0, l = positions.length; i < l; i += 3) {
              _vector4.set(positions[i], positions[i + 1], positions[i + 2], 1);
              _vector4.applyMatrix4(_modelViewProjectionMatrix);
              pushPoint(_vector4, object, camera);
            }
          }
        } else if (object.isSprite) {
          object.modelViewMatrix.multiplyMatrices(camera.matrixWorldInverse, object.matrixWorld);
          _vector4.set(_modelMatrix.elements[12], _modelMatrix.elements[13], _modelMatrix.elements[14], 1);
          _vector4.applyMatrix4(_viewProjectionMatrix);
          pushPoint(_vector4, object, camera);
        }
      }
      if (sortElements === true) {
        _renderData.elements.sort(painterSort);
      }
      return _renderData;
    };
    function pushPoint(_vector42, object, camera) {
      const invW = 1 / _vector42.w;
      _vector42.z *= invW;
      if (_vector42.z >= -1 && _vector42.z <= 1) {
        _sprite = getNextSpriteInPool();
        _sprite.id = object.id;
        _sprite.x = _vector42.x * invW;
        _sprite.y = _vector42.y * invW;
        _sprite.z = _vector42.z;
        _sprite.renderOrder = object.renderOrder;
        _sprite.object = object;
        _sprite.rotation = object.rotation;
        _sprite.scale.x = object.scale.x * Math.abs(_sprite.x - (_vector42.x + camera.projectionMatrix.elements[0]) / (_vector42.w + camera.projectionMatrix.elements[12]));
        _sprite.scale.y = object.scale.y * Math.abs(_sprite.y - (_vector42.y + camera.projectionMatrix.elements[5]) / (_vector42.w + camera.projectionMatrix.elements[13]));
        _sprite.material = object.material;
        _renderData.elements.push(_sprite);
      }
    }
    function getNextObjectInPool() {
      if (_objectCount === _objectPoolLength) {
        const object = new RenderableObject();
        _objectPool.push(object);
        _objectPoolLength++;
        _objectCount++;
        return object;
      }
      return _objectPool[_objectCount++];
    }
    function getNextVertexInPool() {
      if (_vertexCount === _vertexPoolLength) {
        const vertex = new RenderableVertex();
        _vertexPool.push(vertex);
        _vertexPoolLength++;
        _vertexCount++;
        return vertex;
      }
      return _vertexPool[_vertexCount++];
    }
    function getNextFaceInPool() {
      if (_faceCount === _facePoolLength) {
        const face = new RenderableFace();
        _facePool.push(face);
        _facePoolLength++;
        _faceCount++;
        return face;
      }
      return _facePool[_faceCount++];
    }
    function getNextLineInPool() {
      if (_lineCount === _linePoolLength) {
        const line = new RenderableLine();
        _linePool.push(line);
        _linePoolLength++;
        _lineCount++;
        return line;
      }
      return _linePool[_lineCount++];
    }
    function getNextSpriteInPool() {
      if (_spriteCount === _spritePoolLength) {
        const sprite = new RenderableSprite();
        _spritePool.push(sprite);
        _spritePoolLength++;
        _spriteCount++;
        return sprite;
      }
      return _spritePool[_spriteCount++];
    }
    function painterSort(a, b) {
      if (a.renderOrder !== b.renderOrder) {
        return a.renderOrder - b.renderOrder;
      } else if (a.z !== b.z) {
        return b.z - a.z;
      } else if (a.id !== b.id) {
        return a.id - b.id;
      } else {
        return 0;
      }
    }
    function clipTriangle(vertices) {
      _clipInput[0] = vertices[0];
      _clipInput[1] = vertices[1];
      _clipInput[2] = vertices[2];
      let inputCount = 3;
      let outputCount = 0;
      for (let p = 0; p < _clipPlanes.length; p++) {
        const plane = _clipPlanes[p];
        outputCount = 0;
        if (inputCount === 0) break;
        for (let i = 0; i < inputCount; i++) {
          const v1 = _clipInput[i];
          const v2 = _clipInput[(i + 1) % inputCount];
          const d1 = plane.sign * v1.z + v1.w;
          const d2 = plane.sign * v2.z + v2.w;
          const v1Inside = d1 >= 0;
          const v2Inside = d2 >= 0;
          if (v1Inside && v2Inside) {
            _clipOutput[outputCount++] = v1;
          } else if (v1Inside && !v2Inside) {
            _clipOutput[outputCount++] = v1;
            const t = d1 / (d1 - d2);
            let intersection = _clipVertexPool[outputCount];
            if (!intersection) {
              intersection = new Vector4();
              _clipVertexPool[outputCount] = intersection;
            }
            intersection.lerpVectors(v1, v2, t);
            _clipOutput[outputCount++] = intersection;
          } else if (!v1Inside && v2Inside) {
            const t = d1 / (d1 - d2);
            let intersection = _clipVertexPool[outputCount];
            if (!intersection) {
              intersection = new Vector4();
              _clipVertexPool[outputCount] = intersection;
            }
            intersection.lerpVectors(v1, v2, t);
            _clipOutput[outputCount++] = intersection;
          }
        }
        const temp = _clipInput;
        _clipInput = _clipOutput;
        _clipOutput = temp;
        inputCount = outputCount;
      }
      return inputCount;
    }
    function clipLine(s1, s2) {
      let alpha1 = 0, alpha2 = 1;
      const bc1near = s1.z + s1.w, bc2near = s2.z + s2.w, bc1far = -s1.z + s1.w, bc2far = -s2.z + s2.w;
      if (bc1near >= 0 && bc2near >= 0 && bc1far >= 0 && bc2far >= 0) {
        return true;
      } else if (bc1near < 0 && bc2near < 0 || bc1far < 0 && bc2far < 0) {
        return false;
      } else {
        if (bc1near < 0) {
          alpha1 = Math.max(alpha1, bc1near / (bc1near - bc2near));
        } else if (bc2near < 0) {
          alpha2 = Math.min(alpha2, bc1near / (bc1near - bc2near));
        }
        if (bc1far < 0) {
          alpha1 = Math.max(alpha1, bc1far / (bc1far - bc2far));
        } else if (bc2far < 0) {
          alpha2 = Math.min(alpha2, bc1far / (bc1far - bc2far));
        }
        if (alpha2 < alpha1) {
          return false;
        } else {
          s1.lerp(s2, alpha1);
          s2.lerp(s1, 1 - alpha2);
          return true;
        }
      }
    }
  }
};

// node_modules/three/examples/jsm/renderers/SVGRenderer.js
var SVGObject = class extends Object3D {
  /**
   * Constructs a new SVG object.
   *
   * @param {SVGElement} node - The SVG element.
   */
  constructor(node) {
    super();
    this.isSVGObject = true;
    this.node = node;
  }
};
var SVGRenderer = class {
  /**
   * Constructs a new SVG renderer.
   */
  constructor() {
    let _renderData, _elements, _lights, _svgWidth, _svgHeight, _svgWidthHalf, _svgHeightHalf, _v1, _v2, _v3, _svgNode, _pathCount = 0, _svgObjectCount = 0, _renderListCount = 0, _precision = null, _quality = 1, _currentPath, _currentStyle;
    const _this = this, _clipBox = new Box2(), _elemBox = new Box2(), _color = new Color(), _diffuseColor = new Color(), _ambientLight = new Color(), _directionalLights = new Color(), _pointLights = new Color(), _clearColor = new Color(), _vector3 = new Vector3(), _centroid = new Vector3(), _normal = new Vector3(), _normalViewMatrix = new Matrix3(), _viewMatrix = new Matrix4(), _viewProjectionMatrix = new Matrix4(), _svgPathPool = [], _svgObjectsPool = [], _renderListPool = [], _projector = new Projector(), _svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    this.domElement = _svg;
    this.autoClear = true;
    this.sortObjects = true;
    this.sortElements = true;
    this.overdraw = 0.5;
    this.outputColorSpace = SRGBColorSpace;
    this.info = {
      render: {
        vertices: 0,
        faces: 0
      }
    };
    this.setQuality = function(quality) {
      switch (quality) {
        case "high":
          _quality = 1;
          break;
        case "low":
          _quality = 0;
          break;
      }
    };
    this.setClearColor = function(color) {
      _clearColor.set(color);
    };
    this.setPixelRatio = function() {
    };
    this.setSize = function(width, height) {
      _svgWidth = width;
      _svgHeight = height;
      _svgWidthHalf = _svgWidth / 2;
      _svgHeightHalf = _svgHeight / 2;
      _svg.setAttribute("viewBox", -_svgWidthHalf + " " + -_svgHeightHalf + " " + _svgWidth + " " + _svgHeight);
      _svg.setAttribute("width", _svgWidth);
      _svg.setAttribute("height", _svgHeight);
      _clipBox.min.set(-_svgWidthHalf, -_svgHeightHalf);
      _clipBox.max.set(_svgWidthHalf, _svgHeightHalf);
    };
    this.getSize = function() {
      return {
        width: _svgWidth,
        height: _svgHeight
      };
    };
    this.setPrecision = function(precision) {
      _precision = precision;
    };
    function removeChildNodes() {
      _pathCount = 0;
      while (_svg.childNodes.length > 0) {
        _svg.removeChild(_svg.childNodes[0]);
      }
    }
    function convert(c) {
      return _precision !== null ? c.toFixed(_precision) : c;
    }
    function renderSort(a, b) {
      const aOrder = a.data.renderOrder !== void 0 ? a.data.renderOrder : 0;
      const bOrder = b.data.renderOrder !== void 0 ? b.data.renderOrder : 0;
      if (aOrder !== bOrder) {
        return aOrder - bOrder;
      } else {
        const aZ = a.data.z !== void 0 ? a.data.z : 0;
        const bZ = b.data.z !== void 0 ? b.data.z : 0;
        return bZ - aZ;
      }
    }
    this.clear = function() {
      removeChildNodes();
      _svg.style.backgroundColor = _clearColor.getStyle(_this.outputColorSpace);
    };
    this.render = function(scene, camera) {
      if (camera instanceof Camera === false) {
        console.error("THREE.SVGRenderer.render: camera is not an instance of Camera.");
        return;
      }
      const background = scene.background;
      if (background && background.isColor) {
        removeChildNodes();
        _svg.style.backgroundColor = background.getStyle(_this.outputColorSpace);
      } else if (this.autoClear === true) {
        this.clear();
      }
      _this.info.render.vertices = 0;
      _this.info.render.faces = 0;
      _viewMatrix.copy(camera.matrixWorldInverse);
      _viewProjectionMatrix.multiplyMatrices(camera.projectionMatrix, _viewMatrix);
      _renderData = _projector.projectScene(scene, camera, this.sortObjects, this.sortElements);
      _elements = _renderData.elements;
      _lights = _renderData.lights;
      _normalViewMatrix.getNormalMatrix(camera.matrixWorldInverse);
      calculateLights(_lights);
      _renderListCount = 0;
      for (let e = 0, el = _elements.length; e < el; e++) {
        const element = _elements[e];
        const material = element.material;
        if (material === void 0 || material.opacity === 0) continue;
        getRenderItem(_renderListCount++, "element", element, material);
      }
      _svgObjectCount = 0;
      scene.traverseVisible(function(object) {
        if (object.isSVGObject) {
          _vector3.setFromMatrixPosition(object.matrixWorld);
          _vector3.applyMatrix4(_viewProjectionMatrix);
          if (_vector3.z < -1 || _vector3.z > 1) return;
          const x = _vector3.x * _svgWidthHalf;
          const y = -_vector3.y * _svgHeightHalf;
          const svgObject = getSVGObjectData(_svgObjectCount++);
          svgObject.node = object.node;
          svgObject.x = x;
          svgObject.y = y;
          svgObject.z = _vector3.z;
          svgObject.renderOrder = object.renderOrder;
          getRenderItem(_renderListCount++, "svgObject", svgObject, null);
        }
      });
      _renderListPool.length = _renderListCount;
      if (this.sortElements && _svgObjectCount > 0) {
        _renderListPool.sort(renderSort);
      }
      _currentPath = "";
      _currentStyle = "";
      for (let i = 0; i < _renderListCount; i++) {
        const item = _renderListPool[i];
        if (item.type === "svgObject") {
          flushPath();
          const svgObject = item.data;
          const node = svgObject.node;
          node.setAttribute("transform", "translate(" + svgObject.x + "," + svgObject.y + ")");
          _svg.appendChild(node);
        } else {
          const element = item.data;
          const material = item.material;
          _elemBox.makeEmpty();
          if (element instanceof RenderableSprite) {
            _v1 = element;
            _v1.x *= _svgWidthHalf;
            _v1.y *= -_svgHeightHalf;
            renderSprite(_v1, element, material);
          } else if (element instanceof RenderableLine) {
            _v1 = element.v1;
            _v2 = element.v2;
            _v1.positionScreen.x *= _svgWidthHalf;
            _v1.positionScreen.y *= -_svgHeightHalf;
            _v2.positionScreen.x *= _svgWidthHalf;
            _v2.positionScreen.y *= -_svgHeightHalf;
            _elemBox.setFromPoints([_v1.positionScreen, _v2.positionScreen]);
            if (_clipBox.intersectsBox(_elemBox) === true) {
              renderLine(_v1, _v2, material);
            }
          } else if (element instanceof RenderableFace) {
            _v1 = element.v1;
            _v2 = element.v2;
            _v3 = element.v3;
            _v1.positionScreen.x *= _svgWidthHalf;
            _v1.positionScreen.y *= -_svgHeightHalf;
            _v2.positionScreen.x *= _svgWidthHalf;
            _v2.positionScreen.y *= -_svgHeightHalf;
            _v3.positionScreen.x *= _svgWidthHalf;
            _v3.positionScreen.y *= -_svgHeightHalf;
            if (this.overdraw > 0) {
              expand(_v1.positionScreen, _v2.positionScreen, this.overdraw);
              expand(_v2.positionScreen, _v3.positionScreen, this.overdraw);
              expand(_v3.positionScreen, _v1.positionScreen, this.overdraw);
            }
            _elemBox.setFromPoints([
              _v1.positionScreen,
              _v2.positionScreen,
              _v3.positionScreen
            ]);
            if (_clipBox.intersectsBox(_elemBox) === true) {
              renderFace3(_v1, _v2, _v3, element, material);
            }
          }
        }
      }
      flushPath();
    };
    function calculateLights(lights) {
      _ambientLight.setRGB(0, 0, 0);
      _directionalLights.setRGB(0, 0, 0);
      _pointLights.setRGB(0, 0, 0);
      for (let l = 0, ll = lights.length; l < ll; l++) {
        const light = lights[l];
        const lightColor = light.color;
        if (light.isAmbientLight) {
          _ambientLight.r += lightColor.r;
          _ambientLight.g += lightColor.g;
          _ambientLight.b += lightColor.b;
        } else if (light.isDirectionalLight) {
          _directionalLights.r += lightColor.r;
          _directionalLights.g += lightColor.g;
          _directionalLights.b += lightColor.b;
        } else if (light.isPointLight) {
          _pointLights.r += lightColor.r;
          _pointLights.g += lightColor.g;
          _pointLights.b += lightColor.b;
        }
      }
    }
    function calculateLight(lights, position, normal, color) {
      for (let l = 0, ll = lights.length; l < ll; l++) {
        const light = lights[l];
        const lightColor = light.color;
        if (light.isDirectionalLight) {
          const lightPosition = _vector3.setFromMatrixPosition(light.matrixWorld).normalize();
          let amount = normal.dot(lightPosition);
          if (amount <= 0) continue;
          amount *= light.intensity;
          color.r += lightColor.r * amount;
          color.g += lightColor.g * amount;
          color.b += lightColor.b * amount;
        } else if (light.isPointLight) {
          const lightPosition = _vector3.setFromMatrixPosition(light.matrixWorld);
          let amount = normal.dot(_vector3.subVectors(lightPosition, position).normalize());
          if (amount <= 0) continue;
          amount *= light.distance == 0 ? 1 : 1 - Math.min(position.distanceTo(lightPosition) / light.distance, 1);
          if (amount == 0) continue;
          amount *= light.intensity;
          color.r += lightColor.r * amount;
          color.g += lightColor.g * amount;
          color.b += lightColor.b * amount;
        }
      }
    }
    function renderSprite(v1, element, material) {
      let scaleX = element.scale.x * _svgWidthHalf;
      let scaleY = element.scale.y * _svgHeightHalf;
      if (material.isPointsMaterial) {
        scaleX *= material.size;
        scaleY *= material.size;
      }
      const path = "M" + convert(v1.x - scaleX * 0.5) + "," + convert(v1.y - scaleY * 0.5) + "h" + convert(scaleX) + "v" + convert(scaleY) + "h" + convert(-scaleX) + "z";
      let style = "";
      if (material.isSpriteMaterial || material.isPointsMaterial) {
        style = "fill:" + material.color.getStyle(_this.outputColorSpace) + ";fill-opacity:" + material.opacity;
      }
      addPath(style, path);
    }
    function renderLine(v1, v2, material) {
      const path = "M" + convert(v1.positionScreen.x) + "," + convert(v1.positionScreen.y) + "L" + convert(v2.positionScreen.x) + "," + convert(v2.positionScreen.y);
      if (material.isLineBasicMaterial) {
        let style = "fill:none;stroke:" + material.color.getStyle(_this.outputColorSpace) + ";stroke-opacity:" + material.opacity + ";stroke-width:" + material.linewidth + ";stroke-linecap:" + material.linecap;
        if (material.isLineDashedMaterial) {
          style = style + ";stroke-dasharray:" + material.dashSize + "," + material.gapSize;
        }
        addPath(style, path);
      }
    }
    function renderFace3(v1, v2, v3, element, material) {
      _this.info.render.vertices += 3;
      _this.info.render.faces++;
      const path = "M" + convert(v1.positionScreen.x) + "," + convert(v1.positionScreen.y) + "L" + convert(v2.positionScreen.x) + "," + convert(v2.positionScreen.y) + "L" + convert(v3.positionScreen.x) + "," + convert(v3.positionScreen.y) + "z";
      let style = "";
      if (material.isMeshBasicMaterial) {
        _color.copy(material.color);
        if (material.vertexColors) {
          _color.multiply(element.color);
        }
      } else if (material.isMeshLambertMaterial || material.isMeshPhongMaterial || material.isMeshStandardMaterial) {
        _diffuseColor.copy(material.color);
        if (material.vertexColors) {
          _diffuseColor.multiply(element.color);
        }
        _color.copy(_ambientLight);
        _centroid.copy(v1.positionWorld).add(v2.positionWorld).add(v3.positionWorld).divideScalar(3);
        calculateLight(_lights, _centroid, element.normalModel, _color);
        _color.multiply(_diffuseColor).add(material.emissive);
      } else if (material.isMeshNormalMaterial) {
        _normal.copy(element.normalModel).applyMatrix3(_normalViewMatrix).normalize();
        _color.setRGB(_normal.x, _normal.y, _normal.z).multiplyScalar(0.5).addScalar(0.5);
      }
      if (material.wireframe) {
        style = "fill:none;stroke:" + _color.getStyle(_this.outputColorSpace) + ";stroke-opacity:" + material.opacity + ";stroke-width:" + material.wireframeLinewidth + ";stroke-linecap:" + material.wireframeLinecap + ";stroke-linejoin:" + material.wireframeLinejoin;
      } else {
        style = "fill:" + _color.getStyle(_this.outputColorSpace) + ";fill-opacity:" + material.opacity;
      }
      addPath(style, path);
    }
    function expand(v1, v2, pixels) {
      let x = v2.x - v1.x, y = v2.y - v1.y;
      const det = x * x + y * y;
      if (det === 0) return;
      const idet = pixels / Math.sqrt(det);
      x *= idet;
      y *= idet;
      v2.x += x;
      v2.y += y;
      v1.x -= x;
      v1.y -= y;
    }
    function addPath(style, path) {
      if (_currentStyle === style) {
        _currentPath += path;
      } else {
        flushPath();
        _currentStyle = style;
        _currentPath = path;
      }
    }
    function flushPath() {
      if (_currentPath) {
        _svgNode = getPathNode(_pathCount++);
        _svgNode.setAttribute("d", _currentPath);
        _svgNode.setAttribute("style", _currentStyle);
        _svg.appendChild(_svgNode);
      }
      _currentPath = "";
      _currentStyle = "";
    }
    function getPathNode(id) {
      let path = _svgPathPool[id];
      if (path === void 0) {
        path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        if (_quality == 0) {
          path.setAttribute("shape-rendering", "crispEdges");
        }
        _svgPathPool[id] = path;
      }
      return path;
    }
    function getSVGObjectData(id) {
      let svgObject = _svgObjectsPool[id];
      if (svgObject === void 0) {
        svgObject = {
          node: null,
          x: 0,
          y: 0,
          z: 0,
          renderOrder: 0
        };
        _svgObjectsPool[id] = svgObject;
      }
      return svgObject;
    }
    function getRenderItem(id, type, data, material) {
      let item = _renderListPool[id];
      if (item === void 0) {
        item = {
          type,
          data,
          material
        };
        _renderListPool[id] = item;
        return item;
      }
      item.type = type;
      item.data = data;
      item.material = material;
      return item;
    }
  }
};
export {
  SVGObject,
  SVGRenderer
};
//# sourceMappingURL=three_examples_jsm_renderers_SVGRenderer__js.js.map
