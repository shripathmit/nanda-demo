"use client";

// Deterministic PRNG so a run can be reproduced from its seed.
// mulberry32 — small, fast, good enough distribution for demo jitter.
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Per-agent telemetry perturbation for a single run. Bounded so routing stays
// realistic and budget constraints still mean something.
export interface AgentJitter {
  /** multiplier on latency, ~0.85–1.15 */
  latencyMult: number;
  /** additive delta on current load, ~-0.12..+0.12 */
  loadDelta: number;
  /** surge multiplier on price — 1.0 most runs, occasional spike up to ~1.7 */
  surge: number;
}

export function makeAgentJitter(rng: () => number): AgentJitter {
  const latencyMult = 0.85 + rng() * 0.3;
  const loadDelta = (rng() - 0.5) * 0.24;
  const surge = rng() < 0.25 ? 1 + rng() * 0.7 : 1.0;
  return { latencyMult, loadDelta, surge };
}

/** Random 32-bit seed for a fresh, unreproduced run. */
export function randomSeed(): number {
  return Math.floor(Math.random() * 0xffffffff) >>> 0;
}
