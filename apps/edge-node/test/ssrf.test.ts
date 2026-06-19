import { describe, it, expect } from "vitest";
import { assertPublicUrl } from "../src/ssrf";

const publicLookup = async () => "93.184.216.34"; // example.com

describe("assertPublicUrl", () => {
  it("accepts a public https URL", async () => {
    const u = await assertPublicUrl("https://example.com/x", publicLookup);
    expect(u.hostname).toBe("example.com");
  });
  it("rejects non-http(s) schemes", async () => {
    await expect(assertPublicUrl("file:///etc/passwd", publicLookup)).rejects.toThrow();
  });
  it("rejects loopback", async () => {
    await expect(assertPublicUrl("http://x.test", async () => "127.0.0.1")).rejects.toThrow();
  });
  it("rejects private ranges", async () => {
    await expect(assertPublicUrl("http://x.test", async () => "10.1.2.3")).rejects.toThrow();
    await expect(assertPublicUrl("http://x.test", async () => "192.168.1.1")).rejects.toThrow();
    await expect(assertPublicUrl("http://x.test", async () => "172.16.5.4")).rejects.toThrow();
  });
  it("rejects link-local / cloud metadata", async () => {
    await expect(assertPublicUrl("http://x.test", async () => "169.254.169.254")).rejects.toThrow();
  });
});
