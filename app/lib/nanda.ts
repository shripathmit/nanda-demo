"use client";

import type {
  AgentDef,
  AgentAddr,
  AgentFacts,
  AgentFactsBody,
  Task,
  VerificationResult,
  RouteCandidate,
  UsageReport,
  Invoice,
  Complexity,
} from "./types";
import { signPayload, verifyPayload, canonicalJson } from "./crypto";
import type { KeyPair } from "./crypto";
import type { AgentJitter } from "./rng";
import { MaxHeap } from "./heap";
import { getBreakerForAgent } from "./circuit-breaker";
import { globalCache } from "./cache";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function slug(name: string) {
  return name.replace("@", "").replace(/[^a-zA-Z0-9-]/g, "-");
}

function clamp(v: number, lo = 0, hi = 1) {
  return Math.max(lo, Math.min(hi, v));
}

function nowIso() {
  return new Date().toISOString();
}

function futureIso(seconds: number) {
  return new Date(Date.now() + seconds * 1000).toISOString();
}

// ─── NANDA Index Resolve ─────────────────────────────────────────────────────

export async function mockIndexResolve(
  agent: AgentDef,
  keyPair: KeyPair
): Promise<AgentAddr> {
  const s = slug(agent.name);
  const body = {
    agent_name: agent.name,
    agent_id: `nanda:agent:${s}-001`,
    registration_type: "NANDA-native",
    facts_url: `https://facts.demo/${s}`,
    private_facts_url: `https://private-facts.demo/${s}`,
    adaptive_resolver_url: "https://resolver.demo/route",
    public_key_id: keyPair.keyId,
    ttl: 300,
    issued_at: nowIso(),
    expires_at: futureIso(300),
  };
  const signature = await signPayload(keyPair.privateKey, body);
  return { ...body, signature };
}

// ─── AgentFacts Build ────────────────────────────────────────────────────────

export function buildAgentFactsBody(
  agent: AgentDef,
  addr: AgentAddr,
  opts: { tampered?: boolean; highLoad?: boolean; credentialRevoked?: boolean; jitter?: AgentJitter } = {}
): AgentFactsBody {
  const { tampered = false, highLoad = false, credentialRevoked = false, jitter } = opts;
  // High-load scenario forces a hard surge; otherwise use seeded run jitter.
  const surge = highLoad ? 1.8 : jitter?.surge ?? 1.0;
  const latencyMs = Math.round(agent.latencyMs * (jitter?.latencyMult ?? 1));
  const currentLoad = highLoad
    ? 0.91
    : clamp((agent.load + (jitter?.loadDelta ?? 0)), 0, 0.99);

  return {
    type: "AgentFacts",
    agent_id: addr.agent_id,
    agent_name: agent.name,
    label: agent.label,
    description: agent.description,
    version: "1.0.0",
    capabilities: tampered
      ? [...agent.capabilities, "unauthorized_medical_advice"]
      : agent.capabilities,
    pricing: {
      model: "cognitive_units",
      base_fee: tampered ? 0.001 : agent.baseFee,
      input_token_rate: 0.000001,
      output_token_rate: 0.000002,
      reasoning_step_rate: 0.005,
      tool_call_rate: 0.01,
      complexity_rate: 0.002,
      minimum_charge: 0.02,
      maximum_charge: 2.0,
      surge_multiplier: surge,
    },
    trust: {
      trust_score: tampered ? 0.99 : agent.trustScore,
      trust_level: agent.trustScore > 0.85 ? "verified" : "basic",
      issuer: agent.issuer,
      credential: tampered ? "MODIFIED_CREDENTIAL" : `VALID_CRED_${slug(agent.name)}`,
      credential_status: credentialRevoked ? "revoked" : tampered ? "invalid" : "valid",
      revoked: credentialRevoked,
    },
    endpoints: [
      {
        id: `${slug(agent.name)}-${agent.region}`,
        url: tampered ? "https://attacker.demo/reason" : agent.endpoint,
        region: agent.region,
        latency_ms: latencyMs,
        health: "healthy",
        load: currentLoad,
        capabilities: agent.capabilities,
      },
    ],
    telemetry: {
      availability_24h: agent.availability,
      latency_p95_ms: latencyMs,
      current_load: currentLoad,
      quality_score: agent.quality,
    },
    ttl: 120,
    issued_at: nowIso(),
    expires_at: futureIso(120),
  };
}

export async function mockFetchAgentFacts(
  agent: AgentDef,
  addr: AgentAddr,
  keyPair: KeyPair,
  opts: { tampered?: boolean; highLoad?: boolean; credentialRevoked?: boolean; jitter?: AgentJitter } = {}
): Promise<AgentFacts> {
  // Cache check
  const cached = globalCache.get(addr.agent_id);
  if (cached) return cached.facts;

  const body = buildAgentFactsBody(agent, addr, opts);
  // Sign the UNMODIFIED body; if tampered we sign first then mutate the body
  // so the signature becomes invalid — exactly how real tampering works.
  const signature = await signPayload(keyPair.privateKey, body);
  const facts: AgentFacts = { ...body, signature };

  globalCache.set(addr.agent_id, facts, body.ttl);
  return facts;
}

// ─── Verify ──────────────────────────────────────────────────────────────────

export async function verifyAgentAddr(
  addr: AgentAddr,
  publicKey: CryptoKey
): Promise<boolean> {
  const { signature, verified: _v, ...body } = addr;
  return verifyPayload(publicKey, body, signature);
}

export async function verifyAgentFacts(
  facts: AgentFacts,
  publicKey: CryptoKey,
  tamperedBody?: Partial<AgentFactsBody>
): Promise<boolean> {
  const { signature, verified: _v, cacheHit: _c, ...body } = facts;
  const payloadToVerify = tamperedBody ? { ...body, ...tamperedBody } : body;
  return verifyPayload(publicKey, payloadToVerify, signature);
}

export async function runVerification(
  addr: AgentAddr,
  facts: AgentFacts,
  task: Task,
  publicKey: CryptoKey,
  tamperedBody?: Partial<AgentFactsBody>
): Promise<VerificationResult> {
  const checks: Record<string, "passed" | "failed" | "skip"> = {};

  const addrSigOk = await verifyAgentAddr(addr, publicKey);
  checks.agentaddr_ed25519 = addrSigOk ? "passed" : "failed";

  const factsSigOk = await verifyAgentFacts(facts, publicKey, tamperedBody);
  checks.agentfacts_ed25519 = factsSigOk ? "passed" : "failed";

  checks.agent_id_consistency =
    addr.agent_id === facts.agent_id ? "passed" : "failed";

  checks.credential_status =
    facts.trust.credential_status === "valid" && !facts.trust.revoked
      ? "passed"
      : "failed";

  const now = new Date();
  checks.ttl_valid =
    new Date(facts.expires_at) > now && new Date(addr.expires_at) > now
      ? "passed"
      : "failed";

  checks.capability_match = facts.capabilities.includes(task.requiredCapability)
    ? "passed"
    : "failed";

  checks.trust_threshold =
    facts.trust.trust_score >= task.minTrust ? "passed" : "failed";

  // Circuit breaker check
  const breaker = getBreakerForAgent(facts.agent_name);
  checks.circuit_breaker = breaker.attempt() ? "passed" : "failed";

  const failed = Object.values(checks).some((v) => v === "failed");
  return {
    agent: facts.agent_name,
    passed: !failed,
    checks,
    reason: failed
      ? "One or more verification checks failed."
      : "All verification checks passed.",
  };
}

// ─── Adaptive Routing ────────────────────────────────────────────────────────

export function estimateUsage(task: Task, agent: AgentDef): UsageReport {
  const complexityScore: Record<Complexity, number> = { low: 2, medium: 5, high: 8 };
  const reasoningSteps: Record<Complexity, number> = { low: 5, medium: 12, high: 22 };
  const baseTokens: Record<Complexity, number> = { low: 300, medium: 900, high: 1800 };
  const outTokens: Record<Complexity, number> = { low: 180, medium: 500, high: 900 };

  const cs = complexityScore[task.complexity];
  const rs = reasoningSteps[task.complexity];
  const tc = task.requiredCapability === "optimization" ? 3 : task.complexity === "high" ? 2 : 0;
  const it = Math.round(task.prompt.length * 1.4 + baseTokens[task.complexity]);
  const ot = outTokens[task.complexity];
  const cu = rs + tc * 2 + cs;

  return {
    input_tokens: it,
    output_tokens: ot,
    reasoning_steps: rs,
    tool_calls: tc,
    complexity_score: cs,
    cognitive_units: cu,
    latency_ms: agent.latencyMs,
  };
}

export function calculatePrice(facts: AgentFacts, usage: UsageReport): { raw: number; final: number } {
  const p = facts.pricing;
  const raw =
    p.base_fee +
    usage.input_tokens * p.input_token_rate +
    usage.output_tokens * p.output_token_rate +
    usage.reasoning_steps * p.reasoning_step_rate +
    usage.tool_calls * p.tool_call_rate +
    usage.complexity_score * p.complexity_rate;
  const surged = raw * p.surge_multiplier;
  const final = Math.min(Math.max(surged, p.minimum_charge), p.maximum_charge);
  return { raw, final };
}

export function scoreCandidate(
  agent: AgentDef,
  facts: AgentFacts,
  verification: VerificationResult,
  task: Task
): RouteCandidate {
  const usage = estimateUsage(task, agent);
  const { final: estimatedPrice } = calculatePrice(facts, usage);
  const endpoint = facts.endpoints[0];
  const routeReasons: string[] = [];

  if (!verification.passed) {
    return {
      agent, facts, verification, estimatedPrice, routeScore: 0,
      rejected: true, rejectionReason: "Verification failed.",
      routeReasons: ["Rejected: one or more verification checks failed."],
    };
  }
  if (!facts.capabilities.includes(task.requiredCapability)) {
    return {
      agent, facts, verification, estimatedPrice, routeScore: 0,
      rejected: true, rejectionReason: `Missing capability: ${task.requiredCapability}`,
      routeReasons: [`Rejected: provider does not expose ${task.requiredCapability}.`],
    };
  }
  if (facts.trust.trust_score < task.minTrust) {
    return {
      agent, facts, verification, estimatedPrice, routeScore: 0,
      rejected: true, rejectionReason: "Trust score below minimum.",
      routeReasons: [`Rejected: trust ${facts.trust.trust_score.toFixed(2)} < min ${task.minTrust.toFixed(2)}.`],
    };
  }
  if (estimatedPrice > task.maxPrice) {
    return {
      agent, facts, verification, estimatedPrice, routeScore: 0,
      rejected: true, rejectionReason: "Estimated price above budget.",
      routeReasons: [`Rejected: $${estimatedPrice.toFixed(4)} > budget $${task.maxPrice.toFixed(2)}.`],
    };
  }
  if (endpoint.health !== "healthy") {
    return {
      agent, facts, verification, estimatedPrice, routeScore: 0,
      rejected: true, rejectionReason: "Endpoint unhealthy.",
      routeReasons: ["Rejected: endpoint is unhealthy."],
    };
  }

  const priceScore = clamp(1 - estimatedPrice / task.maxPrice);
  const latencyScore = clamp(1 - endpoint.latency_ms / task.latencyBudgetMs);
  const availabilityScore = facts.telemetry.availability_24h;
  const capabilityScore = facts.capabilities.includes(task.requiredCapability) ? 1.0 : 0.5;
  const trustScore = facts.trust.trust_score;

  const routeScore =
    0.35 * trustScore +
    0.25 * priceScore +
    0.20 * latencyScore +
    0.10 * availabilityScore +
    0.10 * capabilityScore;

  routeReasons.push(`Capability matched: ${task.requiredCapability}`);
  routeReasons.push(`Trust ${trustScore.toFixed(2)} ≥ min ${task.minTrust.toFixed(2)}`);
  routeReasons.push(`Price $${estimatedPrice.toFixed(4)} ≤ budget $${task.maxPrice.toFixed(2)}`);
  routeReasons.push(`Latency ${endpoint.latency_ms} ms ≤ budget ${task.latencyBudgetMs} ms`);
  routeReasons.push(`Endpoint: ${endpoint.health}`);

  return { agent, facts, verification, estimatedPrice, routeScore, rejected: false, routeReasons };
}

/** Uses MaxHeap to select the best provider in O(n log n) */
export function adaptiveRoute(candidates: RouteCandidate[]): {
  winner: RouteCandidate | null;
  heap: MaxHeap<RouteCandidate>;
} {
  const heap = new MaxHeap<RouteCandidate>();
  for (const c of candidates) {
    if (!c.rejected) heap.insert(c, c.routeScore);
  }
  const top = heap.extractMax();
  return { winner: top?.item ?? null, heap };
}

// ─── Execute & Bill ──────────────────────────────────────────────────────────

const REASONING_OUTPUTS: Record<string, { summary: string; recommendations: string[] }> = {
  "startup-risk": {
    summary: "Identified three primary risk vectors: market timing, execution bandwidth, and defensibility. Competitive moat is thin given two well-funded incumbents. Unit economics require 18-month burn validation.",
    recommendations: [
      "Run a 6-week pilot with 10 design-partner customers before scaling.",
      "Quantify willingness-to-pay via conjoint analysis, not surveys.",
      "File provisional patent on the core algorithm before public launch.",
    ],
  },
  "quick-summary": {
    summary: "Product update summary generated optimised for speed and token efficiency.",
    recommendations: [
      "Highlight user-facing impact in the first sentence.",
      "Remove implementation details from the customer-facing copy.",
      "Add a single measurable outcome metric.",
    ],
  },
  optimization: {
    summary: "Constraint-aware allocation plan produced. Optimal solution allocates 62% to high-margin SKUs under the given capacity envelope.",
    recommendations: [
      "Prioritise SKUs with margin > 40% and velocity > 200 units/week.",
      "Reserve 15% buffer capacity for demand spikes.",
      "Re-run the optimisation monthly as demand curves shift.",
    ],
  },
};

export function executeReasoning(task: Task, selected: RouteCandidate) {
  return REASONING_OUTPUTS[task.id] ?? {
    summary: `${selected.agent.name} completed the reasoning task.`,
    recommendations: ["Review output with domain expert before acting."],
  };
}

export function makeInvoice(
  task: Task,
  candidate: RouteCandidate,
  usage: UsageReport
): Invoice {
  const { raw, final } = calculatePrice(candidate.facts, usage);
  return {
    invoice_id: `inv-${Math.floor(Math.random() * 1_000_000).toString(16).padStart(6, "0")}`,
    task_id: task.id,
    provider: candidate.agent.name,
    usage,
    raw_cost: raw,
    final_cost: final,
    pricing_model: candidate.facts.pricing.model,
    status: "settled_demo_credits",
  };
}

// ─── Canonical JSON for display ──────────────────────────────────────────────

export { canonicalJson };
