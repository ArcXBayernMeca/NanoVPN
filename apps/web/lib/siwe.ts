import { SiweMessage } from "siwe";
import { ARC } from "@nanovpn/core";

export function buildSiweMessage(p: {
  address: string;
  nonce: string;
  domain: string;
  uri: string;
}): string {
  return new SiweMessage({
    domain: p.domain,
    address: p.address,
    statement: "Sign in to NanoVPN.",
    uri: p.uri,
    version: "1",
    chainId: ARC.chainId,
    nonce: p.nonce,
  }).prepareMessage();
}

export async function verifySiwe(
  message: string,
  signature: string,
  expectedNonce: string,
  expectedDomain?: string
) {
  try {
    const siwe = new SiweMessage(message);
    const { data } = await siwe.verify({ signature, nonce: expectedNonce, domain: expectedDomain });
    return { success: true as const, address: data.address as string };
  } catch {
    return { success: false as const, address: undefined };
  }
}
