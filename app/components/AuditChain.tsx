"use client";

import { useState } from "react";
import type { AuditEvent } from "@/app/lib/types";
import { verifyChain } from "@/app/lib/audit";
import { ShieldCheck, ShieldX, ChevronDown, ChevronRight } from "lucide-react";

interface Props {
  events: AuditEvent[];
}

const TYPE_COLOR: Record<string, string> = {
  task_selected: "text-blue-400",
  provider_resolution_started: "text-zinc-400",
  agentaddr_returned: "text-zinc-400",
  agentfacts_fetched: "text-zinc-400",
  cache_hit: "text-amber-400",
  cache_miss: "text-zinc-500",
  verification_passed: "text-emerald-400",
  verification_failed: "text-red-400",
  routing_started: "text-purple-400",
  candidate_rejected: "text-red-400",
  provider_selected: "text-cyan-400",
  reasoning_executed: "text-cyan-400",
  usage_metered: "text-blue-400",
  invoice_generated: "text-emerald-400",
  tamper_detected: "text-red-500",
  execution_blocked: "text-red-500",
  circuit_open: "text-amber-500",
  credential_revoked: "text-amber-500",
  ttl_expired: "text-amber-400",
  chain_verified: "text-emerald-400",
};

export default function AuditChain({ events }: Props) {
  const [verifyResults, setVerifyResults] = useState<boolean[] | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  async function handleVerify() {
    setVerifying(true);
    const results = await verifyChain(events);
    setVerifyResults(results);
    setVerifying(false);
  }

  function toggleExpand(id: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs text-zinc-500 uppercase tracking-widest">
          {events.length} events • SHA-256 Merkle chain
        </div>
        {events.length > 0 && (
          <button
            onClick={handleVerify}
            disabled={verifying}
            className="flex items-center gap-1.5 text-xs bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
          >
            <ShieldCheck size={12} />
            {verifying ? "Verifying…" : "Verify Chain Integrity"}
          </button>
        )}
      </div>

      {verifyResults && (
        <div className={`rounded-lg border px-3 py-2 mb-3 text-xs font-mono ${verifyResults.every(Boolean) ? "border-emerald-800/60 bg-emerald-950/20 text-emerald-400" : "border-red-800/60 bg-red-950/20 text-red-400"}`}>
          {verifyResults.every(Boolean)
            ? "✓ All hashes verified — chain is intact"
            : `✗ ${verifyResults.filter((r) => !r).length} hash(es) invalid — chain tampered`}
        </div>
      )}

      <div className="max-h-72 overflow-y-auto space-y-1.5 pr-1">
        {events.length === 0 && (
          <div className="text-zinc-600 text-xs py-4 text-center">No audit events yet.</div>
        )}
        {events.map((e, i) => {
          const valid = verifyResults ? verifyResults[i] : null;
          const isExpanded = expanded.has(e.id);
          return (
            <div
              key={e.id}
              className={`rounded-lg border text-xs transition-colors ${
                valid === false
                  ? "border-red-800/60 bg-red-950/10"
                  : valid === true
                  ? "border-emerald-900/40 bg-zinc-900"
                  : "border-zinc-800/60 bg-zinc-900"
              }`}
            >
              <button
                className="w-full flex items-start gap-2 p-2.5 text-left"
                onClick={() => toggleExpand(e.id)}
              >
                <div className="mt-0.5 shrink-0">
                  {isExpanded ? <ChevronDown size={10} className="text-zinc-500" /> : <ChevronRight size={10} className="text-zinc-500" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`font-mono ${TYPE_COLOR[e.type] ?? "text-zinc-400"}`}>
                      {e.type}
                    </span>
                    {valid === true && <ShieldCheck size={10} className="text-emerald-500" />}
                    {valid === false && <ShieldX size={10} className="text-red-500" />}
                  </div>
                  <div className="text-zinc-400 truncate mt-0.5">{e.message}</div>
                </div>
                <div className="text-zinc-600 shrink-0">{new Date(e.timestamp).toLocaleTimeString()}</div>
              </button>
              {isExpanded && (
                <div className="px-2.5 pb-2.5 space-y-1">
                  <div className="font-mono text-[10px] text-zinc-600 break-all">
                    hash: {e.hash}
                  </div>
                  <div className="font-mono text-[10px] text-zinc-700 break-all">
                    prev: {e.prev_hash}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
