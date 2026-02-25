-- Link meal plan entries to recipes so we can look up their nutrition data
ALTER TABLE meal_plans
  ADD COLUMN recipe_id uuid references recipes(id) on delete set null;
