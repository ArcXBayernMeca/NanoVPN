-- supabase/migrations/0005_funding_status.sql
-- Atomic funding claim: 'unfunded' -> 'funding' -> 'funded'. Sponsor-cap hardening.
alter table user_wallets add column if not exists funding_status text not null default 'unfunded';
update user_wallets set funding_status = 'funded' where funded_micro_usd > 0;
