create table recipes (
  id           uuid        default gen_random_uuid() primary key,
  user_id      uuid        references auth.users(id) on delete cascade not null,
  family_id    uuid        references families(id) on delete set null,
  title        text        not null,
  description  text,
  source_url   text,
  image_url    text,
  ingredients  jsonb       not null default '[]',
  instructions jsonb       not null default '[]',
  servings     text,
  prep_time    text,
  cook_time    text,
  created_at   timestamptz default now()
);

alter table recipes enable row level security;

create policy "Users can manage their own recipes"
  on recipes for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Family members can view shared recipes"
  on recipes for select
  using (family_id = get_my_family_id());
