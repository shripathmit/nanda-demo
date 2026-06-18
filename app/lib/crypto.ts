"use client";

// ─── Canonical JSON ──────────────────────────────────────────────────────────
// Deterministic serialisation: keys sorted recursively, no whitespace.
// Required so signatures are stable across different JS engines.

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value !== null && typeof value === "object") {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value as object).sort()) {
      sorted[key] = sortKeysDeep((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return value;
}

export function canonicalJson(obj: object): ArrayBuffer {
  return new TextEncoder().encode(JSON.stringify(sortKeysDeep(obj))).buffer as ArrayBuffer;
}

export function canonicalJsonString(obj: object): string {
  return JSON.stringify(sortKeysDeep(obj));
}

// ─── Key management ──────────────────────────────────────────────────────────

export interface KeyPair {
  publicKey: CryptoKey;
  privateKey: CryptoKey;
  /** hex-encoded SHA-256 of the exported public key bytes – used as key ID */
  keyId: string;
  /** base64-encoded raw public key for display */
  publicKeyB64: string;
}

async function deriveKeyId(publicKey: CryptoKey): Promise<string> {
  const raw = await crypto.subtle.exportKey("raw", publicKey);
  const hash = await crypto.subtle.digest("SHA-256", raw);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function exportPublicKeyB64(publicKey: CryptoKey): Promise<string> {
  const raw = await crypto.subtle.exportKey("raw", publicKey);
  return btoa(String.fromCharCode(...new Uint8Array(raw)));
}

export async function generateKeyPair(): Promise<KeyPair> {
  const pair = await crypto.subtle.generateKey(
    { name: "Ed25519" } as AlgorithmIdentifier,
    true,
    ["sign", "verify"]
  ) as CryptoKeyPair;
  const keyId = await deriveKeyId(pair.publicKey);
  const publicKeyB64 = await exportPublicKeyB64(pair.publicKey);
  return { publicKey: pair.publicKey, privateKey: pair.privateKey, keyId, publicKeyB64 };
}

// ─── Sign / Verify ───────────────────────────────────────────────────────────

export async function signPayload(privateKey: CryptoKey, payload: object): Promise<string> {
  const bytes = canonicalJson(payload);
  const sig = await crypto.subtle.sign(
    { name: "Ed25519" } as AlgorithmIdentifier,
    privateKey,
    bytes
  );
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

export async function verifyPayload(
  publicKey: CryptoKey,
  payload: object,
  signatureB64: string
): Promise<boolean> {
  try {
    const bytes = canonicalJson(payload);
    const sigBytes = Uint8Array.from(atob(signatureB64), (c) => c.charCodeAt(0)).buffer as ArrayBuffer;
    return await crypto.subtle.verify(
      { name: "Ed25519" } as AlgorithmIdentifier,
      publicKey,
      sigBytes,
      bytes
    );
  } catch {
    return false;
  }
}

// ─── SHA-256 for Merkle audit chain ─────────────────────────────────────────

export async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
