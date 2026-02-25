-- Add nutrition columns to recipes
ALTER TABLE recipes
  ADD COLUMN calories   integer,
  ADD COLUMN protein_g  integer,
  ADD COLUMN carbs_g    integer,
  ADD COLUMN fat_g      integer;

-- User profiles table for daily macro goals
CREATE TABLE user_profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  daily_calories  integer not null default 2000,
  daily_protein_g integer not null default 150,
  daily_carbs_g   integer not null default 250,
  daily_fat_g     integer not null default 65,
  updated_at      timestamptz default now()
);

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own profile"
  ON user_profiles FOR ALL
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());
