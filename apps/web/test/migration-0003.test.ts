import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const sql = readFileSync(resolve(__dirname, "../../../supabase/migrations/0003_more_nodes.sql"), "utf8");

describe("0003_more_nodes.sql", () => {
  const ids = ["singapore-1", "mumbai-1", "london-1", "toronto-1", "sao-paulo-1", "sydney-1"];
  it("inserts the 6 new nodes", () => { for (const id of ids) expect(sql).toContain(`'${id}'`); });
  it("is idempotent (on conflict do nothing)", () => { expect(sql.toLowerCase()).toContain("on conflict (id) do nothing"); });
  it("uses the MVP single proxy host", () => { expect(sql).toContain("http://localhost:8080"); });
});
