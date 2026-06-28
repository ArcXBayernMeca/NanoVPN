-- supabase/migrations/0004_user_wallets.sql
-- Per-user server-custodied spending EOA (encrypted key at rest). Service-role only.
create table if not exists user_wallets (
  user_id               text primary key,                  -- siwe address (lowercased) or passkey id
  identity_type         text not null default 'siwe',      -- 'siwe' | 'passkey'
  eoa_address           text not null unique,
  encrypted_private_key text not null,                      -- "<ivHex>:<tagHex>:<ctHex>" (AES-256-GCM)
  funding_source        text not null default 'sponsored', -- 'sponsored' | 'metamask'
  funded_micro_usd      bigint not null default 0,
  spent_micro_usd       bigint not null default 0,
  created_at            timestamptz not null default now()
);

alter table user_wallets enable row level security;
-- Intentionally NO policies: only the service role (which bypasses RLS) may read/write.
-- Intentionally NOT added to the realtime publication (no client subscriptions).
