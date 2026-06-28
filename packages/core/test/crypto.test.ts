import { describe, it, expect } from "vitest";
import { encryptSecret, decryptSecret } from "../src/crypto";

const KEY = "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff"; // 32 bytes

describe("crypto", () => {
  it("round-trips a secret", () => {
    const secret = "0xabc123deadbeef";
    const blob = encryptSecret(secret, KEY);
    expect(blob).not.toContain(secret);
    expect(blob.split(":")).toHaveLength(3);
    expect(decryptSecret(blob, KEY)).toBe(secret);
  });

  it("fails to decrypt with the wrong key", () => {
    const blob = encryptSecret("topsecret", KEY);
    const wrong = "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";
    expect(() => decryptSecret(blob, wrong)).toThrow();
  });

  it("fails to decrypt tampered ciphertext", () => {
    const blob = encryptSecret("topsecret", KEY);
    const [iv, tag, ct] = blob.split(":");
    const flipped = ct[0] === "a" ? "b" + ct.slice(1) : "a" + ct.slice(1);
    expect(() => decryptSecret(`${iv}:${tag}:${flipped}`, KEY)).toThrow();
  });

  it("rejects a non-32-byte key", () => {
    expect(() => encryptSecret("x", "abcd")).toThrow();
  });
});
