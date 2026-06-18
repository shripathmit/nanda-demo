"use client";

import type { AgentDef, AgentAddr, AgentFacts } from "./types";
import type { KeyPair } from "./crypto";
import { mockIndexResolve, mockFetchAgentFacts } from "./nanda";

// ─────────────────────────────────────────────────────────────────────────────
// NANDA Registry — makes the paper's two-hop resolution explicit.
//
//   client knows only a NAME
//        │
//        ▼   hop 1: index lookup
//   NANDA Lean Index ──► AgentAddr   (signed pointer: facts_url, key_id, ttl, sig)
//        │
//        ▼   hop 2: follow facts_url
//   AgentFacts Service ──► AgentFacts (signed metadata: caps, pricing, trust…)
//
// The index stores only what is needed to mint a lean AgentAddr. The facts
// service holds the full provider record, keyed by agent_id, and serves signed
// AgentFacts. A client never holds an AgentDef directly — it starts from a name
// and follows signed pointers, exactly as the paper describes.
// ─────────────────────────────────────────────────────────────────────────────

/** Mirror of the agent_id derivation in nanda.ts (slug → nanda:agent:<slug>-001). */
export function agentIdFor(name: string): string {
  const slug = name.replace("@", "").replace(/[^a-zA-Z0-9-]/g, "-");
  return `nanda:agent:${slug}-001`;
}

export interface FactsOpts {
  tampered?: boolean;
  highLoad?: boolean;
  credentialRevoked?: boolean;
}

export class NandaRegistry {
  /** The lean index: agent_name → registration. */
  private index = new Map<string, AgentDef>();
  /** The facts service backing store: agent_id → full provider record. */
  private factsStore = new Map<string, AgentDef>();

  constructor(private keyPair: KeyPair) {}

  /** Register an agent into the index and facts service. */
  register(def: AgentDef): void {
    this.index.set(def.name, def);
    this.factsStore.set(agentIdFor(def.name), def);
  }

  registerAll(defs: AgentDef[]): void {
    for (const d of defs) this.register(d);
  }

  /** All names a client could resolve. */
  listNames(): string[] {
    return [...this.index.keys()];
  }

  /**
   * HOP 1 — Index lookup. Resolve a NAME to a signed AgentAddr.
   * Returns only a lean pointer: no capabilities, pricing, or trust.
   */
  async resolve(agentName: string): Promise<AgentAddr> {
    const def = this.index.get(agentName);
    if (!def) throw new Error(`Index miss: unknown agent name "${agentName}"`);
    return mockIndexResolve(def, this.keyPair);
  }

  /**
   * HOP 2 — Follow AgentAddr.facts_url to the facts service and fetch the
   * signed AgentFacts for that agent_id.
   */
  async fetchFacts(addr: AgentAddr, opts: FactsOpts = {}): Promise<AgentFacts> {
    const def = this.factsStore.get(addr.agent_id);
    if (!def) throw new Error(`Facts service miss: unknown agent_id "${addr.agent_id}"`);
    return mockFetchAgentFacts(def, addr, this.keyPair, opts);
  }
}
