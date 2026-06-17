import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

function make(label: string) {
  const pk = generatePrivateKey();
  const account = privateKeyToAccount(pk);
  return { label, pk, address: account.address };
}

const buyer = make("BUYER");
const seller = make("SELLER");

console.log("# Add these to .env (NEVER commit). Then fund both on Arc testnet.");
console.log(`BUYER_PRIVATE_KEY=${buyer.pk}`);
console.log(`SELLER_PRIVATE_KEY=${seller.pk}`);
console.log(`SELLER_ADDRESS=${seller.address}`);
console.log(`# BUYER_ADDRESS (fund this at https://faucet.circle.com): ${buyer.address}`);
console.log(`# Then: circle gateway deposit --testnet   (deposit buyer USDC into the Gateway balance)`);
