-- supabase/migrations/0003_more_nodes.sql
-- UX overhaul v2: more nodes with DIFFERENTIATED prices so "cheapest" is a real choice.
-- Same proxy host for the MVP (egress IP identical until multi-region deploy).
insert into public.nodes (id, operator_address, country, city, lat, lng, proxy_url, settle_url, price_per_gb_usd, price_per_request_usd)
values
  ('singapore-1', '0x0000000000000000000000000000000000000000', 'Singapore', 'Singapore', 1.3521, 103.8198,
   'http://localhost:8080', 'http://localhost:8080/settle', 2.0, 0.0012),
  ('mumbai-1', '0x0000000000000000000000000000000000000000', 'India', 'Mumbai', 19.0760, 72.8777,
   'http://localhost:8080', 'http://localhost:8080/settle', 1.4, 0.0007),
  ('london-1', '0x0000000000000000000000000000000000000000', 'United Kingdom', 'London', 51.5072, -0.1276,
   'http://localhost:8080', 'http://localhost:8080/settle', 2.2, 0.0013),
  ('toronto-1', '0x0000000000000000000000000000000000000000', 'Canada', 'Toronto', 43.6532, -79.3832,
   'http://localhost:8080', 'http://localhost:8080/settle', 2.0, 0.0011),
  ('sao-paulo-1', '0x0000000000000000000000000000000000000000', 'Brazil', 'São Paulo', -23.5505, -46.6333,
   'http://localhost:8080', 'http://localhost:8080/settle', 1.6, 0.0009),
  ('sydney-1', '0x0000000000000000000000000000000000000000', 'Australia', 'Sydney', -33.8688, 151.2093,
   'http://localhost:8080', 'http://localhost:8080/settle', 2.6, 0.0015)
on conflict (id) do nothing;
