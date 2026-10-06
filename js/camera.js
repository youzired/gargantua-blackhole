// camera.js — OrbitControls rig, view presets with eased transitions,
// and the looping cinematic camera.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { VIEW_PRESETS, PARAM_DEFS, clamp } from './params.js';

const easeInOut = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

export class CameraRig {
  constructor(canvas, state, { onUserInterrupt } = {}) {
    this.state = state;
    this.camera = new THREE.PerspectiveCamera(state.camera.fov, 1, 0.05, 4000);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.06;
    this.controls.enablePan = false;
    this.controls.minDistance = 2.15;     // never cross the horizon (r = 1)
    this.controls.maxDistance = 320;
    this.controls.rotateSpeed = 0.55;
    this.controls.zoomSpeed = 0.85;
    this.controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_ROTATE };

    this.sph = new THREE.Spherical(state.camera.radius, state.camera.theta, state.camera.phi);
    // THREE.Spherical(radius, phi=polar, theta=azimuth) — map preset fields accordingly
    this._applySpherical();

    this.tween = null;
    this.cinematic = false;
    this.cineT = 0;
    this.onUserInterrupt = onUserInterrupt;

    this.controls.addEventListener('start', () => {
      if (this.cinematic) this.setCinematic(false);
      this.tween = null;
      if (this.onUserInterrupt) this.onUserInterrupt();
    });

    // cinematic keyframes (preset cam uses {theta: polar, phi: azimuth})
    this.keys = VIEW_PRESETS.map(p => sphericalToVec(new THREE.Spherical(p.cam.radius, p.cam.theta, p.cam.phi)));
    this.curve = new THREE.CatmullRomCurve3(this.keys, true, 'catmullrom', 0.4);
  }

  setCinematic(on) {
    if (on === this.cinematic) return;
    this.cinematic = on;
    this.controls.enabled = !on;
    if (on) {
      // sync cineT to nearest point on curve
      const p = this.camera.position.clone();
      let best = 0, bd = Infinity;
      for (let i = 0; i <= 240; i++) {
        const t = i / 240;
        const d = this.curve.getPoint(t).distanceToSquared(p);
        if (d < bd) { bd = d; best = t; }
      }
      this.cineT = best;
    } else {
      this.syncFromCamera();
    }
  }

  syncFromCamera() {
    const off = this.camera.position.clone().sub(this.controls.target);
    this.sph.setFromVector3(off);
    const c = this.state.camera;
    c.radius = this.sph.radius; c.theta = this.sph.theta; c.phi = this.sph.phi; c.fov = this.camera.fov;
  }

  _applySpherical() {
    this.sph.radius = clamp(this.sph.radius, 2.15, 320);
    this.sph.phi = clamp(this.sph.phi, 0.02, Math.PI - 0.02);
    this.camera.position.setFromSpherical(this.sph);
    this.camera.lookAt(0, 0, 0);
    this.camera.updateMatrixWorld();
  }

  setAspect(a) { this.camera.aspect = a; this.camera.updateProjectionMatrix(); }
  restoreFromState() {
    const c = this.state.camera;
    this.sph = new THREE.Spherical(c.radius, c.theta, c.phi); // see note below
    // state stores {radius, theta(=polar), phi(=azimuth)} — normalize into THREE's (phi=polar)
    this.sph = new THREE.Spherical(c.radius, c.theta, c.phi);
    this.sph.phi = clamp(c.theta, 0.02, Math.PI - 0.02);
    this.sph.theta = c.phi;
    this.camera.fov = clamp(c.fov || 48, 15, 90);
    this.camera.updateProjectionMatrix();
    this._applySpherical();
    this.controls.update();
  }

  applyPreset(idx, instant = false) {
    const preset = VIEW_PRESETS.find(p => p.id === idx) || VIEW_PRESETS[0];
    this.state.preset = idx;
    const from = {
      radius: this.sph.radius, polar: this.sph.phi, azim: this.sph.theta, fov: this.camera.fov,
      params: {},
    };
    const to = {
      radius: preset.cam.radius, polar: preset.cam.theta, azim: preset.cam.phi, fov: preset.cam.fov,
    };
    // normalize azimuth to shortest path
    while (to.azim - from.azim > Math.PI) to.azim -= 2 * Math.PI;
    while (to.azim - from.azim < -Math.PI) to.azim += 2 * Math.PI;

    const paramFrom = {}, paramTo = {};
    for (const d of PARAM_DEFS) {
      paramFrom[d.id] = this.state.params[d.id];
      paramTo[d.id] = (preset.params[d.id] !== undefined) ? preset.params[d.id] : this.state.params[d.id];
    }
    if (instant) {
      this._tweenTo(1, from, to, paramFrom, paramTo);
      Object.assign(this.state.params, paramTo);
      this.syncFromCamera();
      return;
    }
    this.tween = { t: 0, dur: 2.2, from, to, paramFrom, paramTo };
    if (this.cinematic) this.setCinematic(false);
  }

  _tweenTo(k, from, to, pf, pt) {
    this.sph.radius = lerp(from.radius, to.radius, k);
    this.sph.phi = clamp(lerp(from.polar, to.polar, k), 0.02, Math.PI - 0.02);
    this.sph.theta = lerp(from.azim, to.azim, k);
    this.camera.fov = lerp(from.fov, to.fov, k);
    this.camera.updateProjectionMatrix();
    this._applySpherical();
    for (const id in pt) this.state.params[id] = lerp(pf[id], pt[id], k);
  }

  update(dt) {
    if (this.tween) {
      this.tween.t += dt;
      const k = easeInOut(clamp(this.tween.t / this.tween.dur, 0, 1));
      this._tweenTo(k, this.tween.from, this.tween.to, this.tween.paramFrom, this.tween.paramTo);
      if (this.tween.t >= this.tween.dur) { this.syncFromCamera(); this.tween = null; }
      return;
    }
    if (this.cinematic) {
      this.cineT += dt / 90;            // full loop ~90 s
      const seg = this.cineT * this.keys.length;
      // dwell easing: slow near keyframes, faster between
      const segF = Math.floor(seg);
      const f = seg - segF;
      const eased = (segF + easeInOut(f)) / this.keys.length;
      const p = this.curve.getPoint(eased % 1);
      // breathing + slow roll
      const br = 1 + 0.06 * Math.sin(this.cineT * Math.PI * 2 * 2);
      this.camera.position.copy(p).multiplyScalar(br);
      this.camera.lookAt(0, 0, 0);
      const fovBase = 46 + 8 * Math.sin(this.cineT * Math.PI * 2);
      this.camera.fov = fovBase;
      this.camera.updateProjectionMatrix();
      this.camera.updateMatrixWorld();
      return;
    }
    this.controls.update();
    this.syncFromCamera();
  }

  get info() {
    return {
      radius: this.sph.radius,
      polarDeg: (this.sph.phi * 180 / Math.PI).toFixed(1),
      azimDeg: (((this.sph.theta * 180 / Math.PI) % 360 + 360) % 360).toFixed(1),
      fov: this.camera.fov.toFixed(0),
    };
  }
}

function sphericalToVec(s) { const v = new THREE.Vector3(); v.setFromSpherical(s); return v; }
function lerp(a, b, t) { return a + (b - a) * t; }
