import "server-only";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { encryptSecret, decryptSecret } from "@nanovpn/core";
import { supabaseService } from "@/lib/supabase-server";

function masterKey(): string {
  const k = process.env.WALLET_ENCRYPTION_KEY;
  if (!k) throw new Error("WALLET_ENCRYPTION_KEY not configured");
  return k;
}

export interface UserWallet {
  userId: string;
  eoaAddress: `0x${string}`;
  fundedMicroUsd: number;
}

/** Look up the user's spending wallet, creating + encrypting one on first call. */
export async function getOrCreateUserWallet(userId: string): Promise<UserWallet> {
  userId = userId.toLowerCase();
  const db = supabaseService();
  const { data: existing, error: lookupError } = await db
    .from("user_wallets")
    .select("user_id,eoa_address,funded_micro_usd")
    .eq("user_id", userId)
    .maybeSingle();
  if (lookupError) throw new Error(`wallet lookup failed: ${lookupError.message}`);
  if (existing) {
    return {
      userId: existing.user_id,
      eoaAddress: existing.eoa_address as `0x${string}`,
      fundedMicroUsd: Number(existing.funded_micro_usd),
    };
  }
  const pk = generatePrivateKey();
  const account = privateKeyToAccount(pk);
  const { error } = await db.from("user_wallets").insert({
    user_id: userId,
    identity_type: "siwe",
    eoa_address: account.address,
    encrypted_private_key: encryptSecret(pk, masterKey()),
    funding_source: "sponsored",
    funded_micro_usd: 0,
    spent_micro_usd: 0,
  });
  if (error) throw new Error(`wallet provision failed: ${error.message}`);
  return { userId, eoaAddress: account.address, fundedMicroUsd: 0 };
}

/** Decrypt and return the user's spending-EOA private key. Server-only. */
export async function loadSigningKey(userId: string): Promise<`0x${string}`> {
  userId = userId.toLowerCase();
  const db = supabaseService();
  const { data, error } = await db
    .from("user_wallets")
    .select("encrypted_private_key")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(`wallet lookup failed: ${error.message}`);
  if (!data) throw new Error("no wallet for user");
  return decryptSecret(data.encrypted_private_key, masterKey()) as `0x${string}`;
}

/** SETS (overwrites) funded_micro_usd — not an increment. Called once per wallet in the fund-once flow; a future refill path must NOT reuse this blindly. */
export async function markFunded(userId: string, microUsd: number): Promise<void> {
  userId = userId.toLowerCase();
  const db = supabaseService();
  const { error } = await db
    .from("user_wallets")
    .update({ funded_micro_usd: microUsd })
    .eq("user_id", userId);
  if (error) throw new Error(`mark funded failed: ${error.message}`);
}
