import { describe, it, expect, vi, beforeEach } from "vitest";

// ── in-memory sessions store ──────────────────────────────────────────────────
const sessions: Array<Record<string, any>> = [];
let nextId = 1;

const fakeDb = {
  from: (_t: string) => ({
    select: (_cols: string) => ({
      eq: (col1: string, val1: string) => ({
        eq: (col2: string, val2: string) => ({
          maybeSingle: async () => {
            const row = sessions.find(
              (r) => r[col1] === val1 && r[col2] === val2,
            );
            return { data: row ? { id: row.id } : null, error: null };
          },
        }),
      }),
    }),
    insert: (row: Record<string, any>) => ({
      select: (_c: string) => ({
        single: async () => {
          const id = `sess-${nextId++}`;
          sessions.push({ ...row, id });
          return { data: { id }, error: null };
        },
      }),
    }),
  }),
};

vi.mock("@/lib/supabase-server", () => ({ supabaseService: () => fakeDb }));

// Mock session.ts so newSessionToken is deterministic but non-empty
vi.mock("@/lib/session", () => ({ newSessionToken: () => "tok-abc123" }));

import { getOrCreateEgressSession } from "../lib/egress-session";

beforeEach(() => {
  sessions.length = 0;
  nextId = 1;
});

describe("getOrCreateEgressSession", () => {
  it("(a) new call with no sessionId inserts a row with session_token and status:active, returns new id", async () => {
    const id = await getOrCreateEgressSession("0xuser", "tokyo-1");
    expect(id).toBe("sess-1");
    const row = sessions.find((r) => r.id === "sess-1");
    expect(row).toBeDefined();
    expect(row!.session_token).toBe("tok-abc123");
    expect(row!.status).toBe("active");
    expect(row!.user_address).toBe("0xuser");
    expect(row!.node_id).toBe("tokyo-1");
    // Only one row inserted
    expect(sessions).toHaveLength(1);
  });

  it("(b) passing an existing owned sessionId returns it WITHOUT a new insert", async () => {
    // Pre-populate an owned session
    sessions.push({ id: "existing-1", user_address: "0xuser", node_id: "tokyo-1", session_token: "tok-old", status: "active" });

    const id = await getOrCreateEgressSession("0xuser", "tokyo-1", "existing-1");
    expect(id).toBe("existing-1");
    // No new rows inserted
    expect(sessions).toHaveLength(1);
  });

  it("(c) passing a sessionId owned by a DIFFERENT user falls through to a new insert", async () => {
    // Pre-populate a session owned by a different user
    sessions.push({ id: "other-1", user_address: "0xother", node_id: "tokyo-1", session_token: "tok-old", status: "active" });

    const id = await getOrCreateEgressSession("0xuser", "tokyo-1", "other-1");
    // Should NOT return other user's session — must create a new one
    expect(id).not.toBe("other-1");
    expect(id).toBe("sess-1");
    // A new row was inserted for the correct user
    const newRow = sessions.find((r) => r.id === "sess-1");
    expect(newRow!.user_address).toBe("0xuser");
    expect(newRow!.session_token).toBe("tok-abc123");
  });
});
