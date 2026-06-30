// Maps each seeded node id to the Fly region its egress machine runs in, so the web and
// agent can pin egress to the right region. Kept in code (not the DB) to avoid a migration;
// the 9 node ids are fixed by the seed migrations.
export const NODE_REGION: Record<string, string> = {
  "tokyo-1": "nrt",
  "frankfurt-1": "fra",
  "nyc-1": "ewr",
  "singapore-1": "sin",
  "mumbai-1": "bom",
  "london-1": "lhr",
  "toronto-1": "yyz",
  "sao-paulo-1": "gru",
  "sydney-1": "syd",
};

// Fly region code → display city, for the honest egress line when routing lands in a region
// other than the one the user picked.
export const FLY_REGION_CITY: Record<string, string> = {
  nrt: "Tokyo",
  fra: "Frankfurt",
  ewr: "New York",
  sin: "Singapore",
  bom: "Mumbai",
  lhr: "London",
  yyz: "Toronto",
  gru: "São Paulo",
  syd: "Sydney",
};
