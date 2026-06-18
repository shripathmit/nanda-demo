"use client";

import ReactFlow, {
  Background,
  type Node,
  type Edge,
  Position,
} from "reactflow";
import "reactflow/dist/style.css";
import type { SubTask, SubTaskStatus } from "@/app/lib/types";
import { assignPhases } from "@/app/lib/dag";

interface Props {
  subtasks: SubTask[];
  statuses: Map<string, SubTaskStatus>;
}

const STATUS_STYLE: Record<SubTaskStatus, string> = {
  waiting: "background:#18181b;border:1px solid #3f3f46;color:#71717a",
  resolving: "background:#1c1917;border:1px solid #a16207;color:#fbbf24",
  verifying: "background:#1c1917;border:1px solid #a16207;color:#fbbf24",
  routing: "background:#0c0a1e;border:1px solid #7c3aed;color:#a78bfa",
  executing: "background:#083344;border:1px solid #0e7490;color:#22d3ee",
  done: "background:#052e16;border:1px solid #166534;color:#34d399",
  failed: "background:#1f0a0a;border:1px solid #7f1d1d;color:#f87171",
};

function styleFromStatus(status: SubTaskStatus): React.CSSProperties {
  const str = STATUS_STYLE[status];
  const result: React.CSSProperties = {};
  str.split(";").forEach((part) => {
    const [k, v] = part.split(":");
    if (k && v) (result as Record<string, string>)[k.trim().replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = v.trim();
  });
  return { ...result, borderRadius: 10, padding: "8px 14px", fontSize: 11, fontFamily: "monospace" };
}

// X positions by phase, Y positions by task order within phase
function layoutNodes(subtasks: SubTask[], phaseMap: Map<string, number>, statuses: Map<string, SubTaskStatus>): Node[] {
  const phases: SubTask[][] = [];
  for (const t of subtasks) {
    const p = phaseMap.get(t.id) ?? 0;
    if (!phases[p]) phases[p] = [];
    phases[p].push(t);
  }

  const nodes: Node[] = [];
  phases.forEach((phase, pi) => {
    const totalHeight = phase.length * 80;
    const startY = (3 * 80 - totalHeight) / 2;
    phase.forEach((t, ti) => {
      nodes.push({
        id: t.id,
        data: { label: `${t.label}\n${t.preferredAgent ?? ""}` },
        position: { x: pi * 260, y: startY + ti * 80 },
        style: styleFromStatus(statuses.get(t.id) ?? "waiting"),
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
      });
    });
  });
  return nodes;
}

export default function DagGraph({ subtasks, statuses }: Props) {
  const phaseMap = assignPhases(subtasks);

  const nodes = layoutNodes(subtasks, phaseMap, statuses);

  const edges: Edge[] = subtasks.flatMap((t) =>
    t.dependsOn.map((dep) => {
      const depStatus = statuses.get(dep) ?? "waiting";
      const tStatus = statuses.get(t.id) ?? "waiting";
      const active = depStatus === "done" || tStatus !== "waiting";
      return {
        id: `${dep}-${t.id}`,
        source: dep,
        target: t.id,
        animated: active,
        style: { stroke: active ? "#22d3ee" : "#3f3f46", strokeWidth: active ? 2 : 1 },
      };
    })
  );

  return (
    <div style={{ height: 280 }} className="rounded-xl overflow-hidden border border-zinc-800/60">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        fitView
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        panOnDrag={false}
        zoomOnScroll={false}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#27272a" gap={20} size={1} />
      </ReactFlow>
    </div>
  );
}
