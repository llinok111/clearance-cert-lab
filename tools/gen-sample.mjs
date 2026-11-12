#!/usr/bin/env node
// Deterministic corpus generator: analytic-ground-truth mesh pairs + one perf pair.
// `node tools/gen-sample.mjs` rewrites data/corpus.json byte-for-byte identically.
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, '..', 'data', 'corpus.json');

// mulberry32, fixed seed
let state = 0xC0FFEE;
function rnd() {
  state |= 0; state = (state + 0x6D2B79F5) | 0;
  let t = Math.imul(state ^ (state >>> 15), 1 | state);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const rand = (a, b) => a + (b - a) * rnd();

function boxMesh(cx, cy, cz, sx, sy, sz) {
  const x0 = cx - sx / 2, x1 = cx + sx / 2;
  const y0 = cy - sy / 2, y1 = cy + sy / 2;
  const z0 = cz - sz / 2, z1 = cz + sz / 2;
  const v = [
    [x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0],
    [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1],
  ];
  const f = [
    [0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7],
    [0, 1, 5], [0, 5, 4], [2, 3, 7], [2, 7, 6],
    [1, 2, 6], [1, 6, 5], [0, 4, 7], [0, 7, 3],
  ];
  return { positions: v.flat(), indices: f.flat(), triangles: 12 };
}

function quad(z, s = 1) {
  return {
    positions: [-s, -s, z, s, -s, z, s, s, z, -s, s, z],
    indices: [0, 1, 2, 0, 2, 3], triangles: 2,
  };
}

function tetra(apexZ, s = 1) {
  // base is 2 units above the plane; the downward apex sits exactly at z = apexZ
  const b = apexZ + 2;
  return {
    positions: [-s, -s, b, s, -s, b, 0, s, b, 0, 0, apexZ],
    indices: [0, 2, 1, 0, 1, 3, 1, 2, 3, 2, 0, 3], triangles: 4,
  };
}

function icosphere(subdiv, radius) {
  const t = (1 + Math.sqrt(5)) / 2;
  const verts = [
    [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
    [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
    [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1],
  ].map((v) => { const l = Math.hypot(...v); return v.map((x) => x / l); });
  let faces = [
    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
    [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
    [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
  ];
  const cache = new Map();
  const mid = (a, b) => {
    const k = a < b ? a + '_' + b : b + '_' + a;
    if (cache.has(k)) return cache.get(k);
    const m = [(verts[a][0] + verts[b][0]) / 2, (verts[a][1] + verts[b][1]) / 2, (verts[a][2] + verts[b][2]) / 2];
    const l = Math.hypot(...m);
    verts.push([m[0] / l, m[1] / l, m[2] / l]);
    cache.set(k, verts.length - 1);
    return verts.length - 1;
  };
  for (let s = 0; s < subdiv; s++) {
    const next = [];
    for (const [a, b, c] of faces) {
      const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a);
      next.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]);
    }
    faces = next;
  }
  return {
    positions: verts.flatMap((v) => v.map((x) => x * radius)),
    indices: faces.flat(), triangles: faces.length,
  };
}

const cases = [];
const push = (id, kind, meshA, meshB, truth, extra = {}) => {
  cases.push({ id, kind, meshA, meshB, truth, truthKind: 'analytic', ...extra });
};

// 1. axis-aligned box pairs: exact Euclidean gap from per-axis separations
for (let i = 0; i < 12; i++) {
  const sa = rand(0.4, 1.2), sb = rand(0.4, 1.2);
  const gap = rand(0.05, 0.8);
  const oy = rand(-0.6, 0.6), oz = rand(-0.6, 0.6);
  const bx = sa / 2 + gap + sb / 2;
  const A = boxMesh(0, 0, 0, sa, sa, sa);
  const B = boxMesh(bx, oy, oz, sb, sb, sb);
  const amin = [-sa / 2, -sa / 2, -sa / 2], amax = [sa / 2, sa / 2, sa / 2];
  const bmin = [bx - sb / 2, oy - sb / 2, oz - sb / 2], bmax = [bx + sb / 2, oy + sb / 2, oz + sb / 2];
  let truth = 0;
  for (let k = 0; k < 3; k++) {
    const g = Math.max(0, bmin[k] - amax[k], amin[k] - bmax[k]);
    truth += g * g;
  }
  push(`box-${String(i).padStart(3, '0')}`, 'box-pair', A, B, Math.sqrt(truth));
}

// 2. parallel planes (2 triangles each)
for (let i = 0; i < 8; i++) {
  const g = rand(0.02, 0.5);
  push(`plane-${String(i).padStart(3, '0')}`, 'parallel-planes', quad(0, 1), quad(g, 0.8), g);
}

// 3. tetrahedron apex over a plane: closest feature is the apex
for (let i = 0; i < 8; i++) {
  const g = rand(0.02, 0.6);
  push(`tetra-${String(i).padStart(3, '0')}`, 'tetra-plane', quad(0, 1.5), tetra(g, 0.6), g);
}

// 4. near-touching: gap 1e-4 .. 1e-2 of the part size
for (let i = 0; i < 8; i++) {
  const s = 1;
  const g = 10 ** rand(-4, -2);
  const A = boxMesh(0, 0, 0, s, s, s);
  const B = boxMesh(s + g, 0, 0, s, s, s);
  push(`near-${String(i).padStart(3, '0')}`, 'near-touch', A, B, g);
}

// 5. touching / overlapping: truth is exactly 0
for (let i = 0; i < 6; i++) {
  const s = 1;
  const ov = i === 0 ? 0 : rand(0.001, 0.2);
  const A = boxMesh(0, 0, 0, s, s, s);
  const B = boxMesh(s - ov, 0, 0, s, s, s);
  push(`contact-${String(i).padStart(3, '0')}`, 'contact', A, B, 0);
}

// 6. scale ladder: same geometry at 1e-6 .. 1e6
for (const k of [-6, -3, 0, 3, 6]) {
  const sc = 10 ** k;
  const A = boxMesh(0, 0, 0, sc, sc, sc);
  const B = boxMesh(sc * 1.1, 0, 0, sc, sc, sc); // gap = 0.1 * scale
  push(`scaled-${k >= 0 ? 'p' : 'm'}${Math.abs(k)}`, 'scale-ladder', A, B, 0.1 * sc, { scale: sc });
}

const shifted = (m, dx, dy = 0) => ({ ...m, positions: m.positions.map((x, i) => (i % 3 === 0 ? x + dx : i % 3 === 1 ? x + dy : x)) });
const perf = {
  A: icosphere(3, 1),
  B: shifted(icosphere(3, 1), 2.2, 2.2),
  small: { A: icosphere(2, 1), B: shifted(icosphere(2, 1), 2.2, 2.2) },
  note: 'icospheres radius 1, centres at (0,0,0) and (2.2,2.2,0): root AABB gap 0.283 << true gap ~1.2; faceted so no closed-form truth',
};

const corpus = {
  generator: 'tools/gen-sample.mjs',
  seed: '0xC0FFEE (mulberry32)',
  caseCount: cases.length,
  cases,
  perf,
};
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(corpus));
console.log(`wrote ${OUT}: ${cases.length} cases, perf ${perf.A.triangles}x${perf.B.triangles} triangles`);
