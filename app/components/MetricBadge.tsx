"use client";

interface Props {
  label: string;
  value: string | number;
  variant?: "default" | "success" | "error" | "warning" | "cyan";
}

const variants: Record<string, string> = {
  default: "bg-zinc-800 text-zinc-200 border-zinc-700",
  success: "bg-emerald-950/60 text-emerald-400 border-emerald-800/60",
  error: "bg-red-950/60 text-red-400 border-red-800/60",
  warning: "bg-amber-950/60 text-amber-400 border-amber-800/60",
  cyan: "bg-cyan-950/60 text-cyan-300 border-cyan-800/60",
};

export default function MetricBadge({ label, value, variant = "default" }: Props) {
  return (
    <div className={`rounded-lg border px-3 py-2 ${variants[variant]}`}>
      <div className="text-[10px] uppercase tracking-widest opacity-60">{label}</div>
      <div className="font-mono text-sm font-semibold mt-0.5">{value}</div>
    </div>
  );
}
