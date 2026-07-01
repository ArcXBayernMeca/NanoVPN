// apps/web/app/api/self-fund/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getOrCreateUserWallet, loadSigningKey, addFunding } from "@/lib/user-wallet";
import { depositOwnBalance } from "@/lib/self-fund";
import { gatewayAvailableMicroUsd } from "@/lib/gateway-balance";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const address = req.cookies.get("siwe-address")?.value;
  if (!address) return NextResponse.json({ error: "not signed in" }, { status: 401 });
  const userId = address.toLowerCase();
  try {
    const wallet = await getOrCreateUserWallet(userId); // ensure the row/EOA exists
    const key = await loadSigningKey(userId);

    let deposited: number;
    try {
      deposited = await depositOwnBalance(key);
    } catch {
      // The deposit did not confirm on-chain — the user's USDC is still in their EOA. Credit nothing.
      return NextResponse.json({ error: "deposit didn't go through — your USDC is safe in your wallet, try again" }, { status: 400 });
    }
    if (deposited <= 0) {
      return NextResponse.json({ error: "no USDC received — transfer to your spending wallet first" }, { status: 400 });
    }

    const fundedMicroUsd = await addFunding(userId, deposited, "metamask");
    const gatewayMicroUsd = await gatewayAvailableMicroUsd(wallet.eoaAddress);
    return NextResponse.json({ depositedMicroUsd: deposited, fundedMicroUsd, gatewayMicroUsd });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
