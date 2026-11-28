// The still-wood birds are the same signed-distance model as the close-up study,
// marched in the bird's own frame so feathers, eyes and the wing cycle survive the forest.
import * as THREE from 'three';

const LOOK = {
  swallow: {
    flapAmp: 1, glide: 0.06, wing: 1, sweep: 0.28, fork: 1.15, spots: 1, vane: 1, slim: 1, slot: 0.35, forehead: 1, headPale: 0, iri: 1,
    back: [0.16, 0.26, 0.46], belly: [0.93, 0.86, 0.72], throat: [0.74, 0.28, 0.14], wingC: [0.08, 0.11, 0.2], beak: [0.08, 0.06, 0.05],
  },
  swift: {
    flapAmp: 0.38, glide: 0, wing: 1.28, sweep: 0.72, fork: 0.42, spots: 0, vane: 0.72, slim: 0.82, slot: 0.12, forehead: 0, headPale: 0, iri: 0.15,
    back: [0.14, 0.12, 0.11], belly: [0.22, 0.19, 0.17], throat: [0.55, 0.48, 0.4], wingC: [0.07, 0.06, 0.06], beak: [0.06, 0.05, 0.05],
  },
  kite: {
    flapAmp: 0.92, glide: 0.62, wing: 1.22, sweep: 0.18, fork: 0.95, spots: 0, vane: 1.55, slim: 1.18, slot: 0.9, forehead: 0, headPale: 1, iri: 0.2,
    back: [0.52, 0.28, 0.14], belly: [0.78, 0.62, 0.42], throat: [0.9, 0.84, 0.74], wingC: [0.28, 0.15, 0.09], beak: [0.86, 0.62, 0.18],
  },
};

const boxGeo = new THREE.BoxGeometry(5.4, 3.0, 3.6);
boxGeo.translate(0, 0.7, -0.35);

const VERT = `
varying vec3 vPos;
void main() {
  vPos = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const FRAG = `
precision highp float;
uniform mat4 uModel;
uniform mat4 uView;
uniform mat4 uProj;
uniform vec3 uCam;
uniform vec3 uSun;
uniform vec3 uSunCol;
uniform vec3 uFog;
uniform float uFogD;
uniform float uFlap;
uniform float uAmp;
uniform float uGlide;
uniform float uSweep;
uniform float uWing;
uniform float uFork;
uniform float uSpots;
uniform float uVane;
uniform float uSlim;
uniform float uSlot;
uniform float uForehead;
uniform float uHeadPale;
uniform float uIri;
uniform float uTime;
uniform float uSteps;
uniform float uShadow;
uniform float uAo;
uniform float uBump;
uniform float uStance;
uniform vec3 uBack;
uniform vec3 uBelly;
uniform vec3 uThroat;
uniform vec3 uWingC;
uniform vec3 uBeak;
varying vec3 vPos;

vec2 H(float d, float id) { return vec2(d, id); }
vec2 uMin2(vec2 a, vec2 b) { return a.x <= b.x ? a : b; }
vec2 uSmin(vec2 a, vec2 b, float k) {
  float h = clamp(0.5 + 0.5 * (b.x - a.x) / max(k, 1e-4), 0.0, 1.0);
  float d = mix(b.x, a.x, h) - k * h * (1.0 - h);
  return vec2(d, h > 0.5 ? a.y : b.y);
}
vec3 rotX(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(p.x, c * p.y - s * p.z, s * p.y + c * p.z); }
vec3 rotY(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z); }
vec3 rotZ(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(c * p.x - s * p.y, s * p.x + c * p.y, p.z); }
float sdEllipsoid(vec3 p, vec3 r) {
  float k0 = length(p / r);
  float k1 = length(p / (r * r));
  return k0 * (k0 - 1.0) / max(k1, 1e-4);
}
float sdSphere(vec3 p, float r) { return length(p) - r; }
float sdCapsule(vec3 p, vec3 a, vec3 b, float r) {
  vec3 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h) - r;
}
float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 345.45));
  p += dot(p, p + 34.345);
  return fract(p.x * p.y);
}
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

vec4 wingAngles(float u) {
  float elev;
  float elbow;
  if (u < 0.40) {
    float k = u / 0.40;
    float s = k * k * (3.0 - 2.0 * k);
    elev = mix(0.98, -0.48, s);
    elbow = mix(0.16, 0.2, s);
  } else {
    float k = (u - 0.40) / 0.60;
    float s = k * k * (3.0 - 2.0 * k);
    elev = mix(-0.48, 0.98, s);
    elbow = mix(0.2, 0.16, s) + sin(k * 3.14159265) * 0.48;
  }
  float fold = clamp((elbow - 0.12) / 1.0, 0.0, 1.0);
  float sweep = uSweep + fold * 0.2;
  float twist = (u < 0.40) ? mix(0.08, -0.42, u / 0.40) : mix(-0.42, 0.5, (u - 0.40) / 0.60);
  elev = mix(0.2, elev, uAmp);
  elbow = mix(0.14, elbow, uAmp);
  twist = mix(-0.06, twist, uAmp);
  elev = mix(elev, 0.24, uGlide);
  elbow = mix(elbow, 0.08, uGlide);
  sweep = mix(sweep, uSweep + 0.18, uGlide);
  twist = mix(twist, -0.1, uGlide);
  float brake = smoothstep(0.08, 0.4, uStance) * (1.0 - smoothstep(0.5, 0.8, uStance));
  float tuck = smoothstep(0.46, 0.94, uStance);
  elev = mix(elev, 0.98, brake);
  elbow = mix(elbow, 0.02, brake);
  sweep = mix(sweep, max(uSweep * 0.3, 0.04), brake);
  twist = mix(twist, -0.22, brake);
  elev = mix(elev, -0.08, tuck);
  elbow = mix(elbow, 0.72, tuck);
  sweep = mix(sweep, 1.25, tuck);
  twist = mix(twist, 0.0, tuck);
  float idle = smoothstep(0.9, 1.0, uStance);
  elev -= idle * 0.05 * max(sin(uTime * 0.85), 0.0);
  return vec4(elev, elbow, sweep, twist);
}

float sdFeather(vec3 p, float len, float rad) { return sdCapsule(p, vec3(0.0), vec3(len, 0.0, 0.0), rad); }

vec2 sdWing(vec3 p) {
  p.x = abs(p.x);
  vec4 ang = wingAngles(fract(uFlap));
  float span = 1.05 * uWing;
  float innerL = span * 0.46;
  float outerL = span * 0.42;
  vec3 q = p - vec3(0.1 * uSlim, 0.045, 0.04);
  q = rotZ(q, -ang.x);
  q = rotY(q, -ang.z);
  vec2 inner = H(sdCapsule(q, vec3(0.0), vec3(innerL, 0.0, 0.02), 0.05 * uSlim), 5.0);
  vec2 coverts = H(1e5, 5.0);
  for (int i = 0; i < 3; i++) {
    float t = (float(i) + 0.5) / 3.0;
    float x = innerL * t;
    float chord = mix(0.18, 0.1, t) * uVane;
    coverts = uMin2(coverts, H(sdCapsule(q, vec3(x, 0.0, 0.03), vec3(x * 0.95, -0.004, -chord), 0.026 * uSlim), 5.0));
  }
  vec3 e = q - vec3(innerL, 0.0, 0.02);
  e = rotZ(e, -ang.y * 0.85);
  e = rotY(e, -0.2);
  vec2 outer = H(sdCapsule(e, vec3(0.0), vec3(outerL, 0.0, 0.0), 0.036 * uSlim), 5.0);
  float rest = smoothstep(0.55, 0.95, uStance);
  vec2 secs = H(1e5, 6.0);
  for (int i = 0; i < 4; i++) {
    float t = (float(i) + 0.5) / 4.0;
    vec3 f = e - vec3(outerL * t * 0.8, 0.0, 0.0);
    float splay = mix(mix(0.35, 0.85, t), 0.28, rest);
    f = rotY(f, splay - 1.5707963);
    float len = mix(0.24, 0.42, t) * uVane * mix(1.0, 0.7, rest);
    secs = uMin2(secs, H(sdFeather(f, len, mix(0.024, 0.014, t)), 6.0));
  }
  float u = fract(uFlap);
  float flapSlot = smoothstep(0.2, 0.42, u) * smoothstep(0.7, 0.45, u);
  float slot = mix(flapSlot, 1.0, uGlide) * uSlot;
  vec2 prim = H(1e5, 6.0);
  for (int i = 0; i < 5; i++) {
    float t = float(i) / 4.0;
    vec3 f = e - vec3(mix(outerL * 0.45, outerL, t), 0.0, 0.0);
    float splay = mix(mix(0.55, 1.15, t) + slot * 0.22 * t, 0.42, rest);
    f = rotY(f, splay - 1.5707963);
    float len = mix(0.3, 0.72, t) * uWing * mix(1.0, 0.58, rest);
    prim = uMin2(prim, H(sdFeather(f, len, mix(0.02, 0.011, t)), 6.0));
  }
  vec2 sheet = H(sdEllipsoid(q - vec3(innerL * 0.5, 0.0, -0.05 * uVane), vec3(innerL * 0.55, 0.04, 0.15 * uVane)), 5.0);
  vec2 sheet2 = H(sdEllipsoid(e - vec3(outerL * 0.42, 0.0, -0.07 * uVane), vec3(outerL * 0.5, 0.032, 0.13 * uVane)), 5.0);
  vec2 wing = uSmin(inner, outer, 0.06);
  wing = uSmin(wing, sheet, 0.05);
  wing = uSmin(wing, sheet2, 0.04);
  wing = uSmin(wing, coverts, 0.04);
  wing = uSmin(wing, secs, 0.028);
  wing = uMin2(wing, prim);
  return wing;
}

vec2 sdTail(vec3 p) {
  float u = fract(uFlap);
  float pump = (u < 0.40) ? mix(0.12, -0.28, u / 0.40) : mix(-0.28, 0.12, (u - 0.40) / 0.60);
  pump = mix(pump, -0.05, uGlide);
  pump = mix(pump, -0.2, smoothstep(0.55, 1.0, uStance));
  pump += sin(uTime * 2.3) * smoothstep(0.92, 1.0, uStance) * 0.06;
  float spread = mix(0.22 + 0.62 * uFork, 0.12 + 0.28 * uFork, smoothstep(0.6, 1.0, uStance));
  vec2 tail = H(1e5, 7.0);
  vec3 root0 = vec3(0.0, 0.02, -0.34);
  for (int i = 0; i < 5; i++) {
    float s = (float(i) - 2.0) / 2.0;
    float len = mix(0.18, 0.28 + 0.55 * uFork, abs(s));
    vec3 tp = p - root0;
    tp = rotY(tp, -s * spread);
    tp = rotX(tp, -pump - 0.08 * abs(s));
    tp = rotY(tp, -1.5707963);
    float w = mix(0.018, 0.011, abs(s));
    tail = uMin2(tail, H(sdFeather(tp, len, w), 7.0));
  }
  return tail;
}

vec2 sdLegs(vec3 p) {
  float stand = smoothstep(0.18, 0.88, uStance);
  vec3 q = p;
  q.x = abs(q.x);
  vec3 hip = mix(vec3(0.045, -0.06, 0.02), vec3(0.042, -0.02, 0.04), stand);
  vec3 knee = mix(vec3(0.03, -0.1, 0.12), vec3(0.036, -0.09, 0.05), stand);
  vec3 toe = mix(vec3(0.015, -0.11, 0.22), vec3(0.02, -0.155, 0.12), stand);
  float thigh = sdCapsule(q, hip, knee, mix(0.018, 0.02, stand) * uSlim);
  float foot = sdCapsule(q, knee, toe, mix(0.01, 0.012, stand));
  return H(min(thigh, foot), 8.0);
}

vec2 birdDetail(vec3 p) {
  float slim = uSlim;
  vec2 torso = H(sdEllipsoid(p - vec3(0.0, 0.0, 0.02), vec3(0.15 * slim, 0.125 * slim, 0.32)), 1.0);
  vec2 breast = H(sdEllipsoid(p - vec3(0.0, -0.03, 0.16), vec3(0.125 * slim, 0.115 * slim, 0.16)), 1.0);
  vec2 rump = H(sdEllipsoid(p - vec3(0.0, 0.02, -0.2), vec3(0.09 * slim, 0.075 * slim, 0.13)), 1.0);
  vec2 body = uSmin(torso, breast, 0.09);
  body = uSmin(body, rump, 0.07);
  vec2 neck = H(sdCapsule(p, vec3(0.0, 0.03, 0.28), vec3(0.0, 0.09, 0.48), 0.055 * slim), 1.0);
  vec3 headC = vec3(0.0, 0.115, 0.58);
  float headD = sdEllipsoid(p - headC, vec3(0.108 * slim, 0.098 * slim, 0.128));
  vec3 ec = p - headC;
  ec.x = abs(ec.x);
  headD = max(headD, -sdSphere(ec - vec3(0.072, 0.02, 0.045), 0.046));
  vec2 head = H(headD, 2.0);
  vec2 eye = H(sdSphere(ec - vec3(0.078, 0.022, 0.055), 0.027), 4.0);
  vec3 bk = p - (headC + vec3(0.0, -0.015, 0.09));
  bk = rotX(bk, 0.22);
  vec2 upper = H(sdEllipsoid(bk - vec3(0.0, 0.012, 0.07), vec3(0.034, 0.013, 0.095)), 3.0);
  vec2 lower = H(sdEllipsoid(bk - vec3(0.0, -0.006, 0.05), vec3(0.026, 0.009, 0.055)), 3.0);
  vec2 beak = uSmin(upper, lower, 0.012);
  body = uSmin(body, neck, 0.055);
  body = uSmin(body, head, 0.05);
  body = uSmin(body, beak, 0.02);
  body = uMin2(body, eye);
  vec2 wing = sdWing(p);
  body = uSmin(body, wing, 0.07);
  body = uSmin(body, sdTail(p), 0.04);
  body = uMin2(body, sdLegs(p));
  return body;
}

float boundR() { return 1.25 + 1.35 * uWing + 0.45 * uFork; }
vec2 mapBird(vec3 p) {
  float bd = length(p) - boundR();
  if (bd > 0.55) return H(bd, 0.0);
  return birdDetail(p);
}
float mapD(vec3 p) { return mapBird(p).x; }

vec3 calcNormal(vec3 p) {
  vec2 e = vec2(0.0012, -0.0012);
  return normalize(e.xyy * mapD(p + e.xyy) + e.yyx * mapD(p + e.yyx) + e.yxy * mapD(p + e.yxy) + e.xxx * mapD(p + e.xxx));
}
float softShadow(vec3 ro, vec3 rd) {
  if (uShadow < 0.5) return 1.0;
  float res = 1.0;
  float t = 0.04;
  int steps = int(uShadow);
  for (int i = 0; i < 12; i++) {
    if (i >= steps) break;
    float h = mapD(ro + rd * t);
    if (h < 0.0015) return 0.18;
    res = min(res, 14.0 * h / t);
    t += clamp(h, 0.03, 0.28);
    if (t > 4.0) break;
  }
  return clamp(res, 0.22, 1.0);
}
float ambientOcclusion(vec3 p, vec3 n) {
  if (uAo < 0.5) return 1.0;
  float occ = 0.0;
  float sca = 1.0;
  for (int i = 1; i <= 4; i++) {
    float h = 0.02 * float(i);
    occ += (h - mapD(p + n * h)) * sca;
    sca *= 0.82;
  }
  return clamp(1.0 - 1.45 * occ, 0.0, 1.0);
}
vec3 plumage(vec3 bp, vec3 nBird, float id) {
  float dorsal = smoothstep(-0.04, 0.06, bp.y);
  vec3 col = mix(uBelly, uBack, dorsal);
  if (id > 4.5 && id < 6.5) {
    col = mix(uWingC, uBack, 0.35);
    col = mix(uBelly * 0.55 + uWingC * 0.45, col, smoothstep(-0.2, 0.45, nBird.y));
  }
  if (id > 5.5 && id < 6.5) {
    float tip = smoothstep(0.55, 1.45, abs(bp.x));
    col = mix(col, col * 0.45 + vec3(0.02), tip * 0.75);
  }
  if (id > 6.5 && id < 7.5) {
    col = mix(uWingC, uBack, 0.4);
    if (uSpots > 0.5) {
      float spot = smoothstep(0.08, 0.14, abs(bp.x)) * smoothstep(0.22, 0.12, abs(bp.z + 0.46));
      spot *= smoothstep(0.06, 0.0, abs(bp.y - 0.02));
      col = mix(col, vec3(0.94, 0.92, 0.86), clamp(spot, 0.0, 1.0));
    }
  }
  bool throatZone = bp.z > 0.36 && bp.z < 0.64 && bp.y < 0.1 && bp.y > -0.05 && abs(bp.x) < 0.09;
  if (id < 2.5 && throatZone) col = mix(col, uThroat, 0.92);
  if (uForehead > 0.5 && id > 1.5 && id < 2.5 && bp.z > 0.6 && bp.y > 0.12 && abs(bp.x) < 0.07) col = mix(col, uThroat, 0.88);
  if (uHeadPale > 0.5 && id > 1.5 && id < 2.5) col = mix(col, uThroat, 0.82);
  if (id > 2.5 && id < 3.5) col = uBeak;
  if (id > 7.5) {
    float bright = dot(uBeak, vec3(0.3, 0.59, 0.11));
    col = mix(vec3(0.32, 0.2, 0.18), uBeak, smoothstep(0.25, 0.55, bright));
  }
  col *= 0.9 + 0.16 * noise(bp.xz * 14.0 + bp.y * 6.0);
  return col;
}
vec3 shadeBird(vec3 p, vec3 rd, vec2 hit) {
  vec3 n = calcNormal(p);
  if (uBump > 0.5 && hit.y > 4.5 && hit.y < 7.5) {
    float barbs = sin(dot(p, vec3(10.0, 2.0, 62.0)));
    vec3 tang = normalize(cross(n, vec3(0.0, 1.0, 0.0)) + vec3(0.001, 0.0, 0.0));
    n = normalize(n + tang * barbs * 0.16);
  }
  if (hit.y > 3.5 && hit.y < 4.5) {
    float catch1 = pow(clamp(dot(n, normalize(uSun - rd)), 0.0, 1.0), 60.0);
    vec3 fillL = normalize(vec3(-uSun.x, 0.75, 0.35));
    float catch2 = pow(clamp(dot(n, fillL), 0.0, 1.0), 28.0);
    float pupil = smoothstep(0.2, 0.82, dot(n, -rd));
    vec3 iris = mix(vec3(0.05, 0.035, 0.02), vec3(0.012, 0.01, 0.01), pupil);
    return iris + vec3(1.0) * catch1 + vec3(0.75, 0.82, 0.95) * catch2 * 0.5;
  }
  vec3 albedo = plumage(p, n, hit.y);
  float ndl = dot(n, uSun);
  float wrap = clamp((ndl + 0.45) / 1.45, 0.0, 1.0);
  float sh = softShadow(p + n * 0.02, uSun);
  float occ = ambientOcclusion(p, n);
  vec3 amb = mix(vec3(0.28, 0.34, 0.28), vec3(0.62, 0.72, 0.66), n.y * 0.5 + 0.5);
  float fre = pow(clamp(1.0 - dot(n, -rd), 0.0, 1.0), 2.4);
  float spec = pow(clamp(dot(reflect(-uSun, n), -rd), 0.0, 1.0), 48.0);
  float trans = 0.0;
  if (hit.y > 5.5 && hit.y < 7.5) trans = pow(clamp(-ndl, 0.0, 1.0), 1.35);
  vec3 col = albedo * (wrap * sh * uSunCol * 1.45 + amb * occ * 0.85);
  col += albedo * vec3(1.0, 0.72, 0.42) * trans * uSunCol * 0.7;
  float specW = (hit.y > 2.5 && hit.y < 3.5) ? 0.55 : 0.08;
  col += uSunCol * spec * sh * specW;
  col += vec3(0.7, 0.82, 0.74) * fre * 0.14;
  if (uIri > 0.2 && hit.y < 2.5 && n.y > 0.2) col += vec3(0.15, 0.35, 0.62) * fre * uIri * 0.55;
  if (hit.y > 5.5 && hit.y < 7.5) col += vec3(0.75, 0.8, 0.86) * pow(fre, 1.5) * 0.35;
  return col;
}

void main() {
  vec3 ro = uCam;
  vec3 rd = normalize(vPos - ro);
  float t = 0.001;
  bool hitB = false;
  vec2 bh = H(1e5, 0.0);
  int steps = int(uSteps);
  for (int i = 0; i < 80; i++) {
    if (i >= steps) break;
    vec3 pos = vPos + rd * t;
    if (abs(pos.x) > 2.75 || pos.y < -0.9 || pos.y > 2.25 || pos.z < -2.2 || pos.z > 1.5 || t > 6.5) break;
    bh = mapBird(pos);
    if (bh.x < 0.0013 + t * 0.00045) { hitB = true; break; }
    t += max(bh.x * 0.82, 0.0016);
  }
  if (!hitB) discard;
  vec3 pos = vPos + rd * t;
  vec3 col = shadeBird(pos, rd, bh);
  vec4 hitW = uModel * vec4(pos, 1.0);
  float dist = length(cameraPosition - hitW.xyz);
  float fog = 1.0 - exp(-uFogD * uFogD * dist * dist);
  col = mix(col, uFog, clamp(fog, 0.0, 1.0));
  vec4 clip = uProj * uView * hitW;
  gl_FragDepth = clip.z / clip.w * 0.5 + 0.5;
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

const _inv = new THREE.Matrix4();
const _cam = new THREE.Vector3();
const _sun = new THREE.Vector3();
const _pos = new THREE.Vector3();
const SUN_W = new THREE.Vector3(40, 55, 18).normalize();

function lin(rgb) {
  const c = new THREE.Color();
  c.setRGB(rgb[0], rgb[1], rgb[2]);
  return c;
}

export function createSdfBird(kind, low = false) {
  const look = LOOK[kind.id] || LOOK.swallow;
  const uniforms = {
    uCam: { value: new THREE.Vector3(0, 0.4, 3) },
    uModel: { value: new THREE.Matrix4() },
    uView: { value: new THREE.Matrix4() },
    uProj: { value: new THREE.Matrix4() },
    uSun: { value: SUN_W.clone() },
    uSunCol: { value: new THREE.Color(0xfff0d0).multiplyScalar(1.2) },
    uFog: { value: new THREE.Color(0xc5ddd0) },
    uFogD: { value: low ? 0.034 : 0.026 },
    uFlap: { value: 0 },
    uAmp: { value: look.flapAmp },
    uGlide: { value: look.glide },
    uSweep: { value: look.sweep },
    uWing: { value: look.wing },
    uFork: { value: look.fork },
    uSpots: { value: look.spots },
    uVane: { value: look.vane },
    uSlim: { value: look.slim },
    uSlot: { value: look.slot },
    uForehead: { value: look.forehead },
    uHeadPale: { value: look.headPale },
    uIri: { value: look.iri },
    uTime: { value: 0 },
    uSteps: { value: low ? 36 : 64 },
    uShadow: { value: low ? 0 : 8 },
    uAo: { value: low ? 0 : 1 },
    uBump: { value: low ? 0 : 1 },
    uStance: { value: 0 },
    uBack: { value: lin(look.back) },
    uBelly: { value: lin(look.belly) },
    uThroat: { value: lin(look.throat) },
    uWingC: { value: lin(look.wingC) },
    uBeak: { value: lin(look.beak) },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: VERT,
    fragmentShader: FRAG,
    toneMapped: true,
    fog: false,
  });
  const mesh = new THREE.Mesh(boxGeo, material);
  mesh.scale.setScalar(kind.scale);
  mesh.frustumCulled = true;
  mesh.onBeforeRender = (_r, scene, camera) => {
    mesh.updateWorldMatrix(true, false);
    uniforms.uModel.value.copy(mesh.matrixWorld);
    uniforms.uView.value.copy(camera.matrixWorldInverse);
    uniforms.uProj.value.copy(camera.projectionMatrix);
    _inv.copy(mesh.matrixWorld).invert();
    _cam.copy(camera.position).applyMatrix4(_inv);
    uniforms.uCam.value.copy(_cam);
    _sun.copy(SUN_W).transformDirection(_inv);
    uniforms.uSun.value.copy(_sun);
    if (scene.fog && scene.fog.density) uniforms.uFogD.value = scene.fog.density;
    const dist = camera.position.distanceTo(mesh.getWorldPosition(_pos));
    const mirror = camera.up.y < 0;
    const far = dist > 26 || mirror;
    uniforms.uSteps.value = mirror ? 18 : low ? (far ? 22 : 40) : (far ? 30 : 68);
    uniforms.uShadow.value = !low && !mirror && dist < 16 ? 8 : 0;
    uniforms.uAo.value = !low && !mirror && dist < 20 ? 1 : 0;
    uniforms.uBump.value = !mirror && dist < 14 ? 1 : 0;
  };
  mesh.userData.pose = (b, time) => {
    uniforms.uFlap.value = b.phase;
    uniforms.uTime.value = time;
    const sitting = b.mode === 'perch';
    uniforms.uStance.value = sitting ? 1 : b.mode === 'launch' || b.mode === 'land' ? b.fold : 0;
    uniforms.uGlide.value = b.mode === 'fly' ? look.glide : 0;
    uniforms.uAmp.value = look.flapAmp * (sitting ? 0.05 : 1 - b.fold * 0.75);
  };
  return mesh;
}
