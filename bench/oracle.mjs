// Independent brute-force oracle. Deliberately does NOT import src/core.mjs and does not
// reuse its tolerances: intersection is decided by a 11-axis separating-axis test, distance
// by an independently written point-triangle / segment-segment minimiser.
const EPS_REL = 1e-10; // only used to make SAT numerically tolerant, scaled by the pair size

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

function projRange(pts, axis) {
  let lo = Infinity, hi = -Infinity;
  for (const p of pts) { const d = dot(p, axis); if (d < lo) lo = d; if (d > hi) hi = d; }
  return [lo, hi];
}

// 11-axis SAT for two triangles (face normals + edge-edge cross products).
export function trianglesIntersect(A, B) {
  const scale = Math.max(1e-300, Math.hypot(...sub(A[1], A[0])), Math.hypot(...sub(B[1], B[0])));
  const eps = EPS_REL * scale;
  const axes = [];
  const nA = cross(sub(A[1], A[0]), sub(A[2], A[0]));
  const nB = cross(sub(B[1], B[0]), sub(B[2], B[0]));
  if (Math.hypot(...nA) > 1e-300) axes.push(nA);
  if (Math.hypot(...nB) > 1e-300) axes.push(nB);
  for (let i = 0; i < 3; i++) {
    const ea = sub(A[(i + 1) % 3], A[i]);
    for (let j = 0; j < 3; j++) {
      const ax = cross(ea, sub(B[(j + 1) % 3], B[j]));
      if (Math.hypot(...ax) > 1e-300) axes.push(ax);
    }
    // in-plane edge normals: required when both triangles are coplanar
    axes.push(cross(ea, nA));
    axes.push(cross(sub(B[(i + 1) % 3], B[i]), nB));
  }
  for (const ax of axes) {
    const [a0, a1] = projRange(A, ax), [b0, b1] = projRange(B, ax);
    const len = Math.hypot(...ax);
    if (a1 < b0 - eps * len || b1 < a0 - eps * len) return false;
  }
  return true;
}

function closestOnTri(p, a, b, c) {
  const ab = sub(b, a), ac = sub(c, a), ap = sub(p, a);
  const d1 = dot(ab, ap), d2 = dot(ac, ap);
  if (d1 <= 0 && d2 <= 0) return a;
  const bp = sub(p, b), d3 = dot(ab, bp), d4 = dot(ac, bp);
  if (d3 >= 0 && d4 <= d3) return b;
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) { const v = d1 / (d1 - d3); return [a[0] + ab[0] * v, a[1] + ab[1] * v, a[2] + ab[2] * v]; }
  const cp = sub(p, c), d5 = dot(ab, cp), d6 = dot(ac, cp);
  if (d6 >= 0 && d5 <= d6) return c;
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) { const w = d2 / (d2 - d6); return [a[0] + ac[0] * w, a[1] + ac[1] * w, a[2] + ac[2] * w]; }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    const w = (d4 - d3) / ((d4 - d3) + (d5 - d6));
    return [b[0] + (c[0] - b[0]) * w, b[1] + (c[1] - b[1]) * w, b[2] + (c[2] - b[2]) * w];
  }
  const den = va + vb + vc;
  if (!(Math.abs(den) > 1e-300)) return a;
  const v = vb / den, w = vc / den;
  return [a[0] + ab[0] * v + ac[0] * w, a[1] + ab[1] * v + ac[1] * w, a[2] + ab[2] * v + ac[2] * w];
}

function segSeg(p1, q1, p2, q2) {
  const d1 = sub(q1, p1), d2 = sub(q2, p2), r = sub(p1, p2);
  const a = dot(d1, d1), e = dot(d2, d2), f = dot(d2, r);
  let s, t;
  if (a <= 1e-300 && e <= 1e-300) { s = 0; t = 0; }
  else if (a <= 1e-300) { s = 0; t = Math.min(1, Math.max(0, f / e)); }
  else {
    const c = dot(d1, r);
    if (e <= 1e-300) { t = 0; s = Math.min(1, Math.max(0, -c / a)); }
    else {
      const b = dot(d1, d2), den = a * e - b * b;
      s = den > 1e-300 ? Math.min(1, Math.max(0, (b * f - c * e) / den)) : 0;
      t = (b * s + f) / e;
      if (t < 0) { t = 0; s = Math.min(1, Math.max(0, -c / a)); }
      else if (t > 1) { t = 1; s = Math.min(1, Math.max(0, (b - c) / a)); }
    }
  }
  return [p1[0] + d1[0] * s, p1[1] + d1[1] * s, p1[2] + d1[2] * s,
    p2[0] + d2[0] * t, p2[1] + d2[1] * t, p2[2] + d2[2] * t];
}

export function triTriDistance(A, B) {
  if (trianglesIntersect(A, B)) return 0;
  let best = Infinity;
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      const p = A[i];
      const q = closestOnTri(p, B[j], B[(j + 1) % 3], B[(j + 2) % 3]);
      best = Math.min(best, Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]));
      const r = B[j];
      const s = closestOnTri(r, A[i], A[(i + 1) % 3], A[(i + 2) % 3]);
      best = Math.min(best, Math.hypot(r[0] - s[0], r[1] - s[1], r[2] - s[2]));
    }
    for (let j = 0; j < 3; j++) {
      const [x0, y0, z0, x1, y1, z1] = segSeg(A[i], A[(i + 1) % 3], B[j], B[(j + 1) % 3]);
      best = Math.min(best, Math.hypot(x0 - x1, y0 - y1, z0 - z1));
    }
  }
  return best;
}

export function bruteDistance(meshA, meshB, limit = Infinity) {
  const A = meshA.positions, B = meshB.positions;
  const tri = (P, I, t) => [[P[I[3 * t] * 3], P[I[3 * t] * 3 + 1], P[I[3 * t] * 3 + 2]],
    [P[I[3 * t + 1] * 3], P[I[3 * t + 1] * 3 + 1], P[I[3 * t + 1] * 3 + 2]],
    [P[I[3 * t + 2] * 3], P[I[3 * t + 2] * 3 + 1], P[I[3 * t + 2] * 3 + 2]]];
  let best = Infinity, tests = 0;
  for (let i = 0; i < meshA.triangles; i++) {
    for (let j = 0; j < meshB.triangles; j++) {
      if (tests >= limit) return { distance: best, tests };
      best = Math.min(best, triTriDistance(tri(A, meshA.indices, i), tri(B, meshB.indices, j)));
      tests++;
    }
  }
  return { distance: best, tests };
}
