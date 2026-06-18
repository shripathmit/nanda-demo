"use client";

import type { SubTask } from "./types";

// Kahn's algorithm for topological sort.
// Returns an array of execution phases where each phase is a list of
// subtasks that can run in parallel (all their dependencies are in earlier phases).

export function topologicalPhases(tasks: SubTask[]): SubTask[][] {
  const idToTask = new Map(tasks.map((t) => [t.id, t]));
  const inDegree = new Map<string, number>();
  const dependents = new Map<string, string[]>(); // id → list of tasks that depend on it

  for (const task of tasks) {
    inDegree.set(task.id, task.dependsOn.length);
    for (const dep of task.dependsOn) {
      if (!dependents.has(dep)) dependents.set(dep, []);
      dependents.get(dep)!.push(task.id);
    }
  }

  const phases: SubTask[][] = [];
  let queue = tasks.filter((t) => inDegree.get(t.id) === 0);

  while (queue.length > 0) {
    phases.push(queue);
    const next: SubTask[] = [];
    for (const task of queue) {
      for (const dependentId of dependents.get(task.id) ?? []) {
        const newDegree = (inDegree.get(dependentId) ?? 1) - 1;
        inDegree.set(dependentId, newDegree);
        if (newDegree === 0) {
          const dep = idToTask.get(dependentId);
          if (dep) next.push(dep);
        }
      }
    }
    queue = next;
  }

  // Cycle detection: if any task was never enqueued, there's a cycle
  const visited = new Set(phases.flat().map((t) => t.id));
  const unvisited = tasks.filter((t) => !visited.has(t.id));
  if (unvisited.length > 0) {
    throw new Error(`DAG cycle detected involving: ${unvisited.map((t) => t.id).join(", ")}`);
  }

  return phases;
}

/** Assign a phase number to each subtask */
export function assignPhases(tasks: SubTask[]): Map<string, number> {
  const phases = topologicalPhases(tasks);
  const phaseMap = new Map<string, number>();
  phases.forEach((phase, index) => {
    for (const task of phase) phaseMap.set(task.id, index);
  });
  return phaseMap;
}
