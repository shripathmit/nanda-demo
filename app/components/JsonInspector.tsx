"use client";

import { useState } from "react";
import { Edit3, RotateCcw, AlertTriangle } from "lucide-react";

interface Props {
  data: object;
  onTamper?: (tampered: object) => void;
  readOnly?: boolean;
  label?: string;
}

export default function JsonInspector({ data, onTamper, readOnly = false, label }: Props) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  const [parseError, setParseError] = useState<string | null>(null);

  const original = JSON.stringify(data, null, 2);

  // Seed the editor from the current data only when editing begins; while not
  // editing we render `original` directly, so no effect-driven sync is needed.
  function startEdit() {
    setText(original);
    setParseError(null);
    setEditing(true);
  }

  function handleChange(v: string) {
    setText(v);
    try {
      JSON.parse(v);
      setParseError(null);
    } catch (e: unknown) {
      setParseError(e instanceof Error ? e.message : "Parse error");
    }
  }

  function handleSubmit() {
    try {
      const parsed = JSON.parse(text);
      onTamper?.(parsed);
      setEditing(false);
    } catch {
      // keep error visible
    }
  }

  function handleReset() {
    setText(original);
    setParseError(null);
    setEditing(false);
  }

  return (
    <div className="space-y-2">
      {label && (
        <div className="flex items-center justify-between">
          <div className="text-[10px] uppercase tracking-widest text-zinc-500">{label}</div>
          {!readOnly && (
            <div className="flex items-center gap-2">
              {editing && (
                <button
                  onClick={handleReset}
                  className="flex items-center gap-1 text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  <RotateCcw size={10} />
                  Reset
                </button>
              )}
              <button
                onClick={() => (editing ? handleSubmit() : startEdit())}
                className={`flex items-center gap-1 text-[10px] px-2 py-1 rounded border transition-colors ${
                  editing
                    ? "bg-red-950/60 border-red-800/60 text-red-400 hover:bg-red-900/60"
                    : "bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-zinc-200"
                }`}
              >
                <Edit3 size={10} />
                {editing ? "Apply Tamper" : "Edit JSON"}
              </button>
            </div>
          )}
        </div>
      )}

      {parseError && (
        <div className="flex items-center gap-1.5 text-[10px] text-amber-400 bg-amber-950/20 border border-amber-800/40 rounded px-2 py-1">
          <AlertTriangle size={10} />
          {parseError}
        </div>
      )}

      {editing ? (
        <textarea
          className="w-full font-mono text-xs bg-zinc-950 border border-zinc-700 text-zinc-200 p-3 rounded-lg h-72 resize-none outline-none focus:border-red-600 transition-colors"
          value={text}
          onChange={(e) => handleChange(e.target.value)}
          spellCheck={false}
        />
      ) : (
        <pre className="font-mono text-xs bg-zinc-950 border border-zinc-800/60 text-zinc-300 p-3 rounded-lg max-h-72 overflow-auto whitespace-pre-wrap break-all">
          {original}
        </pre>
      )}
    </div>
  );
}
