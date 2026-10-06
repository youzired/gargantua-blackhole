// engine.js — WebGL2 renderer, HDR scene pass, bloom pyramid, composite,
// quality tiers, adaptive resolution, context-loss recovery.

import * as THREE from 'three';
import { GLSL_COMMON, GLSL_QUAD_VERT } from './shaders/util.js';
import { SCENEF } from './shaders/scene.js';
import { BRIGHTF, BLURF, COMPOSITEF } from './shaders/post.js';
import { QUALITY_TIERS, clamp } from './params.js';

const MAX_BLOOM = 5;

export class Engine extends EventTarget {
  constructor(canvas, state, camera) {
    super();
    this.canvas = canvas;
    this.state = state;
    this.camera = camera;
    this.seed = Math.random() * 100;
    this.simTime = 0;
    this.frame = 0;
    this.lost = false;
    this.renderScaleBoost = 1;
    this.stats = { fps: 0, ms: 0, pixels: 0, bufferW: 0, bufferH: 0 };
    this._fpsAcc = 0; this._fpsN = 0; this._lastT = performance.now();

    this.renderer = new THREE.WebGLRenderer({
      canvas, antialias: false, alpha: false, depth: false, stencil: false,
      powerPreference: 'high-performance', preserveDrawingBuffer: true,
    });
    this.renderer.setClearColor(0x000000, 1);

    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    this.quad.frustumCulled = false;
    this.scene = new THREE.Scene();
    this.scene.add(this.quad);
    this.ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    this._buildMaterials();
    this._buildTargets();
    this._hookContext();
    this.resize();
  }

  _mkMat(fragment, uniforms) {
    const m = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: GLSL_QUAD_VERT,
      fragmentShader: GLSL_COMMON + fragment,
      depthTest: false, depthWrite: false,
    });
    Object.assign(m.uniforms, uniforms);
    return m;
  }

  _buildMaterials() {
    const p = this.state.params;
    this.uScene = {
      uRes:   { value: new THREE.Vector2(1, 1) },
      uCamMat:{ value: new THREE.Matrix4() },
      uTime:  { value: 0 }, uFov: { value: 48 }, uSeed: { value: this.seed },
      uSteps: { value: p.steps }, uLens: { value: p.lensStrength }, uEscape: { value: p.escapeRadius },
      uDiskIn: { value: p.diskInner }, uDiskOut: { value: p.diskOuter },
      uThick:  { value: p.diskThickness }, uDens: { value: p.diskDensity },
      uTemp:   { value: p.diskTemp }, uLum: { value: p.diskLum },
      uTurb:   { value: p.turbIntensity }, uTurbScl: { value: p.turbScale },
      uRot:    { value: p.diskRotation }, uBeam: { value: p.beaming },
      uRedsh:  { value: p.redshift }, uTint: { value: p.spectralTint },
      uStarD:  { value: p.starDensity }, uStarB: { value: p.starBrightness },
      uGalB:   { value: p.galaxyBright },
      uDebug:  { value: 0 },
    };
    this.uBright = { uTex: { value: null }, uThresh: { value: 2.0 } };
    this.uBlur   = { uTex: { value: null }, uDir: { value: new THREE.Vector2() } };
    this.uComp = {
      uScene:  { value: null },
      uBloom:  { value: Array.from({ length: MAX_BLOOM }, () => this._black()) },
      uBloomOn:{ value: [0, 0, 0, 0, 0] },
      uExposure: { value: 1 }, uBloomStr: { value: .85 }, uGrain: { value: .26 },
      uAberr: { value: 0.0016 }, uTime: { value: 0 }, uMode: { value: 0 },
      uRes: { value: new THREE.Vector2(1, 1) },
    };

    this.matScene = this._mkMat(SCENEF, this.uScene);
    this.matBright = this._mkMat(BRIGHTF, this.uBright);
    this.matBlur = this._mkMat(BLURF, this.uBlur);
    this.matComp = this._mkMat(COMPOSITEF, this.uComp);
    this.quadMat = this.matScene;
  }

  _black() {
    const t = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
    t.needsUpdate = true;
    return t;
  }

  _buildTargets() {
    const opts = {
      type: THREE.HalfFloatType, format: THREE.RGBAFormat,
      minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
      depthBuffer: false, stencilBuffer: false, generateMipmaps: false,
      wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping,
    };
    this.rtScene = new THREE.WebGLRenderTarget(2, 2, opts);
    this.rtBright = new THREE.WebGLRenderTarget(2, 2, opts);
    this.rtBloom = [];
    for (let i = 0; i < MAX_BLOOM; i++) {
      this.rtBloom.push({ a: new THREE.WebGLRenderTarget(2, 2, opts), b: new THREE.WebGLRenderTarget(2, 2, opts) });
    }
  }

  _hookContext() {
    const c = this.canvas;
    this._onLost = (e) => { e.preventDefault(); this.lost = true; this.dispatchEvent(new CustomEvent('glstatus', { detail: 'lost' })); };
    this._onRestored = () => {
      this.lost = false;
      try {
        for (const b of this.rtBloom) { b.a.dispose(); b.b.dispose(); }
        this.rtScene.dispose(); this.rtBright.dispose();
        this._buildTargets();
        this.resize();
      } catch (err) { console.warn('[gargantua] RT rebuild after restore failed:', err); }
      this.dispatchEvent(new CustomEvent('glstatus', { detail: 'restored' }));
    };
    c.addEventListener('webglcontextlost', this._onLost, false);
    c.addEventListener('webglcontextrestored', this._onRestored, false);
  }

  get tier() { return QUALITY_TIERS[this.state.quality] || QUALITY_TIERS.standard; }

  resize() {
    const { innerWidth: w, innerHeight: h } = window;
    const tier = this.tier;
    let pr = Math.min(window.devicePixelRatio || 1, tier.dprCap) * tier.scale * this.renderScaleBoost;
    pr = clamp(pr, 0.4, 2.5);
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h, false);
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    const W = Math.max(2, size.x | 0), H = Math.max(2, size.y | 0);

    this.rtScene.setSize(W, H);
    this.rtBright.setSize(W >> 1, H >> 1);
    let bw = W >> 2, bh = H >> 2;
    for (let i = 0; i < MAX_BLOOM; i++) {
      const w = Math.max(4, bw >> i), h2 = Math.max(4, bh >> i);
      this.rtBloom[i].a.setSize(w, h2);
      this.rtBloom[i].b.setSize(w, h2);
    }
    this.uScene.uRes.value.set(W, H);
    this.uComp.uRes.value.set(W, H);
    this.stats.bufferW = W; this.stats.bufferH = H; this.stats.pixels = W * H;
  }

  setQuality(q) {
    if (!QUALITY_TIERS[q]) return;
    this.state.quality = q;
    this.resize();
  }

  _syncUniforms() {
    const p = this.state.params, u = this.uScene;
    u.uFov.value = this.camera.fov;
    u.uTime.value = this.simTime;
    u.uSteps.value = Math.round(clamp(p.steps * this.tier.stepMul, 64, 960));
    u.uLens.value = p.lensStrength;
    u.uEscape.value = p.escapeRadius;
    u.uDiskIn.value = Math.min(p.diskInner, p.diskOuter - 1);
    u.uDiskOut.value = Math.max(p.diskOuter, p.diskInner + 1);
    u.uThick.value = p.diskThickness;
    u.uDens.value = p.diskDensity;
    u.uTemp.value = p.diskTemp;
    u.uLum.value = p.diskLum;
    u.uTurb.value = p.turbIntensity;
    u.uTurbScl.value = p.turbScale;
    u.uRot.value = p.diskRotation;
    u.uBeam.value = p.beaming;
    u.uRedsh.value = p.redshift;
    u.uTint.value = p.spectralTint;
    u.uStarD.value = p.starDensity;
    u.uStarB.value = p.starBrightness;
    u.uGalB.value = p.galaxyBright;
    u.uDebug.value = this.state.debug | 0;

    const c = this.uComp;
    c.uExposure.value = p.exposure;
    c.uBloomStr.value = p.bloomStrength;
    c.uGrain.value = p.grain;
    c.uTime.value = this.simTime;
    const d = this.state.debug | 0;
    c.uMode.value = d === 0 ? 0 : d === 1 ? 1 : d === 8 ? 8 : 2;
    const ab = this.state.quality === 'cinematic' ? 0.0022 : this.state.quality === 'high' ? 0.0016 : 0.0012;
    c.uAberr.value = d === 0 ? ab : 0;
  }

  _drawTo(mat, target) {
    this.quadMat = mat;
    this.quad.material = mat;
    this.renderer.setRenderTarget(target || null);
    this.renderer.render(this.scene, this.ortho);
  }

  render() {
    if (this.lost) return;
    const t0 = performance.now();
    this._syncUniforms();
    this.camera.updateMatrixWorld();
    this.uScene.uCamMat.value.copy(this.camera.matrixWorld);

    // 1. geodesic pass -> HDR
    this._drawTo(this.matScene, this.rtScene);

    // 2. bright pass
    this.uBright.uTex.value = this.rtScene.texture;
    this._drawTo(this.matBright, this.rtBright);

    // 3. blur pyramid
    const levels = Math.min(this.tier.bloomLevels, MAX_BLOOM);
    let src = this.rtBright.texture;
    for (let i = 0; i < levels; i++) {
      const A = this.rtBloom[i].a, B = this.rtBloom[i].b;
      // downsample (linear filter copy) from src into A
      this.uBlur.uTex.value = src;
      this.uBlur.uDir.value.set(0, 0);
      this._drawTo(this.matBlur, A);
      for (let it = 0; it < this.tier.blurIter; it++) {
        const spread = 1 + it * 0.6;
        this.uBlur.uTex.value = A.texture;
        this.uBlur.uDir.value.set(spread / A.width, 0);
        this._drawTo(this.matBlur, B);
        this.uBlur.uTex.value = B.texture;
        this.uBlur.uDir.value.set(0, spread / A.height);
        this._drawTo(this.matBlur, A);
      }
      src = A.texture;
      this.uComp.uBloom.value[i] = A.texture;
      this.uComp.uBloomOn.value[i] = [1, 0.72, 0.52, 0.38, 0.28][i];
    }
    for (let i = levels; i < MAX_BLOOM; i++) {
      this.uComp.uBloom.value[i] = this._blackTex || (this.uComp.uBloom.value[i]);
      this.uComp.uBloomOn.value[i] = 0;
    }

    // 4. composite -> screen
    this.uComp.uScene.value = this.rtScene.texture;
    this._drawTo(this.matComp, null);
    this.renderer.setRenderTarget(null);

    // adaptive resolution guard (software GPUs)
    const ms = performance.now() - t0;
    this.stats.ms = this.stats.ms * 0.9 + ms * 0.1;
    this.frame++;
    if (this.frame % 45 === 0 && !this.state.autoScaleOff) {
      if (this.stats.ms > 55 && this.renderScaleBoost > 0.55) {
        this.renderScaleBoost = Math.max(0.55, this.renderScaleBoost - 0.1);
        this.resize();
      } else if (this.stats.ms < 22 && this.renderScaleBoost < 1) {
        this.renderScaleBoost = Math.min(1, this.renderScaleBoost + 0.05);
        this.resize();
      }
    }
    // fps
    const now = performance.now();
    const dt = now - this._lastT; this._lastT = now;
    this._fpsAcc += dt; this._fpsN++;
    if (this._fpsAcc > 500) { this.stats.fps = 1000 / (this._fpsAcc / this._fpsN); this._fpsAcc = 0; this._fpsN = 0; }
  }

  advanceTime(dt) {
    if (!this.state.paused) this.simTime += dt * this.state.timeScale;
  }

  forceContextRestore() {
    const ext = this.renderer.getContext().getExtension('WEBGL_lose_context');
    if (ext) ext.restoreContext();
  }

  dispose() {
    const c = this.canvas;
    c.removeEventListener('webglcontextlost', this._onLost);
    c.removeEventListener('webglcontextrestored', this._onRestored);
    this.rtScene.dispose(); this.rtBright.dispose();
    for (const b of this.rtBloom) { b.a.dispose(); b.b.dispose(); }
    this.matScene.dispose(); this.matBright.dispose(); this.matBlur.dispose(); this.matComp.dispose();
    this.renderer.dispose();
  }
}
