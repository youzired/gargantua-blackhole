// shaders/util.js — shared GLSL chunks (GLSL ES 3.00 syntax, THREE.GLSL3).

export const GLSL_COMMON = /* glsl */`
#define PI  3.14159265359
#define TAU 6.28318530718
#define RS  1.0            // units: Schwarzschild radius = 1  (M = 0.5)

// ---------- hashing ----------
float hash11(float p){ p = fract(p*0.1031); p *= p+33.33; p *= p+p; return fract(p); }
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx)*0.1031); p3 += dot(p3, p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }
float hash13(vec3 p){ p = fract(p*0.1031); p += dot(p, p.zyx+31.32); return fract((p.x+p.y)*p.z); }
vec3 hash31(float p){ vec3 q = fract(vec3(p)*vec3(0.1031,0.1030,0.0973)); q += dot(q, q.yzx+33.33); return fract((q.xxy+q.yzz)*q.zyx); }
vec2 hash22(vec2 p){ vec3 p3 = fract(vec3(p.xyx)*vec3(0.1031,0.1030,0.0973)); p3 += dot(p3, p3.yzx+33.33);
  return fract((p3.xx+p3.yz)*p3.zy); }

// ---------- smooth 3D value noise ----------
float vnoise3(vec3 x){
  vec3 i = floor(x), f = fract(x);
  f = f*f*(3.0-2.0*f);
  float n000 = hash13(i+vec3(0,0,0)), n100 = hash13(i+vec3(1,0,0));
  float n010 = hash13(i+vec3(0,1,0)), n110 = hash13(i+vec3(1,1,0));
  float n001 = hash13(i+vec3(0,0,1)), n101 = hash13(i+vec3(1,0,1));
  float n011 = hash13(i+vec3(0,1,1)), n111 = hash13(i+vec3(1,1,1));
  return mix(mix(mix(n000,n100,f.x), mix(n010,n110,f.x), f.y),
             mix(mix(n001,n101,f.x), mix(n011,n111,f.x), f.y), f.z);
}
// 2D value noise for the galactic band
float vnoise2(vec2 x){
  vec2 i = floor(x), f = fract(x); f = f*f*(3.0-2.0*f);
  return mix(mix(hash12(i),           hash12(i+vec2(1,0)), f.x),
             mix(hash12(i+vec2(0,1)), hash12(i+vec2(1,1)), f.x), f.y);
}

float fbm3(vec3 p, int oct){
  float s = 0.0, a = 0.5, tot = 0.0;
  for (int i = 0; i < 4; i++){
    if (i >= oct) break;
    s += a * vnoise3(p);  tot += a;
    p = p * 2.13 + vec3(7.31, 3.17, 1.77);
    a *= 0.5;
  }
  return s / max(tot, 1e-4);
}
float fbm2(vec2 p, int oct){
  float s = 0.0, a = 0.5, tot = 0.0;
  for (int i = 0; i < 5; i++){
    if (i >= oct) break;
    s += a * vnoise2(p); tot += a;
    p = p * 2.17 + vec2(5.21, 1.93);
    a *= 0.5;
  }
  return s / max(tot, 1e-4);
}

// ---------- blackbody-ish emission tint (Planck locus approximation) -------
// temperature in Kelvin -> linear RGB, normalized so 10000K ≈ white-hot.
// High temperatures saturate toward blue-white (never violet).
vec3 planckTint(float K){
  K = clamp(K, 1500.0, 16000.0);
  float t = K / 100.0;
  vec3 c;
  // Red — saturates at 0.82 for very hot (keeps blue-white, not purple)
  c.r = (t <= 66.0) ? 1.0 : max(1.292936 * pow(t - 60.0, -0.1332047), 0.80);
  // Green
  c.g = (t <= 66.0) ? clamp(0.3900816*log(t) - 0.6318414, 0.0, 1.0)
                    : max(clamp(1.1298909*pow(t - 60.0, -0.7542467), 0.0, 1.0), 0.86);
  // Blue
  c.b = (t >= 66.0) ? 1.0
       : (t <= 19.0) ? 0.0
       : clamp(0.5432068*log(t - 10.0) - 1.1962540, 0.0, 1.0);
  float lum = pow(clamp(K / 10000.0, 0.15, 1.6), 1.35);   // hotter -> brighter
  return c * lum;
}

vec3 aces(vec3 x){
  const float a=2.51, b=0.03, c=2.43, d=0.59, e=0.14;
  return clamp((x*(a*x+b))/(x*(c*x+d)+e), 0.0, 1.0);
}
vec3 linearToSRGB(vec3 c){
  c = max(c, vec3(0.0));
  return mix(c*12.92, 1.055*pow(c, vec3(1.0/2.4)) - 0.055, step(0.0031308, c));
}
float luminance(vec3 c){ return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

// rotation helpers
mat2 rot2(float a){ float s=sin(a), c=cos(a); return mat2(c,-s,s,c); }
`;

export const GLSL_QUAD_VERT = /* glsl */`
out vec2 vUv;
void main(){
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;
