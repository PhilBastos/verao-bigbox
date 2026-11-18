// Mascots modeled in code after assets/ref_laranja.png / ref_vermelho.png. Head = +x, up = +y, left side = +z.
// Body, bill, jaw, tail and dorsal are one sculpted volume (signed distance field, smooth-unioned),
// meshed with surface nets; the mouth is carved out of it. Markings are painted in the shader by position.
import * as THREE from 'three';

export function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}
// remap a planar shape geometry's UVs to 0..1 of its xy bounding box
export function fitUV(geo) {
  geo.computeBoundingBox();
  const { min, max } = geo.boundingBox, p = geo.attributes.position, uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++)
    uv.setXY(i, (p.getX(i) - min.x) / (max.x - min.x), (p.getY(i) - min.y) / (max.y - min.y));
  return geo;
}

// ---------- SDF toolkit ----------
const smin = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };
const smax = (a, b, k) => -smin(-a, -b, k);
function ellipsoid(x, y, z, cx, cy, cz, rx, ry, rz) {
  const px = (x - cx) / rx, py = (y - cy) / ry, pz = (z - cz) / rz;
  const k0 = Math.sqrt(px * px + py * py + pz * pz), qx = px / rx, qy = py / ry, qz = pz / rz, k1 = Math.sqrt(qx * qx + qy * qy + qz * qz);
  return k1 === 0 ? -Math.min(rx, ry, rz) : k0 * (k0 - 1) / k1;
}
// capsule a→b with radius ra→rb (in 3D)
function cone(x, y, z, ax, ay, az, bx, by, bz, ra, rb) {
  const pax = x - ax, pay = y - ay, paz = z - az, bax = bx - ax, bay = by - ay, baz = bz - az;
  const h = Math.min(1, Math.max(0, (pax * bax + pay * bay + paz * baz) / (bax * bax + bay * bay + baz * baz)));
  const ex = pax - bax * h, ey = pay - bay * h, ez = paz - baz * h;
  return Math.sqrt(ex * ex + ey * ey + ez * ez) - (ra + (rb - ra) * h);
}

// ---------- surface nets mesher ----------
function surfaceNets(f, min, max, step) {
  const nx = Math.ceil((max[0] - min[0]) / step) + 1, ny = Math.ceil((max[1] - min[1]) / step) + 1, nz = Math.ceil((max[2] - min[2]) / step) + 1;
  const V = new Float32Array(nx * ny * nz), id = (i, j, k) => i + nx * (j + ny * k);
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++)
    V[id(i, j, k)] = f(min[0] + i * step, min[1] + j * step, min[2] + k * step);
  const cid = (i, j, k) => i + (nx - 1) * (j + (ny - 1) * k);
  const vIndex = new Int32Array((nx - 1) * (ny - 1) * (nz - 1)).fill(-1), pos = [];
  const corner = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
  const edges = []; for (let a = 0; a < 8; a++) for (const bit of [1, 2, 4]) if (!(a & bit)) edges.push([a, a | bit]);
  const cv = new Float32Array(8);
  for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    let mask = 0;
    for (let c = 0; c < 8; c++) { const [a, b, d] = corner[c]; cv[c] = V[id(i + a, j + b, k + d)]; if (cv[c] < 0) mask |= 1 << c; }
    if (mask === 0 || mask === 255) continue;
    let sx = 0, sy = 0, sz = 0, n = 0;
    for (const [a, b] of edges) {
      if ((cv[a] < 0) === (cv[b] < 0)) continue;
      const t = cv[a] / (cv[a] - cv[b]), A = corner[a], B = corner[b];
      sx += A[0] + (B[0] - A[0]) * t; sy += A[1] + (B[1] - A[1]) * t; sz += A[2] + (B[2] - A[2]) * t; n++;
    }
    vIndex[cid(i, j, k)] = pos.length / 3;
    pos.push(min[0] + (i + sx / n) * step, min[1] + (j + sy / n) * step, min[2] + (k + sz / n) * step);
  }
  const idx = [];
  const quad = (a, b, c, d, flip) => { if ([a, b, c, d].some(v => v < 0)) return; flip ? idx.push(a, c, b, a, d, c) : idx.push(a, b, c, a, c, d); };
  for (let k = 1; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {  // x edges
    const s0 = V[id(i, j, k)] < 0; if (s0 === (V[id(i + 1, j, k)] < 0)) continue;
    quad(vIndex[cid(i, j - 1, k - 1)], vIndex[cid(i, j, k - 1)], vIndex[cid(i, j, k)], vIndex[cid(i, j - 1, k)], !s0);
  }
  for (let k = 1; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {  // y edges
    const s0 = V[id(i, j, k)] < 0; if (s0 === (V[id(i, j + 1, k)] < 0)) continue;
    quad(vIndex[cid(i - 1, j, k - 1)], vIndex[cid(i - 1, j, k)], vIndex[cid(i, j, k)], vIndex[cid(i, j, k - 1)], !s0);
  }
  for (let k = 0; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {  // z edges
    const s0 = V[id(i, j, k)] < 0; if (s0 === (V[id(i, j, k + 1)] < 0)) continue;
    quad(vIndex[cid(i - 1, j - 1, k)], vIndex[cid(i, j - 1, k)], vIndex[cid(i, j, k)], vIndex[cid(i - 1, j, k)], !s0);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
  return g;
}

// ---------- the two mascots ----------
// gill strokes [top, mid, bottom, width]: front one longest (rises past the eye), then shorter, then shortest
const GILLS = {
  laranja: { e: 0.21, s: [[[-1.3, 1.1], [-2.2, -1.0], [-2.3, -3.1], 0.03], [[-2.6, 0.2], [-3.2, -1.2], [-3.2, -2.6], 0.025], [[-3.8, -0.6], [-4.15, -1.4], [-4.1, -2.2], 0.02]] },
  vermelho: { e: 0.19, s: [[[-0.9, 2.1], [-1.7, -0.6], [-1.9, -3.4], 0.026], [[-2.5, 1.0], [-3.1, -0.9], [-3.2, -2.8], 0.022], [[-3.9, 0.0], [-4.3, -1.1], [-4.3, -2.1], 0.018]] },
};
const EYE = [0.98, 0.36];
function gillUniforms(kind) {
  const G = GILLS[kind], pt = ([x, y]) => [EYE[0] + x * G.e, EYE[1] + y * G.e];
  const circ = [], arc = [];
  for (const [t, m, b, w] of G.s) {
    const [ax, ay] = pt(t), [bx, by] = pt(m), [cx, cy] = pt(b);
    const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
    const ux = ((ax * ax + ay * ay) * (by - cy) + (bx * bx + by * by) * (cy - ay) + (cx * cx + cy * cy) * (ay - by)) / d;
    const uy = ((ax * ax + ay * ay) * (cx - bx) + (bx * bx + by * by) * (ax - cx) + (cx * cx + cy * cy) * (bx - ax)) / d;
    const ang = (x, y) => Math.atan2(y - uy, -(x - ux));
    circ.push(new THREE.Vector3(ux, uy, Math.hypot(ax - ux, ay - uy))); arc.push(new THREE.Vector3(ang(ax, ay), ang(cx, cy), w));
  }
  return { circ, arc };
}

const MASCOTS = {
  laranja: { name: 'laranja', kind: 0, body: '#ef7322', belly: '#f6a050', mark: '#d9342a', fill: '#f39a48', fin: '#ee7a2c', dark: '#b8241c', long: 1.0, eye: 0.9 },
  vermelho: { name: 'vermelho', kind: 1, body: '#e03a2a', belly: '#f26a4c', mark: '#f0c23c', fill: '#e03a2a', fin: '#e03a2a', dark: '#f0c23c', long: 1.0, eye: 0.8 },
};

// signed distance to a closed polygon (flat [x0,y0,x1,y1,...])
function sdPoly(px, py, V) {
  const n = V.length / 2; let d = (px - V[0]) ** 2 + (py - V[1]) ** 2, s = 1;
  for (let i = 0, j = n - 1; i < n; j = i, i++) {
    const ex = V[2 * j] - V[2 * i], ey = V[2 * j + 1] - V[2 * i + 1], wx = px - V[2 * i], wy = py - V[2 * i + 1];
    const h = Math.min(1, Math.max(0, (wx * ex + wy * ey) / (ex * ex + ey * ey))), bx = wx - ex * h, by = wy - ey * h;
    d = Math.min(d, bx * bx + by * by);
    const c1 = py >= V[2 * i + 1], c2 = py < V[2 * j + 1], c3 = ex * wy > ey * wx;
    if ((c1 && c2 && c3) || (!c1 && !c2 && !c3)) s = -s;
  }
  return s * Math.sqrt(d);
}
// caudal fin outline: forked, lobes tapering to soft tips, concave trailing edge
const TAIL = (() => {
  const s = new THREE.Shape(); s.moveTo(-0.85, 0.32);
  s.bezierCurveTo(-1.25, 0.45, -1.75, 0.95, -2.12, 1.42); s.quadraticCurveTo(-2.3, 1.62, -2.36, 1.44);
  s.bezierCurveTo(-2.1, 1.0, -1.82, 0.45, -1.68, 0.0);
  s.bezierCurveTo(-1.82, -0.45, -2.1, -1.0, -2.36, -1.44); s.quadraticCurveTo(-2.3, -1.62, -2.12, -1.42);
  s.bezierCurveTo(-1.75, -0.95, -1.25, -0.45, -0.85, -0.32); s.lineTo(-0.85, 0.32);
  const pts = s.getPoints(14).filter((p, i, a) => i === 0 || p.distanceTo(a[i - 1]) > 1e-6); // no zero-length edges
  if (pts[0].distanceTo(pts[pts.length - 1]) < 1e-6) pts.pop();
  return pts.flatMap(p => [p.x, p.y]);
})();
function tailField(x, y, z) {
  // cheap lower bound away from the fin's box
  const bx = Math.max(-2.45 - x, x + 0.7, 0), by = Math.max(Math.abs(y) - 1.7, 0), bz = Math.max(Math.abs(z) - 0.22, 0);
  const bd = Math.sqrt(bx * bx + by * by + bz * bz); if (bd > 0.25) return bd;
  const d2 = sdPoly(x, y, TAIL);
  const t = 0.17 + (0.05 - 0.17) * Math.min(1, Math.max(0, (-0.85 - x) / 1.45)); // thick root → thin tips
  const r = t * 0.85, wx = d2 + r, wy = Math.abs(z) - t + r;
  return Math.min(Math.max(wx, wy), 0) + Math.sqrt(Math.max(wx, 0) ** 2 + Math.max(wy, 0) ** 2) - r;
}

// one shared field; part weights tell the shader which markings apply where
function fishField(x, y, z) {
  const zb = z / 0.84;
  const head = ellipsoid(x, y, zb, 0.38, 0.03, 0, 0.98, 0.8, 0.8);
  const rear = cone(x, y, zb, 0.15, 0.02, 0, -1.05, 0.0, 0, 0.62, 0.16);
  // duck-bill upper lip: broad, flat, with a soft downward curl at the tip
  const bill = smin(ellipsoid(x, y, z, 1.3, -0.11, 0, 0.36, 0.15, 0.33), ellipsoid(x, y, z, 1.56, -0.19, 0, 0.12, 0.08, 0.22), 0.06);
  const jaw = ellipsoid(x, y, z, 1.05, -0.47, 0, 0.64, 0.22, 0.46);
  const body = smin(smin(smin(head, rear, 0.35), bill, 0.12), jaw, 0.14);
  const tail = tailField(x, y, z);
  // deep mouth: the head is hollow behind the lips
  const cav = ellipsoid(x, y, z, 1.12, -0.36, 0, 0.72, 0.2, 0.38);
  let d = smin(body, tail, 0.3);
  d = smax(d, -cav, 0.04);
  return { d, body, tail, cav };
}

function buildBody(C) {
  const geo = surfaceNets((x, y, z) => fishField(x, y, z).d, [-2.5, -1.75, -0.8], [1.8, 1.75, 0.8], 0.02);
  const p = geo.attributes.position, n = p.count, part = new Float32Array(n * 3), nor = new Float32Array(n * 3);
  const e = 0.004;
  for (let i = 0; i < n; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), F = fishField(x, y, z);
    // part weights: tail, dorsal, mouth interior
    part[i * 3] = THREE.MathUtils.smoothstep(F.body - F.tail, 0.0, 0.18);
    part[i * 3 + 1] = 0;
    part[i * 3 + 2] = 1 - THREE.MathUtils.smoothstep(F.cav, 0.0, 0.035);
    const gx = fishField(x + e, y, z).d - fishField(x - e, y, z).d, gy = fishField(x, y + e, z).d - fishField(x, y - e, z).d, gz = fishField(x, y, z + e).d - fishField(x, y, z - e).d;
    const l = Math.hypot(gx, gy, gz) || 1; nor[i * 3] = gx / l; nor[i * 3 + 1] = gy / l; nor[i * 3 + 2] = gz / l;
  }
  geo.setAttribute('part', new THREE.BufferAttribute(part, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));

  const mat = new THREE.MeshPhysicalMaterial({ roughness: 0.4, clearcoat: 0.3, clearcoatRoughness: 0.4, sheen: 0.5, sheenColor: new THREE.Color(C.belly) });
  const U = { uBody: C.body, uBelly: C.belly, uMark: C.mark, uFill: C.fill };
  mat.onBeforeCompile = sh => {
    for (const k in U) sh.uniforms[k] = { value: new THREE.Color(U[k]) };
    sh.uniforms.uKind = { value: C.kind };
    const g = gillUniforms(C.name); sh.uniforms.uGill = { value: g.circ }; sh.uniforms.uGillA = { value: g.arc };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 part; varying vec3 vPart; varying vec3 vObj;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPart = part; vObj = position;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vPart; varying vec3 vObj;\nuniform vec3 uBody, uBelly, uMark, uFill; uniform int uKind; uniform vec3 uGill[3]; uniform vec3 uGillA[3];\n' + MARKINGS)
      .replace('vec4 diffuseColor = vec4( diffuse, opacity );', 'vec4 diffuseColor = vec4( fishColor(vObj, vPart), opacity );');
  };
  return new THREE.Mesh(geo, mat);
}

// GLSL: all markings as functions of object-space position
const MARKINGS = /* glsl */`
float aa(float d, float w) { return 1.0 - smoothstep(w - 0.004, w + 0.004, d); }
float seg(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h); }
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
vec3 fishColor(vec3 p, vec3 part) {
  bool O = uKind == 0;
  vec3 col = mix(uBody, uBelly, smoothstep(0.0, -0.6, p.y) * 0.55);
  float side = smoothstep(0.12, 0.3, abs(p.z));

  // gill strokes: circular arcs fitted to the reference (see GILLS), tapered at both ends
  float gside = smoothstep(0.04, 0.18, abs(p.z));
  for (int i = 0; i < 3; i++) {
    vec2 q = p.xy - uGill[i].xy;
    float t = (atan(q.y, -q.x) - uGillA[i].x) / (uGillA[i].y - uGillA[i].x);
    if (t < 0.0 || t > 1.0) continue;
    float w = uGillA[i].z * pow(sin(3.14159 * t), 0.5);
    col = mix(col, uMark, gside * aa(abs(length(q) - uGill[i].z), w) * (1.0 - part.x));
  }
  if (O) {
    // freckles in front of the eye
    for (int i = 0; i < 6; i++) {
      vec2 f = vec2(1.16 + 0.05 * float(i % 3), 0.16 + 0.05 * float(i / 3) + 0.02 * float(i % 2));
      col = mix(col, uMark, side * aa(length(p.xy - f), 0.012 + 0.004 * float(i % 2)));
    }
    // two rows of dashes along the back under the dorsal
    if (p.x > -0.6 && p.x < 0.55 && p.y > 0.3) {
      float cell = floor(p.x / 0.055);
      float jz = 0.17 + 0.05 * hash(vec2(cell, 1.0));
      vec2 q = vec2((fract(p.x / 0.055) - 0.5) * 0.055, abs(p.z) - jz);
      col = mix(col, uMark, aa(length(q / vec2(0.8, 1.6)), 0.011) * (1.0 - part.y));
    }
  }

  // tail
  if (part.x > 0.01) {
    vec3 tc = uBody;
    vec2 q = vec2(p.x, abs(p.y));
    if (O) {   // clusters of red spots of mixed sizes toward the lobe tips
      for (int i = 0; i < 18; i++) {
        float fi = float(i);
        vec2 c = mix(vec2(-1.85, 0.9), vec2(-2.28, 1.46), hash(vec2(fi, 3.0))) + vec2(0.78, 0.62) * (hash(vec2(fi, 7.0)) - 0.5) * 0.24;
        tc = mix(tc, uMark, aa(length(q - c), 0.016 + 0.03 * hash(vec2(fi, 11.0))));
      }
    } else {   // wide yellow band along the trailing (inner) edge of the fork + thin yellow along the top edge
      float din = min(min(seg(q, vec2(-1.68, 0.0), vec2(-1.86, 0.5)), seg(q, vec2(-1.86, 0.5), vec2(-2.1, 1.0))), seg(q, vec2(-2.1, 1.0), vec2(-2.38, 1.46)));
      tc = mix(tc, uMark, aa(din, 0.2));
      float dout = min(min(seg(p.xy, vec2(-0.85, 0.32), vec2(-1.25, 0.5)), seg(p.xy, vec2(-1.25, 0.5), vec2(-1.75, 0.95))), seg(p.xy, vec2(-1.75, 0.95), vec2(-2.14, 1.44)));
      tc = mix(tc, uMark, aa(dout, 0.035));
    }
    col = mix(col, tc, part.x);
  }

  if (!O && p.x < -0.4 && p.y > 0.1) col = mix(col, uMark, aa(abs(p.z), 0.03)); // yellow ridge along the back to the tail
  // mouth interior: hollow, near black
  col = mix(col, vec3(0.05, 0.012, 0.01), part.z);
  return col;
}`;

export function makeFish(kind = 'laranja') {
  const C = MASCOTS[kind], L = C.long, fish = new THREE.Group();
  const add = (geo, mat, p, s = [1, 1, 1], r, parent = fish) => {
    const m = new THREE.Mesh(geo, mat); m.position.set(...p); m.scale.set(...s); if (r) m.rotation.set(...r); parent.add(m); return m;
  };
  const skinP = { roughness: 0.4, clearcoat: 0.3, clearcoatRoughness: 0.4, sheen: 0.5, sheenColor: new THREE.Color(C.belly) };
  const plain = new THREE.MeshPhysicalMaterial({ color: C.body, ...skinP });

  const body = buildBody(C); body.scale.x = L; fish.add(body);

  // eyes: bulging, high and forward; big pupil looking ahead; lid over the top
  const sph = new THREE.SphereGeometry(1, 48, 32);
  const white = new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 0.4 });
  const black = new THREE.MeshPhysicalMaterial({ color: '#050507', roughness: 0.05, clearcoat: 1 });
  const lidGeo = new THREE.SphereGeometry(1, 48, 24, 0, Math.PI * 2, 0, 0.8);
  for (const s of [1, -1]) {
    const eye = new THREE.Group(); eye.position.set(0.98 * L, 0.36, 0.42 * s); eye.rotation.set(0, -0.5 * s, 0); eye.scale.setScalar(C.eye); fish.add(eye);
    add(sph, white, [0, 0, 0], [0.24, 0.27, 0.22], null, eye);
    add(sph, black, [0.13, 0.02, 0.03 * s], [0.135, 0.18, 0.12], null, eye);
    add(lidGeo, plain, [0, 0, 0], [0.255, 0.285, 0.235], [0, 0, -0.38], eye);
  }

  // ---- fins: thin, soft membranes (parametric sheets with a gentle ripple), patterns drawn in (v, u) space
  // u: root → edge, v: back → front (or across). Canvas: x = v, y = 1 - u (top of canvas = fin edge).
  function sheet(fn, nu = 28, nv = 48) {
    const pos = [], uv = [], idx = [];
    for (let i = 0; i <= nu; i++) for (let j = 0; j <= nv; j++) {
      const u = i / nu, v = j / nv; pos.push(...fn(u, v)); uv.push(v, 1 - u);
    }
    for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
      const a = i * (nv + 1) + j, b = a + nv + 1; idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals(); return g;
  }
  const membrane = (draw) => {
    const map = canvasTex(1024, 1024, draw); map.flipY = false;
    return new THREE.MeshPhysicalMaterial({ map, side: THREE.DoubleSide, roughness: 0.45, clearcoat: 0.25, clearcoatRoughness: 0.4,
      sheen: 0.6, sheenColor: new THREE.Color(C.belly), transmission: 0.0 });
  };
  const roundTop = v => Math.pow(1 - Math.pow(Math.abs(2 * v - 1), 6), 0.22);   // rounded corners at the free edge
  const ripple = (u, v, a, k) => a * Math.sin(v * Math.PI * k + 0.6) * Math.pow(u, 1.4);

  // dorsal pattern. Canvas y: 0 = free edge, H = root; x: back → front.
  const crestPattern = (x, W, H) => {
    if (C.kind === 0) {   // red fin; light-orange ovals, each with a red dot, closed inside the fin (red margin all round)
      x.fillStyle = C.mark; x.fillRect(0, 0, W, H);
      const n = 4, gap = W * 0.04, w = (W * 0.86 - gap * (n - 1)) / n;
      for (let i = 0; i < n; i++) {
        const x0 = W * 0.07 + i * (w + gap), top = H * 0.17, bot = H * 0.74, r = w / 2;
        x.fillStyle = C.fill; x.beginPath(); x.roundRect(x0, top, w, bot - top, r); x.fill();
        x.fillStyle = C.mark; x.beginPath(); x.ellipse(x0 + w / 2, bot - r * 1.15, w * 0.16, w * 0.24, 0, 0, 7); x.fill();
      }
    } else {               // red "fingers" with rounded bottoms, separated by thin yellow lines that open into a yellow band at the root
      x.fillStyle = C.mark; x.fillRect(0, 0, W, H);
      x.save(); x.transform(1, 0, 0.22, 1, -0.22 * H, 0); // fingers lean back with the fin rays
      const n = 9, gap = 12, w = (W * 1.18 - gap * (n - 1)) / n;
      x.fillStyle = C.body;
      for (let i = 0; i < n; i++) { const x0 = i * (w + gap); x.beginPath(); x.roundRect(x0, -30, w, H * 0.8 + 30, [0, 0, w / 2, w / 2]); x.fill(); }
      x.restore();
    }
  };
  // belly fin: orange = same family as the dorsal; red = thin yellow rays
  const bellyPattern = (x, W, H) => {
    if (C.kind === 0) return crestPattern(x, W, H);
    x.fillStyle = C.body; x.fillRect(0, 0, W, H);
    x.strokeStyle = C.mark; x.lineWidth = 9; x.lineCap = 'round';
    for (let i = 0; i < 10; i++) { x.beginPath(); x.moveTo(W * (0.05 + i * 0.1), H); x.lineTo(W * (-0.05 + i * 0.11), H * 0.06); x.stroke(); }
  };
  const fanPattern = (x, W, H) => {   // pectorals (u root → edge runs down the canvas from H to 0)
    x.fillStyle = C.fin; x.fillRect(0, 0, W, H);
    if (C.kind === 0) {   // red root, bold red rays, elongated red ovals between rays near the root
      const g = x.createLinearGradient(0, H, 0, H * 0.6); g.addColorStop(0, C.dark); g.addColorStop(1, C.dark + '00');
      x.fillStyle = g; x.fillRect(0, 0, W, H);
      x.fillStyle = C.mark;
      for (let i = 0; i < 5; i++) { const vx = W * (0.1 + i * 0.2); x.beginPath(); x.roundRect(vx - 12, H * 0.04, 24, H * 0.94, 12); x.fill(); }
      for (let i = 0; i < 4; i++) { x.beginPath(); x.ellipse(W * (0.2 + i * 0.2), H * 0.62, 16, 60, 0, 0, 7); x.fill(); }
    } else {               // thin yellow rays converging at a yellow root
      x.strokeStyle = C.mark; x.lineWidth = 9; x.lineCap = 'round';
      for (let i = 0; i < 9; i++) { const vx = W * (0.06 + i * 0.11); x.beginPath(); x.moveTo(vx, H * 0.03); x.lineTo(vx, H); x.stroke(); }
      const g = x.createLinearGradient(0, H, 0, H * 0.82); g.addColorStop(0, C.mark); g.addColorStop(1, C.mark + '00');
      x.fillStyle = g; x.fillRect(0, 0, W, H);
    }
  };
  const crestMat = membrane(crestPattern), bellyMat = membrane(bellyPattern), fanMat = membrane(fanPattern);

  // dorsal: wide base along the back, taller at the front, top leaning back
  const dorsalGeo = sheet((u, v) => {
    const h = (C.kind === 0 ? 0.52 + 0.28 * v : 0.78 - 0.5 * v) * roundTop(v);
    const lean = C.kind === 0 ? 0.14 : 0.45;
    return [(-0.56 + 0.98 * v - lean * u * h) * L, 0.48 + 0.2 * v + u * h, ripple(u, v, 0.035, 3)];
  });
  fish.add(new THREE.Mesh(dorsalGeo, crestMat));

  // belly fin: same family as the dorsal, smaller, hanging under the rear belly
  const bellyGeo = sheet((u, v) => {
    const h = (0.42 + 0.06 * v) * roundTop(v);
    return [(-0.62 + 0.62 * v - 0.22 * u * h) * L, -0.42 - 0.08 * v - u * h, ripple(u, v, 0.03, 2.5)];
  });
  fish.add(new THREE.Mesh(bellyGeo, bellyMat));

  // pectoral pair: narrow root, wide rounded end; posed like the reference (near one down-back, far one forward)
  const fanGeo = sheet((u, v) => {
    const len = 0.9 + 0.08 * (1 - Math.pow(2 * v - 1, 2));
    const x = THREE.MathUtils.lerp(-0.1, 0.1, v) * (1 - u) + THREE.MathUtils.lerp(-0.42, 0.3, v) * u;
    return [x, -len * u, ripple(u, v, 0.04, 2)];
  });
  for (const [s, rz] of [[1, -0.55], [-1, 0.95]]) {
    const m = new THREE.Mesh(fanGeo, fanMat);
    m.position.set(0.5 * L, -0.42, 0.38 * s); m.rotation.set(0.35 * s, 0, rz); fish.add(m);
  }

  fish.userData.tail = new THREE.Object3D(); // tail is part of the body mesh now; swim bend comes later in the vertex shader
  return fish;
}
