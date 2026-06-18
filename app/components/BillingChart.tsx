"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  LabelList,
} from "recharts";
import type { Invoice } from "@/app/lib/types";

interface Props {
  invoices: Array<{ label: string; invoice: Invoice }>;
}

const COLORS = ["#22d3ee", "#818cf8", "#34d399", "#f59e0b"];

export default function BillingChart({ invoices }: Props) {
  if (invoices.length === 0) return null;

  const data = invoices.map((d, i) => ({
    name: d.label,
    cost: parseFloat(d.invoice.final_cost.toFixed(4)),
    color: COLORS[i % COLORS.length],
  }));

  const total = invoices.reduce((s, d) => s + d.invoice.final_cost, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-xs text-zinc-500 uppercase tracking-widest">
          Per-agent cost breakdown
        </div>
        <div className="font-mono text-sm text-emerald-400">
          Total: ${total.toFixed(4)}
        </div>
      </div>

      <ResponsiveContainer width="100%" height={160}>
        <BarChart data={data} margin={{ top: 16, right: 8, left: -20, bottom: 0 }}>
          <XAxis
            dataKey="name"
            tick={{ fill: "#71717a", fontSize: 10 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: "#71717a", fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => `$${v}`}
          />
          <Tooltip
            contentStyle={{
              background: "#18181b",
              border: "1px solid #3f3f46",
              borderRadius: 8,
              fontSize: 12,
            }}
            formatter={(v) => [`$${Number(v).toFixed(4)}`, "Cost"]}
            cursor={{ fill: "rgba(255,255,255,0.03)" }}
          />
          <Bar dataKey="cost" radius={[4, 4, 0, 0]}>
            {data.map((d, i) => (
              <Cell key={i} fill={d.color} />
            ))}
            <LabelList
              dataKey="cost"
              position="top"
              formatter={(v) => `$${Number(v).toFixed(3)}`}
              style={{ fill: "#a1a1aa", fontSize: 10 }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      <div className="space-y-1">
        {invoices.map((d, i) => (
          <div key={d.invoice.invoice_id} className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <div
                className="w-2 h-2 rounded-full"
                style={{ background: COLORS[i % COLORS.length] }}
              />
              <span className="text-zinc-400">{d.label}</span>
              <span className="text-zinc-600 font-mono">{d.invoice.invoice_id}</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-zinc-500">{d.invoice.usage.cognitive_units} CU</span>
              <span className="font-mono text-zinc-200">${d.invoice.final_cost.toFixed(4)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
