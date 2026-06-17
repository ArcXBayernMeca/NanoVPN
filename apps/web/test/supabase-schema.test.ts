import { describe, it, expect } from "vitest";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const run = url && key ? describe : describe.skip; // skip in CI without creds

run("supabase schema", () => {
  it("has the seed node", async () => {
    // createClient is inside the test so it only runs when creds are present
    const db = createClient(url!, key!, { auth: { persistSession: false } });
    const { data, error } = await db
      .from("nodes")
      .select("id,city")
      .eq("id", "tokyo-1")
      .single();
    expect(error).toBeNull();
    expect(data?.city).toBe("Tokyo");
  });
});
