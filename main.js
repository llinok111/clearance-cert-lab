// Rendering + interaction only. All geometry/measurement math is delegated to src/core.mjs.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { makeMesh, certifyClearance } from './src/core.mjs';

const stage = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
stage.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x07090c);
scene.fog = new THREE.Fog(0x07090c, 12, 34);
const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 400);
camera.position.set(4.2, 3.1, 5.4);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

scene.add(new THREE.HemisphereLight(0xbfd4ff, 0x0a0f16, 1.15));
const key = new THREE.DirectionalLight(0xffffff, 2.1);
key.position.set(5, 8, 6);
scene.add(key);
const rim = new THREE.DirectionalLight(0x4f8cff, 1.4);
rim.position.set(-6, -2, -5);
scene.add(rim);
scene.add(new THREE.GridHelper(20, 20, 0x1b2734, 0x111a24));

const matA = new THREE.MeshStandardMaterial({ color: 0x8fb4ff, metalness: 0.15, roughness: 0.42, transparent: true, opacity: 0.92 });
const matB = new THREE.MeshStandardMaterial({ color: 0xffb86b, metalness: 0.1, roughness: 0.5 });
const witnessMat = new THREE.LineBasicMaterial({ color: 0x59d18c });

let group = new THREE.Group();
scene.add(group);
let current = null;
const $ = (id) => document.getElementById(id);

function clearGroup() {
  scene.remove(group);
  group.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
  group = new THREE.Group();
  scene.add(group);
}

function addMesh(m, material) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(m.positions, 3));
  g.setIndex(Array.from(m.indices));
  g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, material);
  group.add(mesh);
  return mesh;
}

function fit(camera, groupA, groupB) {
  const box = new THREE.Box3().setFromObject(group);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const r = Math.max(size.x, size.y, size.z) || 1;
  camera.position.copy(center).add(new THREE.Vector3(r * 1.5, r * 1.05, r * 1.7));
  controls.target.copy(center);
  camera.near = r / 500;
  camera.far = r * 60;
  camera.updateProjectionMatrix();
  controls.update();
  scene.fog.near = r * 3;
  scene.fog.far = r * 12;
}

let corpus = null;
function load(caseIndex) {
  const c = corpus.cases[caseIndex];
  clearGroup();
  const A = makeMesh(c.meshA.positions, c.meshA.indices);
  const B = makeMesh(c.meshB.positions, c.meshB.indices);
  addMesh(A, matA);
  addMesh(B, matB);
  current = { A, B, truth: c.truth, kind: c.kind };
  fit(camera, A, B);
  evaluate();
}

function evaluate() {
  if (!current) return;
  const { A, B, truth } = current;
  const frac = Number($('target').value);
  const diag = Math.min(A.diag, B.diag);
  const target = frac * diag;
  $('targetV').textContent = `${target.toFixed(4)} (${(target / diag).toFixed(3)} x diag)`;
  const t0 = performance.now();
  const r = certifyClearance(A, B, target, { tol: Math.min(1e-3 * diag, target * 1e-3) });
  const ms = performance.now() - t0;
  const v = $('verdict');
  v.textContent = r.verdict;
  v.className = `v ${r.verdict === 'certified-clear' ? 'ok' : r.verdict === 'contact-witness' ? 'bad' : 'warn'}`;
  $('lo').textContent = r.result.lo === null ? 'null (unresolved)' : r.result.lo.toFixed(6);
  $('hi').textContent = r.result.hi === null ? 'null (unresolved)' : r.result.hi.toFixed(6);
  $('cert').textContent = String(r.result.certified);
  $('tests').textContent = `${r.result.leafTests} (of ${A.triCount * B.triCount})`;
  $('red').textContent = `${(100 * (1 - r.result.leafTests / (A.triCount * B.triCount))).toFixed(2)}% fewer`;
  $('ms').textContent = `${ms.toFixed(1)} ms`;
  drawWitness(r);
  window.__lastRun = { verdict: r.verdict, lo: r.result.lo, hi: r.result.hi, truth, target, ms };
}

let witness = null;
function drawWitness(r) {
  if (witness) { group.remove(witness); witness.geometry.dispose(); witness = null; }
  const pa = r.pa || r.result.pa, pb = r.pb || r.result.pb;
  if (!pa || !pb) return;
  const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...pa), new THREE.Vector3(...pb)]);
  witness = new THREE.Line(g, witnessMat);
  group.add(witness);
  const dot = new THREE.Mesh(new THREE.SphereGeometry(Math.max(0.008, current.A.diag * 0.004), 12, 8), witnessMat);
  dot.position.set(...pa);
  group.add(dot);
  const dot2 = dot.clone();
  dot2.position.set(...pb);
  group.add(dot2);
}

function resize() {
  const w = stage.clientWidth, h = stage.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);

const sel = $('case');
fetch('./data/corpus.json').then((r) => r.json()).then((data) => {
  corpus = data;
  data.cases.forEach((c, i) => {
    const o = document.createElement('option');
    o.value = String(i);
    o.textContent = `${c.id} · ${c.kind}${c.truth === 0 ? ' · contact' : ''}`;
    sel.appendChild(o);
  });
  sel.addEventListener('change', () => load(Number(sel.value)));
  $('target').addEventListener('input', evaluate);
  resize();
  load(0);
  renderer.setAnimationLoop(() => { controls.update(); renderer.render(scene, camera); });
}).catch((e) => {
  stage.innerHTML = `<pre style="padding:20px;color:#ff7b72">failed to load data/corpus.json: ${e.message}\nrun: node tools/gen-sample.mjs</pre>`;
});
