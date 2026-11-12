// clearance-cert core: sound two-sided interval for the distance between two triangle meshes.
// Pure ES module. No three.js, no DOM, no I/O, no environment access at import time.
//
// Every number this module reports is an interval [lo, hi]:
//   * hi comes from exact triangle-triangle distance of pairs that were actually visited
//     (therefore hi >= true distance, up to the 1e-9*diag intersection tolerance below),
//   * lo comes from AABB lower bounds of every pair that was NOT resolved
//     (therefore lo <= true distance).
// A result is `certified` only when hi - lo <= tol. Otherwise we say so.

const LEAF_TRIS = 4;

/* ------------------------------------------------------------------ vector */
const dot = (ax, ay, az, bx, by, bz) => ax * bx + ay * by + az * bz;

function closestPointOnTri(px, py, pz, ax, ay, az, bx, by, bz, cx, cy, cz, out) {
  const abx = bx - ax, aby = by - ay, abz = bz - az;
  const acx = cx - ax, acy = cy - ay, acz = cz - az;
  const apx = px - ax, apy = py - ay, apz = pz - az;
  const d1 = dot(abx, aby, abz, apx, apy, apz);
  const d2 = dot(acx, acy, acz, apx, apy, apz);
  if (d1 <= 0 && d2 <= 0) { out[0] = ax; out[1] = ay; out[2] = az; return out; }
  const bpx = px - bx, bpy = py - by, bpz = pz - bz;
  const d3 = dot(abx, aby, abz, bpx, bpy, bpz);
  const d4 = dot(acx, acy, acz, bpx, bpy, bpz);
  if (d3 >= 0 && d4 <= d3) { out[0] = bx; out[1] = by; out[2] = bz; return out; }
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    const v = d1 / (d1 - d3);
    out[0] = ax + abx * v; out[1] = ay + aby * v; out[2] = az + abz * v; return out;
  }
  const cpx = px - cx, cpy = py - cy, cpz = pz - cz;
  const d5 = dot(abx, aby, abz, cpx, cpy, cpz);
  const d6 = dot(acx, acy, acz, cpx, cpy, cpz);
  if (d6 >= 0 && d5 <= d6) { out[0] = cx; out[1] = cy; out[2] = cz; return out; }
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    const w = d2 / (d2 - d6);
    out[0] = ax + acx * w; out[1] = ay + acy * w; out[2] = az + acz * w; return out;
  }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    const w = (d4 - d3) / ((d4 - d3) + (d5 - d6));
    out[0] = bx + (cx - bx) * w; out[1] = by + (cy - by) * w; out[2] = bz + (cz - bz) * w; return out;
  }
  const den = va + vb + vc;
  if (!(Math.abs(den) > 1e-300)) { out[0] = ax; out[1] = ay; out[2] = az; return out; }
  const inv = 1 / den, v = vb * inv, w = vc * inv;
  out[0] = ax + abx * v + acx * w;
  out[1] = ay + aby * v + acy * w;
  out[2] = az + abz * v + acz * w;
  return out;
}

function segSegClosest(p1x, p1y, p1z, q1x, q1y, q1z, p2x, p2y, p2z, q2x, q2y, q2z) {
  const d1x = q1x - p1x, d1y = q1y - p1y, d1z = q1z - p1z;
  const d2x = q2x - p2x, d2y = q2y - p2y, d2z = q2z - p2z;
  const rx = p1x - p2x, ry = p1y - p2y, rz = p1z - p2z;
  const a = dot(d1x, d1y, d1z, d1x, d1y, d1z);
  const e = dot(d2x, d2y, d2z, d2x, d2y, d2z);
  const f = dot(d2x, d2y, d2z, rx, ry, rz);
  let s, t;
  if (a <= 1e-300 && e <= 1e-300) { s = 0; t = 0; }
  else if (a <= 1e-300) { s = 0; t = clamp01(f / e); }
  else {
    const c = dot(d1x, d1y, d1z, rx, ry, rz);
    if (e <= 1e-300) { t = 0; s = clamp01(-c / a); }
    else {
      const b = dot(d1x, d1y, d1z, d2x, d2y, d2z);
      const den = a * e - b * b;
      s = den > 1e-300 ? clamp01((b * f - c * e) / den) : 0;
      t = (b * s + f) / e;
      if (t < 0) { t = 0; s = clamp01(-c / a); }
      else if (t > 1) { t = 1; s = clamp01((b - c) / a); }
    }
  }
  const c1x = p1x + d1x * s, c1y = p1y + d1y * s, c1z = p1z + d1z * s;
  const c2x = p2x + d2x * t, c2y = p2y + d2y * t, c2z = p2z + d2z * t;
  const dx = c1x - c2x, dy = c1y - c2y, dz = c1z - c2z;
  return { d2: dx * dx + dy * dy + dz * dz, c1x, c1y, c1z, c2x, c2y, c2z };
}

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

function segTriHit(px, py, pz, qx, qy, qz, ax, ay, az, bx, by, bz, cx, cy, cz) {
  const e1x = bx - ax, e1y = by - ay, e1z = bz - az;
  const e2x = cx - ax, e2y = cy - ay, e2z = cz - az;
  const dx = qx - px, dy = qy - py, dz = qz - pz;
  const hx = dy * e2z - dz * e2y, hy = dz * e2x - dx * e2z, hz = dx * e2y - dy * e2x;
  const det = e1x * hx + e1y * hy + e1z * hz;
  if (!(Math.abs(det) > 1e-18)) return false;
  const inv = 1 / det;
  const sx = px - ax, sy = py - ay, sz = pz - az;
  const u = (sx * hx + sy * hy + sz * hz) * inv;
  const eps = 1e-9;
  if (u < -eps || u > 1 + eps) return false;
  const qx2 = sy * e1z - sz * e1y, qy2 = sz * e1x - sx * e1z, qz2 = sx * e1y - sy * e1x;
  const v = (dx * qx2 + dy * qy2 + dz * qz2) * inv;
  if (v < -eps || u + v > 1 + eps) return false;
  const t = (e2x * qx2 + e2y * qy2 + e2z * qz2) * inv;
  return t >= -eps && t <= 1 + eps;
}

// 2D triangle overlap (coplanar case). Project by dropping the dominant normal axis.
function coplanarOverlap(v, w) {
  const e1x = v[3] - v[0], e1y = v[4] - v[1], e1z = v[5] - v[2];
  const e2x = v[6] - v[0], e2y = v[7] - v[1], e2z = v[8] - v[2];
  const nx1 = e1y * e2z - e1z * e2y, ny1 = e1z * e2x - e1x * e2z, nz1 = e1x * e2y - e1y * e2x;
  const ax2 = Math.abs(nx1), ay2 = Math.abs(ny1), az2 = Math.abs(nz1);
  const drop = ax2 >= ay2 && ax2 >= az2 ? 0 : ay2 >= az2 ? 1 : 2;
  const pick = (P, i) => (drop === 0 ? [P[3 * i + 1], P[3 * i + 2]]
    : drop === 1 ? [P[3 * i], P[3 * i + 2]] : [P[3 * i], P[3 * i + 1]]);
  const A = [pick(v, 0), pick(v, 1), pick(v, 2)];
  const B = [pick(w, 0), pick(w, 1), pick(w, 2)];
  const axes = [];
  for (const T of [A, B]) for (let i = 0; i < 3; i++) {
    const p = T[i], q = T[(i + 1) % 3];
    axes.push([-(q[1] - p[1]), q[0] - p[0]]);
  }
  for (const [ax, ay] of axes) {
    let aMin = Infinity, aMax = -Infinity, bMin = Infinity, bMax = -Infinity;
    for (const p of A) { const d = p[0] * ax + p[1] * ay; if (d < aMin) aMin = d; if (d > aMax) aMax = d; }
    for (const p of B) { const d = p[0] * ax + p[1] * ay; if (d < bMin) bMin = d; if (d > bMax) bMax = d; }
    if (aMax < bMin || bMax < aMin) return false;
  }
  return true;
}

/* ------------------------------------------------------------------- meshes */
export function makeMesh(positions, indices, name = 'mesh') {
  const pos = positions instanceof Float64Array ? positions : Float64Array.from(positions);
  const idx = indices instanceof Uint32Array ? indices : Uint32Array.from(indices);
  const triCount = idx.length / 3;
  let mnx = Infinity, mny = Infinity, mnz = Infinity, mxx = -Infinity, mxy = -Infinity, mxz = -Infinity;
  for (let i = 0; i < pos.length; i += 3) {
    const x = pos[i], y = pos[i + 1], z = pos[i + 2];
    if (x < mnx) mnx = x; if (x > mxx) mxx = x;
    if (y < mny) mny = y; if (y > mxy) mxy = y;
    if (z < mnz) mnz = z; if (z > mxz) mxz = z;
  }
  const dx = mxx - mnx, dy = mxy - mny, dz = mxz - mnz;
  return {
    name, positions: pos, indices: idx, triCount,
    bbox: { min: [mnx, mny, mnz], max: [mxx, mxy, mxz] },
    diag: Math.hypot(dx, dy, dz),
  };
}

function triBounds(mesh, t, outMn, outMx) {
  const p = mesh.positions, I = mesh.indices;
  const a = I[3 * t] * 3, b = I[3 * t + 1] * 3, c = I[3 * t + 2] * 3;
  for (let k = 0; k < 3; k++) {
    const va = p[a + k], vb = p[b + k], vc = p[c + k];
    outMn[k] = Math.min(va, vb, vc);
    outMx[k] = Math.max(va, vb, vc);
  }
}

function aabbGap2(amn, amx, bmn, bmx) {
  let s = 0;
  for (let k = 0; k < 3; k++) {
    const d = amn[k] > bmx[k] ? amn[k] - bmx[k] : bmn[k] > amx[k] ? bmn[k] - amx[k] : 0;
    s += d * d;
  }
  return s;
}

/* ---------------------------------------------------------------------- BVH */
export function buildBvh(mesh) {
  const n = mesh.triCount;
  const order = new Uint32Array(n);
  for (let i = 0; i < n; i++) order[i] = i;
  const cent = new Float64Array(n * 3);
  const mn = new Float64Array(3), mx = new Float64Array(3);
  for (let t = 0; t < n; t++) {
    triBounds(mesh, t, mn, mx);
    cent[3 * t] = (mn[0] + mx[0]) / 2;
    cent[3 * t + 1] = (mn[1] + mx[1]) / 2;
    cent[3 * t + 2] = (mn[2] + mx[2]) / 2;
  }
  const nodes = [];
  function rec(start, end) {
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (let i = start; i < end; i++) {
      const t = order[i];
      triBounds(mesh, t, mn, mx);
      for (let k = 0; k < 3; k++) {
        if (mn[k] < min[k]) min[k] = mn[k];
        if (mx[k] > max[k]) max[k] = mx[k];
      }
    }
    const id = nodes.length;
    nodes.push({ min, max, l: -1, r: -1, start, count: end - start });
    const count = end - start;
    if (count <= LEAF_TRIS) return id;
    const ex = max[0] - min[0], ey = max[1] - min[1], ez = max[2] - min[2];
    const axis = ex >= ey && ex >= ez ? 0 : ey >= ez ? 1 : 2;
    const sub = Array.from(order.subarray(start, end)).sort((i, j) => cent[3 * i + axis] - cent[3 * j + axis]);
    order.set(sub, start);
    const mid = (start + end) >> 1;
    const l = rec(start, mid), r = rec(mid, end);
    nodes[id].l = l; nodes[id].r = r;
    return id;
  }
  rec(0, n);
  return { nodes, order, mesh };
}

/* ------------------------------------------------------- triangle distances */
const tmpA = new Float64Array(3), tmpB = new Float64Array(3);

export function triTriDistance2(A, ia, B, ib, withWitness = false) {
  const ap = A.positions, bp = B.positions, ai = A.indices, bi = B.indices;
  const va = [ap[3 * ai[3 * ia]], ap[3 * ai[3 * ia] + 1], ap[3 * ai[3 * ia] + 2],
    ap[3 * ai[3 * ia + 1]], ap[3 * ai[3 * ia + 1] + 1], ap[3 * ai[3 * ia + 1] + 2],
    ap[3 * ai[3 * ia + 2]], ap[3 * ai[3 * ia + 2] + 1], ap[3 * ai[3 * ia + 2] + 2]];
  const vb = [bp[3 * bi[3 * ib]], bp[3 * bi[3 * ib] + 1], bp[3 * bi[3 * ib] + 2],
    bp[3 * bi[3 * ib + 1]], bp[3 * bi[3 * ib + 1] + 1], bp[3 * bi[3 * ib + 1] + 2],
    bp[3 * bi[3 * ib + 2]], bp[3 * bi[3 * ib + 2] + 1], bp[3 * bi[3 * ib + 2] + 2]];

  // intersection => distance 0 (non-coplanar: an edge must pierce; coplanar: 2D SAT)
  let hit = false;
  for (let e = 0; e < 3 && !hit; e++) {
    const i0 = 3 * e, i1 = 3 * ((e + 1) % 3);
    if (segTriHit(va[i0], va[i0 + 1], va[i0 + 2], va[i1], va[i1 + 1], va[i1 + 2],
      vb[0], vb[1], vb[2], vb[3], vb[4], vb[5], vb[6], vb[7], vb[8])) hit = true;
    if (!hit && segTriHit(vb[i0], vb[i0 + 1], vb[i0 + 2], vb[i1], vb[i1 + 1], vb[i1 + 2],
      va[0], va[1], va[2], va[3], va[4], va[5], va[6], va[7], va[8])) hit = true;
  }
  let best = Infinity, wpa = null, wpb = null;
  const consider = (d2, ax, ay, az, bx, by, bz) => {
    if (withWitness) { if (d2 < best) { best = d2; wpa = [ax, ay, az]; wpb = [bx, by, bz]; } }
    else if (d2 < best) best = d2;
  };
  if (hit) {
    // report zero distance with the centroid of the overlap region as witness
    const cx = (va[0] + va[3] + va[6]) / 3, cy = (va[1] + va[4] + va[7]) / 3, cz = (va[2] + va[5] + va[8]) / 3;
    return withWitness ? { d2: 0, pa: [cx, cy, cz], pb: [cx, cy, cz] } : 0;
  }
  // collinear/coplanar edge-crossing without vertex inside is missed by segTriHit when
  // triangles are exactly coplanar; detect that case explicitly.
  const ux = va[3] - va[0], uy = va[4] - va[1], uz = va[5] - va[2];
  const wx = va[6] - va[0], wy = va[7] - va[1], wz = va[8] - va[2];
  const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
  const nl = Math.hypot(nx, ny, nz);
  if (nl > 0) {
    const scale = nl * Math.max(A.diag, B.diag, 1e-300);
    let coplanar = true;
    for (let k = 0; k < 3; k++) {
      const d = Math.abs(nx * (vb[3 * k] - va[0]) + ny * (vb[3 * k + 1] - va[1]) + nz * (vb[3 * k + 2] - va[2]));
      if (d > 1e-9 * scale) { coplanar = false; break; }
    }
    if (coplanar && coplanarOverlap(va, vb)) {
      const cx = (va[0] + va[3] + va[6]) / 3, cy = (va[1] + va[4] + va[7]) / 3, cz = (va[2] + va[5] + va[8]) / 3;
      return withWitness ? { d2: 0, pa: [cx, cy, cz], pb: [cx, cy, cz] } : 0;
    }
  }
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      const p = [va[3 * i], va[3 * i + 1], va[3 * i + 2]];
      const q = closestPointOnTri(p[0], p[1], p[2],
        vb[3 * j], vb[3 * j + 1], vb[3 * j + 2],
        vb[3 * ((j + 1) % 3)], vb[3 * ((j + 1) % 3) + 1], vb[3 * ((j + 1) % 3) + 2],
        vb[3 * ((j + 2) % 3)], vb[3 * ((j + 2) % 3) + 1], vb[3 * ((j + 2) % 3) + 2], tmpA);
      const ddx = p[0] - tmpA[0], ddy = p[1] - tmpA[1], ddz = p[2] - tmpA[2];
      consider(ddx * ddx + ddy * ddy + ddz * ddz, p[0], p[1], p[2], tmpA[0], tmpA[1], tmpA[2]);
      const r = [vb[3 * j], vb[3 * j + 1], vb[3 * j + 2]];
      closestPointOnTri(r[0], r[1], r[2],
        va[3 * i], va[3 * i + 1], va[3 * i + 2],
        va[3 * ((i + 1) % 3)], va[3 * ((i + 1) % 3) + 1], va[3 * ((i + 1) % 3) + 2],
        va[3 * ((i + 2) % 3)], va[3 * ((i + 2) % 3) + 1], va[3 * ((i + 2) % 3) + 2], tmpB);
      const eex = r[0] - tmpB[0], eey = r[1] - tmpB[1], eez = r[2] - tmpB[2];
      consider(eex * eex + eey * eey + eez * eez, tmpB[0], tmpB[1], tmpB[2], r[0], r[1], r[2]);
    }
    for (let j = 0; j < 3; j++) {
      const s = segSegClosest(
        va[3 * i], va[3 * i + 1], va[3 * i + 2],
        va[3 * ((i + 1) % 3)], va[3 * ((i + 1) % 3) + 1], va[3 * ((i + 1) % 3) + 2],
        vb[3 * j], vb[3 * j + 1], vb[3 * j + 2],
        vb[3 * ((j + 1) % 3)], vb[3 * ((j + 1) % 3) + 1], vb[3 * ((j + 1) % 3) + 2]);
      consider(s.d2, s.c1x, s.c1y, s.c1z, s.c2x, s.c2y, s.c2z);
    }
  }
  return withWitness ? { d2: best, pa: wpa, pb: wpb } : best;
}

/* ---------------------------------------------------------------- traversal */
class MinHeap {
  constructor() { this.k = []; this.a = []; this.b = []; }
  get size() { return this.k.length; }
  push(k, a, b) {
    let i = this.k.length;
    this.k.push(k); this.a.push(a); this.b.push(b);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.k[p] <= this.k[i]) break;
      this.swap(p, i); i = p;
    }
  }
  peek() { return this.k[0]; }
  pop() {
    const top = { k: this.k[0], a: this.a[0], b: this.b[0] };
    const last = this.k.length - 1;
    if (last > 0) { this.swap(0, last); }
    this.k.pop(); this.a.pop(); this.b.pop();
    let i = 0;
    for (;;) {
      const l = 2 * i + 1, r = l + 1;
      let m = i;
      if (l < this.k.length && this.k[l] < this.k[m]) m = l;
      if (r < this.k.length && this.k[r] < this.k[m]) m = r;
      if (m === i) break;
      this.swap(i, m); i = m;
    }
    return top;
  }
  swap(i, j) {
    [this.k[i], this.k[j]] = [this.k[j], this.k[i]];
    [this.a[i], this.a[j]] = [this.a[j], this.a[i]];
    [this.b[i], this.b[j]] = [this.b[j], this.b[i]];
  }
}

function seedUpperBound(A, B) {
  const n = Math.min(A.triCount, B.triCount);
  const probes = Math.min(48, n);
  let best = { d2: Infinity, ia: 0, ib: 0, pa: null, pb: null };
  for (let s = 0; s < probes; s++) {
    const ia = Math.floor((s * 2654435761) % A.triCount);
    const ib = Math.floor((s * 40503) % B.triCount);
    const r = triTriDistance2(A, ia, B, ib, true);
    if (r.d2 < best.d2) best = { d2: r.d2, ia, ib, pa: r.pa, pb: r.pb };
  }
  return best;
}

/**
 * Sound interval for dist(meshA, meshB).
 * opts.tol: required absolute width (use tolScale * min(diagA, diagB) for scale invariance)
 * opts.maxPairs: node-pair expansion budget; exceeding it returns certified:false.
 */
export function closestPair(A, B, opts = {}) {
  const diag = Math.min(A.diag, B.diag) || Math.max(A.diag, B.diag) || 1;
  const tol = opts.tol ?? 1e-3 * diag;
  const maxPairs = opts.maxPairs ?? 200000;
  const bvhA = opts.bvhA ?? buildBvh(A);
  const bvhB = opts.bvhB ?? buildBvh(B);
  const seed = seedUpperBound(A, B);
  let hi2 = seed.d2;
  let best = { ia: seed.ia, ib: seed.ib, pa: seed.pa, pb: seed.pb };
  const heap = new MinHeap();
  const rootGap = aabbGap2(bvhA.nodes[0].min, bvhA.nodes[0].max, bvhB.nodes[0].min, bvhB.nodes[0].max);
  heap.push(rootGap, 0, 0);
  let pops = 0, leafTests = 0;
  const total = A.triCount * B.triCount;
  const stop = () => {
    const hi = Math.sqrt(hi2);
    return {
      certified: true, reason: 'interval-closed', lo: Math.max(0, hi - tol), hi,
      tol, pa: best.pa, pb: best.pb, ia: best.ia, ib: best.ib,
      leafTests, nodePairs: pops, totalPairs: total, heapSize: heap.size, diag,
    };
  };
  while (heap.size > 0) {
    const topK = heap.peek();
    if (Number.isFinite(hi2)) {
      const thresh = Math.max(0, Math.sqrt(hi2) - tol);
      if (topK >= thresh * thresh) return stop();
    }
    if (pops >= maxPairs) {
      const hi = Number.isFinite(hi2) ? Math.sqrt(hi2) : null;
      let lo = Math.sqrt(heap.peek());
      if (hi !== null && lo > hi) lo = hi;
      return {
        certified: false, reason: 'budget-exhausted', lo, hi, tol,
        pa: best.pa, pb: best.pb, ia: best.ia, ib: best.ib,
        leafTests, nodePairs: pops, totalPairs: total, heapSize: heap.size, diag,
      };
    }
    const p = heap.pop();
    pops++;
    const na = bvhA.nodes[p.a], nb = bvhB.nodes[p.b];
    const leafA = na.l < 0, leafB = nb.l < 0;
    if (leafA && leafB) {
      for (let i = na.start; i < na.start + na.count; i++) {
        const ia = bvhA.order[i];
        for (let j = nb.start; j < nb.start + nb.count; j++) {
          const ib = bvhB.order[j];
          const d2 = triTriDistance2(A, ia, B, ib, false);
          leafTests++;
          if (d2 < hi2) {
            const w = triTriDistance2(A, ia, B, ib, true);
            hi2 = d2; best = { ia, ib, pa: w.pa, pb: w.pb };
          }
        }
      }
      continue;
    }
    // split the larger node (by diagonal, then by count)
    const useA = leafB || (!leafA && (na.count >= nb.count));
    if (useA) {
      for (const c of [na.l, na.r]) {
        const cn = bvhA.nodes[c];
        heap.push(aabbGap2(cn.min, cn.max, nb.min, nb.max), c, p.b);
      }
    } else {
      for (const c of [nb.l, nb.r]) {
        const cn = bvhB.nodes[c];
        heap.push(aabbGap2(na.min, na.max, cn.min, cn.max), p.a, c);
      }
    }
  }
  const hi = Math.sqrt(hi2);
  return {
    certified: true, reason: 'exhaustive', lo: hi, hi, tol,
    pa: best.pa, pb: best.pb, ia: best.ia, ib: best.ib,
    leafTests, nodePairs: pops, totalPairs: total, heapSize: 0, diag,
  };
}

/** Exact brute force over every triangle pair (performance baseline / oracle in-repo). */
export function bruteForceDistance(A, B) {
  let best = Infinity, ia = 0, ib = 0;
  for (let i = 0; i < A.triCount; i++) {
    for (let j = 0; j < B.triCount; j++) {
      const d2 = triTriDistance2(A, i, B, j, false);
      if (d2 < best) { best = d2; ia = i; ib = j; }
    }
  }
  return { lo: Math.sqrt(best), hi: Math.sqrt(best), pair: [ia, ib], tests: A.triCount * B.triCount };
}

/** Certification against a design target: is every point of B at least `target` away from A? */
export function certifyClearance(A, B, target, opts = {}) {
  const r = closestPair(A, B, { ...opts, tol: Math.min(opts.tol ?? 1e-3 * Math.min(A.diag, B.diag), target * 1e-3) });
  if (r.lo !== null && r.lo >= target) {
    return { pass: true, verdict: 'certified-clear', interval: [r.lo, r.hi], target, result: r };
  }
  if (r.hi !== null && r.hi < target) {
    return { pass: false, verdict: 'contact-witness', gap: r.hi, target, pa: r.pa, pb: r.pb, result: r };
  }
  return { pass: false, verdict: 'undecided', interval: [r.lo, r.hi], target, result: r };
}
