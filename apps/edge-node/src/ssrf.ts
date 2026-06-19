import { lookup as dnsLookup } from "node:dns/promises";

export type LookupFn = (host: string) => Promise<string>;

const defaultLookup: LookupFn = async (host) => (await dnsLookup(host)).address;

function isPrivateIpv4(ip: string): boolean {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return true; // reject malformed
  const [a, b] = p;
  if (a === 10) return true;
  if (a === 127) return true;                 // loopback
  if (a === 0) return true;                    // "this network"
  if (a === 169 && b === 254) return true;     // link-local + cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a >= 224) return true;                    // multicast / reserved
  return false;
}

function isPrivateIp(ip: string): boolean {
  if (ip.includes(":")) {
    const low = ip.toLowerCase();
    // loopback ::1, unspecified ::, unique-local fc00::/7, link-local fe80::/10
    return low === "::1" || low === "::" || low.startsWith("fc") || low.startsWith("fd") || low.startsWith("fe8") || low.startsWith("fe9") || low.startsWith("fea") || low.startsWith("feb");
  }
  return isPrivateIpv4(ip);
}

export async function assertPublicUrl(raw: string, lookup: LookupFn = defaultLookup): Promise<URL> {
  let url: URL;
  try { url = new URL(raw); } catch { throw new Error("invalid url"); }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("scheme not allowed");
  const ip = await lookup(url.hostname);
  if (isPrivateIp(ip)) throw new Error("target resolves to a private/reserved address");
  return url;
}
