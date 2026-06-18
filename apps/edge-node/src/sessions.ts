import { Meter } from "./meter";

export interface SessionEntry {
  id: string;
  token: string;
  nodeId: string;
  budgetMicroUsd: number;
  status: "active" | "stopped";
  settling: boolean;
  meter: Meter;
}

export class SessionRegistry {
  private byToken = new Map<string, SessionEntry>();
  private byId = new Map<string, SessionEntry>();

  register(s: { id: string; token: string; nodeId: string; pricePerGbUsd: number; budgetMicroUsd: number }) {
    const entry: SessionEntry = {
      id: s.id, token: s.token, nodeId: s.nodeId, budgetMicroUsd: s.budgetMicroUsd,
      status: "active", settling: false, meter: new Meter(s.pricePerGbUsd),
    };
    this.byToken.set(s.token, entry);
    this.byId.set(s.id, entry);
    return entry;
  }
  getByToken(token: string) { return this.byToken.get(token); }
  getById(id: string) { return this.byId.get(id); }
  addBytes(id: string, n: number) { this.byId.get(id)?.meter.addBytes(n); }
  canProxy(id: string) {
    const e = this.byId.get(id);
    return !!e && e.status === "active" && e.meter.spentMicroUsd < e.budgetMicroUsd;
  }
  stop(id: string) { const e = this.byId.get(id); if (e) e.status = "stopped"; }
  list() { return [...this.byId.values()]; }
}
