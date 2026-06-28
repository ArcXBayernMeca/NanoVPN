import { randomBytes, createCipheriv, createDecipheriv } from "node:crypto";

const ALGO = "aes-256-gcm";

function keyBuf(keyHex: string): Buffer {
  const key = Buffer.from(keyHex, "hex");
  if (key.length !== 32) throw new Error("encryption key must be 32 bytes (64 hex chars)");
  return key;
}

/** Encrypt a UTF-8 secret. Returns "<ivHex>:<tagHex>:<ciphertextHex>". */
export function encryptSecret(plaintext: string, keyHex: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, keyBuf(keyHex), iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("hex"), tag.toString("hex"), ct.toString("hex")].join(":");
}

/** Decrypt a blob produced by encryptSecret. Throws if the key is wrong or the data was tampered. */
export function decryptSecret(blob: string, keyHex: string): string {
  const [ivHex, tagHex, ctHex] = blob.split(":");
  if (!ivHex || !tagHex || !ctHex) throw new Error("malformed ciphertext");
  const decipher = createDecipheriv(ALGO, keyBuf(keyHex), Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  return Buffer.concat([decipher.update(Buffer.from(ctHex, "hex")), decipher.final()]).toString("utf8");
}
