import Link from "next/link";
import { WalletButton } from "./WalletButton";
import { NavLinks } from "./NavLinks";

export function SiteNav() {
  return (
    <header className="sitenav">
      <Link href="/" className="sitenav__brand">Nano<b>VPN</b></Link>
      <NavLinks />
      <div className="sitenav__right">
        <span className="netpill"><span className="dot" /> Arc testnet</span>
        <WalletButton />
      </div>
    </header>
  );
}
