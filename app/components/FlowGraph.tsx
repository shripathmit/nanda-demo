"use client";

import ReactFlow, {
  Background,
  type Node,
  type Edge,
  Position,
} from "reactflow";
import "reactflow/dist/style.css";

interface Props {
  selectedAgent?: string;
  stage: string;
}

const NODE_STYLE = {
  background: "#18181b",
  border: "1px solid #3f3f46",
  borderRadius: 10,
  padding: "8px 14px",
  fontSize: 11,
  color: "#a1a1aa",
  fontFamily: "monospace",
};

const ACTIVE_STYLE = {
  ...NODE_STYLE,
  border: "1px solid #22d3ee",
  color: "#22d3ee",
  background: "#083344",
};

const AGENT_NAMES = ["@fast-thinker", "@deep-thinker", "@math-expert", "@market-analyst"];

export default function FlowGraph({ selectedAgent, stage }: Props) {
  const resolved = stage !== "idle" && stage !== "resolving";
  const verified = ["verified", "routing", "routed", "executing", "executed", "billing", "billed"].includes(stage);
  const routed = ["routed", "executing", "executed", "billing", "billed"].includes(stage);

  const nodes: Node[] = [
    {
      id: "client",
      data: { label: "Client Agent" },
      position: { x: 0, y: 120 },
      style: resolved ? ACTIVE_STYLE : NODE_STYLE,
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
    },
    {
      id: "index",
      data: { label: "NANDA Lean Index" },
      position: { x: 200, y: 60 },
      style: resolved ? ACTIVE_STYLE : NODE_STYLE,
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
    },
    {
      id: "facts",
      data: { label: "AgentFacts Service" },
      position: { x: 200, y: 180 },
      style: verified ? ACTIVE_STYLE : NODE_STYLE,
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
    },
    {
      id: "resolver",
      data: { label: "Adaptive Resolver" },
      position: { x: 420, y: 120 },
      style: routed ? ACTIVE_STYLE : NODE_STYLE,
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
    },
    ...AGENT_NAMES.map((name, i) => ({
      id: name,
      data: { label: name },
      position: { x: 640, y: i * 70 + 10 },
      style:
        routed && selectedAgent === name
          ? { ...ACTIVE_STYLE, border: "1px solid #22d3ee", background: "#0c4a6e" }
          : routed && selectedAgent !== name
          ? { ...NODE_STYLE, opacity: 0.35 }
          : NODE_STYLE,
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
    })),
  ];

  const edges: Edge[] = [
    { id: "c-i", source: "client", target: "index", label: "resolve(name)", style: { stroke: resolved ? "#22d3ee" : "#3f3f46" }, labelStyle: { fill: "#52525b", fontSize: 9 }, animated: stage === "resolving" },
    { id: "i-f", source: "index", target: "facts", label: "AgentAddr→facts_url", style: { stroke: resolved ? "#22d3ee" : "#3f3f46" }, labelStyle: { fill: "#52525b", fontSize: 9 } },
    { id: "f-r", source: "facts", target: "resolver", label: "verify+score", style: { stroke: verified ? "#22d3ee" : "#3f3f46" }, labelStyle: { fill: "#52525b", fontSize: 9 } },
    ...AGENT_NAMES.map((name, i) => ({
      id: `r-${i}`,
      source: "resolver",
      target: name,
      style: {
        stroke: routed && selectedAgent === name ? "#22d3ee" : "#3f3f46",
        strokeWidth: routed && selectedAgent === name ? 2 : 1,
      },
      animated: routed && selectedAgent === name,
    })),
  ];

  return (
    <div style={{ height: 300 }} className="rounded-xl overflow-hidden border border-zinc-800/60">
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
