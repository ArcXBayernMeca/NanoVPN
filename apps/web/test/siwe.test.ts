import { describe, it, expect } from "vitest";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { buildSiweMessage, verifySiwe } from "../lib/siwe";

describe("SIWE", () => {
  it("verifies a message signed by the claimed address", async () => {
    const account = privateKeyToAccount(generatePrivateKey());
    const nonce = "abc123nonce";
    const message = buildSiweMessage({
      address: account.address,
      nonce,
      domain: "localhost",
      uri: "http://localhost:3000",
    });
    const signature = await account.signMessage({ message });
    const result = await verifySiwe(message, signature, nonce);
    expect(result.success).toBe(true);
    expect(result.address?.toLowerCase()).toBe(account.address.toLowerCase());
  });

  it("rejects a wrong nonce", async () => {
    const account = privateKeyToAccount(generatePrivateKey());
    // SIWE nonces must be ≥8 alphanumeric chars; "n1" in the brief would fail
    // construction — using valid nonces here while still testing mismatch.
    const message = buildSiweMessage({
      address: account.address,
      nonce: "validnonce1",
      domain: "localhost",
      uri: "http://localhost:3000",
    });
    const signature = await account.signMessage({ message });
    const result = await verifySiwe(message, signature, "DIFFERENT1");
    expect(result.success).toBe(false);
  });

  it("verifies when expectedDomain matches the message domain", async () => {
    const account = privateKeyToAccount(generatePrivateKey());
    const nonce = "domnonce123";
    const message = buildSiweMessage({
      address: account.address,
      nonce,
      domain: "localhost:3000",
      uri: "http://localhost:3000",
    });
    const signature = await account.signMessage({ message });
    const result = await verifySiwe(message, signature, nonce, "localhost:3000");
    expect(result.success).toBe(true);
    expect(result.address?.toLowerCase()).toBe(account.address.toLowerCase());
  });

  it("rejects when expectedDomain is a different host", async () => {
    const account = privateKeyToAccount(generatePrivateKey());
    const nonce = "domnonce456";
    const message = buildSiweMessage({
      address: account.address,
      nonce,
      domain: "localhost:3000",
      uri: "http://localhost:3000",
    });
    const signature = await account.signMessage({ message });
    const result = await verifySiwe(message, signature, nonce, "evil.example.com");
    expect(result.success).toBe(false);
  });
});
