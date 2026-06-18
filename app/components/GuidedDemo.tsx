"use client";

import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Play, RotateCcw, Search, FileText, ShieldCheck, ShieldX,
  Zap, CheckCircle2, ArrowRight, User, Loader2,
} from "lucide-react";
import type { KeyPair } from "@/app/lib/crypto";
import { NandaRegistry } from "@/app/lib/registry";
import { verifyAgentAddr, verifyAgentFacts } from "@/app/lib/nanda";
import { AGENTS } from "@/app/lib/agents";
import type { AgentAddr, AgentFacts } from "@/app/lib/types";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const NAME = "@deep-thinker";

// A friendly, auto-playing walkthrough of the core NANDA flow:
//   a client knows only a NAME → finds a signpost (AgentAddr) → fetches the
//   details (AgentFacts) → checks the signature → and rejects a forgery.
// Everything below runs the SAME real Ed25519 code as the advanced panel.
export default function GuidedDemo({ keyPair }: { keyPair: KeyPair }) {
  const registry = useMemo(() => {
    const r = new NandaRegistry(keyPair);
    r.registerAll(AGENTS);
    return r;
  }, [keyPair]);

  const [phase, setPhase] = useState(0); // 0 idle → 6 done
  const [running, setRunning] = useState(false);
  const [addr, setAddr] = useState<AgentAddr | null>(null);
  const [addrOk, setAddrOk] = useState<boolean | null>(null);
  const [facts, setFacts] = useState<AgentFacts | null>(null);
  const [factsOk, setFactsOk] = useState<boolean | null>(null);
  const [tamperOk, setTamperOk] = useState<boolean | null>(null);

  async function play() {
    setRunning(true);
    setAddr(null); setAddrOk(null); setFacts(null); setFactsOk(null); setTamperOk(null);

    setPhase(1); await sleep(900);

    const a = await registry.resolve(NAME);
    setAddr(a);
    setAddrOk(await verifyAgentAddr(a, keyPair.publicKey));
    setPhase(2); await sleep(1700);

    const f = await registry.fetchFacts(a);
    setFacts(f);
    setPhase(3); await sleep(1700);

    setFactsOk(await verifyAgentFacts(f, keyPair.publicKey));
    setPhase(4); await sleep(1700);

    const tampered: AgentFacts = { ...f, trust: { ...f.trust, trust_score: 0.999 } };
    setTamperOk(await verifyAgentFacts(tampered, keyPair.publicKey));
    setPhase(5); await sleep(1700);

    setPhase(6);
    setRunning(false);
  }

  return (
    <div className="space-y-6">
      {/* Intro */}
      <div className="rounded-2xl border border-zinc-800/60 bg-zinc-900 p-6">
        <h2 className="text-xl font-bold text-white">How does one AI agent safely hire another?</h2>
        <p className="text-zinc-400 mt-2 text-sm leading-relaxed max-w-3xl">
          Our client agent has a hard task and wants to delegate part of it. It knows only a{" "}
          <span className="text-cyan-300 font-mono">name</span> — like a phone contact with no number.
          NANDA is the directory that turns that name into something the client can{" "}
          <span className="text-white font-medium">trust and act on</span>. Press play and watch it happen,
          step by step.
        </p>
        <div className="flex flex-wrap items-center gap-3 mt-5">
          <button
            onClick={play}
            disabled={running}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold bg-cyan-600 hover:bg-cyan-500 text-white transition-colors disabled:opacity-40"
          >
            {running ? <Loader2 size={15} className="animate-spin" /> : <Play size={15} />}
            {running ? "Playing…" : phase === 6 ? "Replay walkthrough" : "▶ Play walkthrough"}
          </button>
          {phase > 0 && !running && (
            <button
              onClick={() => { setPhase(0); setAddr(null); setAddrOk(null); setFacts(null); setFactsOk(null); setTamperOk(null); }}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 transition-colors"
            >
              <RotateCcw size={12} /> Clear
            </button>
          )}
          <span className="text-[11px] text-zinc-600">
            Runs real Ed25519 cryptography in your browser — nothing is faked.
          </span>
        </div>

        {/* Progress rail */}
        <div className="flex items-center gap-1.5 mt-5">
          {["Name", "Find signpost", "Fetch details", "Verify", "Catch forgery", "Act"].map((label, i) => {
            const step = i + 1;
            const active = phase >= step;
            return (
              <div key={label} className="flex items-center gap-1.5 flex-1">
                <div className="flex flex-col items-center gap-1 flex-1">
                  <div className={`h-1.5 w-full rounded-full transition-colors ${active ? "bg-cyan-500" : "bg-zinc-800"}`} />
                  <span className={`text-[9px] ${active ? "text-cyan-300" : "text-zinc-600"} hidden sm:block`}>{label}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Step 0 — the client */}
      <AnimatePresence>
        {phase >= 1 && (
          <StepCard
            icon={<User size={16} className="text-zinc-300" />}
            tag="The client"
            title={`I need to hire ${NAME}, but all I have is the name.`}
            plain="Like having a contact name with no phone number. The client can't call anyone yet — it has to look the agent up first."
          >
            <div className="flex items-center gap-3 font-mono text-sm">
              <span className="text-zinc-500">known:</span>
              <span className="px-2.5 py-1 rounded-md bg-cyan-950/40 border border-cyan-800/50 text-cyan-300">{NAME}</span>
              <span className="text-zinc-600">·  everything else: unknown</span>
            </div>
          </StepCard>
        )}
      </AnimatePresence>

      {/* Step 1 — hop 1: AgentAddr */}
      <AnimatePresence>
        {phase >= 2 && addr && (
          <StepCard
            icon={<Search size={16} className="text-blue-400" />}
            tag="Hop 1 · ask the directory"
            title="The index hands back a signed signpost (AgentAddr)"
            plain="The directory does NOT dump all the details here. It returns a lightweight, signed pointer: where to get the full record, which key vouches for it, and how long this answer is good for. Notice there's no price, no skills, no trust score yet — that's deliberate."
            verdict={addrOk ? { ok: true, text: "Signpost signature is authentic" } : { ok: false, text: "Invalid" }}
          >
            <KV rows={[
              ["agent_id", addr.agent_id],
              ["facts_url  (where the details live)", addr.facts_url],
              ["valid for", `${addr.ttl} seconds`],
              ["signed by key", addr.public_key_id.slice(0, 28) + "…"],
            ]} />
            <Note>It deliberately does <b>not</b> contain capabilities, pricing, or trust — those change often and live in the next document.</Note>
          </StepCard>
        )}
      </AnimatePresence>

      {/* Step 2 — hop 2: AgentFacts */}
      <AnimatePresence>
        {phase >= 3 && facts && (
          <StepCard
            icon={<FileText size={16} className="text-indigo-400" />}
            tag="Hop 2 · follow the signpost"
            title="Fetching the full record (AgentFacts)"
            plain="The client follows facts_url to get the real details: what this agent can do, what it costs, how trusted it is, and where to actually call it. This document is signed separately, so it can be updated without touching the directory."
          >
            <KV rows={[
              ["can do", facts.capabilities.join(", ")],
              ["trust score", `${facts.trust.trust_score}  (${facts.trust.trust_level})`],
              ["price", `$${facts.pricing.base_fee} per call`],
              ["call it at", facts.endpoints[0].url],
            ]} />
          </StepCard>
        )}
      </AnimatePresence>

      {/* Step 3 — verify */}
      <AnimatePresence>
        {phase >= 4 && (
          <StepCard
            icon={<ShieldCheck size={16} className="text-emerald-400" />}
            tag="Verify"
            title="Is this record genuine and unchanged?"
            plain="The client recomputes the cryptographic signature over the document. If even one character had been altered in transit, the math wouldn't line up. It lines up."
            verdict={factsOk ? { ok: true, text: "Authentic — signature matches the issuer's key" } : { ok: false, text: "Rejected" }}
          >
            <Note>This is real <span className="font-mono">crypto.subtle.verify()</span> with Ed25519 — the same primitive used to secure TLS and SSH.</Note>
          </StepCard>
        )}
      </AnimatePresence>

      {/* Step 4 — tamper */}
      <AnimatePresence>
        {phase >= 5 && (
          <StepCard
            icon={<ShieldX size={16} className="text-red-400" />}
            tag="Now try to cheat"
            title="An attacker inflates the trust score"
            plain="Suppose a man-in-the-middle quietly bumps this agent's trust score from 0.94 to 0.999 to win the job. They didn't have the private key, so they can't re-sign. The client checks the signature again…"
            verdict={tamperOk === false ? { ok: true, text: "Forgery caught — signature no longer matches, request blocked" } : { ok: false, text: "Tamper NOT detected" }}
          >
            <div className="flex items-center gap-2 font-mono text-sm">
              <span className="text-zinc-500">trust_score</span>
              <span className="text-zinc-400">0.94</span>
              <ArrowRight size={13} className="text-red-500" />
              <span className="text-red-400 line-through">0.999</span>
              <span className="text-[11px] text-emerald-400 ml-2">→ verification fails ✓</span>
            </div>
          </StepCard>
        )}
      </AnimatePresence>

      {/* Step 5 — act / done */}
      <AnimatePresence>
        {phase >= 6 && facts && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl border border-emerald-800/50 bg-emerald-950/10 p-6">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle2 size={18} className="text-emerald-400" />
              <h3 className="text-lg font-bold text-white">Done — the client can now act, safely</h3>
            </div>
            <p className="text-zinc-300 text-sm leading-relaxed max-w-3xl">
              Starting from just the name <span className="font-mono text-cyan-300">{NAME}</span>, the client
              resolved a signed signpost, fetched the verified details, proved they were genuine, and rejected a
              forgery — all without ever trusting the network. It now knows it can call{" "}
              <span className="font-mono text-emerald-300">{facts.endpoints[0].url}</span> at{" "}
              <span className="font-mono text-emerald-300">${facts.pricing.base_fee}/call</span>.
            </p>
            <div className="mt-4 flex items-center gap-2 text-xs text-zinc-500">
              <Zap size={13} className="text-cyan-400" />
              Want to drive it yourself? Open the <b className="text-zinc-300">NANDA Protocol Trace</b> tab to resolve
              any agent step-by-step, or <b className="text-zinc-300">Multi-Agent Economy</b> to watch four agents run a real task.
            </div>
            <div className="mt-3 text-[11px] text-zinc-600">
              The same flow works for every registered agent:{" "}
              {AGENTS.map((a) => <span key={a.name} className="font-mono text-zinc-500 mr-2">{a.name}</span>)}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {phase === 0 && (
        <div className="rounded-2xl border border-dashed border-zinc-800 bg-zinc-950/40 p-10 text-center">
          <p className="text-zinc-500 text-sm">Press <span className="text-cyan-300">▶ Play walkthrough</span> to begin.</p>
        </div>
      )}
    </div>
  );
}

// ── small presentational helpers ──────────────────────────────────────────────
function StepCard({
  icon, tag, title, plain, verdict, children,
}: {
  icon: React.ReactNode;
  tag: string;
  title: string;
  plain: string;
  verdict?: { ok: boolean; text: string };
  children?: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="rounded-2xl border border-zinc-800/60 bg-zinc-900 p-6"
    >
      <div className="flex items-center gap-2 mb-1.5">
        {icon}
        <span className="text-[10px] uppercase tracking-widest text-zinc-500">{tag}</span>
      </div>
      <h3 className="text-base font-semibold text-white">{title}</h3>
      <p className="text-zinc-400 text-sm leading-relaxed mt-1.5 max-w-3xl">{plain}</p>
      {children && <div className="mt-4 rounded-xl border border-zinc-800/60 bg-zinc-950 p-4 space-y-2">{children}</div>}
      {verdict && (
        <div className={`mt-4 inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
          verdict.ok ? "border-emerald-800/60 bg-emerald-950/20 text-emerald-300" : "border-red-800/60 bg-red-950/20 text-red-300"
        }`}>
          {verdict.ok ? <ShieldCheck size={15} /> : <ShieldX size={15} />}
          {verdict.text}
        </div>
      )}
    </motion.div>
  );
}

function KV({ rows }: { rows: [string, string][] }) {
  return (
    <div className="space-y-1.5">
      {rows.map(([k, v]) => (
        <div key={k} className="flex flex-col sm:flex-row sm:items-baseline gap-0.5 sm:gap-3">
          <span className="text-[11px] text-zinc-500 sm:w-56 shrink-0">{k}</span>
          <span className="font-mono text-[13px] text-zinc-200 break-all">{v}</span>
        </div>
      ))}
    </div>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] text-zinc-500 leading-relaxed pt-1">{children}</p>;
}
