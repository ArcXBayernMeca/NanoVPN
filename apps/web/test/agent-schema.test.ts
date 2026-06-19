import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const sql = readFileSync(fileURLToPath(new URL("../../../supabase/migrations/0002_agent.sql", import.meta.url)), "utf8");

describe("0002_agent.sql", () => {
  it("creates agent_runs and agent_events", () => {
    expect(sql).toMatch(/create table public\.agent_runs/);
    expect(sql).toMatch(/create table public\.agent_events/);
  });
  it("enables RLS with public read on both", () => {
    expect(sql).toMatch(/alter table public\.agent_runs enable row level security/);
    expect(sql).toMatch(/alter table public\.agent_events enable row level security/);
    expect(sql).toMatch(/public read agent_runs/);
    expect(sql).toMatch(/public read agent_events/);
  });
  it("adds both tables to realtime", () => {
    expect(sql).toMatch(/add table public\.agent_runs/);
    expect(sql).toMatch(/add table public\.agent_events/);
  });
  it("seeds 2 extra nodes for visible selection", () => {
    expect(sql).toMatch(/frankfurt-1/);
    expect(sql).toMatch(/nyc-1/);
  });
});
