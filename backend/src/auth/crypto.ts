import { randomBytes, createCipheriv, createDecipheriv } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
import path from "node:path";
import { config } from "../config.js";

let cachedKey: Buffer | undefined;

/** Machine-local key used to encrypt session-held credentials at rest. Root-only file. */
function getSecretKey(): Buffer {
  if (cachedKey) return cachedKey;
  if (existsSync(config.secretKeyPath)) {
    cachedKey = Buffer.from(readFileSync(config.secretKeyPath, "utf8").trim(), "hex");
    return cachedKey;
  }
  mkdirSync(path.dirname(config.secretKeyPath), { recursive: true });
  const key = randomBytes(32);
  writeFileSync(config.secretKeyPath, key.toString("hex"), { mode: 0o600 });
  chmodSync(config.secretKeyPath, 0o600);
  cachedKey = key;
  return key;
}

/** Encrypts a value (e.g. a bound admin's password) for storage in the session store. */
export function encryptSecret(plaintext: string): string {
  const key = getSecretKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]).toString("base64");
}

export function decryptSecret(payload: string): string {
  const key = getSecretKey();
  const raw = Buffer.from(payload, "base64");
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const ciphertext = raw.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
