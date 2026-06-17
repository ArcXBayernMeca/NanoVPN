import { randomBytes } from "node:crypto";
import type { NodeListing } from "@nanovpn/core";

export function newSessionToken(): string {
  return randomBytes(32).toString("hex");
}

export async function registerOnNode(node: NodeListing, body: {
  id: string; token: string; nodeId: string; pricePerGbUsd: number; budgetMicroUsd: number;
}) {
  const base = node.settleUrl.replace(/\/settle.*$/, "");
  const res = await fetch(`${base}/register`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`node register failed: ${res.status}`);
}
