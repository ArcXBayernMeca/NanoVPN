import { describe, it, expect } from "vitest";
import { walletLabel } from "@/components/WalletProvider";

describe("walletLabel", () => {
  it("prompts to connect when no address", () => { expect(walletLabel(undefined, null)).toBe("Connect wallet"); });
  it("prompts to sign in when connected but not signed", () => { expect(walletLabel("0x1234567890abcdef", null)).toBe("Sign in as 0x1234…cdef"); });
  it("shows the short address when signed in", () => { expect(walletLabel("0x1234567890abcdef", "0x1234567890abcdef")).toBe("0x1234…cdef"); });
});
