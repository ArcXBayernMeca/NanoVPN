import "server-only";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { encryptSecret, decryptSecret } from "@nanovpn/core";
import { supabaseService } from "@/lib/supabase-server";
import { fundSponsored } from "@/lib/funding";

function masterKey(): string {
  const k = process.env.WALLET_ENCRYPTION_KEY;
  if (!k) throw new Error("WALLET_ENCRYPTION_KEY not configured");
  return k;
}

export interface UserWallet {
  userId: string;
  eoaAddress: `0x${string}`;
  fundedMicroUsd: number;
  fundingStatus: string;
}

/** Look up the user's spending wallet, creating + encrypting one on first call. */
export async function getOrCreateUserWallet(userId: string): Promise<UserWallet> {
  userId = userId.toLowerCase();
  const db = supabaseService();
  const { data: existing, error: lookupError } = await db
    .from("user_wallets")
    .select("user_id,eoa_address,funded_micro_usd,funding_status")
    .eq("user_id", userId)
    .maybeSingle();
  if (lookupError) throw new Error(`wallet lookup failed: ${lookupError.message}`);
  if (existing) {
    return {
      userId: existing.user_id,
      eoaAddress: existing.eoa_address as `0x${string}`,
      fundedMicroUsd: Number(existing.funded_micro_usd),
      fundingStatus: existing.funding_status as string,
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
  return { userId, eoaAddress: account.address, fundedMicroUsd: 0, fundingStatus: "unfunded" };
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

const MAX_SPONSORED_WALLETS = () => Number(process.env.MAX_SPONSORED_WALLETS) || 100;

export interface ProvisionResult {
  eoaAddress: `0x${string}`;
  fundedMicroUsd: number;
  status: "funded" | "capped" | "pending";
}

/**
 * Provision + sponsor-fund a wallet, exactly once, under a global cap.
 * Atomic claim (unfunded -> funding) means only one caller funds; losers poll.
 */
export async function ensureProvisionedAndFunded(userId: string): Promise<ProvisionResult> {
  userId = userId.toLowerCase();
  const db = supabaseService();
  const wallet = await getOrCreateUserWallet(userId);
  if (wallet.fundingStatus === "funded") {
    return { eoaAddress: wallet.eoaAddress, fundedMicroUsd: wallet.fundedMicroUsd, status: "funded" };
  }

  // Atomic claim: only the row still 'unfunded' flips to 'funding', and only one caller wins it.
  const { data: claimed } = await db
    .from("user_wallets")
    .update({ funding_status: "funding" })
    .eq("user_id", userId)
    .eq("funding_status", "unfunded")
    .select("user_id");

  if (claimed && claimed.length > 0) {
    // Cap check (soft ceiling).
    const { count } = await db
      .from("user_wallets")
      .select("user_id", { count: "exact", head: true })
      .eq("funding_status", "funded");
    if ((count ?? 0) >= MAX_SPONSORED_WALLETS()) {
      await db.from("user_wallets").update({ funding_status: "unfunded" }).eq("user_id", userId);
      return { eoaAddress: wallet.eoaAddress, fundedMicroUsd: 0, status: "capped" };
    }
    try {
      const key = await loadSigningKey(userId);
      const granted = await fundSponsored(key);
      await db.from("user_wallets").update({ funding_status: "funded", funded_micro_usd: granted }).eq("user_id", userId);
      return { eoaAddress: wallet.eoaAddress, fundedMicroUsd: granted, status: "funded" };
    } catch (e) {
      // Release the claim so a later attempt can retry; don't leave a stuck 'funding' row.
      await db.from("user_wallets").update({ funding_status: "unfunded" }).eq("user_id", userId);
      throw e;
    }
  }

  // Lost the claim — another caller is funding (or just finished). Poll briefly.
  for (let i = 0; i < 10; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    const w = await getOrCreateUserWallet(userId);
    if (w.fundingStatus === "funded") return { eoaAddress: w.eoaAddress, fundedMicroUsd: w.fundedMicroUsd, status: "funded" };
    if (w.fundingStatus === "unfunded") return { eoaAddress: w.eoaAddress, fundedMicroUsd: 0, status: "capped" };
  }
  return { eoaAddress: wallet.eoaAddress, fundedMicroUsd: 0, status: "pending" };
}

/** Add to the user's funded balance (e.g. a MetaMask self-fund deposit). Increments, sets status/source. */
export async function addFunding(userId: string, microUsd: number, source: string): Promise<number> {
  userId = userId.toLowerCase();
  const db = supabaseService();
  const { data, error: readErr } = await db
    .from("user_wallets").select("funded_micro_usd").eq("user_id", userId).maybeSingle();
  if (readErr) throw new Error(`add funding read failed: ${readErr.message}`);
  const newTotal = Number(data?.funded_micro_usd ?? 0) + microUsd;
  const { error } = await db
    .from("user_wallets")
    .update({ funded_micro_usd: newTotal, funding_status: "funded", funding_source: source })
    .eq("user_id", userId);
  if (error) throw new Error(`add funding failed: ${error.message}`);
  return newTotal;
}
