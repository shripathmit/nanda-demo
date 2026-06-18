"use client";

import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, CheckCircle2, XCircle, Play, RotateCcw, Dices } from "lucide-react";
import type {
  SubTask, SubTaskResult, SubTaskStatus, AuditEvent,
} from "@/app/lib/types";
import type { KeyPair } from "@/app/lib/crypto";
import {
  mockIndexResolve, mockFetchAgentFacts, runVerification,
  scoreCandidate, adaptiveRoute, estimateUsage, makeInvoice,
} from "@/app/lib/nanda";
import { buildAuditEvent, GENESIS_HASH } from "@/app/lib/audit";
import { topologicalPhases } from "@/app/lib/dag";
import { AGENTS, VC_SUBTASKS } from "@/app/lib/agents";
import { globalCache } from "@/app/lib/cache";
import { mulberry32, makeAgentJitter, randomSeed, type AgentJitter } from "@/app/lib/rng";
import AuditChain from "./AuditChain";
import BillingChart from "./BillingChart";
import DagGraph from "./DagGraph";
import MetricBadge from "./MetricBadge";

interface Props {
  keyPair: KeyPair;
}

// Synthetic task spec for each subtask type
const SUBTASK_TASK_MAP: Record<string, { id: string; maxPrice: number; minTrust: number; latencyBudgetMs: number }> = {
  market_sizing:    { id: "quick-summary",  maxPrice: 1.0, minTrust: 0.75, latencyBudgetMs: 3000 },
  financial_modeling: { id: "optimization", maxPrice: 1.0, minTrust: 0.80, latencyBudgetMs: 4000 },
  competitive_analysis: { id: "startup-risk", maxPrice: 1.0, minTrust: 0.85, latencyBudgetMs: 5000 },
  risk_synthesis:   { id: "startup-risk",  maxPrice: 1.0, minTrust: 0.85, latencyBudgetMs: 5000 },
};

const SUBTASK_OUTPUTS: Record<string, string> = {
  market_sizing: "TAM: $4.2B. SAM: $620M. B2B logistics SaaS in North America. Growth rate 18% YoY. 3 dominant incumbents control 61% market share. Remaining 39% fragmented.",
  financial_modeling: "Optimal burn rate: $280K/mo at current headcount. Break-even at 48 MRR contracts at $6,500 ACV. 18-month runway with current raise. CAC payback: 11 months.",
  competitive_analysis: "Key moat: proprietary carrier integration layer (12 months to replicate). Incumbents lack real-time multi-modal tracking. Differentiation: ML-powered delay prediction at lane level.",
  risk_synthesis: "Top risks: (1) Enterprise sales cycle >6 months vs 3-month runway buffer. (2) Carrier API dependency — 3 of 5 top carriers have restrictive ToS. (3) Gross margin compressed by data enrichment costs at scale.",
};

function delay(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

export default function OrchestrationDemo({ keyPair }: Props) {
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [statuses, setStatuses] = useState<Map<string, SubTaskStatus>>(new Map());
  const [results, setResults] = useState<Map<string, SubTaskResult>>(new Map());
  const [audit, setAudit] = useState<AuditEvent[]>([]);
  // Seed drives per-run telemetry jitter. Empty input → random seed each run;
  // a fixed value reproduces a run exactly.
  const [seedInput, setSeedInput] = useState("");
  const [lastSeed, setLastSeed] = useState<number | null>(null);
  const prevHashRef = useRef(GENESIS_HASH);
  const auditRef = useRef<AuditEvent[]>([]);
  // Per-agent jitter for the current run, keyed by agent name.
  const jitterRef = useRef<Map<string, AgentJitter>>(new Map());

  async function addAudit(type: string, message: string, color?: string) {
    const event = await buildAuditEvent(
      auditRef.current.length + 1,
      type,
      message,
      prevHashRef.current
    );
    prevHashRef.current = event.hash;
    auditRef.current = [...auditRef.current, event];
    setAudit([...auditRef.current]);
    return event;
  }

  function setStatus(id: string, status: SubTaskStatus) {
    setStatuses((prev) => new Map([...prev, [id, status]]));
  }

  function setResult(id: string, result: SubTaskResult) {
    setResults((prev) => new Map([...prev, [id, result]]));
  }

  async function runSubTask(st: SubTask, phase: number): Promise<SubTaskResult | null> {
    setStatus(st.id, "resolving");
    await addAudit("provider_resolution_started", `[${st.label}] Resolving provider for capability: ${st.capability}`);

    // Determine task spec
    const taskOverride = SUBTASK_TASK_MAP[st.id];
    const syntheticTask = {
      id: st.id,
      title: st.label,
      prompt: st.label,
      requiredCapability: st.capability,
      maxPrice: taskOverride?.maxPrice ?? 1.0,
      minTrust: taskOverride?.minTrust ?? 0.8,
      latencyBudgetMs: taskOverride?.latencyBudgetMs ?? 4000,
      complexity: st.complexity,
    };

    // Resolve all agents, pick the preferred or best match.
    // Per-run jitter (from jitterRef) perturbs telemetry so routing and cost
    // vary run-to-run while staying reproducible for a given seed.
    const resolvedAddrs = await Promise.all(AGENTS.map((a) => mockIndexResolve(a, keyPair)));
    const fetchedFacts = await Promise.all(
      AGENTS.map((a, i) =>
        mockFetchAgentFacts(a, resolvedAddrs[i], keyPair, { jitter: jitterRef.current.get(a.name) })
      )
    );
    await addAudit("agentfacts_fetched", `[${st.label}] AgentFacts retrieved for ${AGENTS.length} candidates.`);

    setStatus(st.id, "verifying");
    const verifications = await Promise.all(
      fetchedFacts.map((f, i) => runVerification(resolvedAddrs[i], f, syntheticTask, keyPair.publicKey))
    );

    setStatus(st.id, "routing");
    const scored = AGENTS.map((a, i) => scoreCandidate(a, fetchedFacts[i], verifications[i], syntheticTask));
    const { winner } = adaptiveRoute(scored);

    if (!winner) {
      await addAudit("execution_blocked", `[${st.label}] No eligible provider found.`);
      setStatus(st.id, "failed");
      return null;
    }
    await addAudit("provider_selected", `[${st.label}] Selected ${winner.agent.name} (score: ${winner.routeScore.toFixed(4)})`);

    setStatus(st.id, "executing");
    await delay(winner.agent.latencyMs * 0.4); // accelerated for demo

    const usage = estimateUsage(syntheticTask, winner.agent);
    const invoice = makeInvoice(syntheticTask, winner, usage);
    await addAudit("invoice_generated", `[${st.label}] Invoice ${invoice.invoice_id}: $${invoice.final_cost.toFixed(4)} (${usage.cognitive_units} CU)`);

    const result: SubTaskResult = {
      subTask: st,
      agent: winner.agent,
      facts: winner.facts,
      verification: verifications.find((v) => v.agent === winner.agent.name)!,
      candidate: winner,
      usage,
      invoice,
      status: "done",
      output: SUBTASK_OUTPUTS[st.id] ?? `${winner.agent.name} completed ${st.label}.`,
      phase,
    };

    setResult(st.id, result);
    setStatus(st.id, "done");
    return result;
  }

  async function handleRun() {
    setRunning(true);
    setDone(false);
    setStatuses(new Map());
    setResults(new Map());
    setAudit([]);
    auditRef.current = [];
    prevHashRef.current = GENESIS_HASH;
    globalCache.snapshot().forEach(({ agentId }) => globalCache.invalidate(agentId));

    // Resolve seed: use the user's value if it parses, else a fresh random seed.
    const parsed = parseInt(seedInput.trim(), 10);
    const seed = seedInput.trim() !== "" && Number.isFinite(parsed) ? parsed >>> 0 : randomSeed();
    setLastSeed(seed);
    setSeedInput(String(seed));

    // Build deterministic per-agent jitter for this run from the seed.
    const rng = mulberry32(seed);
    jitterRef.current = new Map(AGENTS.map((a) => [a.name, makeAgentJitter(rng)]));

    await addAudit("task_selected", `VC Due Diligence initiated (seed ${seed}). DAG decomposed into 4 subtasks across 2 execution phases.`);

    const phases = topologicalPhases(VC_SUBTASKS);

    for (let phaseIdx = 0; phaseIdx < phases.length; phaseIdx++) {
      const phase = phases[phaseIdx];
      await addAudit("routing_started", `Phase ${phaseIdx} starting — ${phase.length} subtask(s) running in parallel: ${phase.map((t) => t.label).join(", ")}`);

      // Execute all tasks in this phase in parallel
      await Promise.all(phase.map((st) => runSubTask(st, phaseIdx)));

      await addAudit("reasoning_executed", `Phase ${phaseIdx} complete.`);
    }

    setRunning(false);
    setDone(true);
    await addAudit("invoice_generated", "All phases complete. Aggregate billing finalised.");
  }

  function handleReset() {
    setRunning(false);
    setDone(false);
    setStatuses(new Map());
    setResults(new Map());
    setAudit([]);
    auditRef.current = [];
    prevHashRef.current = GENESIS_HASH;
  }

  const allResults = Array.from(results.values());
  const totalCost = allResults.reduce((s, r) => s + r.invoice.final_cost, 0);
  const totalCU = allResults.reduce((s, r) => s + r.usage.cognitive_units, 0);
  const avgTrust = allResults.length
    ? allResults.reduce((s, r) => s + r.agent.trustScore, 0) / allResults.length
    : 0;

  const billingData = allResults.map((r) => ({
    label: r.subTask.label,
    invoice: r.invoice,
  }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-xl border border-zinc-800/60 bg-zinc-900 p-5">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-zinc-500 mb-1">
              Multi-Agent Orchestration Economy
            </div>
            <h2 className="text-lg font-semibold text-white">VC Due Diligence: B2B SaaS Startup</h2>
            <p className="text-sm text-zinc-400 mt-1 max-w-xl">
              A Client Orchestrator decomposes this task into a DAG of subtasks and dispatches each to the best-matched reasoning agent via independent NANDA resolution flows.
            </p>
          </div>
          <div className="flex flex-col items-end gap-2 shrink-0">
            <div className="flex gap-2">
              <button
                onClick={handleReset}
                disabled={running}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 transition-colors disabled:opacity-40"
              >
                <RotateCcw size={12} />
                Reset
              </button>
              <button
                onClick={handleRun}
                disabled={running}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-cyan-600 hover:bg-cyan-500 text-white transition-colors disabled:opacity-40"
              >
                {running ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
                {running ? "Running…" : "Run Orchestration"}
              </button>
            </div>
            {/* Seed control — blank = random run, fixed value = reproducible run */}
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-zinc-500 uppercase tracking-widest">Seed</span>
              <input
                value={seedInput}
                onChange={(e) => setSeedInput(e.target.value.replace(/[^0-9]/g, ""))}
                disabled={running}
                placeholder="random"
                className="w-28 px-2 py-1 rounded-md bg-zinc-950 border border-zinc-700 text-[11px] font-mono text-zinc-300 placeholder:text-zinc-600 focus:border-cyan-600 focus:outline-none disabled:opacity-40"
              />
              <button
                onClick={() => setSeedInput("")}
                disabled={running}
                title="Clear seed (next run is random)"
                className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] bg-zinc-800 hover:bg-zinc-700 text-zinc-400 border border-zinc-700 transition-colors disabled:opacity-40"
              >
                <Dices size={11} />
                Randomize
              </button>
            </div>
            {lastSeed !== null && (
              <div className="text-[10px] text-zinc-600 font-mono">
                last run seed: <span className="text-cyan-500">{lastSeed}</span> — reuse to reproduce
              </div>
            )}
          </div>
        </div>
      </div>

      {/* DAG + Summary */}
      <div className="grid xl:grid-cols-2 gap-4">
        <div className="rounded-xl border border-zinc-800/60 bg-zinc-900 p-4">
          <h3 className="text-sm font-semibold text-white mb-3">
            Task Dependency DAG (Kahn&apos;s Algorithm)
          </h3>
          <DagGraph subtasks={VC_SUBTASKS} statuses={statuses} />
          <div className="mt-3 grid grid-cols-4 gap-1.5 text-[9px]">
            {(["waiting", "executing", "done", "failed"] as SubTaskStatus[]).map((s) => (
              <div key={s} className="flex items-center gap-1">
                <div className={`w-2 h-2 rounded-full ${
                  s === "waiting" ? "bg-zinc-600"
                  : s === "executing" ? "bg-cyan-500"
                  : s === "done" ? "bg-emerald-500"
                  : "bg-red-500"
                }`} />
                <span className="text-zinc-600 capitalize">{s}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Subtask cards */}
        <div className="rounded-xl border border-zinc-800/60 bg-zinc-900 p-4">
          <h3 className="text-sm font-semibold text-white mb-3">Subtask Execution Status</h3>
          <div className="space-y-3">
            {VC_SUBTASKS.map((st) => {
              const status = statuses.get(st.id) ?? "waiting";
              const result = results.get(st.id);
              return (
                <SubTaskCard
                  key={st.id}
                  subtask={st}
                  status={status}
                  result={result}
                />
              );
            })}
          </div>
        </div>
      </div>

      {/* Results + Billing */}
      <AnimatePresence>
        {allResults.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="grid xl:grid-cols-3 gap-4"
          >
            {/* Reasoning outputs */}
            <div className="xl:col-span-2 rounded-xl border border-zinc-800/60 bg-zinc-900 p-4 space-y-3">
              <h3 className="text-sm font-semibold text-white">Reasoning Outputs</h3>
              {allResults.map((r) => (
                <div key={r.subTask.id} className="rounded-lg border border-zinc-800/40 bg-zinc-950 p-3">
                  <div className="flex items-center justify-between mb-1">
                    <div className="text-xs font-semibold text-zinc-200">{r.subTask.label}</div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[10px] text-cyan-400">{r.agent.name}</span>
                      <span className="font-mono text-[10px] text-emerald-400">${r.invoice.final_cost.toFixed(4)}</span>
                    </div>
                  </div>
                  <p className="text-xs text-zinc-400 leading-relaxed">{r.output}</p>
                </div>
              ))}
            </div>

            {/* Economy summary */}
            <div className="space-y-4">
              <div className="rounded-xl border border-zinc-800/60 bg-zinc-900 p-4">
                <h3 className="text-sm font-semibold text-white mb-3">Reasoning Economy</h3>
                <div className="grid grid-cols-2 gap-2 mb-4">
                  <MetricBadge label="Total cognitive units" value={totalCU} variant="cyan" />
                  <MetricBadge label="Avg trust" value={avgTrust.toFixed(3)} variant="success" />
                  <MetricBadge label="Subtasks" value={allResults.length} />
                  <MetricBadge label="Total agents" value={new Set(allResults.map((r) => r.agent.name)).size} />
                </div>
                <div className="rounded-xl border border-emerald-800/60 bg-emerald-950/10 p-3 flex justify-between items-center">
                  <span className="text-sm text-zinc-400">Total settlement</span>
                  <span className="font-mono text-lg font-semibold text-emerald-400">${totalCost.toFixed(4)}</span>
                </div>
              </div>

              <div className="rounded-xl border border-zinc-800/60 bg-zinc-900 p-4">
                <BillingChart invoices={billingData} />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Audit stream */}
      <div className="rounded-xl border border-zinc-800/60 bg-zinc-900 p-4">
        <h3 className="text-sm font-semibold text-white mb-3">
          Live Audit Stream — Merkle Chain
        </h3>
        <AuditChain events={audit} />
      </div>
    </div>
  );
}

function SubTaskCard({
  subtask,
  status,
  result,
}: {
  subtask: SubTask;
  status: SubTaskStatus;
  result?: SubTaskResult;
}) {
  const phases = topologicalPhases(VC_SUBTASKS);
  const phase = phases.findIndex((p) => p.some((t) => t.id === subtask.id));

  return (
    <div
      className={`rounded-xl border p-3 transition-all duration-300 ${
        status === "done"
          ? "border-emerald-800/60 bg-emerald-950/10"
          : status === "failed"
          ? "border-red-800/60 bg-red-950/10"
          : status === "waiting"
          ? "border-zinc-800/40 bg-zinc-950/50"
          : "border-cyan-800/40 bg-cyan-950/10"
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {status === "done" && <CheckCircle2 size={13} className="text-emerald-400 shrink-0" />}
          {status === "failed" && <XCircle size={13} className="text-red-400 shrink-0" />}
          {["resolving", "verifying", "routing", "executing"].includes(status) && (
            <Loader2 size={13} className="animate-spin text-cyan-400 shrink-0" />
          )}
          {status === "waiting" && <div className="w-3 h-3 rounded-full border border-zinc-700 shrink-0" />}
          <span className="text-xs font-semibold text-zinc-200">{subtask.label}</span>
        </div>
        <div className="flex items-center gap-2 text-[10px]">
          <span className="text-zinc-600">Phase {phase}</span>
          <span className={`font-mono capitalize ${
            status === "done" ? "text-emerald-400"
            : status === "failed" ? "text-red-400"
            : status === "waiting" ? "text-zinc-600"
            : "text-cyan-400"
          }`}>{status}</span>
        </div>
      </div>

      <div className="text-[10px] text-zinc-600 mt-1 font-mono">{subtask.capability}</div>

      {result && (
        <div className="mt-2 flex items-center gap-3 text-[10px]">
          <span className="text-cyan-400 font-mono">{result.agent.name}</span>
          <span className="text-zinc-600">{result.usage.cognitive_units} CU</span>
          <span className="text-emerald-400 font-mono ml-auto">${result.invoice.final_cost.toFixed(4)}</span>
        </div>
      )}

      {subtask.dependsOn.length > 0 && (
        <div className="text-[9px] text-zinc-700 mt-1">
          waits for: {subtask.dependsOn.join(", ")}
        </div>
      )}
    </div>
  );
}
