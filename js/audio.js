// audio.js — ambient loop with graceful degradation.

export class Ambience {
  constructor(state) {
    this.state = state;
    this.ctx = null;
    this.gain = null;
    this.src = null;
    this.ready = false;
    this.mode = 'none';
  }

  async ensure() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC({ latencyHint: 'interactive' });
    this.gain = this.ctx.createGain();
    this.gain.gain.value = 0;
    this.gain.connect(this.ctx.destination);

    try {
      const res = await fetch('audio/ambient.wav');
      if (!res.ok) throw new Error('wav ' + res.status);
      const buf = await res.arrayBuffer();
      const audio = await this.ctx.decodeAudioData(buf);
      const src = this.ctx.createBufferSource();
      src.buffer = audio; src.loop = true;
      src.connect(this.gain);
      src.start();
      this.src = src;
      this.mode = 'wav';
    } catch (e) {
      console.warn('[gargantua] ambient.wav unavailable, using procedural pad:', e.message);
      this._procedural();
      this.mode = 'procedural';
    }
    this.ready = true;
  }

  _procedural() {
    const c = this.ctx;
    const mk = (freq, vol, detune = 0) => {
      const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = freq; o.detune.value = detune;
      const g = c.createGain(); g.gain.value = vol;
      const lfo = c.createOscillator(); lfo.frequency.value = 0.03 + Math.random() * 0.05;
      const lg = c.createGain(); lg.gain.value = vol * 0.6;
      lfo.connect(lg); lg.connect(g.gain);
      o.connect(g); g.connect(this.gain); o.start(); lfo.start();
    };
    mk(55, 0.16); mk(55.35, 0.12); mk(110.2, 0.05); mk(164.8, 0.035); mk(220.7, 0.02);
    // filtered noise wash
    const len = c.sampleRate * 4;
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * 0.3;
    const n = c.createBufferSource(); n.buffer = buf; n.loop = true;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 640; f.Q.value = 0.55;
    const ng = c.createGain(); ng.gain.value = 0.025;
    const nl = c.createOscillator(); nl.frequency.value = 0.021;
    const nlg = c.createGain(); nlg.gain.value = 0.018;
    nl.connect(nlg); nlg.connect(ng.gain);
    n.connect(f); f.connect(ng); ng.connect(this.gain); n.start(); nl.start();
  }

  async setOn(on, fade = 1.6) {
    this.state.audio.on = on;
    if (on) await this.ensure();
    if (!this.ctx) return;
    if (this.ctx.state === 'suspended') this.ctx.resume();
    const target = on ? this.state.audio.volume * 0.6 : 0;
    const t = this.ctx.currentTime;
    this.gain.gain.cancelScheduledValues(t);
    this.gain.gain.setValueAtTime(this.gain.gain.value, t);
    this.gain.gain.linearRampToValueAtTime(target, t + fade);
  }

  toggle() { this.setOn(!this.state.audio.on); }
  setVolume(v) {
    this.state.audio.volume = v;
    if (this.ctx && this.state.audio.on) {
      const t = this.ctx.currentTime;
      this.gain.gain.cancelScheduledValues(t);
      this.gain.gain.linearRampToValueAtTime(v * 0.6, t + 0.2);
    }
  }
}
