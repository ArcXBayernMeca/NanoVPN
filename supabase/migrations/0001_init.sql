create extension if not exists "pgcrypto";

create table public.nodes (
  id text primary key,
  operator_address text not null,
  country text not null, city text not null,
  lat double precision not null, lng double precision not null,
  proxy_url text not null, settle_url text not null,
  price_per_gb_usd double precision not null,
  price_per_request_usd double precision not null,
  created_at timestamptz not null default now()
);

create table public.users (
  address text primary key,
  created_at timestamptz not null default now()
);

create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  user_address text not null,
  node_id text not null references public.nodes(id),
  session_token text not null unique,
  status text not null default 'active' check (status in ('active','paused','stopped')),
  budget_micro_usd bigint not null,
  spent_micro_usd bigint not null default 0,
  settled_micro_usd bigint not null default 0,
  created_at timestamptz not null default now()
);

create table public.settlements (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id),
  settlement_uuid text not null,
  amount_micro_usd bigint not null,
  payer text not null, payee text not null,
  network text not null,
  status text not null default 'received',
  tx_hash text,
  created_at timestamptz not null default now()
);

create table public.usage_snapshots (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id),
  total_bytes bigint not null,
  spent_micro_usd bigint not null,
  created_at timestamptz not null default now()
);

alter table public.nodes enable row level security;
alter table public.sessions enable row level security;
alter table public.settlements enable row level security;
create policy "public read nodes" on public.nodes for select using (true);
create policy "public read sessions" on public.sessions for select using (true);
create policy "public read settlements" on public.settlements for select using (true);
-- writes happen via the service-role key (bypasses RLS); no insert policies needed.

alter publication supabase_realtime add table public.settlements;
alter publication supabase_realtime add table public.sessions;

-- Seed one node for the MVP (update proxy_url/settle_url/operator after deploy + wallet gen).
insert into public.nodes (id, operator_address, country, city, lat, lng, proxy_url, settle_url, price_per_gb_usd, price_per_request_usd)
values ('tokyo-1', '0x0000000000000000000000000000000000000000', 'Japan', 'Tokyo', 35.6762, 139.6503,
        'http://localhost:8888', 'http://localhost:8080/settle', 3.0, 0.001);
