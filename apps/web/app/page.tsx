"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { MapBackdrop } from "@/components/MapBackdrop";
import { useLocation } from "@/lib/location";

export default function LandingPage() {
  const router = useRouter();
  const { request } = useLocation();
  const [busy, setBusy] = useState(false);

  async function start() {
    if (busy) return;
    setBusy(true);
    // Acquire location, but never let a stuck prompt block navigation (~6s cap).
    const cap = new Promise<void>((resolve) => setTimeout(resolve, 6000));
    await Promise.race([request().then(() => undefined), cap]);
    router.push("/map");
  }

  return (
    <main className="landing">
      <div className="landing__bg"><MapBackdrop /></div>
      <section className="landing__hero">
        <h1 className="landing__title">Nano<b>VPN</b></h1>
        <p className="landing__tag">The only pay-per-use VPN. Settled in USDC, on Arc.</p>
        <button className="btn btn--primary landing__cta" onClick={start} disabled={busy}>
          {busy ? "Locating…" : "Start using"}
        </button>
      </section>
    </main>
  );
}
