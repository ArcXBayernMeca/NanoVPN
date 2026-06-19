import Link from "next/link";

export function SiteNav() {
  return (
    <header className="sitenav">
      <Link href="/" className="sitenav__brand">Nano<b>VPN</b></Link>
      <nav className="sitenav__links">
        <Link href="/">Map</Link>
        <Link href="/agent">Agent</Link>
        <Link href="/developers">Developers</Link>
      </nav>
      <span className="netpill"><span className="dot" /> Arc testnet</span>
    </header>
  );
}
