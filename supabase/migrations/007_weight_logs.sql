CREATE TABLE weight_logs (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  date       date not null,
  weight     numeric(5,1) not null,
  unit       text not null default 'lbs',
  created_at timestamptz default now(),
  UNIQUE (user_id, date)
);
ALTER TABLE weight_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own weight logs"
  ON weight_logs FOR ALL
  USING  (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Extend user_profiles for unit preference (idempotent)
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS weight_unit text not null default 'lbs';
