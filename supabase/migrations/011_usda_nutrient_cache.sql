-- 011_usda_nutrient_cache.sql
create table usda_nutrient_cache (
  id            uuid primary key default gen_random_uuid(),
  query         text not null unique,           -- normalized ingredient string
  calories_per_100g numeric(8,2),
  protein_g_per_100g numeric(8,2),
  carbs_g_per_100g   numeric(8,2),
  fat_g_per_100g     numeric(8,2),
  fiber_g_per_100g   numeric(8,2),
  sugar_g_per_100g   numeric(8,2),
  sodium_mg_per_100g numeric(8,2),
  saturated_fat_g_per_100g numeric(8,2),
  fetched_at    timestamptz default now(),
  expires_at    timestamptz default now() + interval '90 days'
);

-- Index for lookup by query string
create index idx_usda_nutrient_cache_query on usda_nutrient_cache(query);

-- Service role only (edge function uses service_role key)
alter table usda_nutrient_cache enable row level security;
-- No public access — edge function accesses via service_role key
