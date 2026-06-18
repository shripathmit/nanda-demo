/**
 * Headless Level 1 NANDA demo.
 *
 * Demonstrates, end-to-end and with NO browser, the paper's core flow:
 *
 *     name  ──►  AgentAddr  ──►  AgentFacts  ──►  verify  ──►  act
 *            (index hop)     (facts hop)      (Ed25519)
 *
 * Run:  npm run demo
 *
 * It registers four agents, then — acting purely as a CLIENT that knows only a
 * NAME — resolves several of them through the two hops, verifies every signed
 * document, and proves that a single mutated byte is detected by real Ed25519.
 */

import { generateKeyPair } from "../app/lib/crypto";
import { NandaRegistry } from "../app/lib/registry";
import { verifyAgentAddr, verifyAgentFacts } from "../app/lib/nanda";
import { AGENTS } from "../app/lib/agents";
import type { AgentFacts } from "../app/lib/types";

// ── tiny ANSI helpers (no deps) ──────────────────────────────────────────────
const c = {
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
};
const rule = () => console.log(c.dim("─".repeat(74)));
const h = (s: string) => {
  console.log("\n" + c.bold(c.cyan(s)));
  rule();
};

async function main() {
  h("NANDA Level 1 — name → AgentAddr → AgentFacts → verify");

  // The index/issuer holds an Ed25519 key. AgentAddr and AgentFacts are signed
  // with it; a client verifies against the matching public key (key_id).
  const keyPair = await generateKeyPair();
  console.log(`Issuer key_id: ${c.dim(keyPair.keyId.slice(0, 32) + "…")}`);

  // ── Registration ───────────────────────────────────────────────────────────
  const registry = new NandaRegistry(keyPair);
  registry.registerAll(AGENTS);
  console.log(
    `Registered ${c.bold(String(registry.listNames().length))} agents into the index: ` +
      registry.listNames().map((n) => c.cyan(n)).join(", ")
  );

  // A client picks names to resolve. We resolve THREE — well above the floor of
  // two — to show the flow is repeatable, not a one-off.
  const namesToResolve = ["@deep-thinker", "@math-expert", "@market-analyst"];

  let okCount = 0;
  for (const name of namesToResolve) {
    h(`Client resolves ${name}`);

    // HOP 1 — index lookup: name → signed AgentAddr (lean pointer only).
    const addr = await registry.resolve(name);
    console.log("  hop 1 " + c.dim("index → AgentAddr"));
    console.log(`    agent_id   : ${addr.agent_id}`);
    console.log(`    facts_url  : ${addr.facts_url}`);
    console.log(`    public_key : ${c.dim(addr.public_key_id.slice(0, 24) + "…")}`);
    console.log(`    ttl        : ${addr.ttl}s`);
    console.log(`    signature  : ${c.dim(addr.signature.slice(0, 24) + "…")}`);
    // Prove the AgentAddr is LEAN — it must not carry capabilities/pricing/trust.
    const leaked = ["capabilities", "pricing", "trust", "endpoints"].filter(
      (k) => k in (addr as unknown as Record<string, unknown>)
    );
    console.log(
      "    lean check : " +
        (leaked.length === 0
          ? c.green("✓ no capabilities/pricing/trust in AgentAddr")
          : c.red(`✗ leaked ${leaked.join(", ")}`))
    );

    const addrOk = await verifyAgentAddr(addr, keyPair.publicKey);
    console.log("    verify     : " + (addrOk ? c.green("✓ AgentAddr signature valid") : c.red("✗ invalid")));

    // HOP 2 — follow facts_url: agent_id → signed AgentFacts (full metadata).
    const facts = await registry.fetchFacts(addr);
    console.log("  hop 2 " + c.dim("facts_url → AgentFacts"));
    console.log(`    capabilities : ${facts.capabilities.join(", ")}`);
    console.log(`    trust_score  : ${facts.trust.trust_score} (${facts.trust.trust_level})`);
    console.log(`    base_fee     : $${facts.pricing.base_fee}`);
    console.log(`    endpoint     : ${facts.endpoints[0].url} (${facts.endpoints[0].health})`);

    const factsOk = await verifyAgentFacts(facts, keyPair.publicKey);
    console.log("    verify       : " + (factsOk ? c.green("✓ AgentFacts signature valid") : c.red("✗ invalid")));

    // agent_id must be consistent across the two hops (no bait-and-switch).
    const consistent = addr.agent_id === facts.agent_id;
    console.log("    consistency  : " + (consistent ? c.green("✓ agent_id matches across hops") : c.red("✗ mismatch")));

    // The client can now ACT: it has a verified endpoint + price to call.
    console.log(
      "    → actionable : " +
        c.green(`call ${facts.endpoints[0].url} at ~$${facts.pricing.base_fee}/call`)
    );

    if (addrOk && factsOk && consistent && leaked.length === 0) okCount++;
  }

  // ── Tamper detection ─────────────────────────────────────────────────────────
  h("Tamper detection — flip one field after signing");
  const addr = await registry.resolve("@deep-thinker");
  const facts = await registry.fetchFacts(addr);
  const beforeOk = await verifyAgentFacts(facts, keyPair.publicKey);
  console.log("  original AgentFacts verify : " + (beforeOk ? c.green("✓ valid") : c.red("✗ invalid")));

  // Adversary inflates the trust score on a validly-signed document.
  const tampered: AgentFacts = {
    ...facts,
    trust: { ...facts.trust, trust_score: 0.999 },
  };
  console.log(c.yellow(`  adversary sets trust_score ${facts.trust.trust_score} → ${tampered.trust.trust_score}`));
  const afterOk = await verifyAgentFacts(tampered, keyPair.publicKey);
  console.log("  tampered AgentFacts verify : " + (afterOk ? c.red("✗ NOT detected") : c.green("✓ detected — signature rejected")));

  // ── Summary ──────────────────────────────────────────────────────────────────
  rule();
  const allGood = okCount === namesToResolve.length && beforeOk && !afterOk;
  console.log(
    (allGood ? c.green(c.bold("PASS")) : c.red(c.bold("FAIL"))) +
      `  ${okCount}/${namesToResolve.length} agents resolved+verified through both hops; ` +
      `tamper ${afterOk ? "MISSED" : "detected"}.`
  );
  process.exit(allGood ? 0 : 1);
}

main().catch((e) => {
  console.error(c.red("demo failed:"), e);
  process.exit(1);
});
