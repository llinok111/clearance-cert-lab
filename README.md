# clearance-cert-lab

**A sound two-sided interval for the gap between two triangle meshes: 1,638,400 triangle-pair predicates → 5,911 (−99.64%), 26.65 ms vs 4,252 ms for the in-repo brute force (159.5×), and every reported number is an interval that provably contains the true distance.**

Upstream: none

This is not a sampler. A surface-sampling "clearance estimate" is only an upper bound — on the 6
touching pairs in the bundled corpus, 4 are reported as "clear" by a 2048×2048 sample estimate while
the true gap is exactly 0. Here the answer is always `[lo, hi]` with `lo <= truth <= hi`, plus the two
witness points that realise `hi`. When the interval cannot be closed inside the node-pair budget the
tool **abstains** (`certified: false`) instead of guessing.

```
core.closestPair(A, B, {tol}) -> {lo, hi, certified, pa, pb, leafTests, nodePairs, ...}
core.certifyClearance(A, B, target) -> certified-clear | contact-witness | undecided
```

## How to run (one command each)

```bash
node tools/gen-sample.mjs     # rebuild data/corpus.json deterministically (47 pairs + perf pair)
node bench/verify.mjs         # 12 assertions, exit 0 only if all pass
node bench/bench.mjs          # writes bench/result.json (cold start + 7 warm reps + brute force)
python3 -m http.server 4173   # then open http://localhost:4173  (pin: three@0.169.0 via importmap)
```

No install step: `src/core.mjs`, `bench/` and `tools/` are dependency-free Node ESM.
The browser needs network access to `unpkg.com/three@0.169.0` (version pinned in `index.html`).

## Evidence (real runs, 2026-11-12, node v24.19.0, linux/x64)

`node bench/verify.mjs` → **12 passed, 0 failed**

| assertion | measured |
| --- | --- |
| analytic bracket (47 closed-form cases: box gaps, parallel planes, tetra apex, near-touch) | **47/47** intervals contain truth; max over-estimate 4.574e-4 |
| interval width | max `(hi-lo)/minDiag` = **1.000e-3** (the requested tol) |
| contact cases | **6/6** report `hi = 0` exactly |
| independent oracle (11-axis SAT + separately written minimisers, no shared constants) | **47/47** agree; worst relative difference 3.368e-4 |
| scale invariance 1e-6 / 1e-3 / 1 / 1e3 / 1e6 | `lo/scale` spread **1.11e-16**, `hi/scale` spread 9.71e-17 |
| sampling estimate is not a bound | median error 0.00%, max +412.3%; **4/6 touching pairs look clear** |
| predicate count on 320×320 sphere pair | 1,617 / 102,400 = **1.58%** (63.3× fewer) |
| budget exhaustion (`maxPairs: 1`) | `certified: false`, reason `budget-exhausted`, interval `[0.2828, 2.0038]` |
| three-valued clearance verdict | `certified-clear [0.1998, 0.2000]` at target 0.15; `contact-witness` at 0.25 (gap 0.2000) |
| determinism | two runs identical `[lo, hi, leafTests, nodePairs]` |
| witness realises the gap | `|pa-pb| = 0.634978565 = hi` |

`node bench/bench.mjs` → `bench/result.json`

| metric | value |
| --- | --- |
| mesh pair | two icospheres, 1,280 triangles each, centres (0,0,0) / (2.2,2.2,0) |
| brute force (`bruteForceDistance`, same kernel, no pruning) | 1,638,400 predicates, **4,252.095 ms** median of 3 (cold 4,263.28 ms) |
| branch-and-bound (`closestPair`) | **5,911** predicates (−99.64%), 2,833 node-pair expansions, **26.654 ms** median of 7 |
| speed-up | **159.5×** (median vs median); RSD 4.61% |
| interval | `[1.107903913, 1.111368015]`, width 3.464e-3 = `1e-3 × bbox diagonal` (3.4641) |
| cold start | **44.46 ms** (first call, JIT cold) |
| agreement with brute force | absolute difference **0** |
| 47-case corpus batch | cold 17.81 ms, median 3.325 ms, p95 7.638 ms, RSD 41.47% |

**Why RSD 41.47% on the corpus batch:** the batch mixes 47 very different workloads, dominated by
the 1e6-scale ladder case (a 1,732,050-unit bounding box) next to 1e-6 cases; the first warm samples
also still carry JIT warm-up. Per-pair medians are stable (e.g. the sphere pair has RSD 4.61%), so the
width reflects input heterogeneity, not timer noise. The raw per-sample array is reproducible with
`node bench/bench.mjs`.

## 本轮创新

**新在哪：** 首次把「区间算术 + 双树 AABB 分支限界」用在网格间隙上，输出的是一个**可判伪的双边区间**
与**三值裁决**（`certified-clear` / `contact-witness` / `undecided`），而不是一个点估计；区间宽度是调用者
指定的容差，未闭合就显式拒绝。与 Poisson-disk/SDF 类工具不同，这里的结论可以被一个**独立 SAT oracle**
在 47 个闭式真值上逐例推翻——采样估计做不到这一点（本轮实测：4/6 个真实接触对被采样判成"clear"）。

**和谁不一样：** 常见 clearance 工具返回最近点距离（上界）并默认它等于间隙；本仓库同时维护**下界**
（未解析结点对的 AABB 距离）与**上界**（已精确求过的三角形对），只有 `hi-lo <= tol` 才签字。浏览器
滑杆调 target 时，屏幕上的区间与 node 端 `bench/verify.mjs` 断言的是**同一个 core.mjs 函数**。

## Repository layout

```
index.html            # single entry, importmap pins three@0.169.0
main.js               # render + orbit + slider; calls core only
src/core.mjs          # pure geometry/interval logic (no three, no DOM)
baseline/naive.mjs    # brute-force reference, same kernel without pruning
bench/oracle.mjs      # independent oracle: 11-axis SAT + own distance minimisers
bench/verify.mjs      # 12 assertions
bench/bench.mjs       # cold + 7 warm reps, writes bench/result.json
tools/gen-sample.mjs  # deterministic corpus generator (seed 0xC0FFEE)
data/corpus.json      # 47 analytic cases + perf pair, 157 KB, regenerated by the script
```

## Known limits (read before trusting a number)

- **Absolute tolerances are explicit.** `tol` defaults to `1e-3 × min(bbox diagonal)`; every call in
  `bench/` passes it explicitly. A caller working in metres and one working in millimetres get the same
  *relative* interval (verified across 1e-6 … 1e6), but `tol` itself is an absolute length.
- **Intersection epsilon is relative: `1e-9 × diag`.** Triangles closer than that are treated as
  intersecting, so `hi` may under-report the true gap by at most ~`1e-9 × diag`. The coplanar SAT uses
  the same relative epsilon. Below ~`1e-12 × diag` double precision cannot resolve the gap at all.
- **`hi` is only as tight as the tolerance you ask for**, and `lo` only rises when unresolved AABB pairs
  are split. With `maxPairs` exhausted the result is `certified: false` — never silently rounded.
- **The brute-force baseline shares the triangle-triangle kernel** with the fast path; the 159.5×
  measures the pruning, not the kernel. Kernel correctness is instead checked against `bench/oracle.mjs`
  (independent SAT + independent minimisers) and against 47 closed-form distances.
- **Performance is single-threaded and in-memory.** No BVH cache between slider moves; the browser
  rebuilds both trees per evaluation, which is fine at ≤ a few thousand triangles per mesh but not at
  glTF-asset scale. No GPU compute is involved.
- **Pairs of triangle soups only.** Meshes need not be watertight for the distance bound (it is a
  set-to-set distance), but no inside/outside or volume semantics are claimed.

## License

MIT © 2026 llinok111. No third-party code is vendored; three.js is loaded from a pinned CDN at runtime.
