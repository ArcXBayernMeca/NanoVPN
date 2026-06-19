import { describe, it, expect } from "vitest";
import { fetchPublic } from "../src/fetch-public";
import type { LookupFn } from "../src/ssrf";

// All tests use injected fetchImpl (no real network) and injected lookup.

const publicLookup: LookupFn = async () => "93.184.216.34"; // always resolves to a public IP
const privateLookup: LookupFn = async () => "169.254.169.254"; // link-local / metadata IP

/**
 * Build a fake Response with a real ReadableStream body so the byte-counting
 * path in fetchPublic is exercised.
 */
function makeBodyResponse(status: number, body: string, headers: Record<string, string> = {}): unknown {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(body);
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
  return new Response(stream, {
    status,
    headers: { "content-type": "text/plain", ...headers },
  });
}

/**
 * Build a fake redirect Response (3xx) with a Location header.
 */
function makeRedirectResponse(status: number, location: string): unknown {
  return new Response(null, {
    status,
    headers: { location },
  });
}

describe("fetchPublic", () => {
  it("test 1: follows one safe redirect (public → public) and returns final status/bytes", async () => {
    let call = 0;
    const fetchImpl = async (_url: string | URL | Request, _opts?: RequestInit): Promise<Response> => {
      call++;
      if (call === 1) {
        // First request: redirect to another public URL
        return makeRedirectResponse(302, "https://example.com/final") as Response;
      }
      // Second request: real content
      return makeBodyResponse(200, "hello world") as Response;
    };

    const result = await fetchPublic("https://example.com/start", {
      lookup: publicLookup,
      fetchImpl,
    });

    expect(result.status).toBe(200);
    expect(result.bytes).toBe(new TextEncoder().encode("hello world").byteLength);
  });

  it("test 2 (C1 regression): REJECTS a redirect whose Location resolves to a private IP", async () => {
    // The initial URL resolves public, but the redirect target resolves private.
    let call = 0;
    const conditionalLookup: LookupFn = async (host: string) => {
      if (host === "example.com") return "93.184.216.34"; // public
      // redirect target host resolves to metadata IP
      return "169.254.169.254";
    };

    const fetchImpl = async (_url: string | URL | Request, _opts?: RequestInit): Promise<Response> => {
      call++;
      if (call === 1) {
        return makeRedirectResponse(302, "https://metadata.internal/secret") as Response;
      }
      // Should never reach here
      return makeBodyResponse(200, "should not be reached") as Response;
    };

    await expect(
      fetchPublic("https://example.com/start", {
        lookup: conditionalLookup,
        fetchImpl,
      }),
    ).rejects.toThrow();
  });

  it("test 3: throws 'response too large' when streamed body exceeds maxBytes", async () => {
    const bigBody = "x".repeat(100);
    const fetchImpl = async (): Promise<Response> => makeBodyResponse(200, bigBody) as Response;

    await expect(
      fetchPublic("https://example.com/big", {
        lookup: publicLookup,
        fetchImpl,
        maxBytes: 10, // tiny cap
      }),
    ).rejects.toThrow("response too large");
  });

  it("test 4: throws 'too many redirects' past the hop budget", async () => {
    let call = 0;
    const fetchImpl = async (): Promise<Response> => {
      call++;
      // Always redirect (infinite loop)
      return makeRedirectResponse(301, `https://example.com/hop${call}`) as Response;
    };

    await expect(
      fetchPublic("https://example.com/start", {
        lookup: publicLookup,
        fetchImpl,
        maxRedirects: 3,
      }),
    ).rejects.toThrow("too many redirects");
  });

  it("test 5: direct 200 with a small body returns the right byte count", async () => {
    const body = "NanoVPN";
    const fetchImpl = async (): Promise<Response> => makeBodyResponse(200, body) as Response;

    const result = await fetchPublic("https://example.com/ok", {
      lookup: publicLookup,
      fetchImpl,
    });

    expect(result.status).toBe(200);
    expect(result.bytes).toBe(new TextEncoder().encode(body).byteLength);
  });
});
