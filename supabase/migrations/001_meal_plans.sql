create table meal_plans (
  id         uuid        default gen_random_uuid() primary key,
  user_id    uuid        references auth.users(id) on delete cascade not null,
  date       date        not null,
  meal_type  text        not null check (meal_type in ('breakfast', 'lunch', 'dinner')),
  name       text        not null,
  note       text,
  created_at timestamptz default now()
);

-- One meal per type per day per user
create unique index meal_plans_user_date_type on meal_plans (user_id, date, meal_type);

-- Row-level security
alter table meal_plans enable row level security;

create policy "Users can manage their own meal plans"
  on meal_plans for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);
