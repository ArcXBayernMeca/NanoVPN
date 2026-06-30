// apps/web/app/api/self-fund/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getOrCreateUserWallet, loadSigningKey, addFunding } from "@/lib/user-wallet";
import { depositOwnBalance } from "@/lib/self-fund";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const address = req.cookies.get("siwe-address")?.value;
  if (!address) return NextResponse.json({ error: "not signed in" }, { status: 401 });
  const userId = address.toLowerCase();
  try {
    await getOrCreateUserWallet(userId); // ensure the row/EOA exists
    const key = await loadSigningKey(userId);
    const deposited = await depositOwnBalance(key);
    if (deposited === 0) {
      return NextResponse.json({ error: "no USDC received — transfer to your spending wallet first" }, { status: 400 });
    }
    const fundedMicroUsd = await addFunding(userId, deposited, "metamask");
    return NextResponse.json({ depositedMicroUsd: deposited, fundedMicroUsd });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
