#!/usr/bin/env node
// Timing harness: cold start + >=5 warm reps, median/min/p95/stddev, plus the brute-force baseline.
import { readFileSync, writeFileSync } from 'node:fs';
import { makeMesh, closestPair, bruteForceDistance } from '../src/core.mjs';

const corpus = JSON.parse(readFileSync(new URL('../data/corpus.json', import.meta.url)));
const now = () => Number(process.hrtime.bigint()) / 1e6;
const stats = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const mean = s.reduce((a, b) => a + b, 0) / s.length;
  const sd = Math.sqrt(s.reduce((a, b) => a + (b - mean) ** 2, 0) / s.length);
  return {
    n: s.length, min: +s[0].toFixed(3), median: +s[Math.floor(s.length / 2)].toFixed(3),
    p95: +s[Math.min(s.length - 1, Math.floor(0.95 * s.length))].toFixed(3),
    max: +s.at(-1).toFixed(3), stddev: +sd.toFixed(3), rsdPct: +(100 * sd / mean).toFixed(2),
  };
};

// ---- corpus batch (47 pairs) ----
const corpusPairs = corpus.cases.map((c) => [makeMesh(c.meshA.positions, c.meshA.indices), makeMesh(c.meshB.positions, c.meshB.indices)]);
const corpusRun = () => corpusPairs.map(([A, B]) => closestPair(A, B, { tol: 1e-3 * Math.min(A.diag, B.diag) }));
const t0 = now(); const coldOut = corpusRun(); const coldCorpus = now() - t0;
const corpusTimes = [];
for (let i = 0; i < 7; i++) { const t = now(); corpusRun(); corpusTimes.push(now() - t); }

// ---- perf pair: 1280 x 1280 triangles ----
const A = makeMesh(corpus.perf.A.positions, corpus.perf.A.indices);
const B = makeMesh(corpus.perf.B.positions, corpus.perf.B.indices);
const tol = 1e-3 * Math.min(A.diag, B.diag);
const t1 = now(); const coldPerf = closestPair(A, B, { tol }); const coldPerfMs = now() - t1;
const perfTimes = [];
for (let i = 0; i < 7; i++) { const t = now(); closestPair(A, B, { tol }); perfTimes.push(now() - t); }
const totalPairs = A.triCount * B.triCount;

// ---- brute force baseline on the same pair ----
const t2 = now(); const brute = bruteForceDistance(A, B); const coldBrute = now() - t2;
const bruteTimes = [];
for (let i = 0; i < 3; i++) { const t = now(); bruteForceDistance(A, B); bruteTimes.push(now() - t); }

const perf = stats(perfTimes), base = stats(bruteTimes), cor = stats(corpusTimes);
const result = {
  generatedAt: new Date().toISOString(),
  node: process.version,
  platform: `${process.platform}/${process.arch}`,
  corpus: {
    cases: corpus.cases.length,
    order: 'all 47 corpus pairs (box / plane / tetra / near-touch / contact / scale ladder)',
    coldMs: +coldCorpus.toFixed(2), ...cor,
    certified: coldOut.filter((r) => r.certified).length,
  },
  perf: {
    meshA: `icosphere ${A.triCount} tris`, meshB: `icosphere ${B.triCount} tris`,
    totalPairs, leafTests: coldPerf.leafTests, nodePairs: coldPerf.nodePairs,
    pairReductionPct: +(100 * (1 - coldPerf.leafTests / totalPairs)).toFixed(2),
    certified: coldPerf.certified, hi: +coldPerf.hi.toFixed(9),
    interval: [+coldPerf.lo.toFixed(9), +coldPerf.hi.toFixed(9)],
    coldMs: +coldPerfMs.toFixed(2), ...perf,
    speedupVsBruteMedian: +(base.median / perf.median).toFixed(2),
  },
  baselineBruteForce: {
    implementation: 'src/core.mjs bruteForceDistance (same tri-tri routine, no pruning)',
    totalPairs, coldMs: +coldBrute.toFixed(2), ...base,
    distance: +brute.lo.toFixed(9),
  },
  agreementWithBaseline: {
    absDiff: +Math.abs(brute.lo - coldPerf.hi).toFixed(9),
    note: 'brute force is exact for these faceted spheres; the interval hi must be >= truth and within tol',
  },
  notes: [
    'coldMs is the first invocation (JIT cold); warm samples are separate.',
    'P95 is the nearest-rank order statistic of the samples.',
    'RSD is population stddev / mean over the warm samples.',
  ],
};
writeFileSync(new URL('./result.json', import.meta.url), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
