"use client";

import { motion } from "framer-motion";
import { Network, Search, Shield, DollarSign, GitBranch, Layers } from "lucide-react";

const PROBLEMS = [
  {
    icon: <Layers size={20} />,
    number: "01",
    title: "Agents Are Isolated",
    problem: "Each agent must own every capability it uses. A planning agent re-implements math reasoning, market analysis, and code review internally.",
    implication: "Capability duplication drives up cost and limits specialisation. No agent can be world-class at everything.",
    color: "border-zinc-700",
    iconColor: "text-zinc-400",
  },
  {
    icon: <Search size={20} />,
    number: "02",
    title: "No Trusted Discovery Layer",
    problem: "There is no universal protocol for an agent to discover another agent that offers a needed skill across system boundaries.",
    implication: "Without discovery, agents cannot form dynamic task networks. Every integration is a hardcoded bilateral contract.",
    color: "border-zinc-700",
    iconColor: "text-zinc-400",
  },
  {
    icon: <Shield size={20} />,
    number: "03",
    title: "Claims Are Unverifiable",
    problem: "A provider can claim to be an expert reasoning agent, but the client has no cryptographic way to verify that claim before execution.",
    implication: "Without signed metadata and credential checks, agent-to-agent trust relies on reputation alone — which does not scale.",
    color: "border-zinc-700",
    iconColor: "text-zinc-400",
  },
  {
    icon: <DollarSign size={20} />,
    number: "04",
    title: "Reasoning Has Variable Cost",
    problem: "A simple summary and a multi-step strategic analysis consume fundamentally different amounts of compute, tokens, and time.",
    implication: "Static pricing per-call is economically inefficient. The market needs cognitive unit metering — cost proportional to effort.",
    color: "border-zinc-700",
    iconColor: "text-zinc-400",
  },
  {
    icon: <GitBranch size={20} />,
    number: "05",
    title: "Routing Is Multi-Criteria",
    problem: "The best provider depends on capability match, trust score, estimated cost, endpoint latency, load, and health — simultaneously.",
    implication: "A static endpoint URL is not enough. Agents need an adaptive resolver that runs multi-criteria optimisation per request.",
    color: "border-zinc-700",
    iconColor: "text-zinc-400",
  },
  {
    icon: <Network size={20} />,
    number: "06",
    title: "NANDA: The Solution",
    problem: "NANDA provides a Lean Index (stable agent identity), AgentAddr (signed pointer to metadata), and AgentFacts (dynamic signed metadata with capabilities, pricing, trust, and endpoints).",
    implication: "The index stays lean. AgentFacts carries all dynamic data. Verification makes claims cryptographically trustworthy. Adaptive routing optimises execution. Billing closes the economic loop.",
    color: "border-cyan-800/60",
    iconColor: "text-cyan-400",
  },
];

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08 } },
};
const item = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4 } },
};

export default function ProblemView() {
  return (
    <div className="space-y-8">
      <div className="text-center space-y-2">
        <div className="text-xs uppercase tracking-widest text-zinc-500">
          Why the Agentic Internet Needs Infrastructure
        </div>
        <h2 className="text-2xl font-semibold text-white">
          The Discovery and Trust Gap
        </h2>
        <p className="text-zinc-400 max-w-2xl mx-auto text-sm leading-relaxed">
          As AI agents proliferate, they need to discover, verify, and pay each other for specialised reasoning — without pre-arranged integrations.
        </p>
      </div>

      <motion.div
        className="grid md:grid-cols-2 lg:grid-cols-3 gap-4"
        variants={container}
        initial="hidden"
        animate="show"
      >
        {PROBLEMS.map((p) => (
          <motion.div
            key={p.number}
            variants={item}
            className={`rounded-xl border bg-zinc-900 p-5 ${p.color} hover:border-zinc-600 transition-colors`}
          >
            <div className="flex items-start justify-between mb-3">
              <div className={p.iconColor}>{p.icon}</div>
              <span className="font-mono text-xs text-zinc-600">{p.number}</span>
            </div>
            <h3 className="font-semibold text-white text-sm mb-2">{p.title}</h3>
            <p className="text-zinc-400 text-xs leading-relaxed mb-3">{p.problem}</p>
            <div className="rounded-lg bg-zinc-950 border border-zinc-800/60 p-3">
              <div className="text-[10px] uppercase tracking-widest text-zinc-600 mb-1">
                Why it matters
              </div>
              <p className="text-zinc-300 text-xs leading-relaxed">{p.implication}</p>
            </div>
          </motion.div>
        ))}
      </motion.div>

      {/* Architecture flow diagram */}
      <div className="rounded-xl border border-zinc-800/60 bg-zinc-900 p-6">
        <div className="text-[10px] uppercase tracking-widest text-zinc-500 mb-4">
          NANDA Resolution Flow
        </div>
        <div className="flex flex-wrap items-center gap-2 font-mono text-xs">
          {[
            "Client Agent",
            "→",
            "NANDA Lean Index",
            "→",
            "AgentAddr",
            "→",
            "AgentFacts",
            "→",
            "Verification",
            "→",
            "Adaptive Routing",
            "→",
            "Provider Endpoint",
            "→",
            "Usage Metering",
            "→",
            "Billing",
          ].map((t, i) => (
            <span
              key={i}
              className={
                t === "→"
                  ? "text-zinc-600"
                  : "bg-zinc-800 border border-zinc-700/60 text-zinc-300 px-2 py-1 rounded"
              }
            >
              {t}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
