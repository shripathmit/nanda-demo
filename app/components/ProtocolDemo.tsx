"use client";

import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  CheckCircle2, XCircle, AlertCircle, Loader2, ShieldCheck,
  ShieldX, Zap, RotateCcw, Lock, Wifi, WifiOff, ArrowRight, Database, FileJson
} from "lucide-react";
import type {
  AgentDef, AgentAddr, AgentFacts, AgentFactsBody, VerificationResult,
  RouteCandidate, UsageReport, Invoice, AuditEvent, DemoStage, Task,
} from "@/app/lib/types";
import type { KeyPair } from "@/app/lib/crypto";
import {
  mockIndexResolve, mockFetchAgentFacts, runVerification,
  scoreCandidate, adaptiveRoute, estimateUsage, calculatePrice,
  executeReasoning, makeInvoice,
} from "@/app/lib/nanda";
import { globalCache } from "@/app/lib/cache";
import { getBreakerForAgent } from "@/app/lib/circuit-breaker";
import { buildAuditEvent, GENESIS_HASH } from "@/app/lib/audit";
import { AGENTS, TASKS } from "@/app/lib/agents";
import AgentCard from "./AgentCard";
import AuditChain from "./AuditChain";
import JsonInspector from "./JsonInspector";
import MetricBadge from "./MetricBadge";
import FlowGraph from "./FlowGraph";

// ─── Lean index field list ────────────────────────────────────────────────────
// Exactly what the NANDA paper says the index should store — nothing else.
const INDEX_FIELDS = [
  "agent_name", "agent_id", "registration_type",
  "facts_url", "private_facts_url", "adaptive_resolver_url",
  "public_key_id", "ttl", "issued_at", "expires_at", "signature",
] as const;

interface Props {
  keyPair: KeyPair;
}

const STEP_LABELS: Partial<Record<DemoStage, string>> = {
  idle: "Ready",
  resolving: "Resolving providers…",
  resolved: "Providers resolved",
  cache_checked: "Cache checked",
  verifying: "Verifying signatures…",
  verified: "Verification complete",
  routing: "Computing route…",
  routed: "Provider selected",
  executing: "Executing reasoning…",
  executed: "Reasoning complete",
  billing: "Generating invoice…",
  billed: "Invoice generated",
  blocked: "Execution blocked",
};

export default function ProtocolDemo({ keyPair }: Props) {
  const [task, setTask] = useState<Task>(TASKS[0]);
  const [stage, setStage] = useState<DemoStage>("idle");
  const [tampered, setTampered] = useState(false);
  const [revokedAgent, setRevokedAgent] = useState<string | null>(null);
  const [circuitBrokenAgent, setCircuitBrokenAgent] = useState<string | null>(null);

  // Per-agent resolution state — maps agentName → result
  const [addrMap, setAddrMap] = useState<Map<string, AgentAddr>>(new Map());
  const [factsMap, setFactsMap] = useState<Map<string, AgentFacts>>(new Map());
  // Which agent the user is currently examining in the two-hop flow
  const [focusedAgent, setFocusedAgent] = useState<string>(AGENTS[0].name);
  // Per-agent status: idle | addr_fetched | facts_fetched
  const [perAgentStatus, setPerAgentStatus] = useState<Map<string, "idle" | "addr_loading" | "addr_fetched" | "facts_loading" | "facts_fetched">>(new Map());

  const [tamperedBody, setTamperedBody] = useState<Partial<AgentFactsBody> | null>(null);
  const [verifications, setVerifications] = useState<VerificationResult[]>([]);
  const [candidates, setCandidates] = useState<RouteCandidate[]>([]);
  const [winner, setWinner] = useState<RouteCandidate | null>(null);
  const [reasoningResult, setReasoningResult] = useState<{ summary: string; recommendations: string[] } | null>(null);
  const [usage, setUsage] = useState<UsageReport | null>(null);
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [audit, setAudit] = useState<AuditEvent[]>([]);
  const [streamText, setStreamText] = useState("");
  const prevHashRef = useRef(GENESIS_HASH);
  const auditLenRef = useRef(0);

  async function addAudit(type: string, message: string) {
    auditLenRef.current += 1;
    const event = await buildAuditEvent(auditLenRef.current, type, message, prevHashRef.current);
    prevHashRef.current = event.hash;
    setAudit((prev) => [...prev, event]);
    return event;
  }

  function setAgentStatus(name: string, status: "idle" | "addr_loading" | "addr_fetched" | "facts_loading" | "facts_fetched") {
    setPerAgentStatus((prev) => new Map([...prev, [name, status]]));
  }

  function reset() {
    setStage("idle");
    setTampered(false);
    setRevokedAgent(null);
    setCircuitBrokenAgent(null);
    setAddrMap(new Map());
    setFactsMap(new Map());
    setPerAgentStatus(new Map());
    setTamperedBody(null);
    setVerifications([]);
    setCandidates([]);
    setWinner(null);
    setReasoningResult(null);
    setUsage(null);
    setInvoice(null);
    setAudit([]);
    setStreamText("");
    auditLenRef.current = 0;
    prevHashRef.current = GENESIS_HASH;
    globalCache.snapshot().forEach(({ agentId }) => globalCache.invalidate(agentId));
    AGENTS.forEach((a) => getBreakerForAgent(a.name).forceClose());
  }

  // ── Step 1a: Index Lookup — name → AgentAddr (lean, signed) ─────────────────
  async function handleIndexLookup(agentName: string) {
    const agentDef = AGENTS.find((a) => a.name === agentName);
    if (!agentDef) return;
    setFocusedAgent(agentName);
    setAgentStatus(agentName, "addr_loading");
    setStage("resolving");

    await addAudit("provider_resolution_started",
      `Client → NANDA Lean Index: resolve("${agentName}")`);

    const addr = await mockIndexResolve(agentDef, keyPair);

    setAddrMap((prev) => new Map([...prev, [agentName, addr]]));
    setAgentStatus(agentName, "addr_fetched");

    await addAudit("agentaddr_returned",
      `Index returned AgentAddr for ${agentName}. ` +
      `Contains only: agent_id, facts_url, public_key_id, ttl, signature. ` +
      `No capabilities, no pricing, no trust score.`);

    setStage("resolved");
  }

  // ── Step 1b: Fetch AgentFacts — follow facts_url from AgentAddr ──────────────
  async function handleFetchFacts(agentName: string) {
    const agentDef = AGENTS.find((a) => a.name === agentName);
    const addr = addrMap.get(agentName);
    if (!agentDef || !addr) return;
    setFocusedAgent(agentName);
    setAgentStatus(agentName, "facts_loading");

    await addAudit("agentfacts_fetched",
      `Client → ${addr.facts_url}: GET AgentFacts for ${agentName}`);

    const cacheResult = globalCache.get(addr.agent_id);
    if (cacheResult) {
      setFactsMap((prev) => new Map([...prev, [agentName, cacheResult.facts]]));
      setAgentStatus(agentName, "facts_fetched");
      await addAudit("cache_hit",
        `AgentFacts cache hit for ${agentName} — TTL still valid, no network call.`);
      return;
    }

    const opts = {
      tampered: tampered && agentName === "@deep-thinker",
      credentialRevoked: revokedAgent === agentName,
    };
    const facts = await mockFetchAgentFacts(agentDef, addr, keyPair, opts);
    setFactsMap((prev) => new Map([...prev, [agentName, facts]]));
    setAgentStatus(agentName, "facts_fetched");

    await addAudit("cache_miss",
      `AgentFacts fetched from origin for ${agentName} and stored in TTL-aware LRU cache (TTL: ${facts.ttl}s).`);
  }

  // Derived arrays for downstream steps — only agents that have completed both hops
  const resolvedAgents = AGENTS.filter((a) => perAgentStatus.get(a.name) === "facts_fetched");
  const resolvedAddrs = resolvedAgents.map((a) => addrMap.get(a.name)!);
  const resolvedFacts = resolvedAgents.map((a) => factsMap.get(a.name)!);
  const canContinue = resolvedAgents.length >= 2 && stage !== "verifying" && stage !== "routing" && stage !== "executing" && stage !== "billing";

  // ── Step 2: Verify all resolved agents ──────────────────────────────────────
  async function handleVerify() {
    if (resolvedFacts.length === 0) return;
    setStage("verifying");
    await addAudit("verification_started",
      `Verifying ${resolvedAgents.length} agents. ` +
      `Approach: Ed25519 over canonical JSON (sorted keys, no whitespace). ` +
      `Chosen over W3C VCs to avoid JSON-LD context resolution overhead ` +
      `while preserving all tamper-detection properties needed at this prototype stage.`);

    const results = await Promise.all(
      resolvedFacts.map((f, i) =>
        runVerification(
          resolvedAddrs[i], f, task, keyPair.publicKey,
          tamperedBody && f.agent_name === "@deep-thinker" ? tamperedBody : undefined
        )
      )
    );
    setVerifications(results);

    const anyFailed = results.some((r) => !r.passed);
    for (const r of results) {
      if (r.passed) {
        await addAudit("verification_passed",
          `${r.agent}: Ed25519 ✓, agent_id consistent ✓, credential valid ✓, TTL valid ✓`);
      } else {
        const failedKeys = Object.entries(r.checks)
          .filter(([, v]) => v === "failed").map(([k]) => k).join(", ");
        await addAudit("verification_failed", `${r.agent}: FAILED [${failedKeys}]`);
      }
    }

    setStage(anyFailed && tampered ? "blocked" : "verified");
    if (anyFailed && tampered) {
      await addAudit("execution_blocked",
        "Tampered provider rejected — crypto.subtle.verify() returned false. Execution blocked.");
    }
  }

  // ── Step 3–5 unchanged in logic ──────────────────────────────────────────────
  async function handleRoute() {
    if (verifications.length === 0) return;
    setStage("routing");
    await addAudit("routing_started",
      "MaxHeap adaptive resolver scoring eligible candidates by trust, price, latency, availability, capability.");

    const scored = resolvedAgents.map((a, i) =>
      scoreCandidate(a, resolvedFacts[i], verifications[i], task));
    setCandidates(scored);

    const { winner: w } = adaptiveRoute(scored);
    setWinner(w);

    for (const c of scored) {
      if (c.rejected) await addAudit("candidate_rejected", `${c.agent.name}: ${c.rejectionReason}`);
    }

    if (w) {
      setStage("routed");
      await addAudit("provider_selected",
        `${w.agent.name} selected — score ${w.routeScore.toFixed(4)} (MaxHeap O(log n) extraction)`);
    } else {
      setStage("blocked");
      await addAudit("execution_blocked", "No eligible provider passed all routing constraints.");
    }
  }

  async function handleExecute() {
    if (!winner) return;
    setStage("executing");
    setStreamText("");
    await addAudit("reasoning_executed", `${winner.agent.name} processing: "${task.title}"`);

    const result = executeReasoning(task, winner);
    const fullText = result.summary;
    for (let i = 0; i <= fullText.length; i += 4) {
      await new Promise((r) => setTimeout(r, 18));
      setStreamText(fullText.slice(0, i));
    }
    setStreamText(fullText);
    setReasoningResult(result);

    const u = estimateUsage(task, winner.agent);
    setUsage(u);
    setStage("executed");
    await addAudit("usage_metered",
      `Cognitive units: ${u.cognitive_units} ` +
      `(${u.reasoning_steps} steps + ${u.tool_calls * 2} tool×2 + ${u.complexity_score} complexity)`);
  }

  async function handleBill() {
    if (!winner || !usage) return;
    setStage("billing");
    const inv = makeInvoice(task, winner, usage);
    const { raw } = calculatePrice(winner.facts, usage);
    setInvoice(inv);
    setStage("billed");
    await addAudit("invoice_generated",
      `Invoice ${inv.invoice_id}: raw $${raw.toFixed(4)} × surge ${winner.facts.pricing.surge_multiplier} → final $${inv.final_cost.toFixed(4)}`);
  }

  // ── Scenario controls ─────────────────────────────────────────────────────────
  async function handleTamper() {
    setTampered(true);
    reset();
    await addAudit("tamper_detected",
      "Tamper mode: @deep-thinker AgentFacts will be mutated after signing. " +
      "crypto.subtle.verify() will return false on the modified payload.");
  }

  async function handleExpireTTL() {
    globalCache.snapshot().forEach(({ agentId }) => globalCache.invalidate(agentId));
    setPerAgentStatus((prev) => {
      const next = new Map(prev);
      for (const [k, v] of next) {
        if (v === "facts_fetched") next.set(k, "addr_fetched");
      }
      return next;
    });
    setFactsMap(new Map());
    setVerifications([]);
    setCandidates([]);
    setWinner(null);
    setStage("resolved");
    await addAudit("ttl_expired",
      "TTL forcibly expired — cache cleared. Re-fetching AgentFacts will be a cache miss.");
  }

  async function handleCircuitBreak() {
    const target = "@deep-thinker";
    setCircuitBrokenAgent(target);
    getBreakerForAgent(target).forceOpen();
    await addAudit("circuit_open",
      `Circuit breaker OPENED for ${target}. verification check circuit_breaker will FAIL.`);
  }

  async function handleRevokeCredential() {
    const target = "@market-analyst";
    setRevokedAgent(target);
    globalCache.snapshot().forEach(({ agentId }) => {
      if (agentId.includes("market-analyst")) globalCache.invalidate(agentId);
    });
    setFactsMap((prev) => { const n = new Map(prev); n.delete(target); return n; });
    setPerAgentStatus((prev) => {
      const n = new Map(prev);
      if (n.get(target) === "facts_fetched") n.set(target, "addr_fetched");
      return n;
    });
    await addAudit("credential_revoked",
      `${target} credential revoked by issuer. credential_status → "revoked". ` +
      `Re-fetch and re-verify to see failure.`);
  }

  function handleJsonTamper(newBody: object) {
    setTamperedBody(newBody as Partial<AgentFactsBody>);
    setVerifications([]);
    setStage("resolved");
  }

  const focusedAddr = addrMap.get(focusedAgent);
  const focusedFacts = factsMap.get(focusedAgent);
  const cacheSnapshot = globalCache.snapshot();

  return (
    <div className="space-y-6">
      {/* Task selector */}
      <div className="rounded-xl border border-zinc-800/60 bg-zinc-900 p-5">
        <div className="text-[10px] uppercase tracking-widest text-zinc-500 mb-3">Select Task</div>
        <div className="grid sm:grid-cols-3 gap-3">
          {TASKS.map((t) => (
            <button key={t.id} onClick={() => { setTask(t); reset(); }}
              className={`text-left rounded-xl border p-4 transition-colors ${
                task.id === t.id ? "border-cyan-500/60 bg-cyan-950/20" : "border-zinc-800/60 bg-zinc-950 hover:border-zinc-700"
              }`}
            >
              <div className="font-semibold text-sm text-white">{t.title}</div>
              <div className="text-[10px] text-zinc-500 mt-1 font-mono">{t.requiredCapability}</div>
              <div className="text-[10px] text-zinc-600 mt-0.5">
                max ${t.maxPrice} · min trust {t.minTrust} · {t.complexity}
              </div>
            </button>
          ))}
        </div>
        <div className="mt-3 text-xs text-zinc-400 bg-zinc-950 border border-zinc-800/60 rounded-lg px-3 py-2">
          <span className="text-zinc-600">Prompt: </span>{task.prompt}
        </div>
      </div>

      {/* ── Resolution section: two explicit hops per agent ─────────────────── */}
      <div className="rounded-xl border border-zinc-800/60 bg-zinc-900 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-zinc-500 mb-0.5">
              Name Resolution — two-hop flow
            </div>
            <div className="text-xs text-zinc-400">
              Resolve each agent individually: name → AgentAddr (index hop) → AgentFacts (metadata hop)
            </div>
          </div>
          <div className="text-[10px] text-zinc-600 font-mono">
            {resolvedAgents.length}/4 agents fully resolved
            {resolvedAgents.length >= 2 && <span className="text-emerald-500 ml-2">✓ min 2 met</span>}
          </div>
        </div>

        {/* Agent name picker */}
        <div className="flex flex-wrap gap-2">
          {AGENTS.map((a) => {
            const status = perAgentStatus.get(a.name) ?? "idle";
            return (
              <button key={a.name} onClick={() => setFocusedAgent(a.name)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-mono transition-all ${
                  focusedAgent === a.name
                    ? "border-cyan-500/60 bg-cyan-950/20 text-cyan-300"
                    : "border-zinc-800/60 bg-zinc-950 text-zinc-400 hover:border-zinc-700"
                }`}
              >
                <span>{a.name}</span>
                <span className={`text-[9px] ${
                  status === "facts_fetched" ? "text-emerald-400"
                  : status === "addr_fetched" ? "text-amber-400"
                  : status.includes("loading") ? "text-cyan-400"
                  : "text-zinc-700"
                }`}>
                  {status === "facts_fetched" ? "✓ complete"
                   : status === "addr_fetched" ? "addr only"
                   : status.includes("loading") ? "…"
                   : "not resolved"}
                </span>
              </button>
            );
          })}
        </div>

        {/* Two-hop action buttons for focused agent */}
        <div className="flex items-center gap-3">
          <Btn
            onClick={() => handleIndexLookup(focusedAgent)}
            color="blue"
            icon={<Database size={11} />}
            disabled={perAgentStatus.get(focusedAgent) === "addr_loading"}
          >
            1a. Index Lookup — name → AgentAddr
          </Btn>
          <ArrowRight size={14} className="text-zinc-700 shrink-0" />
          <Btn
            onClick={() => handleFetchFacts(focusedAgent)}
            color="indigo"
            icon={<FileJson size={11} />}
            disabled={!addrMap.has(focusedAgent) || perAgentStatus.get(focusedAgent) === "facts_loading"}
          >
            1b. Fetch AgentFacts — follow facts_url
          </Btn>
        </div>

        {/* Progress toward downstream steps */}
        {resolvedAgents.length >= 2 && (
          <div className="rounded-lg border border-emerald-800/40 bg-emerald-950/10 px-3 py-2 text-xs text-emerald-400">
            {resolvedAgents.length} agents fully resolved ({resolvedAgents.map(a => a.name).join(", ")}).
            Ready to verify, route, and execute.
          </div>
        )}
        {resolvedAgents.length === 1 && (
          <div className="rounded-lg border border-amber-800/40 bg-amber-950/10 px-3 py-2 text-xs text-amber-400">
            Resolve at least one more agent before continuing.
          </div>
        )}
      </div>

      {/* ── Lean Index vs AgentFacts: what the index stores vs what it doesn't ── */}
      {focusedAddr && (
        <div className="rounded-xl border border-zinc-800/60 bg-zinc-900 p-5">
          <div className="text-[10px] uppercase tracking-widest text-zinc-500 mb-3">
            Lean Index principle — what lives where
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            {/* Left: what the lean index stores */}
            <div className="rounded-lg border border-blue-900/40 bg-blue-950/10 p-3">
              <div className="flex items-center gap-2 mb-2">
                <Database size={12} className="text-blue-400" />
                <span className="text-xs font-semibold text-blue-300">
                  Lean Index entry for {focusedAgent}
                </span>
                <span className="ml-auto text-[10px] text-zinc-600">{INDEX_FIELDS.length} fields</span>
              </div>
              <div className="text-[10px] text-zinc-500 mb-2">
                Only stable pointers. No capabilities, no pricing, no trust score.
                Can be cached for {focusedAddr.ttl}s before re-checking.
              </div>
              <div className="space-y-0.5 font-mono text-[10px]">
                {INDEX_FIELDS.map((f) => (
                  <div key={f} className="flex gap-2">
                    <span className="text-blue-600 shrink-0 w-40">{f}</span>
                    <span className="text-zinc-400 truncate">
                      {(() => {
                        const val = (focusedAddr as unknown as Record<string, string | number>)[f];
                        if (val === undefined) return "";
                        return f === "signature" ? `${String(val).slice(0, 20)}…` : String(val);
                      })()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            {/* Right: what AgentFacts adds */}
            <div className={`rounded-lg border p-3 ${focusedFacts ? "border-cyan-900/40 bg-cyan-950/10" : "border-zinc-800/40 bg-zinc-950"}`}>
              <div className="flex items-center gap-2 mb-2">
                <FileJson size={12} className={focusedFacts ? "text-cyan-400" : "text-zinc-600"} />
                <span className={`text-xs font-semibold ${focusedFacts ? "text-cyan-300" : "text-zinc-600"}`}>
                  AgentFacts for {focusedAgent}
                </span>
                {focusedFacts && <span className="ml-auto text-[10px] text-zinc-600">dynamic metadata</span>}
              </div>
              {focusedFacts ? (
                <>
                  <div className="text-[10px] text-zinc-500 mb-2">
                    Fetched from <span className="font-mono text-cyan-700">{focusedAddr?.facts_url}</span>.
                    Can change independently of the index. Signed separately.
                  </div>
                  <div className="space-y-0.5 font-mono text-[10px]">
                    {[
                      ["capabilities", focusedFacts.capabilities.join(", ")],
                      ["trust_score", String(focusedFacts.trust.trust_score)],
                      ["trust_level", focusedFacts.trust.trust_level],
                      ["credential_status", focusedFacts.trust.credential_status],
                      ["base_fee", `$${focusedFacts.pricing.base_fee}`],
                      ["surge_multiplier", String(focusedFacts.pricing.surge_multiplier)],
                      ["endpoint_health", focusedFacts.endpoints[0]?.health],
                      ["endpoint_latency", `${focusedFacts.endpoints[0]?.latency_ms}ms`],
                      ["availability_24h", String(focusedFacts.telemetry.availability_24h)],
                      ["ttl", `${focusedFacts.ttl}s`],
                      ["signature", `${focusedFacts.signature.slice(0, 20)}…`],
                    ].map(([k, v]) => (
                      <div key={k} className="flex gap-2">
                        <span className="text-cyan-700 shrink-0 w-40">{k}</span>
                        <span className="text-zinc-400 truncate">{v}</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="text-[10px] text-zinc-600 py-4">
                  Run step 1b to fetch AgentFacts from {focusedAddr?.facts_url}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Downstream controls (only after ≥2 agents resolved) ──────────────── */}
      <div className="flex flex-wrap gap-2">
        <Btn onClick={handleVerify} color="green" disabled={!canContinue}>
          2. Verify (Ed25519)
        </Btn>
        <Btn onClick={handleRoute} color="purple" disabled={stage !== "verified"}>
          3. Route (MaxHeap)
        </Btn>
        <Btn onClick={handleExecute} color="cyan" disabled={stage !== "routed"}>
          4. Execute
        </Btn>
        <Btn onClick={handleBill} color="emerald" disabled={stage !== "executed"}>
          5. Bill
        </Btn>
        <div className="w-px bg-zinc-800 self-stretch mx-1" />
        <Btn onClick={handleTamper} color="red" icon={<ShieldX size={12} />}>Tamper</Btn>
        <Btn onClick={handleExpireTTL} color="amber" icon={<AlertCircle size={12} />}>Expire TTL</Btn>
        <Btn onClick={handleCircuitBreak} color="orange" icon={<WifiOff size={12} />}>Circuit Break</Btn>
        <Btn onClick={handleRevokeCredential} color="amber" icon={<Lock size={12} />}>Revoke Credential</Btn>
        <Btn onClick={reset} color="zinc" icon={<RotateCcw size={12} />}>Reset</Btn>
      </div>

      {/* Status bar */}
      <div className="flex items-center gap-3 rounded-lg border border-zinc-800/60 bg-zinc-900 px-4 py-2.5">
        {stage === "blocked" ? (
          <XCircle size={14} className="text-red-400" />
        ) : stage.includes("ing") ? (
          <Loader2 size={14} className="animate-spin text-cyan-400" />
        ) : stage === "billed" ? (
          <CheckCircle2 size={14} className="text-emerald-400" />
        ) : (
          <div className="w-3.5 h-3.5 rounded-full bg-zinc-700" />
        )}
        <span className="text-sm font-mono text-zinc-300">{STEP_LABELS[stage] ?? stage}</span>
        {tampered && <span className="ml-auto text-[10px] bg-red-950/60 text-red-400 border border-red-800/60 px-2 py-0.5 rounded-full">TAMPER MODE</span>}
        {revokedAgent && <span className="text-[10px] bg-amber-950/60 text-amber-400 border border-amber-800/60 px-2 py-0.5 rounded-full">CREDENTIAL REVOKED: {revokedAgent}</span>}
        {circuitBrokenAgent && <span className="text-[10px] bg-orange-950/60 text-orange-400 border border-orange-800/60 px-2 py-0.5 rounded-full">CIRCUIT OPEN: {circuitBrokenAgent}</span>}
      </div>

      {/* NANDA Flow Graph */}
      <FlowGraph selectedAgent={winner?.agent.name} stage={stage} />

      {/* Main grid */}
      <div className="grid xl:grid-cols-3 gap-4">

        {/* Agent Directory */}
        <Panel title="Agent Directory">
          <div className="space-y-3">
            {AGENTS.map((a) => {
              const v = verifications.find((v) => v.agent === a.name);
              const c = candidates.find((c) => c.agent.name === a.name);
              const isWinner = winner?.agent.name === a.name;
              const circuitOpen = getBreakerForAgent(a.name).currentState === "open";
              return (
                <AgentCard key={a.name} agent={a}
                  status={isWinner ? "selected" : c?.rejected ? "rejected" : stage.includes("ing") ? "loading" : "idle"}
                  trustBadge={v?.passed}
                  circuitOpen={circuitOpen}
                />
              );
            })}
          </div>
        </Panel>

        {/* Verification — with signing rationale */}
        <Panel title="Verification (Web Crypto Ed25519)">
          <div className="rounded-lg border border-zinc-800/40 bg-zinc-950 px-3 py-2 mb-3">
            <div className="text-[10px] text-zinc-600 leading-relaxed">
              <span className="text-zinc-400">Signing approach: </span>
              Ed25519 over canonical JSON (deterministically sorted keys).
              Chosen over W3C VCs to avoid JSON-LD context resolution at this prototype stage,
              while preserving full tamper-detection. Upgrade path: wrap in a VC envelope and add
              a <span className="font-mono">proof</span> block.
            </div>
          </div>
          {verifications.length === 0 ? (
            <Empty text="Resolve ≥2 agents then run Verify." />
          ) : (
            <div className="space-y-3">
              {verifications.map((v) => (
                <div key={v.agent}
                  className={`rounded-xl border p-3 ${v.passed ? "border-emerald-800/60 bg-emerald-950/10" : "border-red-800/60 bg-red-950/10"}`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    {v.passed ? <ShieldCheck size={14} className="text-emerald-400" /> : <ShieldX size={14} className="text-red-400" />}
                    <span className="font-mono text-xs text-zinc-200">{v.agent}</span>
                    <span className={`text-[10px] ml-auto ${v.passed ? "text-emerald-400" : "text-red-400"}`}>
                      {v.passed ? "VERIFIED" : "REJECTED"}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-1">
                    {Object.entries(v.checks).map(([k, val]) => (
                      <div key={k} className="flex items-center gap-1">
                        {val === "passed"
                          ? <CheckCircle2 size={9} className="text-emerald-500 shrink-0" />
                          : <XCircle size={9} className="text-red-500 shrink-0" />}
                        <span className={`text-[9px] font-mono ${val === "passed" ? "text-zinc-500" : "text-red-400"}`}>
                          {k}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>

        {/* AgentFacts Inspector for focused agent */}
        <Panel title={`AgentFacts Inspector — ${focusedAgent}`}>
          {focusedFacts ? (
            <JsonInspector
              data={focusedFacts}
              onTamper={tampered ? handleJsonTamper : undefined}
              readOnly={!tampered}
              label={`sig: ${focusedFacts.signature.slice(0, 12)}… · cache TTL: ${globalCache.ttlRemaining(focusedAddr?.agent_id ?? "")}s`}
            />
          ) : (
            <Empty text="Run step 1b (Fetch AgentFacts) for this agent to inspect its metadata." />
          )}
        </Panel>

        {/* AgentFacts Cache */}
        <Panel title="AgentFacts Cache (LRU + TTL)">
          {cacheSnapshot.length > 0 ? (
            <div className="space-y-2">
              {cacheSnapshot.map((e) => (
                <div key={e.agentId} className="rounded-lg border border-zinc-800/60 bg-zinc-950 p-2.5">
                  <div className="flex items-center justify-between">
                    <div className="font-mono text-[10px] text-zinc-300 truncate">{e.agentId}</div>
                    <div className={`text-[10px] font-mono ${e.ttlRemaining < 30 ? "text-amber-400" : "text-emerald-400"}`}>
                      TTL {e.ttlRemaining}s
                    </div>
                  </div>
                  <div className="text-[10px] text-zinc-600 mt-0.5">{e.hits} cache hit{e.hits !== 1 ? "s" : ""}</div>
                </div>
              ))}
            </div>
          ) : (
            <Empty text="Cache is empty. Fetch AgentFacts to populate." />
          )}
        </Panel>

        {/* Routing */}
        <Panel title="Adaptive Routing (MaxHeap)">
          {candidates.length === 0 ? (
            <Empty text="Run Route to see MaxHeap scoring across candidates." />
          ) : (
            <div className="space-y-2">
              {[...candidates].sort((a, b) => b.routeScore - a.routeScore).map((c) => (
                <div key={c.agent.name}
                  className={`rounded-xl border p-3 ${
                    !c.rejected && winner?.agent.name === c.agent.name
                      ? "border-cyan-600/60 bg-cyan-950/20"
                      : c.rejected ? "border-zinc-800/40 bg-zinc-950 opacity-50"
                      : "border-zinc-800/60 bg-zinc-950"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs text-zinc-200">{c.agent.name}</span>
                    <span className={`font-mono text-xs ${c.rejected ? "text-zinc-600" : "text-cyan-300"}`}>
                      {c.rejected ? "—" : `score ${c.routeScore.toFixed(4)}`}
                    </span>
                  </div>
                  <div className="text-[10px] text-zinc-600 mt-1 font-mono">
                    est. ${c.estimatedPrice.toFixed(4)}
                    {c.facts.pricing.surge_multiplier > 1 && (
                      <span className="text-amber-500 ml-1">× {c.facts.pricing.surge_multiplier} surge</span>
                    )}
                  </div>
                  {c.routeReasons.map((r, i) => (
                    <div key={i} className="text-[9px] text-zinc-600 mt-0.5">{r}</div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </Panel>

        {/* Execution */}
        <Panel title="Reasoning Execution">
          {reasoningResult ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Wifi size={12} className="text-cyan-400" />
                <span className="font-mono text-xs text-cyan-300">{winner?.agent.name}</span>
              </div>
              <p className="text-zinc-300 text-sm leading-relaxed">{streamText}</p>
              <div className="space-y-1">
                {reasoningResult.recommendations.map((r, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs text-zinc-400">
                    <span className="text-cyan-600 shrink-0">→</span>{r}
                  </div>
                ))}
              </div>
            </div>
          ) : stage === "executing" ? (
            <div className="flex items-center gap-2 text-zinc-400 text-sm">
              <Loader2 size={14} className="animate-spin text-cyan-400" />
              <span className="font-mono text-xs">{streamText || "Streaming…"}</span>
            </div>
          ) : (
            <Empty text="Execute reasoning after a provider is routed." />
          )}
        </Panel>

        {/* Billing */}
        <Panel title="Cognitive Usage and Billing">
          {invoice && usage ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <MetricBadge label="Input tokens" value={usage.input_tokens.toLocaleString()} />
                <MetricBadge label="Output tokens" value={usage.output_tokens.toLocaleString()} />
                <MetricBadge label="Reasoning steps" value={usage.reasoning_steps} variant="cyan" />
                <MetricBadge label="Tool calls" value={usage.tool_calls} />
                <MetricBadge label="Complexity score" value={usage.complexity_score} />
                <MetricBadge label="Cognitive units" value={usage.cognitive_units} variant="cyan" />
              </div>
              <div className="rounded-xl border border-emerald-800/60 bg-emerald-950/10 p-3 space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-zinc-500">Raw cost</span>
                  <span className="font-mono text-zinc-300">${invoice.raw_cost.toFixed(4)}</span>
                </div>
                {winner && winner.facts.pricing.surge_multiplier > 1 && (
                  <div className="flex justify-between text-xs">
                    <span className="text-zinc-500">Surge ×{winner.facts.pricing.surge_multiplier}</span>
                    <span className="font-mono text-amber-400">+${(invoice.raw_cost * (winner.facts.pricing.surge_multiplier - 1)).toFixed(4)}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm font-semibold pt-1 border-t border-emerald-900/40">
                  <span className="text-zinc-300">Final charge</span>
                  <span className="font-mono text-emerald-400">${invoice.final_cost.toFixed(4)}</span>
                </div>
                <div className="text-[10px] font-mono text-zinc-600">{invoice.invoice_id}</div>
              </div>
            </div>
          ) : (
            <Empty text="Usage metrics and invoice appear after execution and billing." />
          )}
        </Panel>

        {/* Audit Chain */}
        <Panel title="Merkle Audit Chain (SHA-256)">
          <AuditChain events={audit} />
        </Panel>
      </div>
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-zinc-800/60 bg-zinc-900 p-4">
      <h3 className="font-semibold text-sm text-white mb-3">{title}</h3>
      {children}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="text-zinc-600 text-xs py-4">{text}</div>;
}

const COLOR_MAP: Record<string, string> = {
  blue: "bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-800",
  green: "bg-emerald-700 hover:bg-emerald-600 disabled:bg-zinc-800",
  purple: "bg-purple-700 hover:bg-purple-600 disabled:bg-zinc-800",
  cyan: "bg-cyan-700 hover:bg-cyan-600 disabled:bg-zinc-800",
  emerald: "bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-800",
  red: "bg-red-700 hover:bg-red-600",
  amber: "bg-amber-700 hover:bg-amber-600",
  orange: "bg-orange-700 hover:bg-orange-600",
  zinc: "bg-zinc-700 hover:bg-zinc-600",
};

function Btn({
  children,
  onClick,
  color,
  disabled,
  icon,
}: {
  children: React.ReactNode;
  onClick: () => void;
  color: string;
  disabled?: boolean;
  icon?: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${COLOR_MAP[color] ?? ""}`}
    >
      {icon}
      {children}
    </button>
  );
}
