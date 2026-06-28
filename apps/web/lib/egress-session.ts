import "server-only";
import { supabaseService } from "@/lib/supabase-server";
import { newSessionToken } from "@/lib/session";

/** A scoping row for the human fetch tape. No node registration (we use /egress, not the CONNECT proxy). */
export async function getOrCreateEgressSession(userId: string, nodeId: string, sessionId?: string): Promise<string> {
  const db = supabaseService();
  if (sessionId) {
    const { data } = await db.from("sessions").select("id").eq("id", sessionId).eq("user_address", userId).maybeSingle();
    if (data) return data.id;
  }
  const { data, error } = await db.from("sessions")
    .insert({ user_address: userId, node_id: nodeId, session_token: newSessionToken(), status: "active", budget_micro_usd: 0 })
    .select("id").single();
  if (error || !data) throw new Error(`session create failed: ${error?.message}`);
  return data.id;
}
