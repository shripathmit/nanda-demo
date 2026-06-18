"use client";

export type CircuitState = "closed" | "open" | "half-open";

export class CircuitBreaker {
  private failures = 0;
  private state: CircuitState = "closed";
  private openedAt?: number;
  private readonly threshold: number;
  private readonly halfOpenAfterMs: number;

  constructor(threshold = 3, halfOpenAfterMs = 10_000) {
    this.threshold = threshold;
    this.halfOpenAfterMs = halfOpenAfterMs;
  }

  get currentState(): CircuitState {
    if (this.state === "open" && this.openedAt !== undefined) {
      if (Date.now() - this.openedAt >= this.halfOpenAfterMs) {
        this.state = "half-open";
      }
    }
    return this.state;
  }

  /** Returns true if the request is allowed through */
  attempt(): boolean {
    const s = this.currentState;
    return s === "closed" || s === "half-open";
  }

  recordFailure(): void {
    this.failures++;
    if (this.failures >= this.threshold && this.state === "closed") {
      this.state = "open";
      this.openedAt = Date.now();
    }
  }

  recordSuccess(): void {
    this.failures = 0;
    this.state = "closed";
    this.openedAt = undefined;
  }

  forceOpen(): void {
    this.state = "open";
    this.openedAt = Date.now();
    this.failures = this.threshold;
  }

  forceClose(): void {
    this.state = "closed";
    this.failures = 0;
    this.openedAt = undefined;
  }

  snapshot() {
    return {
      state: this.currentState,
      failures: this.failures,
      threshold: this.threshold,
    };
  }
}

// One breaker per agent endpoint
export const circuitBreakers = new Map<string, CircuitBreaker>();

export function getBreakerForAgent(agentName: string): CircuitBreaker {
  if (!circuitBreakers.has(agentName)) {
    circuitBreakers.set(agentName, new CircuitBreaker(3));
  }
  return circuitBreakers.get(agentName)!;
}
