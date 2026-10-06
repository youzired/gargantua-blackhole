// main.js — bootstrap & orchestration.

import { Engine } from './engine.js';
import { CameraRig } from './camera.js';
import { HUD } from './hud.js';
import { Ambience } from './audio.js';
import { installShotAPI, tickShot } from './shot.js';
import { loadState, saveState, saveStateNow, defaultParams, clamp } from './params.js';

const url = new URL(location.href);
const canvas = document.getElementById('gl');
const overlay = document.getElementById('fatal');
const glstatus = document.getElementById('glstatus');

function fatal(title, msg) {
  overlay.classList.remove('hidden');
  overlay.querySelector('h2').textContent = title;
  overlay.querySelector('p').textContent = msg;
}

// ---- WebGL2 gate -----------------------------------------------------------
try {
  const probe = document.createElement('canvas');
  if (!probe.getContext('webgl2')) throw new Error('no webgl2');
} catch (e) {
  fatal('WebGL 2 unavailable',
    'GARGANTUA needs a WebGL2 context (hardware acceleration on). ' +
    'Try a recent Chrome / Firefox / Edge / Safari with GPU acceleration enabled.');
  throw e;
}

// ---- core objects ----------------------------------------------------------
if (url.searchParams.has('reset')) { try { localStorage.removeItem('gargantua.state.v2'); } catch (e) {} }
const state = loadState();
let engine, rig, hud;

function build() {
  engine = new Engine(canvas, state, null);
  rig = new CameraRig(canvas, state, { onUserInterrupt: () => hud.setCinematic(false) });
  engine.camera = rig.camera;
  engine.stateRef = state;
  rig.setAspect(innerWidth / innerHeight);
  hud = new HUD(state, {
    onParam: (id) => { saveState(state); },
    onQuality: q => { engine.setQuality(q); hud.setQuality(q); rig.setAspect(innerWidth / innerHeight); saveState(state); },
    onPreset: id => { rig.applyPreset(id); hud.setPresetActive(id); hud.setCinematic(false); saveState(state); },
    onCinematic: () => { rig.setCinematic(!rig.cinematic); hud.setCinematic(rig.cinematic); },
    onDebug: i => { state.debug = i; hud.setDebug(i); saveState(state); },
    onAudio: () => amb.toggle(),
    onReset: () => { Object.assign(state.params, defaultParams()); hud.refreshParams(); saveState(state); },
  });
}

const amb = new Ambience(state);
build();

// restore camera & preset (unless a shot script is in charge)
if (!url.searchParams.has('shot')) {
  rig.restoreFromState();
  if (state.preset) hud.setPresetActive(state.preset);
}
hud.setQuality(state.quality);
hud.setDebug(state.debug);
hud.setAudio(false);
state.audio.on = false;   // autoplay policy: never auto-resume; keep UI/state in sync

// ---- shot automation --------------------------------------------------------
const shotAPI = installShotAPI({ engine, rig, hud, state, save: () => saveStateNow(state), url });
engine.resetParamsToDefaults = () => { Object.assign(state.params, defaultParams()); hud.refreshParams(); };
shotAPI.resetParams = () => { engine.resetParamsToDefaults(); saveState(state); return true; };

// ---- keyboard ---------------------------------------------------------------
addEventListener('keydown', (e) => {
  if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
  const k = e.key;
  if (k >= '0' && k <= '9' && !e.altKey && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
    state.debug = +k; hud.setDebug(state.debug); saveState(state); return;
  }
  if ((e.altKey || e.shiftKey) && k >= '1' && k <= '4') {
    const id = +k;
    rig.applyPreset(id); hud.setPresetActive(id); hud.setCinematic(false); saveState(state);
    e.preventDefault(); return;
  }
  switch (k.toLowerCase()) {
    case 'h': hud.togglePanel(); break;
    case 'c': rig.setCinematic(!rig.cinematic); hud.setCinematic(rig.cinematic); break;
    case 'p': state.paused = !state.paused; saveState(state); break;
    case 'a': amb.toggle(); saveState(state); break;
    case 'f': toggleFullscreen(); break;
    case 'r': rig.restoreFromState(); rig.applyPreset(state.preset || 1); break;
    case '[': state.timeScale = clamp(state.timeScale / 1.25, 0.1, 3); saveState(state); break;
    case ']': state.timeScale = clamp(state.timeScale * 1.25, 0.1, 3); saveState(state); break;
    case '?': hud.toggleHelp(); break;
    case 'escape': hud.toggleHelp(false); break;
  }
  if (k === '/') { e.preventDefault(); hud.toggleHelp(); }
});

function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen?.().catch(() => {});
}

// ---- resize ------------------------------------------------------------------
let resizeT = 0;
addEventListener('resize', () => {
  clearTimeout(resizeT);
  resizeT = setTimeout(() => { rig.setAspect(innerWidth / innerHeight); engine.resize(); }, 80);
});
addEventListener('orientationchange', () => setTimeout(() => { rig.setAspect(innerWidth / innerHeight); engine.resize(); }, 300));

// ---- GL context loss watchdog -----------------------------------------------
let lostTimer = 0;
engine.addEventListener('glstatus', (e) => {
  if (e.detail === 'lost') {
    glstatus.classList.remove('hidden');
    clearTimeout(lostTimer);
    lostTimer = setTimeout(() => { try { engine.forceContextRestore(); } catch (err) { /* noop */ } }, 1600);
  } else {
    clearTimeout(lostTimer);
    glstatus.classList.add('hidden');
  }
});

// ---- main loop ----------------------------------------------------------------
let last = performance.now();
let statT = 0;
let firstDone = false;
let retries = 0;

function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.min((now - last) / 1000, 0.06);
  last = now;
  if (document.hidden) return;

  rig.update(dt);
  engine.advanceTime(dt);
  try {
    engine.render();
    if (!firstDone) {
      firstDone = true;
      window.__GARGANTUA_READY__ = true;
      shotAPI.ready = true;
      hud.reveal();
      if (amb.ready === false && state.audio.on) { /* needs user gesture; skipped silently */ }
    }
  } catch (err) {
    console.error('[gargantua] render error:', err);
    if (retries++ < 2) {
      state.params.steps = Math.max(128, state.params.steps - 96);
      engine.renderScaleBoost *= 0.75;
      engine.resize();
      hud.refreshParams();
    } else {
      fatal('Renderer fault', 'The shader pipeline failed repeatedly: ' + (err && err.message || err));
      throw err;
    }
  }

  statT += dt;
  if (statT > 0.25) {
    statT = 0;
    engine.stats.time = engine.simTime;
    hud.updateStats(engine.stats, rig);
  }
  tickShot(shotAPI, engine);
}
requestAnimationFrame(frame);

// ---- persistence on exit -------------------------------------------------------
addEventListener('pagehide', () => { rig.syncFromCamera(); saveStateNow(state); });
addEventListener('beforeunload', () => { rig.syncFromCamera(); saveStateNow(state); });

// ---- mobile niceties --------------------------------------------------------------
if (matchMedia('(pointer: coarse)').matches) {
  canvas.addEventListener('touchstart', () => { if (amb.ctx && amb.ctx.state === 'suspended') amb.ctx.resume(); }, { passive: true, once: true });
}
addEventListener('error', (ev) => {
  if (/WebGL|shader|GL/i.test(String(ev.message))) fatal('GPU fault', ev.message);
});
