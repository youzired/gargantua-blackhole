// shot.js — headless automation surface.
//
// URL interface (all optional):
//   ?shot=1&preset=3&debug=0&q=cinematic&frames=90&t=42&seed=7&w=1600&h=900&scale=1
//   ?params=<base64url JSON of {id:value,...}>
// After the requested frames are rendered deterministically the page sets
//   window.__SHOT_READY__ = true;  window.__SHOT__ = <dataURL>;
// and logs  GARGANTUA_SHOT_READY  to the console.
//
// JS API:  window.GARGANTUA.capture() -> dataURL, .setParam(), .applyPreset(), ...

export function installShotAPI({ engine, rig, hud, state, save, url }) {
  const api = {
    version: '2.0.0',
    ready: false,
    info() {
      return {
        fps: +engine.stats.fps.toFixed(1), ms: +engine.stats.ms.toFixed(2),
        buffer: [engine.stats.bufferW, engine.stats.bufferH],
        quality: state.quality, debug: state.debug, preset: state.preset,
        simTime: +engine.simTime.toFixed(3), frame: engine.frame,
        camera: rig.info, params: { ...state.params },
      };
    },
    setParam(id, v) {
      if (!(id in state.params)) return false;
      state.params[id] = +v; hud.refreshParams(); save(); return true;
    },
    setParams(obj) { Object.entries(obj || {}).forEach(([k, v]) => api.setParam(k, v)); return true; },
    getParam(id) { return state.params[id]; },
    applyPreset(n, instant = true) { rig.applyPreset(+n, instant); hud.setPresetActive(+n); return true; },
    setDebug(n) { state.debug = (+n | 0) % 10; hud.setDebug(state.debug); save(); return state.debug; },
    setQuality(q) { if (QUALITIES.includes(q)) { engine.setQuality(q); hud.setQuality(q); save(); } return state.quality; },
    setCinematic(on) { rig.setCinematic(!!on); hud.setCinematic(rig.cinematic); return rig.cinematic; },
    pause(on = true) { state.paused = !!on; return state.paused; },
    setTime(t) { engine.simTime = +t; return engine.simTime; },
    setSeed(s) { engine.seed = +s; engine.uScene.uSeed.value = engine.seed; return engine.seed; },
    setView(w, h, pixelScale = 1) {
      document.documentElement.style.setProperty('--shot-w', w + 'px');
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: +w });
      Object.defineProperty(window, 'innerHeight', { configurable: true, value: +h });
      engine.renderScaleBoost = Math.min(Math.max(pixelScale, 0.25), 1.5);
      engine.resize();
      return [engine.stats.bufferW, engine.stats.bufferH];
    },
    capture(kind = 'image/png') { return engine.canvas.toDataURL(kind); },
    resetParams() { engine.resetParamsToDefaults?.(); return true; },
    exportState() { return JSON.stringify(state); },
    importState(json) {
      try { const j = JSON.parse(json); Object.assign(state, j); hud.refreshParams(); return true; }
      catch { return false; }
    },
  };
  const QUALITIES = ['standard', 'high', 'cinematic'];
  window.GARGANTUA = api;
  window.__GARGANTUA_READY__ = false;

  const q = url.searchParams;
  if (!q.has('shot')) return api;

  // ---- scripted deterministic capture mode ----
  const debug = q.get('debug'); if (debug != null) api.setDebug(q.get('debug'));
  const preset = q.get('preset'); if (preset != null) api.applyPreset(preset, true);
  const quality = q.get('q'); if (quality) api.setQuality(quality);
  if (q.has('seed')) api.setSeed(q.get('seed'));
  if (q.has('t')) api.setTime(q.get('t'));
  if (q.has('params')) {
    try {
      const b = q.get('params').replace(/-/g, '+').replace(/_/g, '/');
      api.setParams(JSON.parse(decodeURIComponent(escape(atob(b)))));
    } catch (e) { console.warn('[shot] bad params:', e); }
  }
  if (q.has('w') && q.has('h')) api.setView(q.get('w'), q.get('h'), parseFloat(q.get('scale') || '1'));
  else if (q.has('scale')) engine.renderScaleBoost = parseFloat(q.get('scale')), engine.resize();

  const frames = Math.max(1, parseInt(q.get('frames') || '30', 10));
  api._shot = { frames, done: 0 };
  return api;
}

// Called by main loop after each rendered frame while a shot script is pending.
export function tickShot(api, engine) {
  if (!api || !api._shot || api._shot.fired || window.__SHOT_READY__) return;
  const s = api._shot;
  s.done++;
  if (s.done >= s.frames) {
    s.fired = true;
    engine.stateRef.paused = true;
    requestAnimationFrame(() => {
      try {
        window.__SHOT__ = engine.canvas.toDataURL('image/png');
        window.__SHOT_READY__ = true;
        console.log('GARGANTUA_SHOT_READY frames=' + s.frames + ' bytes=' + window.__SHOT__.length);
      } catch (e) { console.error('[shot] capture failed', e); window.__SHOT_ERROR__ = String(e); }
    });
  }
}
