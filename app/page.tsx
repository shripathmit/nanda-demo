"use client";

import { useState, useEffect } from "react";
import { generateKeyPair } from "@/app/lib/crypto";
import type { KeyPair } from "@/app/lib/crypto";
import type { ViewName } from "@/app/lib/types";
import ProblemView from "@/app/components/ProblemView";
import ProtocolDemo from "@/app/components/ProtocolDemo";
import OrchestrationDemo from "@/app/components/OrchestrationDemo";
import { Network, Loader2 } from "lucide-react";

const TABS: { id: ViewName; label: string; desc: string }[] = [
  { id: "problem", label: "Problem Space", desc: "Why the agentic internet needs infrastructure" },
  { id: "protocol", label: "NANDA Protocol Trace", desc: "Live single-agent flow with real Ed25519 cryptography" },
  { id: "orchestration", label: "Multi-Agent Economy", desc: "DAG orchestration with aggregate billing" },
];

export default function Home() {
  const [view, setView] = useState<ViewName>("problem");
  const [keyPair, setKeyPair] = useState<KeyPair | null>(null);

  useEffect(() => {
    generateKeyPair().then(setKeyPair);
  }, []);

  return (
    <main className="min-h-screen bg-[#09090b] text-white">
      <div className="relative border-b border-zinc-800/60 bg-[#09090b]">
        <div
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage: "radial-gradient(circle, #3f3f46 1px, transparent 1px)",
            backgroundSize: "28px 28px",
          }}
        />
        <div className="relative max-w-7xl mx-auto px-6 py-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Network size={16} className="text-cyan-400" />
                <span className="text-[10px] uppercase tracking-widest text-zinc-500">
                  NANDA Research Prototype
                </span>
              </div>
              <h1 className="text-3xl font-bold tracking-tight text-white">
                Cognitive Utility Network
              </h1>
              <p className="text-zinc-400 mt-1.5 max-w-2xl text-sm leading-relaxed">
                A NANDA-powered marketplace where AI agents discover, cryptographically verify,
                adaptively route to, and economically settle with other specialised reasoning agents.
              </p>
            </div>
            <div className="shrink-0 rounded-xl border border-zinc-800/60 bg-zinc-900 px-4 py-3 text-right min-w-52">
              <div className="text-[10px] uppercase tracking-widest text-zinc-600 mb-1">Session Key (Web Crypto)</div>
              {keyPair ? (
                <>
                  <div className="font-mono text-[10px] text-emerald-400">Ed25519 ✓ generated</div>
                  <div className="font-mono text-[10px] text-zinc-600 truncate mt-0.5">
                    {keyPair.keyId.slice(0, 28)}…
                  </div>
                </>
              ) : (
                <div className="flex items-center gap-1.5 justify-end">
                  <Loader2 size={11} className="animate-spin text-zinc-500" />
                  <span className="font-mono text-[10px] text-zinc-500">generating…</span>
                </div>
              )}
            </div>
          </div>

          <div className="flex gap-1 mt-6">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setView(tab.id)}
                className={`flex flex-col items-start px-4 py-2.5 rounded-lg text-left transition-all ${
                  view === tab.id
                    ? "bg-zinc-800 border border-zinc-700 text-white"
                    : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900"
                }`}
              >
                <span className="text-sm font-medium">{tab.label}</span>
                <span className="text-[10px] text-zinc-600 mt-0.5 hidden sm:block">{tab.desc}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8">
        {!keyPair ? (
          <div className="flex items-center justify-center h-64 gap-3 text-zinc-500">
            <Loader2 size={20} className="animate-spin" />
            <span className="font-mono text-sm">Generating Ed25519 session key via Web Crypto API…</span>
          </div>
        ) : (
          <>
            {view === "problem" && <ProblemView />}
            {view === "protocol" && <ProtocolDemo keyPair={keyPair} />}
            {view === "orchestration" && <OrchestrationDemo keyPair={keyPair} />}
          </>
        )}
      </div>
    </main>
  );
}
