# Cognitive Utility Network — a NANDA prototype

A working prototype of the NANDA resolution flow from the paper
*"NANDA: Networked Agent Name Discovery Architecture"* — a client resolves an
agent **name**, follows signed pointers through the **index → AgentAddr →
AgentFacts** two-hop path, **verifies** what it receives with real Ed25519
cryptography, and **acts** on it. It ships with a headless demo, a test harness,
and an interactive browser visualization.

```
   client knows only a NAME
        │
        ▼   hop 1: index lookup
   NANDA Lean Index ──► AgentAddr    signed pointer: facts_url, key_id, ttl, sig
        │                            (no capabilities / pricing / trust)
        ▼   hop 2: follow facts_url
   AgentFacts Service ──► AgentFacts signed metadata: capabilities, pricing,
        │                            trust, endpoints, telemetry
        ▼
   verify (Ed25519) ──► act          call the verified endpoint at the quoted price
```

## Quick start

Requires Node 20+ (developed on Node 24; uses the Web Crypto Ed25519 API).

```bash
npm install

npm run demo      # headless Level 1 walkthrough — prints the full flow + tamper test
npm test          # 20 assertions covering the Level 1 contract
npm run dev       # interactive browser visualization at http://localhost:3001
```

`npm run demo` registers four agents, then — acting purely as a client that
knows only a **name** — resolves three of them through both hops, verifies every
signed document, and proves a single mutated field is rejected by real
cryptography. Exit code is non-zero if any check fails, so it doubles as a smoke
test.

## How it meets the Level 1 brief

| Requirement | Where |
|---|---|
| Resolve a name → verifiable, actionable result | [`scripts/demo.ts`](scripts/demo.ts), [`app/lib/registry.ts`](app/lib/registry.ts) |
| `index → AgentAddr → AgentFacts` visible in code | [`NandaRegistry.resolve` / `.fetchFacts`](app/lib/registry.ts), [`mockIndexResolve` / `mockFetchAgentFacts`](app/lib/nanda.ts) |
| Register ≥2 agents, resolve as a client (≥ twice) | 4 agents in [`app/lib/agents.ts`](app/lib/agents.ts); demo resolves 3 |
| Tamper detection | [`verifyAgentFacts`](app/lib/nanda.ts) + tests in [`tests/level1.test.ts`](tests/level1.test.ts) |

### Verification approach — and why

**Signed JSON with Ed25519 over canonical JSON**, using the platform Web Crypto
API (`crypto.subtle`) — no hand-rolled primitives.

- Each document is signed over a **canonical JSON** encoding (recursively
  sorted keys, no whitespace) so the signature is stable across engines.
- The client verifies the signature against the issuer public key identified by
  `public_key_id`. Any change to a signed field — trust score, price, endpoint
  URL, capabilities — makes `crypto.subtle.verify()` return `false`.

I chose signed JSON over **W3C Verifiable Credentials** deliberately: VCs add
JSON-LD `@context` resolution and a proof suite that buy interoperability we
don't need at Level 1, while signed canonical JSON already gives full
tamper-detection. The upgrade path is clean — wrap the body in a VC envelope and
move the signature into a `proof` block — and is noted in the UI.

The `AgentAddr` is kept deliberately **lean** (the demo and tests assert it
carries no capabilities/pricing/trust); that heavy, fast-changing metadata lives
in `AgentFacts`, which is signed and fetched separately and can change
independently of the index.

## Level 2 — extensions included

Level 1 works end-to-end on its own; these were added on top:

- **Headless CLI demo** (`npm run demo`) and a **20-case test harness**
  (`npm test`) exercising the real `app/lib` code, not a copy.
- **Interactive visualization** (`npm run dev`): a step-by-step protocol trace
  (resolve → verify → route → execute → bill) with live tamper / TTL-expiry /
  circuit-breaker / credential-revocation scenarios, plus a multi-agent **DAG
  orchestration** scene with seeded, reproducible cost/telemetry variance.
- **Real CS under the hood**: a TTL-aware LRU cache for AgentFacts, a binary
  max-heap adaptive router, Kahn's-algorithm DAG scheduler, a circuit-breaker
  state machine, and a SHA-256 Merkle-chained audit log.

## What I set aside (next steps)

- A **real index service** over HTTP (the registry is in-process); the
  `facts_url` would become a live fetch with caching by TTL.
- **Multiple registration types** (enterprise-routed, DID-based) — explicitly a
  Level 2+ concern per the brief; only NANDA-native is implemented.
- **Key rotation / revocation lists** beyond the per-agent credential-status flag.

## AI tooling note

Built with Claude Code (Opus). I used it to scaffold the Next.js app, implement
the crypto/data-structure libraries, and write the demo and tests; I directed
the architecture (the two-hop registry split, the lean-AgentAddr invariant, the
signed-JSON-over-VC decision) and reviewed/verified all output by running the
build, demo, and test suite.

## Project layout

```
app/lib/        crypto.ts (Ed25519, canonical JSON, SHA-256), registry.ts (index),
                nanda.ts (resolve/verify/route/bill), cache.ts, heap.ts, dag.ts,
                circuit-breaker.ts, rng.ts, agents.ts, types.ts
app/components/  browser visualization (ProtocolDemo, OrchestrationDemo, graphs)
scripts/demo.ts  headless Level 1 walkthrough
tests/           Level 1 contract tests (vitest)
```
