"use client";

import type { AuditEvent } from "./types";
import { sha256Hex } from "./crypto";

const GENESIS_HASH = "0000000000000000000000000000000000000000000000000000000000000000";

export async function buildAuditEvent(
  id: number,
  type: string,
  message: string,
  prevHash: string
): Promise<AuditEvent> {
  const partial = {
    id,
    timestamp: new Date().toISOString(),
    type,
    message,
    prev_hash: prevHash,
  };
  const hash = await sha256Hex(JSON.stringify(partial));
  return { ...partial, hash };
}

export async function verifyChain(events: AuditEvent[]): Promise<boolean[]> {
  const results: boolean[] = [];
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    const expectedPrev = i === 0 ? GENESIS_HASH : events[i - 1].hash;
    if (e.prev_hash !== expectedPrev) {
      results.push(false);
      continue;
    }
    const { hash, ...partial } = e;
    const recomputed = await sha256Hex(JSON.stringify(partial));
    results.push(recomputed === hash);
  }
  return results;
}

export { GENESIS_HASH };
