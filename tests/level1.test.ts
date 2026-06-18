import { describe, it, expect, beforeAll } from "vitest";
import { generateKeyPair, type KeyPair } from "@/app/lib/crypto";
import { NandaRegistry, agentIdFor } from "@/app/lib/registry";
import { verifyAgentAddr, verifyAgentFacts, runVerification } from "@/app/lib/nanda";
import { AGENTS } from "@/app/lib/agents";
import type { AgentFacts, Task } from "@/app/lib/types";

// These tests assert the Level 1 contract:
//   "A client should be able to resolve an agent name and receive something it
//    can verify and act on. The flow index → AgentAddr → AgentFacts should be
//    visible. Register ≥2 agents, resolve them as a client, demonstrate the
//    full path. The client should be able to detect tampering."

let keyPair: KeyPair;
let registry: NandaRegistry;

beforeAll(async () => {
  keyPair = await generateKeyPair();
  registry = new NandaRegistry(keyPair);
  registry.registerAll(AGENTS);
});

describe("registration", () => {
  it("registers at least two agents (floor)", () => {
    expect(registry.listNames().length).toBeGreaterThanOrEqual(2);
  });

  it("derives agent_id consistently between index and facts service", () => {
    expect(agentIdFor("@deep-thinker")).toBe("nanda:agent:deep-thinker-001");
  });
});

describe("hop 1 — index lookup returns a lean, signed AgentAddr", () => {
  it("resolves a name to an AgentAddr", async () => {
    const addr = await registry.resolve("@deep-thinker");
    expect(addr.agent_name).toBe("@deep-thinker");
    expect(addr.facts_url).toContain("deep-thinker");
    expect(addr.signature.length).toBeGreaterThan(0);
  });

  it("AgentAddr is LEAN — carries no capabilities/pricing/trust/endpoints", async () => {
    const addr = await registry.resolve("@math-expert") as unknown as Record<string, unknown>;
    for (const heavy of ["capabilities", "pricing", "trust", "endpoints", "telemetry"]) {
      expect(addr[heavy]).toBeUndefined();
    }
  });

  it("AgentAddr signature verifies with the issuer public key", async () => {
    const addr = await registry.resolve("@market-analyst");
    expect(await verifyAgentAddr(addr, keyPair.publicKey)).toBe(true);
  });

  it("rejects an unknown name (index miss)", async () => {
    await expect(registry.resolve("@does-not-exist")).rejects.toThrow(/index miss/i);
  });
});

describe("hop 2 — follow facts_url to fetch signed AgentFacts", () => {
  it("fetches AgentFacts whose agent_id matches the AgentAddr", async () => {
    const addr = await registry.resolve("@deep-thinker");
    const facts = await registry.fetchFacts(addr);
    expect(facts.agent_id).toBe(addr.agent_id); // consistency across hops
    expect(facts.capabilities.length).toBeGreaterThan(0);
    expect(facts.pricing.base_fee).toBeGreaterThan(0);
    expect(facts.endpoints[0].url).toMatch(/^https:\/\//);
  });

  it("AgentFacts signature verifies", async () => {
    const addr = await registry.resolve("@math-expert");
    const facts = await registry.fetchFacts(addr);
    expect(await verifyAgentFacts(facts, keyPair.publicKey)).toBe(true);
  });
});

describe("full client path — repeated at least twice", () => {
  const names = ["@deep-thinker", "@math-expert", "@market-analyst"];

  it.each(names)("client resolves %s end-to-end and can act on it", async (name) => {
    // Client starts from a NAME only.
    const addr = await registry.resolve(name);
    expect(await verifyAgentAddr(addr, keyPair.publicKey)).toBe(true);

    const facts = await registry.fetchFacts(addr);
    expect(await verifyAgentFacts(facts, keyPair.publicKey)).toBe(true);
    expect(addr.agent_id).toBe(facts.agent_id);

    // "Act on it": the client now has a verified, callable endpoint + price.
    expect(facts.endpoints[0].url).toMatch(/^https:\/\//);
    expect(facts.pricing.base_fee).toBeGreaterThan(0);
  });

  it("resolves more than the floor of two distinct agents", async () => {
    const resolved = await Promise.all(names.map((n) => registry.resolve(n)));
    const ids = new Set(resolved.map((a) => a.agent_id));
    expect(ids.size).toBeGreaterThanOrEqual(3);
  });
});

describe("tamper detection — the heart of the exercise", () => {
  let facts: AgentFacts;

  beforeAll(async () => {
    const addr = await registry.resolve("@deep-thinker");
    facts = await registry.fetchFacts(addr);
  });

  it("a pristine document verifies", async () => {
    expect(await verifyAgentFacts(facts, keyPair.publicKey)).toBe(true);
  });

  it("detects a flipped trust score", async () => {
    const tampered: AgentFacts = { ...facts, trust: { ...facts.trust, trust_score: 0.999 } };
    expect(await verifyAgentFacts(tampered, keyPair.publicKey)).toBe(false);
  });

  it("detects an altered pricing field", async () => {
    const tampered: AgentFacts = {
      ...facts,
      pricing: { ...facts.pricing, base_fee: 0.0001 },
    };
    expect(await verifyAgentFacts(tampered, keyPair.publicKey)).toBe(false);
  });

  it("detects an added capability", async () => {
    const tampered: AgentFacts = {
      ...facts,
      capabilities: [...facts.capabilities, "unauthorized_medical_advice"],
    };
    expect(await verifyAgentFacts(tampered, keyPair.publicKey)).toBe(false);
  });

  it("detects a swapped endpoint URL (redirect attack)", async () => {
    const tampered: AgentFacts = {
      ...facts,
      endpoints: [{ ...facts.endpoints[0], url: "https://attacker.demo/reason" }],
    };
    expect(await verifyAgentFacts(tampered, keyPair.publicKey)).toBe(false);
  });

  it("rejects a signature from the wrong key", async () => {
    const other = await generateKeyPair();
    expect(await verifyAgentFacts(facts, other.publicKey)).toBe(false);
  });
});

describe("end-to-end verification gate (runVerification)", () => {
  const task: Task = {
    id: "startup-risk",
    title: "Startup Risk Review",
    prompt: "Evaluate this startup idea and identify the top risks.",
    requiredCapability: "strategic_analysis",
    maxPrice: 1.0,
    minTrust: 0.8,
    latencyBudgetMs: 4000,
    complexity: "high",
  };

  it("passes all checks for a legitimate agent", async () => {
    const addr = await registry.resolve("@deep-thinker");
    const facts = await registry.fetchFacts(addr);
    const result = await runVerification(addr, facts, task, keyPair.publicKey);
    expect(result.passed).toBe(true);
    expect(result.checks.agentfacts_ed25519).toBe("passed");
    expect(result.checks.agent_id_consistency).toBe("passed");
  });

  it("fails verification when AgentFacts is tampered", async () => {
    const addr = await registry.resolve("@deep-thinker");
    const facts = await registry.fetchFacts(addr);
    const result = await runVerification(addr, facts, task, keyPair.publicKey, {
      trust: { ...facts.trust, trust_score: 0.999 },
    });
    expect(result.passed).toBe(false);
    expect(result.checks.agentfacts_ed25519).toBe("failed");
  });
});
