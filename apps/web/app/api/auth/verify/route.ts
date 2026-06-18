import { NextRequest, NextResponse } from "next/server";
import { verifySiwe } from "@/lib/siwe";

export async function POST(req: NextRequest) {
  const { message, signature } = (await req.json()) as {
    message: string;
    signature: string;
  };
  const nonce = req.cookies.get("siwe-nonce")?.value ?? "";
  const host = req.headers.get("host") ?? undefined;
  const result = await verifySiwe(message, signature, nonce, host);
  if (!result.success) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }
  const res = NextResponse.json({ address: result.address });
  res.cookies.set("siwe-address", result.address!, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  });
  return res;
}
