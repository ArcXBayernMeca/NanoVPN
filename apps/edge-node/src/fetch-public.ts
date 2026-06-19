import { assertPublicUrl, type LookupFn } from "./ssrf";

export async function fetchPublic(
  rawUrl: string,
  opts?: {
    lookup?: LookupFn;
    fetchImpl?: typeof fetch;
    maxRedirects?: number; // default 3
    maxBytes?: number;     // default 8_000_000
  },
): Promise<{ status: number; bytes: number }> {
  const maxRedirects = opts?.maxRedirects ?? 3;
  const maxBytes = opts?.maxBytes ?? 8_000_000;
  const fetchImpl = opts?.fetchImpl ?? fetch;
  const lookup = opts?.lookup;

  let current = rawUrl;
  let hopsLeft = maxRedirects;

  // Validate the initial URL before any request
  await assertPublicUrl(current, lookup);

  while (true) {
    const response = await fetchImpl(current, { redirect: "manual" });

    const status = response.status;

    // Check for redirect (3xx with Location header)
    if (status >= 300 && status < 400) {
      const location = response.headers.get("location");
      if (location) {
        if (hopsLeft <= 0) {
          throw new Error("too many redirects");
        }
        hopsLeft--;
        // Resolve relative Location against the current URL
        const next = new URL(location, current).href;
        // Validate the redirect target before following it (C1 fix)
        await assertPublicUrl(next, lookup);
        current = next;
        continue;
      }
    }

    // Non-redirect: stream the body, counting bytes, enforcing the size cap.
    let bytes = 0;
    if (response.body) {
      const reader = response.body.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) {
            bytes += value.byteLength;
            if (bytes > maxBytes) {
              reader.cancel().catch(() => {});
              throw new Error("response too large");
            }
          }
        }
      } catch (e) {
        reader.cancel().catch(() => {});
        throw e;
      }
    }

    return { status, bytes };
  }
}
