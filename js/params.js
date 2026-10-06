// params.js — single source of truth for the 21 tunable parameters,
// quality tiers, view presets and localStorage persistence.

export const QUALITY_TIERS = {
  standard:  { label: 'Standard',  scale: 0.70, dprCap: 1.25, bloomLevels: 3, stepMul: 1.0, blurIter: 2 },
  high:      { label: 'High',      scale: 0.85, dprCap: 1.75, bloomLevels: 4, stepMul: 1.2, blurIter: 3 },
  cinematic: { label: 'Cinematic', scale: 1.00, dprCap: 2.00, bloomLevels: 5, stepMul: 1.6, blurIter: 4 },
};

// Exactly 21 parameters.
export const PARAM_DEFS = [
  // --- Geodesy ---
  { id: 'steps',          group: 'Geodesy', label: 'Integration Steps',      min: 128,  max: 960,   step: 16,   def: 416,  fmt: v => v.toFixed(0) },
  { id: 'lensStrength',   group: 'Geodesy', label: 'Gravity Strength',       min: 0.2,  max: 2.0,   step: 0.01, def: 1.00, fmt: v => v.toFixed(2) + '×' },
  { id: 'escapeRadius',   group: 'Geodesy', label: 'Escape Radius (rs)',     min: 60,   max: 400,   step: 5,    def: 200,  fmt: v => v.toFixed(0) },
  // --- Accretion disk ---
  { id: 'diskInner',      group: 'Disk',    label: 'Inner Radius (rs)',      min: 1.6,  max: 8,     step: 0.05, def: 3.10, fmt: v => v.toFixed(2) },
  { id: 'diskOuter',      group: 'Disk',    label: 'Outer Radius (rs)',      min: 6,    max: 40,    step: 0.5,  def: 13.0, fmt: v => v.toFixed(1) },
  { id: 'diskThickness',  group: 'Disk',    label: 'Thickness (rs)',         min: 0.02, max: 1.2,   step: 0.01, def: 0.11, fmt: v => v.toFixed(2) },
  { id: 'diskDensity',    group: 'Disk',    label: 'Density',                min: 0.0,  max: 6,     step: 0.05, def: 0.85, fmt: v => v.toFixed(2) },
  { id: 'diskTemp',       group: 'Disk',    label: 'Peak Temperature (K)',   min: 3500, max: 26000, step: 100,  def: 10500, fmt: v => v.toFixed(0) },
  { id: 'diskLum',        group: 'Disk',    label: 'Luminosity',             min: 0.0,  max: 8,     step: 0.05, def: 3.60, fmt: v => v.toFixed(2) },
  { id: 'turbIntensity',  group: 'Disk',    label: 'Turbulence',             min: 0.0,  max: 1.5,   step: 0.01, def: 0.90, fmt: v => v.toFixed(2) },
  { id: 'turbScale',      group: 'Disk',    label: 'Turbulence Scale',       min: 0.3,  max: 6,     step: 0.05, def: 1.60, fmt: v => v.toFixed(2) },
  { id: 'diskRotation',   group: 'Disk',    label: 'Rotation Speed',         min: 0.0,  max: 2.0,   step: 0.01, def: 1.00, fmt: v => v.toFixed(2) + '×' },
  // --- Radiation ---
  { id: 'beaming',        group: 'Radiation', label: 'Doppler Beaming',      min: 0,    max: 5,     step: 0.05, def: 3.40, fmt: v => v.toFixed(2) },
  { id: 'redshift',       group: 'Radiation', label: 'Gravitational Redshift',min: 0,   max: 1,     step: 0.01, def: 1.00, fmt: v => v.toFixed(2) },
  { id: 'spectralTint',   group: 'Radiation', label: 'Spectral Tint',        min: -1,   max: 1,     step: 0.01, def: 0.10, fmt: v => v.toFixed(2) },
  // --- Sky ---
  { id: 'starDensity',    group: 'Sky',     label: 'Star Density',           min: 0,    max: 1.5,   step: 0.01, def: 0.85, fmt: v => v.toFixed(2) },
  { id: 'starBrightness', group: 'Sky',     label: 'Star Brightness',        min: 0,    max: 3,     step: 0.01, def: 1.15, fmt: v => v.toFixed(2) },
  { id: 'galaxyBright',   group: 'Sky',     label: 'Milky Way Brightness',   min: 0,    max: 3,     step: 0.01, def: 1.10, fmt: v => v.toFixed(2) },
  // --- Post ---
  { id: 'exposure',       group: 'Post',    label: 'Exposure',               min: 0.1,  max: 4,     step: 0.01, def: 0.95, fmt: v => v.toFixed(2) },
  { id: 'bloomStrength',  group: 'Post',    label: 'Bloom Strength',         min: 0,    max: 2,     step: 0.01, def: 0.60, fmt: v => v.toFixed(2) },
  { id: 'grain',          group: 'Post',    label: 'Film Grain',             min: 0,    max: 1,     step: 0.01, def: 0.16, fmt: v => v.toFixed(2) },
];

export const DEBUG_VIEWS = [
  { key: 0, name: 'Composite',        desc: 'Final tonemapped image' },
  { key: 1, name: 'Raw HDR',          desc: 'Linear scene radiance (no ACES)' },
  { key: 2, name: 'Step Budget',      desc: 'Geodesic integration steps used' },
  { key: 3, name: 'Optical Depth',    desc: 'Accumulated disk optical depth τ' },
  { key: 4, name: 'Closest Approach', desc: 'Minimum r reached (rs) — capture cone' },
  { key: 5, name: 'Doppler Factor',   desc: 'g factor from disk emitter motion' },
  { key: 6, name: 'Grav. Redshift',   desc: 'sqrt(1 − rs/r) at last emission' },
  { key: 7, name: 'Deflection',       desc: 'Total bending angle of the ray (rad)' },
  { key: 8, name: 'Bloom Only',       desc: 'Bright-pass + blur pyramid' },
  { key: 9, name: 'Ray Health',       desc: 'h² drift & radius field (numerics)' },
];

export function defaultParams() {
  const p = {};
  for (const d of PARAM_DEFS) p[d.id] = d.def;
  return p;
}

// ---- View presets: camera + curated parameter overrides -------------------
export const VIEW_PRESETS = [
  {
    id: 1, name: 'Eden — Edge-On',
    cam: { radius: 26, theta: Math.PI * 0.492, phi: 0.62, fov: 38 },
    params: { diskThickness: 0.16, diskDensity: 1.3, diskTemp: 10000, diskLum: 2.6,
      turbIntensity: 1.0, turbScale: 1.4, beaming: 3.2, starBrightness: 0.9, galaxyBright: 0.7,
      exposure: 1.0, bloomStrength: 0.9, grain: 0.2, steps: 416 },
  },
  {
    id: 2, name: 'Vortex — High Inclination',
    cam: { radius: 34, theta: Math.PI * 0.30, phi: 1.05, fov: 50 },
    params: { diskThickness: 0.34, diskDensity: 0.95, diskTemp: 8800, diskLum: 2.2,
      turbIntensity: 1.15, turbScale: 2.2, beaming: 2.6, starBrightness: 1.2,
      galaxyBright: 1.2, exposure: 1.0, bloomStrength: 0.8, grain: 0.18, steps: 352 },
  },
  {
    id: 3, name: 'Photon Ring — Close-Up',
    cam: { radius: 9.5, theta: Math.PI * 0.47, phi: 2.4, fov: 34 },
    params: { diskThickness: 0.12, diskDensity: 1.5, diskTemp: 11500, diskLum: 2.0,
      turbIntensity: 0.8, turbScale: 1.2, beaming: 3.6, redshift: 1, starBrightness: 1.0,
      galaxyBright: 0.5, exposure: 1.05, bloomStrength: 1.05, grain: 0.2, steps: 704 },
  },
  {
    id: 4, name: 'Galactic Dawn',
    cam: { radius: 48, theta: Math.PI * 0.42, phi: -1.9, fov: 58 },
    params: { diskThickness: 0.4, diskDensity: 0.8, diskTemp: 8200, diskLum: 2.0,
      turbIntensity: 1.05, turbScale: 2.0, beaming: 2.4, starBrightness: 1.6, starDensity: 1.15,
      galaxyBright: 2.2, exposure: 1.1, bloomStrength: 0.7, grain: 0.26, steps: 320 },
  },
];

// ---- State ----------------------------------------------------------------
const LS_KEY = 'gargantua.state.v2';

export function createState() {
  return {
    params: defaultParams(),
    quality: guessQualityTier(),
    preset: 0,
    debug: 0,
    timeScale: 1,
    paused: false,
    camera: { radius: 27, theta: Math.PI * 0.437, phi: 0.62, fov: 42, tx: 0, ty: 0, tz: 0 },
    audio: { on: false, volume: 0.5 },
  };
}

function guessQualityTier() {
  const mobile = matchMedia('(pointer: coarse)').matches || innerWidth < 780;
  const cores = navigator.hardwareConcurrency || 4;
  if (mobile || cores <= 4) return 'standard';
  return 'high';
}

export function loadState() {
  const s = createState();
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const j = JSON.parse(raw);
      if (j && typeof j === 'object') {
        if (j.params) for (const d of PARAM_DEFS)
          if (typeof j.params[d.id] === 'number' && isFinite(j.params[d.id]))
            s.params[d.id] = clamp(j.params[d.id], d.min, d.max);
        if (QUALITY_TIERS[j.quality]) s.quality = j.quality;
        if (Number.isInteger(j.debug) && j.debug >= 0 && j.debug <= 9) s.debug = j.debug;
        if (typeof j.timeScale === 'number') s.timeScale = clamp(j.timeScale, 0.1, 3);
        if (typeof j.preset === 'number') s.preset = j.preset;
        if (j.camera) Object.assign(s.camera, subset(j.camera, ['radius','theta','phi','fov','tx','ty','tz']));
        if (j.audio) { s.audio.on = !!j.audio.on; s.audio.volume = clamp(j.audio.volume ?? 0.5, 0, 1); }
      }
    }
  } catch (e) { console.warn('[gargantua] state restore failed:', e); }
  return s;
}

let saveTimer = 0;
export function saveState(state) {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => saveStateNow(state), 350);
}
export function saveStateNow(state) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (e) { /* quota */ }
}

export function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function subset(o, keys) { const r = {}; for (const k of keys) if (typeof o[k] === 'number' && isFinite(o[k])) r[k] = o[k]; return r; }
