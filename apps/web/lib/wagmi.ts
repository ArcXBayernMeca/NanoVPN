import { createConfig, http } from "wagmi";
import { arcTestnet } from "viem/chains";
import { injected } from "wagmi/connectors";

export const config = createConfig({
  chains: [arcTestnet],
  connectors: [injected()],
  transports: { [arcTestnet.id]: http("https://rpc.testnet.arc.network") },
});
