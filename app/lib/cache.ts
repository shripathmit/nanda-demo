"use client";

import type { AgentFacts, CacheEntry } from "./types";

// TTL-aware LRU cache for AgentFacts.
// Insertion order of Map gives us LRU approximation without extra bookkeeping.
export class AgentFactsCache {
  private store = new Map<string, CacheEntry>();
  private readonly maxSize: number;

  constructor(maxSize = 20) {
    this.maxSize = maxSize;
  }

  get(agentId: string): { facts: AgentFacts; cacheHit: true } | null {
    const entry = this.store.get(agentId);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(agentId);
      return null;
    }
    // LRU: re-insert to move to end
    this.store.delete(agentId);
    entry.hits++;
    this.store.set(agentId, entry);
    return { facts: { ...entry.facts, cacheHit: true }, cacheHit: true };
  }

  set(agentId: string, facts: AgentFacts, ttlSeconds: number): void {
    if (this.store.size >= this.maxSize) {
      // evict least recently used (first key in Map)
      const firstKey = this.store.keys().next().value;
      if (firstKey !== undefined) this.store.delete(firstKey);
    }
    this.store.set(agentId, {
      facts,
      expiresAt: Date.now() + ttlSeconds * 1000,
      hits: 0,
    });
  }

  /** Returns seconds until expiry, or 0 if expired/absent */
  ttlRemaining(agentId: string): number {
    const entry = this.store.get(agentId);
    if (!entry) return 0;
    return Math.max(0, Math.floor((entry.expiresAt - Date.now()) / 1000));
  }

  hits(agentId: string): number {
    return this.store.get(agentId)?.hits ?? 0;
  }

  invalidate(agentId: string): void {
    this.store.delete(agentId);
  }

  snapshot(): Array<{ agentId: string; ttlRemaining: number; hits: number }> {
    const now = Date.now();
    return Array.from(this.store.entries()).map(([agentId, entry]) => ({
      agentId,
      ttlRemaining: Math.max(0, Math.floor((entry.expiresAt - now) / 1000)),
      hits: entry.hits,
    }));
  }
}

// Singleton shared across the demo session
export const globalCache = new AgentFactsCache();
