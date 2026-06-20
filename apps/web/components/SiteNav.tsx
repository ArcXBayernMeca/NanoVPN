import Link from "next/link";
import { WalletButton } from "./WalletButton";

export function SiteNav() {
  return (
    <header className="sitenav">
      <Link href="/" className="sitenav__brand">Nano<b>VPN</b></Link>
      <nav className="sitenav__links">
        <Link href="/">Map</Link>
        <Link href="/agent">Agent</Link>
        <Link href="/use-with-agent">Use with agent</Link>
      </nav>
      <div className="sitenav__right">
        <span className="netpill"><span className="dot" /> Arc testnet</span>
        <WalletButton />
      </div>
    </header>
  );
}
