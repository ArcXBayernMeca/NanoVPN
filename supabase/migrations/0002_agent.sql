-- Layer 2: autonomous agent runs + per-step events (realtime, public-read).
create table public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  goal text not null,
  budget_micro_usd bigint not null,
  spent_micro_usd bigint not null default 0,
  node_id text references public.nodes(id),
  status text not null default 'running' check (status in ('running','succeeded','failed','budget_exhausted')),
  result text,
  created_at timestamptz not null default now(),
  ended_at timestamptz
);

create table public.agent_events (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.agent_runs(id),
  seq int not null,
  kind text not null check (kind in ('reasoning','tool_call','payment','result','error')),
  content jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index agent_events_run_seq on public.agent_events (run_id, seq);

alter table public.agent_runs enable row level security;
alter table public.agent_events enable row level security;
-- Public read: runs/events contain goal text, reasoning, amounts, tx hashes — no secrets.
create policy "public read agent_runs" on public.agent_runs for select using (true);
create policy "public read agent_events" on public.agent_events for select using (true);
-- Writes happen via the service-role key (bypasses RLS); no insert policies needed.

alter publication supabase_realtime add table public.agent_runs;
alter publication supabase_realtime add table public.agent_events;

-- Seed 2 more nodes (same proxy for the MVP) so the agent's node-selection reasoning is visible.
insert into public.nodes (id, operator_address, country, city, lat, lng, proxy_url, settle_url, price_per_gb_usd, price_per_request_usd)
values
  ('frankfurt-1', '0x0000000000000000000000000000000000000000', 'Germany', 'Frankfurt', 50.1109, 8.6821,
   'http://localhost:8080', 'http://localhost:8080/settle', 2.5, 0.001),
  ('nyc-1', '0x0000000000000000000000000000000000000000', 'United States', 'New York', 40.7128, -74.0060,
   'http://localhost:8080', 'http://localhost:8080/settle', 2.0, 0.0008)
on conflict (id) do nothing;
