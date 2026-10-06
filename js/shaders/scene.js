// shaders/scene.js — full-screen Schwarzschild null-geodesic raytracer.
// Units: event horizon radius rs = 1, so M = 0.5, photon sphere r = 1.5, ISCO r = 3.
// The geodesic is integrated with velocity-Verlet on  a(x) = -1.5 · lens · h² · x / r⁵
// (the exact spatial form of the null geodesic equation in Schwarzschild
// curvature-Cartesian coordinates). No sphere, no textures — pure integration.

export const SCENEF = /* glsl */`
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform vec2  uRes;
uniform mat4  uCamMat;
uniform float uTime;
uniform float uFov;
uniform float uSeed;

uniform int   uSteps;
uniform float uLens;
uniform float uEscape;

uniform float uDiskIn, uDiskOut, uThick, uDens, uTemp, uLum;
uniform float uTurb, uTurbScl, uRot, uBeam, uRedsh, uTint;

uniform float uStarD, uStarB, uGalB;
uniform int   uDebug;

#define MAXSTEPS 960

const float M = 0.5;   // rs = 1 via #define in common chunk

// ---------------------------------------------------------------- palette ---
vec3 heat(float t){
  t = clamp(t, 0.0, 1.0);
  vec3 c0 = vec3(0.02, 0.03, 0.12), c1 = vec3(0.10, 0.35, 0.85),
       c2 = vec3(0.80, 0.20, 0.75), c3 = vec3(1.00, 0.55, 0.10),
       c4 = vec3(1.00, 0.98, 0.72);
  vec3 c = mix(c0, c1, smoothstep(0.0, 0.25, t));
  c = mix(c, c2, smoothstep(0.25, 0.5, t));
  c = mix(c, c3, smoothstep(0.5, 0.75, t));
  c = mix(c, c4, smoothstep(0.75, 1.0, t));
  return c;
}

// ------------------------------------------------------------ disk model ----
float diskH(float r){                    // flared vertical scale height (torus)
  return max(uThick * (0.30 + 0.165 * r), 0.004);
}
float keplerBeta(float r){               // orbital speed / c, local static frame
  return clamp(sqrt(M / max(r - RS, 0.05)), 0.0, 0.985);
}
float keplerOmega(float r){              // dphi/dt at infinity (Keplerian)
  return sqrt(M) / pow(max(r, 1.05), 1.5);
}
float diskRadial(float r){
  float inn = smoothstep(uDiskIn, uDiskIn + 0.9, r);
  // smooth exponential rim — no hard circle silhouette
  float xo = max(r - uDiskOut * 0.58, 0.0);
  float outer = exp(-xo * xo * 2.6 / (uDiskOut * uDiskOut * 0.12 + 1e-3));
  float farcut = 1.0 - smoothstep(uDiskOut * 0.92, uDiskOut * 1.04, r);
  return inn * outer * farcut * pow(uDiskIn / max(r, uDiskIn), 2.0);
}

vec3 skyColor(vec3 d){
  vec3 col = vec3(0.0);

  // --- deep space ambient, gently biased toward the galactic core --------
  col += vec3(0.0042, 0.0055, 0.011);

  // --- procedural starfield: two cube-grid layers -------------------------
  for (int L = 0; L < 2; L++){
    float sc  = (L == 0) ? 210.0 : 430.0;
    float mul = (L == 0) ? 1.0  : 0.55;
    vec3 p = d * sc;
    vec3 i = floor(p);
    vec3 f = fract(p) - 0.5;
    float rnd = hash13(i + float(L) * 17.31 + uSeed);
    float present = step(1.0 - uStarD * 0.035 * mul, rnd);
    if (present > 0.5){
      vec3 off = (hash31(rnd * 91.7) - 0.5) * 0.62;
      float dd = length(f - off);
      float mag = hash11(rnd * 311.7);
      float rad = mix(0.16, 0.016, pow(mag, 1.6));
      float core = smoothstep(rad, 0.0, dd);
      float glow = pow(core, 3.0);
      // stellar colour: mostly white-blue, some amber giants
      float tintRnd = hash11(rnd * 57.1);
      vec3 sc3 = mix(vec3(0.72, 0.82, 1.0), vec3(1.0, 0.86, 0.66), smoothstep(0.6, 1.0, tintRnd));
      sc3 = mix(sc3, vec3(1.0, 0.62, 0.42), smoothstep(0.9, 1.0, tintRnd));
      // twinkle
      float tw = 0.82 + 0.18 * sin(uTime * (0.6 + 2.6 * mag) + rnd * 40.0);
      float b = pow(core, 2.2) + 0.24 * glow;
      col += sc3 * b * tw * uStarB * mix(0.35, 2.4, pow(mag, 2.6)) * mul;
    }
  }

  // --- milky way band -------------------------------------------------------
  vec3 gax = normalize(vec3(0.32, 0.84, -0.43));
  vec3 t1  = normalize(cross(gax, vec3(1.0, 0.0, 0.0)));
  vec3 t2  = cross(gax, t1);
  float band = exp(-pow(dot(d, gax), 2.0) * 16.0);
  vec2 sph = vec2(atan(dot(d, t2), dot(d, t1)), asin(clamp(dot(d, gax), -1.0, 1.0)));
  float cl1 = fbm2(sph * vec2(1.6, 4.0) + vec2(uSeed), 5);
  float cl2 = fbm2(sph * vec2(3.3, 7.0) + vec2(9.1, uSeed * 0.5), 4);
  float dust = smoothstep(0.42, 0.68, cl2);
  float mw = band * (0.30 + 0.85 * cl1) * mix(1.0, 0.30, dust * dust);
  float core = pow(max(dot(normalize(vec2(sph.x + 0.9, sph.y * 1.7)), vec2(1.0, 0.0)), 0.0), 3.0);
  vec3  mwCol = mix(vec3(0.16, 0.20, 0.34), vec3(0.42, 0.40, 0.50), cl1);
  mwCol = mix(mwCol, vec3(0.60, 0.50, 0.42), smoothstep(0.3, 0.8, cl1) * 0.5);
  col += mwCol * mw * uGalB * 0.55;
  col += vec3(0.5, 0.42, 0.34) * pow(max(0.0, band), 3.0) * core * uGalB * 0.25;

  return col;
}

void main(){
  vec2 ndc = (gl_FragCoord.xy / uRes) * 2.0 - 1.0;
  float th = tan(radians(uFov) * 0.5);
  vec3 dir = normalize(mat3(uCamMat) * vec3(ndc.x * th * (uRes.x / uRes.y), ndc.y * th, -1.0));
  vec3 pos = uCamMat[3].xyz;
  vec3 vel = dir;

  // conserved angular momentum per unit affine speed
  vec3 hv = cross(pos, vel);
  float h2 = dot(hv, hv);
  float h2c = h2;

  float tau   = 0.0;     // optical depth accumulated toward camera
  vec3  emis  = vec3(0.0);
  float minR  = length(pos);
  float stepsUsed = 0.0;
  float gMax  = 1.0, zLast = 1.0, lumDisk = 0.0;
  float transMin = 1.0;
  int   crossings = 0;
  bool  inDisk = false;
  bool  captured = false;
  vec3  startDir = dir;

  vec3 acc = -1.5 * uLens * h2 * pos / pow(max(dot(pos, pos), 1e-4), 2.5);

  for (int i = 0; i < MAXSTEPS; i++){
    if (i >= uSteps) break;
    stepsUsed = float(i) + 1.0;

    float r = length(pos);
    if (r < RS){ captured = true; break; }
    if (r > uEscape) break;

    // adaptive affine step: fine near horizon & inside the disk slab
    float t = clamp(r * 0.055, 0.012, 2.6);
    t = min(t, max(0.02, (r - RS) * 0.35));
    bool nearDisk = (r > uDiskIn - 1.2 && r < uDiskOut + 1.2 && abs(pos.y) < diskH(r) * 3.0);
    if (nearDisk) t = min(t, max(0.028, abs(pos.y) * 0.6 + 0.012));

    // velocity-Verlet
    vec3 npos = pos + vel * t + 0.5 * acc * t * t;
    float nr2 = max(dot(npos, npos), 1e-4);
    vec3 nacc = -1.5 * uLens * h2 * npos / (nr2 * nr2 * sqrt(nr2));
    vel += 0.5 * (acc + nacc) * t;
    acc  = nacc;
    pos  = npos;
    r = length(pos);
    minR = min(minR, r);

    // numerical health: |x×v|² / |v|² should stay equal to h2 along the ray
    vec3 hc = cross(pos, vel);
    h2c = dot(hc, hc) / max(dot(vel, vel), 1e-6);

    // crossing bookkeeping
    bool nowDisk = (r > uDiskIn && r < uDiskOut && abs(pos.y) < diskH(r) * 2.6);
    if (nowDisk && !inDisk) crossings++;
    inDisk = nowDisk;

    // ------------- volumetric emission & self-occlusion -------------------
    if (nowDisk && tau < 7.0){
      float H  = diskH(r);
      float vy = abs(pos.y);
      float vert = exp(-(vy * vy) / (H * H));
      float radial = diskRadial(r);
      // differential rotation advects the turbulence pattern
      vec3 q = pos;
      q.xz = rot2(-keplerOmega(r) * uRot * uTime * 6.0 + q.y * 0.6) * q.xz;
      float n = fbm3(q * (uTurbScl * 0.42) + vec3(0.0, uTime * 0.03, uSeed), 3);
      // log-spiral filaments: sheared in angle by radius (differential winding)
      float ang = atan(q.z, q.x);
      float wind = ang * 1.4 + r * 1.25 - uTime * 0.15 * uRot;
      float fingers = fbm3(vec3(cos(wind), sin(wind), r * 1.1) * 1.9 + uSeed, 3);
      // calmer further out: inner disk stays filamentary, rim smooths down
      float calm = smoothstep(0.40, 0.95, pow(uDiskIn / max(r, uDiskIn), 0.5));
      float turb = 1.0 + uTurb * calm * ((n * 2.0 - 1.0) * 0.7 + (fingers * 2.0 - 1.0) * 0.85);
      float rho = uDens * vert * radial * max(turb, 0.0);
      rho *= rho * 0.35 + 0.65;                      // sharpen filaments
      rho *= pow(clamp(turb, 0.0, 1.6), 1.25);       // higher turbulence contrast
      // sharpen the vertical profile so the disk reads as a thin 3D slab
      rho *= smoothstep(2.4, 0.7, vy / H);

      if (rho > 0.004){
        float beta = keplerBeta(r);
        float gam  = inversesqrt(max(1.0 - beta * beta, 1e-4));
        vec3 ephi  = normalize(cross(vec3(0.0, 1.0, 0.0), pos) + vec3(1e-5, 0.0, 0.0));
        vec3 bvec  = ephi * beta;
        vec3 nhat  = -normalize(vel);                // photon travels toward camera
        float g    = 1.0 / (gam * (1.0 - dot(bvec, nhat)));
        float zfac = mix(1.0, sqrt(max(1.0 - RS / r, 0.04)), uRedsh);
        float shift = g * zfac;

        float T = uTemp * pow(uDiskIn / r, 0.9) * shift;
        vec3  eCol = planckTint(T);
        // σT⁴-style radiative falloff: photosphere glows white, outer disk fades to black
        float heat = pow(max(T, 600.0) / 10000.0, 2.3);
        float inten = rho * heat * pow(max(shift, 0.05), uBeam * 0.5) * t;

        float before = exp(-tau);
        emis += eCol * inten * before * uLum * 2.1;
        tau  += rho * t * 1.6;                        // strong self-occlusion
        transMin = min(transMin, exp(-tau));

        gMax = max(gMax, g);
        zLast = zfac;
        lumDisk += inten * before;
      }
    }

    if (captured) break;
  }

  vec3 sky = vec3(0.0);
  if (!captured){
    vec3 outDir = normalize(vel);
    sky = skyColor(outDir) * exp(-min(tau, 9.0));
    float defl = acos(clamp(dot(startDir, outDir), -1.0, 1.0));

    // ---- debug views --------------------------------------------------------
    if (uDebug == 2) { fragColor = vec4(heat(stepsUsed / float(uSteps)), 1.0); return; }
    if (uDebug == 3) { fragColor = vec4(heat(clamp(tau / 5.0, 0.0, 1.0)), 1.0); return; }
    if (uDebug == 4) {
      float m = clamp((minR - 1.0) / 6.0, 0.0, 1.0);
      vec3 c = heat(1.0 - m);
      c *= 0.08 + 0.92 * min(1.0, float(crossings) / 3.0 + 0.25);
      if (captured) c = vec3(0.0);
      fragColor = vec4(c, 1.0); return;
    }
    if (uDebug == 5) { fragColor = vec4(heat(clamp((gMax - 0.35) / 2.4, 0.0, 1.0)), 1.0); return; }
    if (uDebug == 6) { fragColor = vec4(heat(clamp(zLast, 0.0, 1.0)), 1.0); return; }
    if (uDebug == 7) { fragColor = vec4(heat(defl / PI), 1.0); return; }
    if (uDebug == 9) {
      float drift = abs(h2c - h2) / max(h2, 1e-4);
      vec3 c = heat(clamp(drift * 40.0, 0.0, 1.0));
      float ring = 1.0 - smoothstep(1.50, 1.56, minR);           // photon sphere marker
      float horizon = 1.0 - smoothstep(1.00, 1.04, minR);
      c += vec3(1.0, 0.9, 0.4) * ring * 0.55 + vec3(1.0, 0.15, 0.1) * horizon;
      fragColor = vec4(c, 1.0); return;
    }
  } else if (uDebug >= 2 && uDebug <= 9 && uDebug != 8){
    fragColor = vec4(0.0, 0.0, 0.0, 1.0); return;   // captured rays: pure black
  }

  vec3 col = emis + sky;

  // spectral tint (warm <-> cool)
  vec3 tint = mix(vec3(0.90, 0.97, 1.14), vec3(1.14, 0.99, 0.84), clamp(uTint * 0.5 + 0.5, 0.0, 1.0));
  col *= tint;

  fragColor = vec4(col, 1.0);
}
`;
