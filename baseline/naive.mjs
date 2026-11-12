// Brute-force reference: every triangle pair, no spatial pruning. Same distance kernel as
// src/core.mjs so the measured speed-up isolates the effect of the branch-and-bound pruning.
export { bruteForceDistance as naiveDistance } from '../src/core.mjs';
