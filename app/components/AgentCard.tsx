"use client";

import type { AgentDef } from "@/app/lib/types";
import { CircleCheck, CircleX, Loader2, Shield, Zap, Clock } from "lucide-react";

interface Props {
  agent: AgentDef;
  status?: "idle" | "selected" | "rejected" | "loading";
  trustBadge?: boolean;
  circuitOpen?: boolean;
}

export default function AgentCard({ agent, status = "idle", trustBadge, circuitOpen }: Props) {
  const borderColor =
    status === "selected"
      ? "border-cyan-500/70"
      : status === "rejected"
      ? "border-red-900/60"
      : status === "loading"
      ? "border-zinc-600"
      : "border-zinc-800/60";

  const bg =
    status === "selected"
      ? "bg-cyan-950/20"
      : status === "rejected"
      ? "bg-red-950/10"
      : "bg-zinc-900";

  return (
    <div className={`rounded-xl border p-4 ${borderColor} ${bg} transition-all duration-300`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-mono text-sm text-cyan-300">{agent.name}</div>
          <div className="text-xs text-zinc-400 mt-0.5">{agent.label}</div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {circuitOpen && (
            <span className="text-[10px] bg-red-900/50 text-red-400 border border-red-800/60 px-2 py-0.5 rounded-full">
              CIRCUIT OPEN
            </span>
          )}
          {status === "loading" && <Loader2 size={14} className="animate-spin text-zinc-400" />}
          {status === "selected" && <CircleCheck size={14} className="text-cyan-400" />}
          {status === "rejected" && <CircleX size={14} className="text-red-500" />}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 mt-3">
        <Stat icon={<Shield size={10} />} label="Trust" value={agent.trustScore.toFixed(2)} highlight={trustBadge} />
        <Stat icon={<Zap size={10} />} label="Base fee" value={`$${agent.baseFee}`} />
        <Stat icon={<Clock size={10} />} label="Latency" value={`${agent.latencyMs}ms`} />
      </div>

      <div className="mt-3 flex flex-wrap gap-1">
        {agent.capabilities.map((c) => (
          <span key={c} className="text-[10px] bg-zinc-800 text-zinc-400 border border-zinc-700/60 px-1.5 py-0.5 rounded">
            {c}
          </span>
        ))}
      </div>
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  highlight,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className={`rounded-lg px-2 py-1.5 border ${highlight ? "bg-cyan-950/40 border-cyan-800/60 text-cyan-300" : "bg-zinc-800/50 border-zinc-700/40 text-zinc-300"}`}>
      <div className="flex items-center gap-1 text-zinc-500 mb-0.5">
        {icon}
        <span className="text-[9px] uppercase tracking-widest">{label}</span>
      </div>
      <div className="font-mono text-xs font-semibold">{value}</div>
    </div>
  );
}
