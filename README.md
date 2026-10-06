# GARGANTUA — Schwarzschild Black Hole Raytracer

A full-screen, real-time, per-pixel raytracer of a **Schwarzschild black hole**.
Every fragment integrates a null geodesic around the horizon on the GPU — no
sphere, no sprites, no textures, no baked video. Volumetric accretion disk,
photon ring, multiple disk crossings, gravitational lensing, Doppler beaming,
gravitational redshift, procedural stars & Milky Way, HDR bloom + ACES +
vignette + film grain + chromatic aberration.

Native HTML / CSS / ES Modules + a local Three.js build. **No bundler.**

---

## Launch

```bash
cd gargantua-blackhole
node server.mjs            # default http://localhost:8421/
# or any static server, e.g.:
python3 -m http.server 8421
```

Open `http://localhost:8421/`. Requires **WebGL2** (all current browsers).
The page is fully static — `vendor/three/three.module.js` (r165) is loaded
through an ES-module import map; `OrbitControls` from `vendor/three/examples/jsm`.

Regenerate the ambient score (optional):

```bash
node tools/gen-audio.js     # writes audio/ambient.wav (44 s seamless loop)
```

---

## The physics

Units: the Schwarzschild radius `rs = 1`, so `M = 0.5`, photon sphere `r = 1.5`,
ISCO `r = 3`. In curvature-Cartesian coordinates a photon obeys

```
d²x/dλ²  =  −(3/2) · lens · h² · x / r⁵         (h² = |x × v|², conserved)
```

which is integrated with **velocity-Verlet** and an adaptive affine step
(finer near the horizon and inside the disk slab). Circular orbits satisfy
`v²/r = 1.5 h²/r⁴ ⇒ r_photon = 1.5 rs` — the equation is exact for light.

* **Event horizon** — rays with `r < rs` terminate with zero contribution (pure black).
* **Photon ring / critical curve** — rays near the critical impact parameter wind
  around `r = 1.5` many times before escaping; visible as a razor-thin bright ring
  (peak of the *Step Budget* debug view).
* **Accretion disk (volumetric)** — a flared torus `H(r)=thick·(0.30+0.165 r)` with a
  Gaussian vertical profile `exp(−(y/H)²)`, differential Keplerian rotation advecting
  a 3-D FBM + log-spiral filament turbulence field, and front-to-back emission with
  Beer–Lambert self-occlusion `I += ε·e^{−τ}·dl`, `τ += ρ·dl`. Rays cross the disk
  **multiple times** (primary, secondary, lensed far-side images) — all emergent, not faked.
* **Doppler beaming** — local Keplerian velocity `β=√(M/(r−rs))`, `g = 1/(γ(1−β·n̂))`,
  intensity `∝ g^beaming`.
* **Gravitational redshift** — `√(1−rs/r)` folded into the emitter temperature.
* **Sky** — procedural two-layer cube-grid star field + a tilted Milky Way band with
  FBM clouds and dust lanes, sampled along the *deflected* escape direction.
* **Post** — HDR half-float target → soft-knee bright pass → blur pyramid → additive
  bloom → exposure → **ACES** → vignette → film grain → slight radial **chromatic aberration**.

---

## Controls

| Key | Action | | Key | Action |
|---|---|---|---|---|
| Drag | Orbit (OrbitControls) | | `1–4` | View presets (buttons / Alt+1–4) |
| Wheel / pinch | Zoom | | `0–9` | Debug views |
| `H` | Toggle control panel | | `C` | Cinematic camera loop |
| `P` | Pause time | | `[` `]` | Slower / faster time |
| `R` | Reset camera | | `A` | Ambient audio |
| `F` | Fullscreen | | `?` | Help overlay |

Mouse / touch orbit is live; drag and wheel both work (touch: 1-finger rotate, 2-finger dolly+rotate).

### 21 parameters
Integration Steps · Gravity Strength · Escape Radius · Inner Radius · Outer Radius ·
Thickness · Density · Peak Temperature · Luminosity · Turbulence · Turbulence Scale ·
Rotation Speed · Doppler Beaming · Gravitational Redshift · Spectral Tint · Star Density ·
Star Brightness · Milky Way Brightness · Exposure · Bloom Strength · Film Grain.

### 4 view presets
`Eden — Edge-On`, `Vortex — High Inclination`, `Photon Ring — Close-Up`, `Galactic Dawn`.
Each eases camera **and** parameters over 2.2 s.

### 10 debug views (`0–9`)
0 Composite · 1 Raw HDR (linear) · 2 Step Budget · 3 Optical Depth τ ·
4 Closest Approach (capture cone) · 5 Doppler Factor g · 6 Gravitational Redshift ·
7 Deflection angle · 8 Bloom Only · 9 Ray Health (h² drift + photon-sphere marker).

---

## Quality tiers

`Standard` / `High` / `Cinematic` scale render resolution (device-pixel-ratio capped),
geodesic step budget, bloom pyramid depth and blur iterations. An **adaptive resolution
guard** lowers internal scale automatically if frame time exceeds budget (software /
mobile GPUs) and restores it when headroom returns.

## Persistence & recovery

Full state (21 params, quality, debug view, camera spherical, time scale, audio) is
debounce-saved to `localStorage` and restored on load (`?reset=1` clears it).
The renderer listens for `webglcontextlost/restored`, rebuilds render targets on
restore, runs a watchdog that calls `WEBGL_lose_context.restoreContext()`, and shows a
recovery overlay. Shader failures degrade the step budget before surfacing an error.

## URL screenshot automation

```
/?shot=1&preset=3&debug=0&q=cinematic&frames=90&t=18&seed=42&w=1600&h=900&scale=1
```

Deterministic: applies a preset/quality/debug/seed/frozen sim-time, renders `frames`
frames, pauses, then writes `window.__SHOT__` (PNG data URL), sets
`window.__SHOT_READY__=true` and logs `GARGANTUA_SHOT_READY`.

Headless JS API on `window.GARGANTUA`: `info() · setParam · setParams · getParam ·
applyPreset · setDebug · setQuality · setCinematic · pause · setTime · setSeed ·
setView · capture · resetParams · exportState · importState`.

---

## Structure

```
index.html            import map + HUD/panel/modal skeleton
css/style.css         cinematic HUD, dock, panel, modals, mobile
js/params.js          21 params · quality · presets · persistence
js/engine.js          HDR pass · bloom pyramid · composite · tiers · recovery
js/camera.js          OrbitControls · preset tweens · cinematic loop
js/hud.js             sliders / presets / quality / debug / stats / help
js/audio.js           ambient loop (WebAudio) + procedural fallback
js/shot.js            URL capture automation + window.GARGANTUA
js/main.js            bootstrap, keyboard, loop, resize, persistence
js/shaders/scene.js   geodesic integrator + volumetric disk + sky + debug
js/shaders/post.js    bright / blur / composite shaders
js/shaders/util.js    noise, Planck tint, ACES, sRGB
vendor/three/…        three.module.js r165 + OrbitControls
audio/ambient.wav     44 s seamless ambient loop (synth-generated)
tools/gen-audio.js    regenerates ambient.wav
tools/glsl-probe.html offline GLSL compile checker
server.mjs            zero-dependency static server (correct MIME)
```
