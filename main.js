import * as THREE from 'three';
import { Water } from 'three/addons/objects/Water.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as OT from './assets/opentype.module.js';
import { makeFish, canvasTex } from './fish.js';
const opentype = OT.default ?? OT;

// ---------- renderer / scene ----------
const EXPORT = new URLSearchParams(location.search).has('export');   // ?export: static layers, see the end of the file
const PECA = new URLSearchParams(location.search).get('peca');   // ?peca=story|feed: vertical campaign pieces (same water world)
const KV2 = new URLSearchParams(location.search).get('kv') === 'submerso' || !!PECA;   // ?kv=submerso: the half-under KV (fish in the water)
const renderer = new THREE.WebGLRenderer({ antialias: !EXPORT, alpha: EXPORT, preserveDrawingBuffer: EXPORT });   // export: supersampled instead
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.9;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(32, innerWidth / innerHeight, 0.1, 3000);
const camBase = new THREE.Vector3(0, 2.4, 17);
camera.position.copy(camBase);

const SUN_DIR = new THREE.Vector3(0, 0.06, -1).normalize();

// ---------- sky: purple → pink → gold, sun disc + halo ----------
const skyMat = new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false,
  uniforms: { sunDir: { value: SUN_DIR } },
  vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }`,
  fragmentShader: `uniform vec3 sunDir; varying vec3 vDir;
    void main(){
      float h = clamp(vDir.y, -0.1, 1.0);
      vec3 horizon = vec3(1.0, 0.62, 0.30);
      vec3 mid     = vec3(0.95, 0.36, 0.48);
      vec3 top     = vec3(0.30, 0.10, 0.52);
      vec3 c = mix(horizon, mid, smoothstep(0.0, 0.07, h));
      c = mix(c, top, smoothstep(0.06, 0.26, h));
      float d = max(dot(normalize(vDir), sunDir), 0.0);
      c = pow(c, vec3(2.2));                              // authored in sRGB → linear
      c += vec3(1.0, 0.35, 0.08) * pow(d, 30.0) * 0.35;  // warm glow
      c += vec3(1.0, 0.60, 0.25) * pow(d, 400.0) * 0.8;  // halo
      c += vec3(3.0, 1.9, 0.9) * smoothstep(0.9995, 0.9997, d); // disc (HDR → bloom)
      gl_FragColor = vec4(c, 1.0);
    }`,
});
const sky = new THREE.Mesh(new THREE.SphereGeometry(1000, 64, 32), skyMat);
scene.add(sky);

// painted sky backdrop (generated): bottom row = horizon, sits on the water line at z = -800; keeps the image aspect.
// ponytail: flat billboard, framed for the hero camera; becomes a dome/equirect if the camera starts orbiting
// Default = sky A split in two: clean plate (assets/nuvens/fundo.jpg) + drifting cloud cutouts. ?sky=file.jpg = flat image.
const SKY_Q = new URLSearchParams(location.search).get('sky');
const texLoader = new THREE.TextureLoader();
const skyTex = await texLoader.loadAsync(SKY_Q ? 'assets/' + SKY_Q : 'assets/nuvens/fundo.jpg');
skyTex.colorSpace = THREE.SRGBColorSpace; skyTex.anisotropy = 8;
const SKY_W = 960, SKY_H = SKY_W * skyTex.image.height / skyTex.image.width;
const backdrop = new THREE.Mesh(new THREE.PlaneGeometry(SKY_W, SKY_H),
  new THREE.MeshBasicMaterial({ map: skyTex, toneMapped: false, depthWrite: false, fog: false }));
// skyGroup is anchored on the horizon (bottom edge at y = -1, z = -800); fit() scales it up on tall screens
const skyGroup = new THREE.Group(); skyGroup.position.set(0, -1, -800); scene.add(skyGroup);
backdrop.position.set(0, SKY_H / 2, 0);
skyGroup.add(backdrop);

// clouds drift sideways back and forth (slow, out of sync). Cutouts touching the image edges are cut there,
// so the swing stays under the ~60-unit margin the 16:9 camera leaves outside the frame.
const clouds = SKY_Q ? [] : await Promise.all((await (await fetch('assets/nuvens/nuvens.json')).json()).clouds.map(async (c, i) => {
  const tex = await texLoader.loadAsync('assets/nuvens/' + c.file); tex.colorSpace = THREE.SRGBColorSpace;
  const k = SKY_W / skyTex.image.width;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(c.w * k, c.h * k),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false, fog: false }));
  m.position.set((c.x + c.w / 2) * k - SKY_W / 2, SKY_H - (c.y + c.h / 2) * k, 1 + i * 0.05);
  skyGroup.add(m);
  const low = (c.y + c.h / 2) / skyTex.image.height;                  // 0 top … 1 horizon: lower clouds read farther, swing less
  return { m, x0: m.position.x, amp: 40 - 18 * low, w: (2 * Math.PI) / (48 + i * 7), ph: i * 1.7 };
}));

// environment from the sky so glossy materials reflect the sunset
const pmrem = new THREE.PMREMGenerator(renderer);
const envScene = new THREE.Scene();
envScene.add(new THREE.Mesh(new THREE.SphereGeometry(10, 64, 32), skyMat));
scene.environment = pmrem.fromScene(envScene, 0.02).texture;

// ---------- lights ----------
scene.add(new THREE.HemisphereLight(0xb07cff, 0x0f6f7a, 0.6));
const key = new THREE.DirectionalLight(0xfff0e0, 2.2); key.position.set(6, 9, 14); scene.add(key);
const rim = new THREE.DirectionalLight(0xffa15a, 3.0); rim.position.copy(SUN_DIR).multiplyScalar(50); scene.add(rim);

// ---------- water ----------
const waterNormals = new THREE.TextureLoader().load('assets/waternormals.jpg', t => {
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
});
const water = new Water(new THREE.PlaneGeometry(4000, 4000), {
  textureWidth: 1024, textureHeight: 1024,
  waterNormals, sunDirection: SUN_DIR.clone(),
  sunColor: 0xffd29a, waterColor: 0x0b7f8c, distortionScale: 0.9, fog: false,
});
water.rotation.x = -Math.PI / 2;
water.material.uniforms.size.value = 6.0;
// tame the mirror: Water.js is fully reflective at grazing angles; keep a turquoise body
water.material.fragmentShader = water.material.fragmentShader
  .replace('float reflectance = rf0 + ( 1.0 - rf0 ) * pow( ( 1.0 - theta ), 5.0 );',
           'float reflectance = (rf0 + ( 1.0 - rf0 ) * pow( ( 1.0 - theta ), 5.0 )) * 0.75;')
  .replace('vec3 scatter = max( 0.0, dot( surfaceNormal, eyeDirection ) ) * waterColor;',
           'vec3 scatter = (0.55 + 0.45 * max( 0.0, dot( surfaceNormal, eyeDirection ) )) * waterColor;');
scene.add(water);

// ---------- title "Verão" (Pacifico, extruded: white face, purple sides) ----------
async function makeTitle() {
  const buf = await (await fetch('assets/pacifico.woff')).arrayBuffer();
  const font = opentype.parse(buf);
  const path = font.getPath('Verão', 0, 0, 3.2);
  const sp = new THREE.ShapePath();
  for (const c of path.commands) {
    if (c.type === 'M') sp.moveTo(c.x, -c.y);
    else if (c.type === 'L') sp.lineTo(c.x, -c.y);
    else if (c.type === 'Q') sp.quadraticCurveTo(c.x1, -c.y1, c.x, -c.y);
    else if (c.type === 'C') sp.bezierCurveTo(c.x1, -c.y1, c.x2, -c.y2, c.x, -c.y);
  }
  const shapes = sp.toShapes(false);
  const geo = new THREE.ExtrudeGeometry(shapes, {
    depth: 0.45, curveSegments: 14, bevelEnabled: true,
    bevelThickness: 0.14, bevelSize: 0.07, bevelSegments: 8,
  });
  geo.computeBoundingBox(); const c = geo.boundingBox.getCenter(new THREE.Vector3()).negate();
  geo.translate(c.x, c.y, c.z);
  // dark "sticker" outline behind the letters (fat bevel = offset contour) so the white reads against any sky
  const rim = new THREE.ExtrudeGeometry(shapes, { depth: 0.3, curveSegments: 14, bevelEnabled: true,
    bevelThickness: 0.04, bevelSize: 0.17, bevelSegments: 2 });
  rim.translate(c.x, c.y, c.z - 0.22);
  // matte-ish face: no clearcoat, little sky reflection, so no blooming hot spots over the letters
  const face = new THREE.MeshStandardMaterial({ color: 0xfffaf4, roughness: 0.5, envMapIntensity: 0.25, emissive: 0xfff4ea, emissiveIntensity: 0.32 });
  const side = new THREE.MeshStandardMaterial({ color: 0x6a24a8, roughness: 0.38, envMapIntensity: 0.6 });
  const g = new THREE.Group();
  g.add(new THREE.Mesh(geo, [face, side]), new THREE.Mesh(rim, new THREE.MeshStandardMaterial({ color: 0x2c0b4f, roughness: 0.6 })));
  return g;
}

// ---------- Big Box plate ----------
// ponytail: fake extrusion (stacked alpha layers of the PNG); swap for SVG extrude when a good vector logo arrives
// (the auto-traced assets/marca/marca.svg was rejected by the client)
function makeLogo() {
  const tex = new THREE.TextureLoader().load('assets/logo.webp');
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  const W = 4.6, H = W * 358 / 1771, g = new THREE.Group();
  const plane = new THREE.PlaneGeometry(W, H);
  const layers = 18, depth = 0.32;
  for (let i = 0; i < layers; i++) {
    const m = new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.5, alphaToCoverage: true, color: 0x3d0f63, roughness: 0.5 });
    const l = new THREE.Mesh(plane, m); l.position.z = -depth * (i + 1) / layers; g.add(l);
  }
  const front = new THREE.Mesh(plane, new THREE.MeshPhysicalMaterial({
    map: tex, alphaTest: 0.5, alphaToCoverage: true, roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.1,
    emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.35,
  }));
  g.add(front);
  return g;
}

// foam ring where a fish breaks the surface
function makeFoam() {
  const tex = canvasTex(256, 256, (x, W, H) => {
    const g = x.createRadialGradient(W / 2, H / 2, W * 0.18, W / 2, H / 2, W / 2);
    g.addColorStop(0, '#fff0'); g.addColorStop(0.35, '#ffffffcc'); g.addColorStop(0.6, '#ffffff44'); g.addColorStop(1, '#fff0');
    x.fillStyle = g; x.fillRect(0, 0, W, H);
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.position.y = 0.02; return m;
}

// ---------- debug: ?fish=laranja|vermelho  (&ry=&rx= fixed angle, &cmp = white bg + reference side by side)
{
  const q = new URLSearchParams(location.search);
  if (q.has('fish')) {
    const kind = q.get('fish') || 'laranja', f = makeFish(kind), ry = q.get('ry'), rx = +(q.get('rx') || 0);
    f.position.set(0, 2.5, 8); f.rotation.order = 'YXZ'; scene.add(f);
    camera.position.set(+(q.get('cx') || 0), 2.5 + +(q.get('cy') || 0.4), +(q.get('cz') || 14.5)); camera.lookAt(0, 2.5, 8);
    if (q.has('cmp')) {
      for (const o of [water, backdrop, sky]) o.visible = false;
      scene.background = new THREE.Color('#ffffff');
      const half = () => { renderer.setSize(innerWidth / 2, innerHeight); camera.aspect = innerWidth / 2 / innerHeight; camera.updateProjectionMatrix(); };
      half(); addEventListener('resize', half);
      document.body.style.background = '#fff'; document.getElementById('tag')?.remove();
      const img = Object.assign(document.createElement('img'), { src: `assets/ref_${kind}.png` });
      Object.assign(img.style, { position: 'fixed', right: 0, top: 0, width: '50vw', height: '100vh', objectFit: 'contain', background: '#fff' });
      document.body.appendChild(img);
    }
    const c = new THREE.Clock();
    renderer.setAnimationLoop(() => { f.rotation.y = ry !== null ? +ry : c.getElapsedTime() * 0.6; f.rotation.x = rx; renderer.render(scene, camera); });
    throw 'fish debug';
  }
}

// ---------- assemble ----------
const hero = new THREE.Group(); scene.add(hero);
const title = await makeTitle(); title.position.set(0, 2.55, 0); hero.add(title);
const logo = makeLogo(); logo.position.set(0.25, 0.8, 0.6); hero.add(logo);

// two mascots (GLB from Flora: unit length along x, centred, head = +x). The *-anim.glb copies carry helpers baked by
// fish_attrs.py: _fin (0 body … 1 fin tip) and _findir (fin bend direction). Eyes: model-space centre + radius, lid colour.
// Everything moves in the shaders: body S-wave, fins rippling like fabric, gill breathing, an eyelid for blinks.
const gltf = new GLTFLoader(), fishMats = [];
// loading screen (#carregando in index.html): bytes of the three models, which are nearly all of the wait
const carga = {}, pct = document.querySelector('#carregando b'), ESPERADO = 8.7e6;   // ponytail: total fixo; atualizar se os GLBs mudarem
const progresso = k => e => { carga[k] = e.loaded; if (pct) pct.textContent = Math.min(99, Math.round(100 * Object.values(carga).reduce((a, b) => a + b, 0) / ESPERADO)) + '%'; };
async function loadFish(file, length, eyes, lid) {
  const { scene: m } = await gltf.loadAsync(file, progresso(file));
  const u = { uSwim: { value: 0 }, uPhase: { value: 0 }, uArch: { value: 0 }, uFin: { value: 0 }, uFinPhase: { value: 0 },
    uBreath: { value: 0 }, uBlink: { value: 0 }, uEye: { value: eyes.map(([x, y, z, r]) => new THREE.Vector4(x, y, z, r)) },
    uLid: { value: new THREE.Color().setRGB(...lid, THREE.SRGBColorSpace) } };
  m.traverse(o => {
    if (!o.isMesh) return;
    // flat, toy-like finish: the Tripo normal map and roughness/metal map put bumps and speckles on the fins
    Object.assign(o.material, { normalMap: null, roughnessMap: null, metalnessMap: null, roughness: 0.42, metalness: 0 });
    fishMats.push(o.material);
  });
  m.traverse(o => { if (o.isMesh) o.material.onBeforeCompile = s => {
    Object.assign(s.uniforms, u);
    s.vertexShader = `uniform float uSwim, uPhase, uArch, uFin, uFinPhase, uBreath;
      attribute float _fin; attribute vec3 _findir; varying vec3 vLoc;\n` + s.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      vLoc = position;
      float tl = clamp(0.5 - transformed.x, 0.0, 1.0);                                  // 0 at the snout, 1 at the tail tip
      transformed.z += uSwim * pow(tl, 1.6) * sin(tl * 5.5 - uPhase);                   // body S-wave, grows toward the tail
      transformed += _findir * _fin * uFin * sin(uFinPhase - _fin * 4.0 - position.x * 9.0);  // fins ripple root → tip
      transformed.yz *= 1.0 + uBreath * exp(-pow((position.x - 0.2) / 0.07, 2.0)) * (1.0 - _fin);  // gills breathe
      transformed.y -= uArch * transformed.x * transformed.x;                            // dolphin arch while airborne`);
    s.fragmentShader = `uniform float uBlink; uniform vec4 uEye[2]; uniform vec3 uLid; varying vec3 vLoc;\n` + s.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
      if (uBlink > 0.001) for (int e = 0; e < 2; e++) {                                // lid sweeps down over the painted eye
        vec3 d = vLoc - uEye[e].xyz; float r = uEye[e].w;
        float inside = 1.0 - smoothstep(r * 0.9, r * 1.05, length(d));
        float mx = max(diffuseColor.r, max(diffuseColor.g, diffuseColor.b)), mn = min(diffuseColor.r, min(diffuseColor.g, diffuseColor.b));
        float eye = inside * max(1.0 - smoothstep(0.15, 0.35, (mx - mn) / max(mx, 1e-3)), 1.0 - step(0.03, mx));  // white or pupil
        float edge = r * (1.0 - 2.2 * uBlink);
        diffuseColor.rgb = mix(diffuseColor.rgb, uLid, smoothstep(edge - 0.004, edge + 0.004, d.y) * eye);
        diffuseColor.rgb *= 1.0 - 0.7 * exp(-pow((d.y - edge) / 0.005, 2.0)) * eye;  // lash line
      }`);
  }; });
  const g = new THREE.Group(); g.add(m); g.scale.setScalar(length); g.rotation.order = 'YXZ'; scene.add(g);
  g.userData.u = u; return g;
}
const [laranja, vermelho] = await Promise.all([
  loadFish('assets/mascote-laranja-anim.glb', 3.3, [[0.3232, 0.0489, 0.1275, 0.0659], [0.3194, 0.048, -0.1306, 0.0645]], [0.902, 0.408, 0.145]),
  loadFish('assets/mascote-vermelho-anim.glb', 3.45, [[0.332, 0.0223, 0.0988, 0.0538], [0.3343, 0.0246, -0.0975, 0.053]], [0.863, 0.204, 0.161])]);

// ---------- summer accessories, built in each fish's own unit space (x forward, y up, z sideways) ----------
// sizes come from the geometry: eye centres/radii (measured by fish_attrs.py) and the head's top / width read here
function headProbe(fish) {
  let mesh; fish.traverse(o => { if (o.isMesh && !mesh) mesh = o; });
  const P = mesh.geometry.attributes.position, Nn = mesh.geometry.attributes.normal, n = P.count;
  const scan = (test, pick, init) => { let v = init; for (let i = 0; i < n; i++) if (test(P.getX(i), P.getY(i), P.getZ(i))) v = pick(v, i); return v; };
  return {
    mesh, parent: mesh.parent,
    top: x0 => scan((x, y, z) => Math.abs(x - x0) < 0.012 && Math.abs(z) < 0.035, (v, i) => Math.max(v, P.getY(i)), -1),
    half: (x0, y0) => scan((x, y, z) => Math.abs(x - x0) < 0.012 && Math.abs(y - y0) < 0.03, (v, i) => Math.max(v, Math.abs(P.getZ(i))), 0),
    normal: (c, r) => scan((x, y, z) => (x - c.x) ** 2 + (y - c.y) ** 2 + (z - c.z) ** 2 < r * r,
      (v, i) => v.add(new THREE.Vector3(Nn.getX(i), Nn.getY(i), Nn.getZ(i))), new THREE.Vector3()).normalize(),
  };
}
const tube = (pts, r, mat) => new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 32, r, 10), mat);
function sunglasses(fish, eyes, model) {
  // the sunglasses are a real model (Magnific image → Flora / Tripo 3D, assets/oculos.glb). Here it is only oriented,
  // scaled so each lens sits centred over an eye, set just ahead of the forehead (the snout passes under the bridge)
  // and its arms bent inward so they rest along the sides of the fish's head, which is narrower than a person's.
  const h = headProbe(fish), P = h.mesh.geometry.attributes.position;
  const [xe, ye, ze, r] = eyes[0], Z = Math.abs(ze);
  const g = model.clone(true);
  g.traverse(o => { if (o.isMesh) { const ob = o.material.onBeforeCompile; o.geometry = o.geometry.clone(); o.material = o.material.clone(); o.material.onBeforeCompile = ob; } });   // clone() drops the shader hook
  g.updateMatrixWorld(true);
  // gather every vertex in the model's own space to find its axes: height = thinnest, depth = the axis with the dense front
  const pts = [];
  g.traverse(o => { if (o.isMesh) { const p = o.geometry.attributes.position, v = new THREE.Vector3(); for (let i = 0; i < p.count; i++) pts.push(v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld).toArray()); } });
  const lo = [0, 1, 2].map(a => Math.min(...pts.map(p => p[a]))), hi = [0, 1, 2].map(a => Math.max(...pts.map(p => p[a])));
  const ext = hi.map((v, a) => v - lo[a]), up = ext.indexOf(Math.min(...ext));
  const [a1, a2] = [0, 1, 2].filter(a => a !== up);
  const endCount = (a, end) => pts.filter(p => (end > 0 ? hi[a] - p[a] : p[a] - lo[a]) < ext[a] * 0.12).length;
  const asym = a => Math.abs(endCount(a, 1) - endCount(a, -1)) / (endCount(a, 1) + endCount(a, -1));
  const dep = asym(a1) > asym(a2) ? a1 : a2, wid = dep === a1 ? a2 : a1;
  const frontSign = endCount(dep, 1) > endCount(dep, -1) ? 1 : -1;
  // map model → fish space: depth (toward the front) → +x, height → +y, width → z
  const W = ext[wid], D = ext[dep], cW = (lo[wid] + hi[wid]) / 2, cU = (lo[up] + hi[up]) / 2, front = frontSign > 0 ? hi[dep] : lo[dep];
  const s = Z / (W * 0.285);                                                         // lens centres ≈ ±26% of the width, pair ~9% smaller
  const slab = D * 0.14;                                                             // thickness of the front frame
  let xF = 0;
  for (let i = 0; i < P.count; i++) if (Math.abs(P.getZ(i)) < 0.06 && P.getY(i) > ye + 0.45 * r && P.getY(i) < ye + r) xF = Math.max(xF, P.getX(i));
  const xFront = xF - 0.01 + slab * s;                                              // bridge rests a touch into the snout, like on a nose
  const tail = Math.max(0.01, (D - slab) * s);
  const GX0 = -0.25, GY0 = -0.3, GS = 0.01, GNX = 85, GNY = 60, grid = new Float32Array(GNX * GNY);   // head half-width map
  for (let i = 0; i < P.count; i++) {
    const ix = Math.floor((P.getX(i) - GX0) / GS), iy = Math.floor((P.getY(i) - GY0) / GS);
    if (ix >= 0 && ix < GNX && iy >= 0 && iy < GNY) grid[iy * GNX + ix] = Math.max(grid[iy * GNX + ix], Math.abs(P.getZ(i)));
  }
  const headHalf = (x, y) => {                                                     // max over the 3×3 neighbourhood (safe side)
    const ix = Math.floor((x - GX0) / GS), iy = Math.floor((y - GY0) / GS); let w = 0;
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
      const jx = ix + a, jy = iy + b; if (jx >= 0 && jx < GNX && jy >= 0 && jy < GNY) w = Math.max(w, grid[jy * GNX + jx]);
    }
    return w;
  };
  // arms move as rigid pieces, one smooth profile per side along the depth (moving vertices one by one crumples them):
  // the drooping temple tips are straightened, then each arm is pulled in to rest just off the head without entering it
  const meshes = []; g.traverse(o => { if (o.isMesh) meshes.push(o); });
  const b0 = slab * s, bL = D * s, NB = 48, gap = 0.006;
  const V = meshes.map(o => { const p = o.geometry.attributes.position, v = new THREE.Vector3(), out = new Float32Array(p.count * 4);
    for (let i = 0; i < p.count; i++) { const a = v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld).toArray(), back = (front - a[dep]) * frontSign * s;
      out.set([xFront - back, ye + 0.05 * r + (a[up] - cU) * s, (a[wid] - cW) * s, back], i * 4); }
    return out; });
  const fb = back => Math.min(Math.max((back - b0) / (bL - b0) * NB - 0.5, 0), NB - 1);
  const at = (A, back) => { const f = fb(back), i = Math.floor(f), j = Math.min(i + 1, NB - 1); return A[i] + (A[j] - A[i]) * (f - i); };
  const blur = (A, k) => A.map((_, i) => { let t = 0, n = 0; for (let j = Math.max(0, i - k); j <= Math.min(NB - 1, i + k); j++) { t += A[j]; n++; } return t / n; });
  const fill = A => A.map((v, i) => v ?? A.slice(i).find(w => w != null) ?? A.slice(0, i).reverse().find(w => w != null));
  const profile = (val, red) => [0, 1].map(sd => { const B = Array(NB).fill(null);
    for (const out of V) for (let i = 0; i < out.length; i += 4) if (out[i + 3] > b0 && (out[i + 2] > 0 ? 0 : 1) === sd) {
      const b = Math.round(fb(out[i + 3])), w = val(out, i); B[b] = B[b] == null ? w : red(B[b], w); }
    return fill(B); });
  const yMid = profile((o, i) => [o[i + 1], 1], (a, b) => [a[0] + b[0], a[1] + b[1]]).map(A => blur(A.map(([t, n]) => t / n), 3));
  for (const out of V) for (let i = 0; i < out.length; i += 4) if (out[i + 3] > b0) {
    const Y = yMid[out[i + 2] > 0 ? 0 : 1]; out[i + 1] -= at(Y, out[i + 3]) - Y[0]; }    // tips level with the hinge
  const inner = profile((o, i) => Math.abs(o[i + 2]), Math.min).map(A => blur(A, 2));
  const head = profile((o, i) => headHalf(o[i], o[i + 1]), Math.max).map(A => blur(A.map((_, i) => Math.max(...A.slice(Math.max(0, i - 1), i + 2))), 2));
  meshes.forEach((o, m) => {
    const out = V[m], p = o.geometry.attributes.position, arm = new Float32Array(p.count);
    for (let i = 0; i < p.count; i++) {
      let [x, y, z, back] = out.subarray(i * 4, i * 4 + 4);
      if (back > b0) {
        const sd = z > 0 ? 0 : 1, need = at(head[sd], back) + gap - at(inner[sd], back);
        const t = THREE.MathUtils.smoothstep(back, b0, b0 + 0.4 * tail);
        z += (sd ? -1 : 1) * Math.max(need * t, need);                             // ease inward, but always clear the head
      }
      arm[i] = THREE.MathUtils.clamp((back - 0.92 * b0) / (0.2 * b0), 0, 1);
      p.setXYZ(i, x, y, z);
    }
    o.geometry.setAttribute('arm', new THREE.BufferAttribute(arm, 1));
    o.geometry.computeVertexNormals(); o.position.set(0, 0, 0); o.rotation.set(0, 0, 0); o.scale.set(1, 1, 1);
  });
  const flat = new THREE.Group(); g.traverse(o => { if (o.isMesh) flat.add(o.clone()); });
  h.parent.add(flat); return flat;
}
const oculos = (await gltf.loadAsync('assets/oculos.glb', progresso('oculos'))).scene;
oculos.traverse(o => {
  if (!o.isMesh) return;
  Object.assign(o.material, { normalMap: null, roughnessMap: null, metalnessMap: null, metalness: 0, roughness: 0.22, transparent: true });
  o.material.onBeforeCompile = sh => {                                            // tinted lenses (the eyes show through), black arms
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float arm; varying float vArm;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvArm = arm;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vArm;')
      .replace('#include <map_fragment>', `#include <map_fragment>
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.012, 0.01, 0.01), vArm);          // the generated arm texture is mottled gold
      float lumS = pow(dot(diffuseColor.rgb, vec3(0.3333)), 1.0 / 2.2);                 // back to sRGB-ish luminance
      float lens = smoothstep(0.17, 0.23, lumS) * (1.0 - smoothstep(0.44, 0.52, lumS)) * (1.0 - vArm);
      diffuseColor.rgb *= 1.0 - 0.5 * lens;
      diffuseColor.a *= 1.0 - 0.2 * lens;`);
  };
});
const oculosL = sunglasses(laranja, [[0.3232, 0.0489, 0.1275, 0.0659], [0.3194, 0.048, -0.1306, 0.0645]], oculos);
sunglasses(vermelho, [[0.332, 0.0223, 0.0988, 0.0538], [0.3343, 0.0246, -0.0975, 0.053]], oculos);

// ---------- choreography: KV pose → porpoise dive → crossed leap over the title → resurface → park on the KV frame
const TILT = 0.72, FISH_Y = 0.02, KV_X = 3.3, KV_Z = 4.6;                    // nose up ~41°, face toward the viewer
const VIRA = +(new URLSearchParams(location.search).get('vira') ?? 0.8);  // turn toward the camera (rad); ?vira= overrides for review
const T_DIVE = 1.2, DJ = 1.7, EMERGE = 1.1, JX = 7.2, JB = -1.8;      // dive start, leap length (s), leap span, leap start depth
const HOP = 1.6, HA = HOP * Math.tan(TILT), HB = HA + FISH_Y + 2.8;   // dive hop: leaves at TILT, ends 2.8 under
const cast = [
  { f: laranja, s: -1, yaw: 0.1, jt: 2.9, jz: 1.2, jh: 5.6, et: 5.6 },           // s = side, jt/jz/jh = leap time/depth/apex, et = resurface
  { f: vermelho, s: 1, yaw: Math.PI - 0.1, jt: 3.5, jz: 3.6, jh: 5.0, et: 6.1 },
];
const END = Math.max(...cast.map(c => c.et)) + EMERGE;
const clamp01 = k => Math.min(Math.max(k, 0), 1), ease = k => k * k * (3 - 2 * k);
const back = k => 1 + 2.70158 * (k - 1) ** 3 + 1.70158 * (k - 1) ** 2;   // ease-out with overshoot
cast.forEach((c, i) => {
  c.ph = i * 1.3;
  c.foam = makeFoam(); c.foam.scale.setScalar(1.9); c.foam.position.set(c.s * (KV_X - 0.35), 0.02, KV_Z); scene.add(c.foam);
});

function pose(c, T, t) {
  const d = -c.s, bob = Math.sin(t * 1.7 + c.ph) * 0.06, nod = Math.sin(t * 1.7 + c.ph + 0.8) * 0.05;
  const p = { x: c.s * KV_X, y: FISH_Y + bob, z: KV_Z, yaw: c.yaw + c.s * VIRA + 0.06 * Math.sin(t * 0.45 + c.ph),   // slow look-around
    pitch: TILT + nod, swim: 0.04, arch: 0, foam: 1 };
  if (T < T_DIVE || T >= c.et + EMERGE) return p;                        // the KV frame
  if (T < T_DIVE + 1) {                                                   // porpoise dive: short hop, nose over, under
    const k = T - T_DIVE;
    p.x += d * HOP * k; p.y = FISH_Y + HA * k - HB * k * k + bob * (1 - k);
    p.pitch = Math.atan2(HA - 2 * HB * k, HOP) + nod * (1 - k); p.swim = 0.08; p.foam = 1 - clamp01(k * 4);
    return p;
  }
  const j = (T - c.jt) / DJ;
  if (j >= 0 && j <= 1) {                                                 // the leap over the title
    const H = c.jh - JB;
    Object.assign(p, { x: c.s * JX * (1 - 2 * j), y: JB + H * 4 * j * (1 - j), z: c.jz, yaw: d > 0 ? 0 : Math.PI,
      pitch: Math.atan2(H * 4 * (1 - 2 * j), 2 * JX), arch: 0.45 * Math.sin(Math.PI * j), swim: 0.05, foam: 0 });
    return p;
  }
  const e = (T - c.et) / EMERGE;
  if (e >= 0) {                                                           // resurface into the KV pose with a little pop
    p.y = -2.6 + (p.y + 2.6) * back(e); p.pitch = 1.4 + (p.pitch - 1.4) * ease(e); p.swim = 0.08; p.foam = clamp01(e * 2 - 0.6);
    return p;
  }
  p.y = -6; p.foam = 0; return p;                                         // under water, out of sight
}

// splashes: stateless (pure function of timeline time), so the loop can be scrubbed with ?t=
const splashes = cast.flatMap(c => {
  const d = -c.s, jc = (1 - Math.sqrt(1 + JB / (c.jh - JB))) / 2;       // leap fraction where the body crosses y = 0
  return [
    { t: T_DIVE + 0.45, x: c.s * KV_X + d * (HOP * 0.45 + 0.6), z: KV_Z, k: 0.7 },
    { t: c.jt + jc * DJ, x: c.s * JX * (1 - 2 * jc), z: c.jz, k: 1 },
    { t: c.jt + (1 - jc) * DJ, x: -c.s * JX * (1 - 2 * jc), z: c.jz, k: 1.25 },
    { t: c.et + 0.12 * EMERGE, x: c.s * KV_X + d * 0.4, z: KV_Z, k: 0.8 },
  ];
});
const N = 140, rnd = i => { const v = Math.sin(i * 12.9898) * 43758.5453; return v - Math.floor(v); };
const dropPos = new Float32Array(splashes.length * N * 3), dropCol = new Float32Array(splashes.length * N * 4).fill(1);
const dropGeo = new THREE.BufferGeometry();
dropGeo.setAttribute('position', new THREE.BufferAttribute(dropPos, 3));
dropGeo.setAttribute('color', new THREE.BufferAttribute(dropCol, 4));
const dotTex = canvasTex(64, 64, (x, W, H) => {
  const g = x.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, W / 2);
  g.addColorStop(0, '#fff'); g.addColorStop(0.45, '#ffffffaa'); g.addColorStop(1, '#fff0');
  x.fillStyle = g; x.fillRect(0, 0, W, H);
});
const drops = new THREE.Points(dropGeo, new THREE.PointsMaterial({
  size: 0.16, map: dotTex, color: 0xfff1de, vertexColors: true, transparent: true, depthWrite: false }));
drops.frustumCulled = false; scene.add(drops);
const rings = splashes.map(() => { const r = makeFoam(); scene.add(r); return r; });

function updateSplashes(T) {
  splashes.forEach((s, e) => {
    const age = T - s.t, r = rings[e], a = age / 1.6;
    r.visible = a > 0 && a < 1;
    if (r.visible) { r.position.set(s.x, 0.03, s.z); r.scale.setScalar(s.k * (1 + 3.2 * (1 - (1 - a) ** 3))); r.material.opacity = (1 - a) * 0.9; }
    for (let i = 0; i < N; i++) {
      const n = e * N + i, q = n * 7, th = rnd(q) * 6.283, r0 = 0.4 * s.k * rnd(q + 3);
      const vh = (0.4 + 1.8 * rnd(q + 1)) * s.k, vy = (2.5 + 4.5 * rnd(q + 2) ** 2) * s.k, y = vy * age - 7 * age * age;
      dropPos.set([s.x + Math.cos(th) * (r0 + vh * age), y, s.z + Math.sin(th) * (r0 + vh * age)], n * 3);
      dropCol[n * 4 + 3] = age > 0 && y > 0 ? 1 - clamp01(age / 1.4) : 0;
    }
  });
  dropGeo.attributes.position.needsUpdate = dropGeo.attributes.color.needsUpdate = true;
}

// ---------- underwater world (drawn only in the "below" render) ----------
const UW = new THREE.Color(0x0a5d73), uwFog = new THREE.FogExp2(UW, 0.075);
const UW0 = UW.clone(), DEEP = new THREE.Color(0x052636);   // deeper in the page: darker water, fainter sun shafts
let uwBase = 0.075, rayK = 1;
// the surface seen from below: bright Snell's window overhead, darker mirror outside it, slow shimmer
const underside = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), new THREE.ShaderMaterial({
  uniforms: { time: { value: 0 }, camPos: { value: camera.position }, fogColor: { value: UW }, density: { value: uwFog.density } },
  vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.); vW = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w; }`,
  fragmentShader: `uniform float time, density; uniform vec3 camPos, fogColor; varying vec3 vW;
    void main(){
      vec3 v = normalize(vW - camPos);
      float win = smoothstep(0.62, 0.8, v.y);
      vec2 q = vW.xz * 0.45;
      float n = sin(q.x * 3.1 + time * 0.9) * sin(q.y * 2.7 - time * 0.7) + 0.6 * sin((q.x - q.y) * 4.3 + time * 1.3);
      vec3 c = mix(vec3(0.02, 0.22, 0.27), vec3(0.75, 0.95, 0.9), win);
      c += vec3(0.35, 0.55, 0.5) * smoothstep(0.7, 1.4, n) * (0.35 + win);
      float f = 1. - exp(-pow(density * length(vW - camPos) * 0.6, 2.));
      gl_FragColor = vec4(mix(c, fogColor, f), 1.);
    }`,
}));
underside.rotation.x = Math.PI / 2; underside.position.y = -0.01; scene.add(underside);

// light shafts hanging from the surface, slanted toward the low sun
const rayTex = canvasTex(64, 256, (x, W, H) => {
  const g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#fff'); g.addColorStop(1, '#fff0');
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  x.globalCompositeOperation = 'destination-in';
  const h = x.createLinearGradient(0, 0, W, 0); h.addColorStop(0, '#fff0'); h.addColorStop(0.5, '#fff'); h.addColorStop(1, '#fff0');
  x.fillStyle = h; x.fillRect(0, 0, W, H);
});
const rays = new THREE.Group(); scene.add(rays);
for (let i = 0; i < 9; i++) {
  const g = new THREE.PlaneGeometry(1.2 + rnd(i * 5) * 2.2, 16); g.translate(0, -8, 0);
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: rayTex, color: 0xbff8ff, transparent: true,
    opacity: 0.1 + 0.1 * rnd(i * 5 + 1), blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  m.position.set((rnd(i * 5 + 2) - 0.5) * 26, 0, (rnd(i * 5 + 3) - 0.5) * 14 - 1);
  m.rotation.z = 0.25 + (rnd(i * 5 + 4) - 0.5) * 0.12; m.userData.o = m.material.opacity; rays.add(m);
}

// rising bubbles (stateless, like the splashes)
const NB = 160, bubPos = new Float32Array(NB * 3), bubGeo = new THREE.BufferGeometry();
bubGeo.setAttribute('position', new THREE.BufferAttribute(bubPos, 3));
const bubbles = new THREE.Points(bubGeo, new THREE.PointsMaterial({ size: 0.09, map: dotTex, color: 0xdffcff, transparent: true, opacity: 0.75, depthWrite: false }));
bubbles.frustumCulled = false; scene.add(bubbles);
function updateUnderwater(t) {
  for (let i = 0; i < NB; i++) {
    const y = -12 + ((t * (0.5 + rnd(i * 11 + 500)) + rnd(i * 11 + 501) * 12) % 12);
    bubPos.set([(rnd(i * 11 + 502) - 0.5) * 24 + 0.15 * Math.sin(t * 2 + i), y, (rnd(i * 11 + 503) - 0.5) * 14 + 2], i * 3);
  }
  bubGeo.attributes.position.needsUpdate = true;
  rays.children.forEach((m, i) => { m.material.opacity = m.userData.o * (0.7 + 0.3 * Math.sin(t * 0.8 + i * 2.1)) * rayK; m.position.x += Math.sin(t * 0.3 + i) * 0.002; });
  underside.material.uniforms.time.value = t; floor.material.uniforms.time.value = t;
}

// sand floor with moving caustics (caustic pattern after the well-known tileable water caustic shader by joltz0r / Dave_Hoskins)
const floor = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), new THREE.ShaderMaterial({
  uniforms: { time: { value: 0 }, camPos: { value: camera.position }, fogColor: { value: UW }, density: { value: uwFog.density } },
  vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.); vW = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w; }`,
  fragmentShader: `uniform float time, density; uniform vec3 camPos, fogColor; varying vec3 vW;
    float caustic(vec2 uv, float t) {
      vec2 p = mod(uv * 6.2831853, 6.2831853) - 250.0, i = p; float c = 1.0;
      for (int n = 0; n < 5; n++) {
        float tt = t * (1.0 - 3.5 / float(n + 1));
        i = p + vec2(cos(tt - i.x) + sin(tt + i.y), sin(tt - i.y) + cos(tt + i.x));
        c += 1.0 / length(vec2(p.x / (sin(i.x + tt) / 0.005), p.y / (cos(i.y + tt) / 0.005)));
      }
      c = 1.17 - pow(c / 5.0, 1.4); return pow(abs(c), 8.0);
    }
    void main(){
      vec2 q = vW.xz * 0.16;
      float rip = 0.5 + 0.5 * sin(vW.x * 1.3 + sin(vW.z * 0.9) * 2.0);                       // soft sand ripples
      vec3 sand = mix(vec3(0.42, 0.52, 0.42), vec3(0.62, 0.68, 0.52), rip * 0.5);
      vec3 c = sand + vec3(0.55, 0.9, 0.85) * caustic(q, time * 0.45) * 0.9;
      float f = 1. - exp(-pow(density * length(vW - camPos), 2.));
      gl_FragColor = vec4(mix(c, fogColor, f), 1.);
    }`,
}));
floor.rotation.x = -Math.PI / 2; floor.position.y = PECA ? -5 : KV2 ? -3.6 : -6; scene.add(floor);   // pieces: deeper, more blue behind the products   // deeper under the swimming path

const aboveOnly = [water, backdrop, sky, ...clouds.map(c => c.m)], belowOnly = [underside, rays, bubbles, floor];
function setWorld(under) {
  for (const o of aboveOnly) o.visible = !under;
  for (const o of belowOnly) o.visible = under;
  // above: horizon colour as background, so the water's mirror never samples black just under the reflected horizon
  scene.fog = under ? uwFog : null; scene.background = under ? UW : HORIZON;
  for (const m of fishMats) m.envMapIntensity = under ? 0.3 : 1;   // no bright sunset reflections under water
}
const HORIZON = new THREE.Color(0xfdbf69);

// ---------- half-over / half-under: render above and below, split along a wavy waterline on a virtual dome port
const LENS = 3.2;                      // dome radius: the bigger, the longer the split lasts while the camera crosses y = 0
const _c = new THREE.Vector3();
function viewYRange() {                // lowest / highest view-ray y over the frame (edges + corners)
  let lo = 1, hi = -1;
  for (const [x, y] of [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]]) {
    _c.set(x, y, 0.5).unproject(camera).sub(camera.position).normalize(); lo = Math.min(lo, _c.y); hi = Math.max(hi, _c.y);
  }
  return [lo, hi];
}
class SplitPass extends Pass {
  constructor() {
    super();
    const o = { type: THREE.HalfFloatType, samples: EXPORT ? 0 : 4 };   // MSAA off-screen (export uses 2× supersampling)
    this.above = new THREE.WebGLRenderTarget(1, 1, o); this.below = new THREE.WebGLRenderTarget(1, 1, o);
    this.u = { tA: { value: this.above.texture }, tB: { value: this.below.texture }, invProj: { value: camera.projectionMatrixInverse },
      camWorld: { value: camera.matrixWorld }, camPos: { value: camera.position }, time: { value: 0 }, lens: { value: LENS }, force: { value: 0 } };
    this.quad = new FullScreenQuad(new THREE.ShaderMaterial({ uniforms: this.u,
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }`,
      fragmentShader: `uniform sampler2D tA, tB; uniform mat4 invProj, camWorld; uniform vec3 camPos; uniform float time, lens, force;
        varying vec2 vUv;
        void main(){
          vec4 v = invProj * vec4(vUv * 2. - 1., -1., 1.); v /= v.w;
          vec3 p = camPos + normalize(mat3(camWorld) * v.xyz) * lens;
          float wave = 0.07 * sin(p.x * 1.9 + time * 1.7) + 0.04 * sin(p.x * 4.3 - time * 2.6) + 0.015 * sin(p.x * 11. + time * 4.1);
          float s = force > 1.5 ? -1. : force > 0.5 ? 1. : p.y - wave;      // > 0: this pixel looks out above the water
          float aa = fwidth(s) + 1e-4, under = smoothstep(aa, -aa, s);
          vec2 wob = vec2(0., 0.006 * sin(vUv.x * 40. + time * 3.)) * exp(-abs(s) * 18.);
          vec3 c = mix(texture2D(tA, vUv + wob).rgb, texture2D(tB, vUv - wob).rgb, under);
          c = mix(c, vec3(0.01, 0.08, 0.1), (1. - smoothstep(0., 0.035 + aa, abs(s + 0.015))) * 0.7);   // dark meniscus
          c += vec3(1., 0.95, 0.9) * (1. - smoothstep(0., 0.012 + aa, abs(s - 0.004))) * 0.8;          // bright lip
          gl_FragColor = vec4(c, 1.);
        }` }));
  }
  setSize(w, h) { this.above.setSize(w, h); this.below.setSize(w, h); }
  render(renderer, writeBuffer) {
    const [lo, hi] = viewYRange(), cy = camera.position.y;
    const R = this.u.lens.value, needA = cy + hi * R + 0.15 > 0, needB = cy + lo * R - 0.15 < 0;
    if (needA) { setWorld(false); renderer.setRenderTarget(this.above); renderer.render(scene, camera); }
    if (needB) { setWorld(true); renderer.setRenderTarget(this.below); renderer.render(scene, camera); }
    setWorld(false);
    this.u.force.value = needA && needB ? 0 : needA ? 1 : 2;
    this.u.time.value = clock.getElapsedTime();
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer); this.quad.render(renderer);
  }
}

// ---------- post ----------
const clock = new THREE.Clock();
const composer = new EffectComposer(renderer);
const split = new SplitPass(); composer.addPass(split);
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.35, 0.6, 1.2);
composer.addPass(bloom);
composer.addPass(new OutputPass());

// framing for any screen: the shots are authored at 16:9 (32° vertical). Narrower screens keep at least the title's
// width (+ margin) at the subject: first by widening the lens (up to 60° vertical), then by stepping the camera back.
// On tall screens the KV also tilts down: the title rides in the upper third and the water below stays free.
const A0 = 16 / 9, TAN_V0 = Math.tan(THREE.MathUtils.degToRad(16)), TAN_VMAX = Math.tan(THREE.MathUtils.degToRad(30));
let dolly = 1, lift = 0, tanV = TAN_V0;
function frameLens(a) {
  const tanH = Math.min(TAN_V0 * A0, Math.max(5.4 / 17, TAN_V0 * a));   // half-width to keep at 17 units: all of 16:9, at least the title
  tanV = Math.min(Math.max(TAN_V0, tanH / a), TAN_VMAX);
  dolly = Math.max(1, tanH / (tanV * a));
  lift = clamp01((A0 / a - 1) / 2);
  camera.aspect = a; camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(tanV)); camera.updateProjectionMatrix();
  uwBase = (PECA ? 0.07 : KV2 ? 0.04 : 0.075) / dolly;
  uwFog.density = underside.material.uniforms.density.value = floor.material.uniforms.density.value = uwBase;   // keep the fish readable
  split.u.lens.value = LENS * TAN_V0 / tanV;           // wider lens → smaller dome, so steep rays on tall screens don't reach the water
  skyGroup.scale.setScalar(Math.max(1, 800 * Math.tan(Math.atan(tanV) + 0.05) / (SKY_H - 25),   // sky's top edge never in frame…
    800 * Math.tan(Math.atan(tanV * a) + 0.09) / (SKY_W / 2 - 10)));   // …nor its sides on wide screens (0.09 rad: the mouse sway turns the lens)
}
// phones: the scene is sized to the LARGE viewport (browser bar hidden). When the bar slides away on the first scroll
// there is no gap under the canvas and nothing has to resize; while the bar is showing, the bottom just sits under it.
const lvh = Object.assign(document.createElement('div'), { style: 'position:fixed;top:0;left:0;width:0;height:100lvh;visibility:hidden;pointer-events:none' });
document.body.append(lvh);
const alturaTela = () => Math.max(innerHeight, lvh.offsetHeight || 0);
let fitW = 0, fitH = 0;
function fit() {
  const W = innerWidth, H = alturaTela(); if (W === fitW && H === fitH) return;   // the bar moving fires resize: same size, skip
  fitW = W; fitH = H; frameLens(W / H); renderer.setSize(W, H); composer.setSize(W, H);
}
addEventListener('resize', fit); fit();
const mouse = new THREE.Vector2();
addEventListener('pointermove', e => mouse.set(e.clientX / innerWidth - 0.5, e.clientY / innerHeight - 0.5));

// ---------- scroll: camera path from the KV frame, through the waterline, down to the fish ----------
const KEYS = [   // scroll progress, camera position, look target
  [0.00, [0, 2.4, 17], [0, 2.2, 0]],
  [0.10, [0, 2.4, 17], [0, 2.2, 0]],       // hold while the fish dive
  [0.40, [0, 0.9, 12.5], [0, 1.1, 0]],
  [0.50, [0, 0.0, 11.5], [0, 0.3, 0]],     // waterline across the middle of the frame
  [0.60, [0, -0.35, 11.2], [0, 0.0, 0]],
  [0.80, [0, -2.4, 10.2], [0, -2.2, 0]],
  [1.00, [0, -3.0, 9.6], [0, -2.6, 0]],
];
const camCurve = new THREE.CatmullRomCurve3(KEYS.map(k => new THREE.Vector3(...k[1])));
const lookCurve = new THREE.CatmullRomCurve3(KEYS.map(k => new THREE.Vector3(...k[2])));
function camAt(p) {                          // piecewise-linear progress → curve parameter, so each key lands on its scroll value
  let i = 0; while (i < KEYS.length - 2 && p > KEYS[i + 1][0]) i++;
  const u = (i + clamp01((p - KEYS[i][0]) / (KEYS[i + 1][0] - KEYS[i][0]))) / (KEYS.length - 1);
  return [camCurve.getPoint(u), lookCurve.getPoint(u)];
}
// the dive takes the first DIVE screens of scroll (pT); below it the page's chapters run through the depth (deepT)
const DIVE = 2.6;
let pT = 0, pS = 0, deepT = 0, deep = 0;     // targets / smoothed
const readScroll = () => {
  const d = DIVE * alturaTela(), end = Math.max(d + 1, document.documentElement.scrollHeight - innerHeight);
  pT = clamp01(scrollY / d); deepT = clamp01((scrollY - d) / (end - d));
};
addEventListener('scroll', readScroll, { passive: true }); addEventListener('resize', readScroll); readScroll();

// fish under water: dive hop, then circle each other in front of the camera
const P_DIVE = 0.03;
let under = false, tSwitch = 0;
const wrapA = a => a - 2 * Math.PI * Math.round(a / (2 * Math.PI));
// after the dive the fish keep their distance: long side-on passes across the frame, behind the page's content, each in
// its own lane (depth, height, direction), always at an unhurried swimming pace.
function newLane(c, i, first) {
  const z = -12 - Math.random() * 10, X = (camera.position.z - z) * tanV * camera.aspect + 2.8;   // just off-screen
  c.lane = { u: first ? -0.25 - i * 0.45 : -0.15 - Math.random() * 0.7, dir: first ? (i ? -1 : 1) : -c.lane.dir, X, z,
    y: -3.5 + Math.random() * 1.7, speed: (2.6 + Math.random() * 0.8) / (2 * X) };   // ~3 world units/s, as lane fraction per second
}
function swimPose(c, i, t) {
  const L = c.lane, u = clamp01(L.u), w = t * 1.1 + i * 2;
  return { x: L.dir * L.X * (2 * u - 1), y: L.y + 0.18 * Math.sin(w), z: L.z, yaw: L.dir > 0 ? 0 : Math.PI,
    pitch: 0.06 * Math.sin(w + 1.2), swim: 0.08, arch: 0, foam: 0 };
}
function updateLanes(dt) {
  for (const [i, c] of cast.entries()) {
    if (!under) { c.lane = null; continue; }
    if (!c.lane) newLane(c, i, true);
    c.lane.u += c.lane.speed * dt;
    if (c.lane.u > 1.04) newLane(c, i);
  }
}
function kv2Pose(c, i, t) {                     // ?kv=submerso: hovering side by side, faces to the camera, slightly inward
  const ph = t * 1.1 + i * 1.7;
  return { x: c.s * 1.25, y: -1.35 + 0.08 * Math.sin(ph), z: 5 + 0.05 * Math.sin(ph * 0.7), yaw: -Math.PI / 2 - c.s * 0.38,
    pitch: 0.1 + 0.04 * Math.sin(ph + 1), swim: 0.05, arch: 0, foam: 0 };
}
function fishPose(c, i, T, t, now) {
  if (KV2) return kv2Pose(c, i, t);
  if (!under) return pose(c, T, t);
  const k = now - tSwitch, dive = pose(c, T_DIVE + Math.min(k, 1), t);
  if (k < 1) return dive;
  if (k < 3.4) {                       // after the dive: out of frame to their own side, down and away, never toward the lens
    const e = ease(clamp01((k - 1) / 2.4)), out = c.s > 0 ? 0 : Math.PI;
    return { ...dive, x: dive.x + c.s * 10 * e, y: dive.y - 2.5 * e, z: dive.z - 7 * e, swim: 0.08, foam: 0,
      yaw: dive.yaw + wrapA(out - dive.yaw) * Math.min(1, e * 2.5), pitch: dive.pitch * (1 - e) };
  }
  return swimPose(c, i, t);           // then the far passes (the first one starts off-screen, a few seconds later)
}

// the intro plays once on load and parks on the KV frame; scrolling takes the camera (and the fish) under water.
// ?t=4.1 freezes the timeline at that second (for stills / review).
const qs = new URLSearchParams(location.search);
const FREEZE = qs.has('t') ? +qs.get('t') : EXPORT ? 0.5 : null;
const CAM = qs.get('cam')?.split(',').map(Number);
const KV2_CAM = [[0, 0.05, 16], [0, 0.75, 0]];      // waterline a little under the logo, with room for the waves
// pieces: lens at the waterline, tilted down so the horizon sits ~38% (story) / ~40% (feed) from the top
const pecaCam = () => [[0, 0.05, 17], [0, 0.05 - 17 * (PECA === 'story' ? 0.24 : 0.2) * tanV, 0]];
const hint = document.getElementById('hint');
let t0 = 0, last = 0, replay = false, lastTs = 0;
addEventListener('voltar-superficie', () => { replay = true; });   // landing button: full cycle once back on top
const blink1 = k => (k > 0 && k < 0.2 ? Math.sin(Math.PI * k / 0.2) : 0);   // one 0.2 s blink
const tick = () => {
  if (!tick.pronto) { tick.pronto = true; const l = document.getElementById('carregando'); if (l) { l.classList.add('fim'); setTimeout(() => l.remove(), 1000); } }
  const now = clock.getElapsedTime(), t = FREEZE ?? now, dt = Math.min(0.05, now - last); last = now;
  pS += (pT - pS) * 0.07;
  if (!under && pS > P_DIVE) { under = true; tSwitch = now; }
  if (under && pS < P_DIVE * 0.5) {                                    // back on top: replay the resurface beat into the KV pose…
    under = false; t0 = now - (replay ? T_DIVE + 1.05 : 5.4); replay = false;   // …or, from "Voltar à superfície", the leaps over the title too
  }
  const T = FREEZE ?? now - t0;
  if (hint) hint.style.opacity = !KV2 && T > END && pS < 0.01 ? 1 : 0;
  deep += (deepT - deep) * 0.07;
  const dk = KV2 ? 0 : deep, settle = KV2 ? 0 : clamp01((pS - 0.85) / 0.15);   // depth in the page / dive finished
  if (!KV2) {
    UW.copy(UW0).lerp(DEEP, Math.pow(dk, 0.8)); uwFog.color.copy(UW); rayK = 1 - 0.85 * dk;
    uwFog.density = underside.material.uniforms.density.value = floor.material.uniforms.density.value = uwBase * (1 - 0.55 * settle + 0.4 * dk);   // thinner haze so the far fish still read
    updateLanes(dt);
  }
  water.material.uniforms.time.value = t * 0.35;
  updateUnderwater(t);
  for (const c of clouds) c.m.position.x = c.x0 + c.amp * Math.sin(t * c.w + c.ph);
  title.position.y = 2.55 + Math.sin(t * 0.9) * 0.04;
  title.rotation.y = Math.sin(t * 0.5) * 0.03;
  logo.position.y = 0.8 + Math.sin(t * 0.9 + 0.6) * 0.03;
  for (const [i, c] of cast.entries()) {
    const p = fishPose(c, i, T, t, now), u = c.f.userData.u;
    c.f.position.set(p.x, p.y, p.z); c.f.rotation.set(0, p.yaw, p.pitch);
    const busy = p.swim > 0.045;                                          // diving, leaping or swimming (not parked on the KV)
    c.tail = (c.tail ?? 0) + dt * (busy ? 9 : 4.5); c.finP = (c.finP ?? 0) + dt * (busy ? 9 : 5);
    u.uSwim.value = p.swim; u.uArch.value = p.arch; u.uPhase.value = c.tail;
    u.uFin.value = busy ? 0.022 : 0.013; u.uFinPhase.value = c.finP;
    u.uBreath.value = 0.03 * (0.5 + 0.5 * Math.sin(now * 2.4 + c.ph));
    if (now > (c.nextBlink ?? 1.5 + i)) { c.blinkAt = now; c.dbl = Math.random() < 0.25; c.nextBlink = now + 2.2 + Math.random() * 3.5; }
    u.uBlink.value = Math.max(blink1(now - (c.blinkAt ?? -9)), c.dbl ? blink1(now - c.blinkAt - 0.3) : 0);
    if (qs.has('blink')) u.uBlink.value = +qs.get('blink');                 // review: ?blink=0.6 holds the lid
    c.foam.material.opacity = (0.75 + Math.sin(t * 1.7 + c.ph) * 0.2) * p.foam;
  }
  const k = now - tSwitch;
  const Ts = under ? (k < 1.75 ? T_DIVE + k : -1) : T;
  updateSplashes(Ts);                                                    // under water only the dive splashes play
  if (Ts - lastTs > 0 && Ts - lastTs < 0.5)                              // sound (landing/som.js): one event per splash
    for (const s of splashes) if (s.t > lastTs && s.t <= Ts) dispatchEvent(new CustomEvent('respingo', { detail: { k: s.k, x: s.x } }));
  lastTs = Ts;
  const [cp, cl] = camAt(pS);
  cp.sub(cl).multiplyScalar(dolly).add(cl);                                         // narrow screens: step back on the view line
  cl.y -= lift * (1 - clamp01((pS - 0.1) / 0.3)) * cp.distanceTo(cl) * 0.35 * tanV;  // tall screens: title up to ~1/3 from the top
  cp.y -= 0.7 * dk; cl.y -= 0.9 * dk; cp.x += Math.sin(t * 0.07) * 0.5 * settle;      // chapters: sink a little, drift slowly
  window.cena = { y: cp.y, deep: dk };                                   // for the sound: lens height on its path (no mouse sway) and depth
  camera.position.lerp(cp.add(_c.set(mouse.x * 1.2, -mouse.y * 0.5, 0)), 0.08);
  if (KV2) { const [p, l] = PECA ? pecaCam() : KV2_CAM; camera.position.set(...p); cl.set(...l); }   // half-under KV: lens at the waterline
  if (CAM) { camera.position.set(CAM[0], CAM[1], CAM[2]); cl.set(CAM[3], CAM[4], CAM[5]); }   // review: ?cam=x,y,z,lx,ly,lz
  camera.lookAt(cl); camera.updateMatrixWorld();
  composer.render();
};
renderer.setAnimationLoop(tick);

// ---------- ?export: the KV frame at 3840×2160 → the composite (with bloom) + every element as a transparent PNG layer,
// all on the same canvas size so they stack with no alignment. Files go to ferramentas/export_server.py (127.0.0.1:8765),
// which writes them into KV 2026/estatico/. Same camera and pose as the static KV (timeline frozen at 0.5 s).
if (EXPORT) {
  const say = m => { document.title = m; console.log('[export]', m); };
  // supersampling: every frame is rendered at SS× the size and shrunk with a high-quality filter (clean thin edges,
  // highlights and glasses rims), then sent to the receiver
  const SS = 2;
  const send = async name => {
    const src = renderer.domElement, c = document.createElement('canvas'); c.width = src.width / SS; c.height = src.height / SS;
    const x = c.getContext('2d'); x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high'; x.drawImage(src, 0, 0, c.width, c.height);
    const blob = await new Promise(r => c.toBlob(r, 'image/png'));
    const res = await fetch('http://127.0.0.1:8765/save?name=' + name, { method: 'POST', body: blob });
    say(`${name} ${res.ok ? 'ok' : 'FALHOU'} (${(blob.size / 1e6).toFixed(1)} MB)`);
  };
  const frame = (w, h) => {
    renderer.setPixelRatio(1); renderer.setSize(w * SS, h * SS, false); composer.setPixelRatio(1); composer.setSize(w * SS, h * SS);
    if (PECA) frameLens(w / h); else { camera.fov = 32; camera.aspect = w / h; camera.updateProjectionMatrix(); }
    const [cp, cl] = PECA ? pecaCam() : KV2 ? KV2_CAM : [[0, 2.4, 17], [0, 2.2, 0]];
    camera.position.set(...cp); camera.lookAt(...cl); camera.updateMatrixWorld();
  };
  renderer.setAnimationLoop(null);                             // pose fish, foam, clouds here: a hidden tab never runs the loop
  for (let i = 0; i < 40; i++) tick();
  if (new URLSearchParams(location.search).has('malha')) {
    // ?export&malha → process images: each fish as a clean clay model with its mesh drawn on top (side and 3/4),
    // and the sunglasses alone, the same way. Transparent PNGs, 1400 px, for the landing's creative-process chapter.
    const clay = new THREE.MeshStandardMaterial({ color: 0xf3eef7, roughness: 0.7, metalness: 0, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
    const wire = new THREE.MeshBasicMaterial({ color: 0x4a1466, wireframe: true, transparent: true, opacity: 0.22, depthWrite: false });
    for (const f of [laranja, vermelho]) f.traverse(o => {
      if (!o.isMesh || o.userData.wire) return;
      const w = new THREE.Mesh(o.geometry, wire); w.userData.wire = true; o.material = clay; o.add(w);
    });
    for (const o of [...aboveOnly, ...belowOnly, hero, ...cast.map(c => c.foam)]) o.visible = false;
    setWorld(false); for (const o of [...aboveOnly, ...belowOnly]) o.visible = false;
    scene.fog = null; scene.background = null; renderer.setClearColor(0x000000, 0);
    const S = 1400; renderer.setSize(S * SS, S * SS, false); camera.aspect = 1; camera.fov = 28; camera.updateProjectionMatrix();
    const shoot = async (target, name, pad = 0.62) => {
      target.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(target), mid = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
      const d = pad * Math.max(size.x, size.y) / Math.tan(THREE.MathUtils.degToRad(14)) + size.z / 2;
      camera.position.set(mid.x, mid.y + 0.12 * d, mid.z + d); camera.lookAt(mid); camera.updateMatrixWorld();
      renderer.setRenderTarget(null); renderer.render(scene, camera); await send(name);
    };
    for (const c of cast) {
      for (const o of cast) o.f.visible = o === c;
      const n = c.f === laranja ? 'laranja' : 'vermelho';
      c.f.position.set(0, -2, 0);
      c.f.rotation.set(0, 0, 0.04); await shoot(c.f, `malha-${n}-lado.png`);
      c.f.rotation.set(0, -Math.PI / 2 + 0.75, 0.06); await shoot(c.f, `malha-${n}-34.png`);
    }
    // the sunglasses on their own: hide the orange fish's body, keep the frame where it sits on the face
    for (const o of cast) o.f.visible = o.f === laranja;
    let body; laranja.traverse(o => { if (o.isMesh && !body && !o.userData.wire) body = o; }); body.visible = false;
    laranja.rotation.set(0, -Math.PI / 2 + 0.6, 0.12); await shoot(oculosL, 'malha-oculos.png', 0.24);
    say('Exportação concluída'); throw 'malha export done';
  }
  if (PECA) {
    // ?export&peca=story|feed → the piece's background without fish (they are placed per piece) + fish cut-outs lit
    // under water: frente (the KV pose, glasses to camera) and lado (profile, mid-stroke, head to the right)
    const [w, h] = PECA === 'story' ? [1080, 1920] : [1080, 1350];
    for (const c of cast) c.f.visible = false;
    frame(w, h); setWorld(false); composer.render(); await send(`peca-${PECA}-fundo.png`);
    const hideAll = [...aboveOnly, ...belowOnly, hero, ...cast.map(c => c.foam), ...cast.map(c => c.f)];
    const S = 1200; renderer.setSize(S * SS, S * SS, false); camera.aspect = 1; camera.fov = 32; camera.updateProjectionMatrix();
    setWorld(false); renderer.setClearColor(0x000000, 0);        // KV light (no water haze): the pieces add their own tint
    for (const c of cast) for (const pose of ['frente', 'lado']) {
      for (const o of hideAll) o.visible = false;
      c.f.visible = true;
      const u = c.f.userData.u;
      if (pose === 'lado') { c.f.rotation.set(0, 0, 0.04); u.uSwim.value = 0.08; u.uPhase.value = 1.2; }
      c.f.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(c.f), mid = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
      const d = 0.62 * Math.max(size.x, size.y) / Math.tan(THREE.MathUtils.degToRad(16)) + size.z / 2;
      camera.position.set(mid.x, mid.y + 0.04 * d, mid.z + d); camera.lookAt(mid); camera.updateMatrixWorld();
      scene.background = null; renderer.setRenderTarget(null); renderer.render(scene, camera);
      await send(`peixe-${c.f === laranja ? 'laranja' : 'vermelho'}-${pose}.png`);
    }
    say('Exportação concluída'); throw 'peca export done';
  }
  for (const [w, h, tag] of [[3840, 2160, '4k'], [1920, 1080, '1080']]) {
    frame(w, h); setWorld(false); composer.render(); await send(`kv-verao${KV2 ? '-submerso' : ''}-composicao-${tag}.png`);
  }
  if (KV2) { say('Exportação concluída'); throw 'kv2 export done'; }   // the half-under KV ships as composites only
  frame(3840, 2160);
  const mask = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), new THREE.MeshBasicMaterial({ colorWrite: false }));
  mask.rotation.x = -Math.PI / 2; mask.renderOrder = -1; scene.add(mask);      // invisible water surface: hides what is under it
  const mirror = water.onBeforeRender;                         // the mirror needs the horizon colour behind it (no black seam)
  water.onBeforeRender = (...a) => { scene.background = HORIZON; mirror.apply(water, a); scene.background = null; };
  water.layers.enable(5);
  const parts = { ceu: [sky, backdrop], nuvens: clouds.map(c => c.m), agua: [water], titulo: [title], marca: [logo],
    'peixe-laranja': [laranja], 'peixe-vermelho': [vermelho], espuma: cast.map(c => c.foam) };
  const every = Object.values(parts).flat();
  renderer.setClearColor(0x000000, 0);
  for (const [name, objs] of Object.entries(parts)) {
    const isWater = name === 'agua';
    for (const o of every) o.visible = isWater;                // water: everything stays on for its reflection…
    for (const o of objs) o.visible = true;
    camera.layers.set(isWater ? 5 : 0);                        // …but the camera itself only sees the water
    mask.visible = ['titulo', 'marca', 'peixe-laranja', 'peixe-vermelho', 'espuma'].includes(name);
    scene.background = null; renderer.setRenderTarget(null); renderer.render(scene, camera);
    await send(`kv-verao-${name}-4k.png`);
  }
  say('Exportação concluída');
}

