import { NextResponse } from "next/server";
import { generateNonce } from "siwe";

export async function GET() {
  const nonce = generateNonce();
  const res = NextResponse.json({ nonce });
  res.cookies.set("siwe-nonce", nonce, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  });
  return res;
}
