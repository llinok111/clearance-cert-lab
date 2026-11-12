#!/usr/bin/env node
// Assertion gate. Every number printed here comes from an actual run.
import { readFileSync } from 'node:fs';
import { makeMesh, closestPair, bruteForceDistance, triTriDistance2, certifyClearance } from '../src/core.mjs';
import { bruteDistance } from './oracle.mjs';

const corpus = JSON.parse(readFileSync(new URL('../data/corpus.json', import.meta.url)));
const mesh = (m) => makeMesh(m.positions, m.indices);
let pass = 0, fail = 0;
const ok = (cond, label, detail) => {
  if (cond) { pass++; console.log(`PASS  ${label}  ${detail}`); }
  else { fail++; console.log(`FAIL  ${label}  ${detail}`); }
};

// ---------- 1. analytic corpus: interval must bracket the closed-form truth ----------
let brackets = 0, maxAbsErr = 0, maxWidth = 0, certified = 0;
const rows = [];
for (const c of corpus.cases) {
  const A = mesh(c.meshA), B = mesh(c.meshB);
  const r = closestPair(A, B, { tol: 1e-3 * Math.min(A.diag, B.diag) });
  const tolAbs = 1e-9 * Math.max(A.diag, B.diag);
  const good = r.lo !== null && r.hi !== null && r.lo <= c.truth + tolAbs && r.hi >= c.truth - tolAbs;
  if (good) brackets++;
  maxAbsErr = Math.max(maxAbsErr, r.hi === null ? Infinity : Math.abs(r.hi - c.truth));
  maxWidth = Math.max(maxWidth, (r.hi - r.lo) / Math.min(A.diag, B.diag));
  if (r.certified) certified++;
  rows.push({ id: c.id, truth: c.truth, lo: r.lo, hi: r.hi, certified: r.certified });
}
ok(brackets === corpus.cases.length, 'analytic-bracket',
  `${brackets}/${corpus.cases.length} intervals contain closed-form truth, max|hi-truth|=${maxAbsErr.toExponential(3)}`);
ok(maxWidth <= 1.05e-3, 'relative-interval-width',
  `max (hi-lo)/minDiag=${maxWidth.toExponential(3)} (requested 1e-3, 5% slack for the 1e-9 intersection eps)`);
ok(certified === corpus.cases.length, 'all-certified', `${certified}/${corpus.cases.length} certified=true`);

// ---------- 2. contact cases must report exactly 0 ----------
const contact = corpus.cases.filter((c) => c.kind === 'contact');
const zero = contact.filter((c) => {
  const r = closestPair(mesh(c.meshA), mesh(c.meshB));
  return r.hi === 0;
});
ok(zero.length === contact.length, 'contact-exact-zero', `${zero.length}/${contact.length} touching pairs reported hi=0 exactly`);

// ---------- 3. independent oracle (11-axis SAT + own minimisers) ----------
let oracleMatch = 0, worstOracle = 0;
for (const c of corpus.cases) {
  const A = mesh(c.meshA), B = mesh(c.meshB);
  const r = closestPair(A, B);
  const o = bruteDistance(c.meshA, c.meshB);
  const d = Math.abs(r.hi - o.distance);
  worstOracle = Math.max(worstOracle, d / Math.max(A.diag, 1e-300));
  if (d <= 2e-3 * Math.max(A.diag, B.diag) + 1e-9) oracleMatch++;
}
ok(oracleMatch === corpus.cases.length, 'oracle-agreement',
  `${oracleMatch}/${corpus.cases.length} agree with independent oracle, worst rel diff=${worstOracle.toExponential(3)}`);

// ---------- 4. scale invariance 1e-6 .. 1e6 ----------
const ladder = corpus.cases.filter((c) => c.kind === 'scale-ladder');
const rels = ladder.map((c) => {
  const A = mesh(c.meshA), B = mesh(c.meshB);
  const r = closestPair(A, B);
  return { k: c.scale, loRel: r.lo / c.scale, hiRel: r.hi / c.scale, widthRel: (r.hi - r.lo) / c.scale };
});
const loRelVals = rels.map((r) => r.loRel), hiRelVals = rels.map((r) => r.hiRel);
const loSpread = Math.max(...loRelVals) - Math.min(...loRelVals);
const hiSpread = Math.max(...hiRelVals) - Math.min(...hiRelVals);
ok(ladder.length === 5 && loSpread < 1e-9 && hiSpread < 1e-9, 'scale-invariance',
  `scales ${ladder.map((c) => c.scale).join(',')}: lo/scale ${Math.min(...loRelVals).toFixed(9)}..${Math.max(...loRelVals).toFixed(9)} (spread ${loSpread.toExponential(2)}), hi/scale spread ${hiSpread.toExponential(2)}`);

// ---------- 5. sampling estimate is NOT a bound (honest baseline) ----------
let seed = 12345;
const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
function sampleSurface(m, n) {
  const out = [];
  for (let k = 0; k < n; k++) {
    const t = Math.floor(rnd() * m.triangles);
    let u = rnd(), v = rnd();
    if (u + v > 1) { u = 1 - u; v = 1 - v; }
    const w = 1 - u - v;
    const I = m.indices, P = m.positions;
    out.push([0, 1, 2].map((a) => w * P[I[3 * t] * 3 + a] + u * P[I[3 * t + 1] * 3 + a] + v * P[I[3 * t + 2] * 3 + a]));
  }
  return out;
}
const overestimates = [];
let contactOver = 0;
for (const c of corpus.cases.slice(0, 40)) {
  const S1 = sampleSurface(c.meshA, 2048), S2 = sampleSurface(c.meshB, 2048);
  let best = Infinity;
  for (const p of S1) for (const q of S2) best = Math.min(best, Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]));
  if (c.truth > 1e-9) overestimates.push((best - c.truth) / c.truth);
  else if (best > 1e-6) contactOver++;
}
overestimates.sort((a, b) => a - b);
const med = overestimates[Math.floor(overestimates.length / 2)];
ok(contactOver >= 3 && overestimates[0] >= -1e-9, 'sampling-unsound',
  `2048x2048 surface samples: median overestimate ${(med * 100).toFixed(2)}%, max ${(overestimates.at(-1) * 100).toFixed(1)}%; ${contactOver}/6 touching pairs called "clear" (min sample distance > 0)`);

// ---------- 6. pruning: predicate count vs brute force on the perf pair ----------
const pA = mesh(corpus.perf.small.A), pB = mesh(corpus.perf.small.B);
const pr = closestPair(pA, pB, { tol: 1e-3 * Math.min(pA.diag, pB.diag) });
const totalPairs = pA.triCount * pB.triCount;
const frac = pr.leafTests / totalPairs;
ok(pr.certified && frac < 0.05, 'predicate-reduction',
  `${pr.leafTests}/${totalPairs} triangle-pair predicates = ${(frac * 100).toFixed(2)}% (${(1 / frac).toFixed(1)}x fewer); certified=${pr.certified}, hi=${pr.hi.toFixed(6)}`);

// ---------- 7. budget exhaustion must abstain, not guess ----------
const ab = closestPair(pA, pB, { maxPairs: 1 });
ok(ab.certified === false && ab.reason === 'budget-exhausted' && ab.lo <= pr.hi + 1e-12,
  'abstain-on-budget', `maxPairs=1 -> certified=${ab.certified}, reason=${ab.reason}, interval=[${ab.lo}, ${ab.hi === null ? 'null' : ab.hi.toFixed(4)}]`);

// ---------- 8. clearance verdicts are three-valued and sound ----------
const box = (x, gap) => ({ positions: [x, 0, 0, x + 1, 0, 0, x + 1, 1, 0, x, 1, 0], indices: [0, 1, 2, 0, 2, 3], triangles: 2 });
const q1 = mesh(box(0, 0)), q2 = mesh(box(1.2, 0)); // surface gap 0.2 in the same z-plane
const c1 = certifyClearance(q1, q2, 0.15);
const c2 = certifyClearance(q1, q2, 0.25);
ok(c1.pass === true && c1.verdict === 'certified-clear' && c2.pass === false && c2.verdict === 'contact-witness',
  'clearance-three-valued',
  `target 0.15 -> ${c1.verdict} [${c1.interval[0].toFixed(4)}, ${c1.interval[1].toFixed(4)}]; target 0.25 -> ${c2.verdict} at gap ${c2.gap.toFixed(4)}`);

// ---------- 9. determinism ----------
const j = (r) => JSON.stringify([r.lo, r.hi, r.leafTests, r.nodePairs]);
const d1 = j(closestPair(pA, pB)), d2 = j(closestPair(pA, pB));
ok(d1 === d2, 'determinism', `two runs identical: ${d1}`);

// ---------- 10. witness points really realise the reported gap ----------
const w = closestPair(mesh(corpus.cases[0].meshA), mesh(corpus.cases[0].meshB));
const wd = Math.hypot(w.pa[0] - w.pb[0], w.pa[1] - w.pb[1], w.pa[2] - w.pb[2]);
ok(Math.abs(wd - w.hi) < 1e-9 * Math.max(1, w.hi), 'witness-realises-gap',
  `|pa-pb|=${wd.toFixed(9)} vs hi=${w.hi.toFixed(9)} (pair ${w.ia},${w.ib})`);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
