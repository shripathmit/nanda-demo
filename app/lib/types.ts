export type ViewName = "guided" | "problem" | "protocol" | "orchestration";

export type DemoStage =
  | "idle"
  | "resolving"
  | "resolved"
  | "cache_checked"
  | "verifying"
  | "verified"
  | "routing"
  | "routed"
  | "executing"
  | "executed"
  | "billing"
  | "billed"
  | "blocked";

export type Complexity = "low" | "medium" | "high";

export interface Task {
  id: string;
  title: string;
  prompt: string;
  requiredCapability: string;
  maxPrice: number;
  minTrust: number;
  latencyBudgetMs: number;
  complexity: Complexity;
}

export interface AgentDef {
  name: string;
  label: string;
  description: string;
  capabilities: string[];
  trustScore: number;
  baseFee: number;
  latencyMs: number;
  availability: number;
  load: number;
  quality: number;
  region: string;
  endpoint: string;
  issuer: string;
}

export interface AgentAddr {
  agent_name: string;
  agent_id: string;
  registration_type: string;
  facts_url: string;
  private_facts_url: string;
  adaptive_resolver_url: string;
  public_key_id: string;
  ttl: number;
  issued_at: string;
  expires_at: string;
  /** base64-encoded Ed25519 signature over canonical JSON of the other fields */
  signature: string;
  /** runtime-only: set after Web Crypto verify() */
  verified?: boolean;
}

export interface Pricing {
  model: string;
  base_fee: number;
  input_token_rate: number;
  output_token_rate: number;
  reasoning_step_rate: number;
  tool_call_rate: number;
  complexity_rate: number;
  minimum_charge: number;
  maximum_charge: number;
  surge_multiplier: number;
}

export interface Trust {
  trust_score: number;
  trust_level: string;
  issuer: string;
  credential: string;
  credential_status: "valid" | "revoked" | "invalid";
  revoked: boolean;
}

export interface Endpoint {
  id: string;
  url: string;
  region: string;
  latency_ms: number;
  health: "healthy" | "unhealthy";
  load: number;
  capabilities: string[];
}

export interface Telemetry {
  availability_24h: number;
  latency_p95_ms: number;
  current_load: number;
  quality_score: number;
}

/** The signable body of AgentFacts (fields that are signed) */
export interface AgentFactsBody {
  type: "AgentFacts";
  agent_id: string;
  agent_name: string;
  label: string;
  description: string;
  version: string;
  capabilities: string[];
  pricing: Pricing;
  trust: Trust;
  endpoints: Endpoint[];
  telemetry: Telemetry;
  ttl: number;
  issued_at: string;
  expires_at: string;
}

export interface AgentFacts extends AgentFactsBody {
  /** base64-encoded Ed25519 signature over canonical JSON of AgentFactsBody */
  signature: string;
  /** runtime-only: set after Web Crypto verify() */
  verified?: boolean;
  /** runtime-only: whether fetched from cache */
  cacheHit?: boolean;
}

export interface VerificationResult {
  agent: string;
  passed: boolean;
  checks: Record<string, "passed" | "failed" | "skip">;
  reason: string;
}

export interface RouteCandidate {
  agent: AgentDef;
  facts: AgentFacts;
  verification: VerificationResult;
  estimatedPrice: number;
  routeScore: number;
  rejected: boolean;
  rejectionReason?: string;
  routeReasons: string[];
}

export interface UsageReport {
  input_tokens: number;
  output_tokens: number;
  reasoning_steps: number;
  tool_calls: number;
  complexity_score: number;
  cognitive_units: number;
  latency_ms: number;
}

export interface Invoice {
  invoice_id: string;
  task_id: string;
  provider: string;
  usage: UsageReport;
  raw_cost: number;
  final_cost: number;
  pricing_model: string;
  status: string;
}

export interface AuditEvent {
  id: number;
  timestamp: string;
  type: string;
  message: string;
  hash: string;
  prev_hash: string;
}

// ─── DAG types ──────────────────────────────────────────────────────────────

export interface SubTask {
  id: string;
  label: string;
  capability: string;
  dependsOn: string[];
  preferredAgent?: string;
  complexity: Complexity;
}

export type SubTaskStatus =
  | "waiting"
  | "resolving"
  | "verifying"
  | "routing"
  | "executing"
  | "done"
  | "failed";

export interface SubTaskResult {
  subTask: SubTask;
  agent: AgentDef;
  facts: AgentFacts;
  verification: VerificationResult;
  candidate: RouteCandidate;
  usage: UsageReport;
  invoice: Invoice;
  status: SubTaskStatus;
  output: string;
  phase: number;
}

export interface CacheEntry {
  facts: AgentFacts;
  expiresAt: number;
  hits: number;
}
