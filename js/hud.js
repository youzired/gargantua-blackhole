// hud.js — DOM control surface: 21 sliders, presets, quality, debug, stats.

import { PARAM_DEFS, DEBUG_VIEWS, VIEW_PRESETS, QUALITY_TIERS } from './params.js';

const $ = sel => document.querySelector(sel);

export class HUD {
  constructor(state, handlers) {
    this.state = state;
    this.h = handlers;
    this.sliders = {};
    this.valueLabels = {};
    this._buildPanel();
    this._buildPresets();
    this._buildQuality();
    this._buildDebugBar();
    this._buildShortcuts();
    this._wireToggles();
  }

  _buildPanel() {
    const root = $('#panel-body');
    let group = null, gEl = null;
    for (const d of PARAM_DEFS) {
      if (d.group !== group) {
        group = d.group;
        gEl = document.createElement('div');
        gEl.className = 'pgroup';
        gEl.innerHTML = `<div class="pgroup-t">${group}</div>`;
        root.appendChild(gEl);
      }
      const row = document.createElement('div');
      row.className = 'prow';
      row.innerHTML = `
        <label for="sl-${d.id}">${d.label}</label>
        <input id="sl-${d.id}" type="range" min="${d.min}" max="${d.max}" step="${d.step}"
               value="${this.state.params[d.id]}" aria-label="${d.label}">
        <output id="out-${d.id}">${d.fmt(this.state.params[d.id])}</output>`;
      gEl.appendChild(row);
      const input = row.querySelector('input');
      const out = row.querySelector('output');
      this.sliders[d.id] = input;
      this.valueLabels[d.id] = out;
      input.addEventListener('input', () => {
        const v = parseFloat(input.value);
        this.state.params[d.id] = v;
        out.textContent = d.fmt(v);
        if (this.h.onParam) this.h.onParam(d.id, v);
      });
    }
    const reset = document.createElement('button');
    reset.className = 'btn wide';
    reset.textContent = 'Reset All Parameters';
    reset.addEventListener('click', () => this.h.onReset && this.h.onReset());
    root.appendChild(reset);
  }

  refreshParams() {
    for (const d of PARAM_DEFS) {
      const v = this.state.params[d.id];
      if (this.sliders[d.id]) { this.sliders[d.id].value = v; this.valueLabels[d.id].textContent = d.fmt(v); }
    }
  }

  _buildPresets() {
    const root = $('#preset-row');
    for (const p of VIEW_PRESETS) {
      const b = document.createElement('button');
      b.className = 'btn preset';
      b.dataset.id = p.id;
      b.innerHTML = `<kbd>${p.id}</kbd>${p.name.split(' — ')[0]}`;
      b.title = p.name;
      b.addEventListener('click', () => this.h.onPreset && this.h.onPreset(p.id));
      root.appendChild(b);
    }
    const cine = document.createElement('button');
    cine.className = 'btn';
    cine.id = 'btn-cine';
    cine.innerHTML = '<kbd>C</kbd>Cinematic';
    cine.addEventListener('click', () => this.h.onCinematic && this.h.onCinematic());
    root.appendChild(cine);
  }

  _buildQuality() {
    const root = $('#quality-row');
    for (const q in QUALITY_TIERS) {
      const b = document.createElement('button');
      b.className = 'btn q';
      b.dataset.q = q;
      b.textContent = QUALITY_TIERS[q].label;
      b.addEventListener('click', () => this.h.onQuality && this.h.onQuality(q));
      root.appendChild(b);
    }
    this.setQuality(this.state.quality);
  }

  setQuality(q) {
    document.querySelectorAll('#quality-row .btn').forEach(b => b.classList.toggle('on', b.dataset.q === q));
  }

  setPresetActive(id) {
    document.querySelectorAll('#preset-row .btn.preset').forEach(b => b.classList.toggle('on', +b.dataset.id === id));
  }

  setCinematic(on) {
    const b = $('#btn-cine'); if (b) b.classList.toggle('on', !!on);
  }

  _buildDebugBar() {
    const root = $('#dbg-row');
    for (const d of DEBUG_VIEWS) {
      const b = document.createElement('button');
      b.className = 'btn dbg';
      b.textContent = d.key;
      b.title = `${d.name} — ${d.desc}`;
      b.addEventListener('click', () => this.h.onDebug && this.h.onDebug(d.key));
      root.appendChild(b);
    }
  }

  setDebug(i) {
    const d = DEBUG_VIEWS[i] || DEBUG_VIEWS[0];
    $('#dbg-badge').textContent = `▣ ${i} · ${d.name}`;
    $('#dbg-badge').style.display = i === 0 ? 'none' : 'block';
    document.querySelectorAll('#dbg-row .btn.dbg').forEach(b => b.classList.toggle('on', +b.textContent === i));
  }

  _buildShortcuts() {
    const clean = [
      ['1–4', 'view presets'], ['0–9', 'debug views'], ['C', 'cinematic loop'], ['H', 'panel'],
      ['P', 'pause'], ['[ ]', 'time speed'], ['R', 'reset camera'], ['A', 'ambient audio'],
      ['F', 'fullscreen'], ['?', 'help'],
    ];
    $('#shortcuts').innerHTML = clean.map(([k, v]) => `<span class="sc"><kbd>${k}</kbd>${v}</span>`).join('');
    const rows = [
      ...VIEW_PRESETS.map(p => [String(p.id), `Preset — ${p.name}`]),
      ...DEBUG_VIEWS.map(d => [String(d.key), `Debug — ${d.name}: ${d.desc}`]),
      ['C', 'Toggle cinematic camera loop'], ['H', 'Toggle control panel'],
      ['P', 'Pause / resume simulation time'], ['[ / ]', 'Slower / faster time'],
      ['R', 'Reset camera to last preset'], ['A', 'Toggle ambient audio'],
      ['F', 'Fullscreen'], ['?', 'This help'], ['Esc', 'Close overlays'],
    ];
    $('#help-body').innerHTML = rows.map(([k, v]) =>
      `<div class="hrow"><kbd>${k}</kbd><span>${v}</span></div>`).join('');
  }

  _wireToggles() {
    $('#btn-panel').addEventListener('click', () => this.togglePanel());
    $('#btn-help').addEventListener('click', () => this.toggleHelp(true));
    $('#help-close').addEventListener('click', () => this.toggleHelp(false));
    $('#btn-audio').addEventListener('click', () => this.h.onAudio && this.h.onAudio());
  }

  togglePanel(force) {
    const p = $('#panel');
    const on = force !== undefined ? force : !p.classList.contains('open');
    p.classList.toggle('open', on);
    $('#btn-panel').classList.toggle('on', on);
  }

  toggleHelp(force) {
    const el = $('#help');
    const on = force !== undefined ? force : el.classList.contains('hidden');
    el.classList.toggle('hidden', !on);
  }

  setAudio(on) {
    $('#btn-audio').classList.toggle('on', on);
    $('#btn-audio').innerHTML = on ? '🔊 On' : '🔇 Off';
  }

  updateStats(s, rig) {
    $('#st-fps').textContent = s.fps.toFixed(0);
    $('#st-ms').textContent = (s.fps > 0 ? (1000 / s.fps).toFixed(1) : '—') + ' ms';
    $('#st-res').textContent = `${s.bufferW}×${s.bufferH}`;
    $('#st-q').textContent = QUALITY_TIERS[this.state.quality].label;
    $('#st-steps').textContent = Math.round(this.state.params.steps * QUALITY_TIERS[this.state.quality].stepMul);
    if (rig) {
      const i = rig.info;
      $('#st-r').textContent = i.radius.toFixed(1) + ' rs';
      $('#st-inc').textContent = (90 - +i.polarDeg).toFixed(1) + '°';
      $('#st-fov').textContent = i.fov + '°';
    }
    $('#st-t').textContent = (this.state.paused ? '⏸ ' : '') + 't=' + (s.time != null ? s.time.toFixed(1) : '0') + 's';
    $('#st-preset').textContent = this.state.preset ? (VIEW_PRESETS.find(p => p.id === this.state.preset) || {}).name : 'Free';
  }

  reveal() { $('#loader').classList.add('gone'); }
}
