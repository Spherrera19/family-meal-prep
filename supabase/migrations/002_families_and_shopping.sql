-- ── Families ────────────────────────────────────────────────────────────────

create table families (
  id          uuid        default gen_random_uuid() primary key,
  name        text        not null,
  invite_code text        not null unique
                          default upper(substring(replace(gen_random_uuid()::text, '-', ''), 1, 6)),
  created_by  uuid        references auth.users(id) on delete set null,
  created_at  timestamptz default now()
);

-- ── Family members ───────────────────────────────────────────────────────────

create table family_members (
  id        uuid        default gen_random_uuid() primary key,
  family_id uuid        references families(id) on delete cascade not null,
  user_id   uuid        references auth.users(id) on delete cascade not null,
  joined_at timestamptz default now(),
  unique (family_id, user_id)
);

-- ── Shopping items ───────────────────────────────────────────────────────────

create table shopping_items (
  id         uuid        default gen_random_uuid() primary key,
  family_id  uuid        references families(id) on delete cascade not null,
  name       text        not null,
  quantity   text,
  checked    boolean     default false,
  added_by   uuid        references auth.users(id) on delete set null,
  created_at timestamptz default now()
);

-- ── RLS ──────────────────────────────────────────────────────────────────────

alter table families       enable row level security;
alter table family_members enable row level security;
alter table shopping_items enable row level security;

-- families
create policy "Members can view their family"
  on families for select
  using (id in (select family_id from family_members where user_id = auth.uid()));

create policy "Authenticated users can create families"
  on families for insert
  with check (auth.uid() = created_by);

-- family_members
create policy "Members can view their family roster"
  on family_members for select
  using (family_id in (select family_id from family_members where user_id = auth.uid()));

create policy "Users can join a family"
  on family_members for insert
  with check (auth.uid() = user_id);

create policy "Users can leave a family"
  on family_members for delete
  using (auth.uid() = user_id);

-- shopping_items
create policy "Family members can view items"
  on shopping_items for select
  using (family_id in (select family_id from family_members where user_id = auth.uid()));

create policy "Family members can add items"
  on shopping_items for insert
  with check (
    auth.uid() = added_by and
    family_id in (select family_id from family_members where user_id = auth.uid())
  );

create policy "Family members can update items"
  on shopping_items for update
  using (family_id in (select family_id from family_members where user_id = auth.uid()));

create policy "Family members can delete items"
  on shopping_items for delete
  using (family_id in (select family_id from family_members where user_id = auth.uid()));

-- ── RPC: join by invite code (bypasses RLS for the lookup) ───────────────────

create or replace function join_family_by_code(code text)
returns uuid
language plpgsql security definer
as $$
declare
  fam_id uuid;
begin
  select id into fam_id from families where invite_code = upper(trim(code));
  if fam_id is null then
    raise exception 'No family found with that code';
  end if;
  insert into family_members (family_id, user_id)
  values (fam_id, auth.uid())
  on conflict do nothing;
  return fam_id;
end;
$$;

-- ── Realtime ─────────────────────────────────────────────────────────────────

alter publication supabase_realtime add table shopping_items;
