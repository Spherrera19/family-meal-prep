ALTER TABLE recipes
  ADD COLUMN IF NOT EXISTS fiber_g         numeric(6,1),
  ADD COLUMN IF NOT EXISTS sugar_g         numeric(6,1),
  ADD COLUMN IF NOT EXISTS sodium_mg       integer,
  ADD COLUMN IF NOT EXISTS saturated_fat_g numeric(6,1);
