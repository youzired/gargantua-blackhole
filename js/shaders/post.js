// shaders/post.js — HDR bloom pyramid + filmic composite passes.

export const BRIGHTF = /* glsl */`
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uTex;
uniform float uThresh;
void main(){
  vec3 c = texture(uTex, vUv).rgb;
  float l = luminance(c);
  // soft knee bright-pass
  float k = smoothstep(uThresh, uThresh + 0.7, l);
  fragColor = vec4(c * k, 1.0);
}
`;

export const BLURF = /* glsl */`
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uTex;
uniform vec2 uDir;      // texel-sized step in uv space
void main(){
  // 9-tap gaussian (sigma ~ 2)
  vec3 c = texture(uTex, vUv).rgb * 0.227027;
  c += (texture(uTex, vUv + uDir * 1.3846).rgb + texture(uTex, vUv - uDir * 1.3846).rgb) * 0.3162162;
  c += (texture(uTex, vUv + uDir * 3.2308).rgb + texture(uTex, vUv - uDir * 3.2308).rgb) * 0.0702702;
  c += (texture(uTex, vUv + uDir * 5.0).rgb     + texture(uTex, vUv - uDir * 5.0).rgb)     * 0.0134545;
  fragColor = vec4(c, 1.0);
}
`;

export const COMPOSITEF = /* glsl */`
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uScene;
uniform sampler2D uBloom[5];
uniform float uBloomOn[5];
uniform float uExposure;
uniform float uBloomStr;
uniform float uGrain;
uniform float uAberr;
uniform float uTime;
uniform int   uMode;      // 0 full post, 1 raw hdr, 2 tonemap-only (debug maps), 8 bloom only
uniform vec2  uRes;

void main(){
  vec2 uv = vUv;
  vec3 base;
  if (uMode == 2){
    vec3 c = texture(uScene, uv).rgb * uExposure;
    fragColor = vec4(linearToSRGB(aces(c)), 1.0);
    return;
  }
  if (uMode == 1){
    // raw radiance: exposure + gamma only, so the linear signal is honest
    vec3 c = texture(uScene, uv).rgb * uExposure;
    c = c / (1.0 + c * 0.15);         // gentle highlight guard just for display
    fragColor = vec4(linearToSRGB(c), 1.0);
    return;
  }
  if (uMode == 8){
    vec3 b = vec3(0.0);
    b += texture(uBloom[0], uv).rgb * uBloomOn[0];
    b += texture(uBloom[1], uv).rgb * uBloomOn[1];
    b += texture(uBloom[2], uv).rgb * uBloomOn[2];
    b += texture(uBloom[3], uv).rgb * uBloomOn[3];
    b += texture(uBloom[4], uv).rgb * uBloomOn[4];
    fragColor = vec4(linearToSRGB(aces(b * 1.2)), 1.0);
    return;
  }

  // slight radial chromatic dispersion of the raytraced frame
  vec2 off = (uv - 0.5) * uAberr;
  float rr = texture(uScene, uv + off * 1.0).r;
  vec2  rg = texture(uScene, uv).ga;
  float bb = texture(uScene, uv - off * 1.0).b;
  base = vec3(rr, rg.x, bb);

  vec3 bloom = vec3(0.0);
  bloom += texture(uBloom[0], uv).rgb * uBloomOn[0];
  bloom += texture(uBloom[1], uv).rgb * uBloomOn[1];
  bloom += texture(uBloom[2], uv).rgb * uBloomOn[2];
  bloom += texture(uBloom[3], uv).rgb * uBloomOn[3];
  bloom += texture(uBloom[4], uv).rgb * uBloomOn[4];

  vec3 col = base + bloom * uBloomStr;

  col *= uExposure;
  col = aces(col);

  // vignette (aspect corrected)
  vec2 q = (uv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
  float vig = 1.0 - smoothstep(0.42, 1.05, length(q) * 0.95) * 0.55;
  col *= vig;

  // film grain
  if (uGrain > 0.001){
    float g = hash12(gl_FragCoord.xy * 1.37 + fract(uTime) * 421.71);
    g = (g - 0.5);
    float lum = luminance(col);
    col += g * uGrain * 0.11 * (1.0 - lum * 0.65);
  }

  fragColor = vec4(linearToSRGB(max(col, vec3(0.0))), 1.0);
}
`;
