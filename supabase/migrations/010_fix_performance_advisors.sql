-- ============================================================
-- 1. Fix RLS auth.uid() re-evaluation (wrap with SELECT)
-- ============================================================

-- families
DROP POLICY IF EXISTS "Authenticated users can create families" ON public.families;
CREATE POLICY "Authenticated users can create families" ON public.families
  FOR INSERT WITH CHECK ((select auth.uid()) = created_by);

-- family_members
DROP POLICY IF EXISTS "Users can join a family" ON public.family_members;
CREATE POLICY "Users can join a family" ON public.family_members
  FOR INSERT WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can leave a family" ON public.family_members;
CREATE POLICY "Users can leave a family" ON public.family_members
  FOR DELETE USING ((select auth.uid()) = user_id);

-- meal_plans
DROP POLICY IF EXISTS "Users can manage their own meal plans" ON public.meal_plans;
CREATE POLICY "Users can manage their own meal plans" ON public.meal_plans
  FOR ALL
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- shopping_items
DROP POLICY IF EXISTS "Family members can add items" ON public.shopping_items;
CREATE POLICY "Family members can add items" ON public.shopping_items
  FOR INSERT WITH CHECK (
    (select auth.uid()) = added_by
    AND family_id = get_my_family_id()
  );

-- user_profiles
DROP POLICY IF EXISTS "Users can manage own profile" ON public.user_profiles;
CREATE POLICY "Users can manage own profile" ON public.user_profiles
  FOR ALL
  USING (id = (select auth.uid()))
  WITH CHECK (id = (select auth.uid()));

-- weight_logs
DROP POLICY IF EXISTS "Users manage own weight logs" ON public.weight_logs;
CREATE POLICY "Users manage own weight logs" ON public.weight_logs
  FOR ALL
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

-- ============================================================
-- 2. Fix multiple permissive SELECT policies on recipes
--    Merge into one SELECT policy; split ALL into explicit cmds
-- ============================================================

DROP POLICY IF EXISTS "Users can manage their own recipes" ON public.recipes;
DROP POLICY IF EXISTS "Family members can view shared recipes" ON public.recipes;

-- Single unified SELECT (own recipes OR family shared recipes)
CREATE POLICY "Users and family members can view recipes" ON public.recipes
  FOR SELECT USING (
    (select auth.uid()) = user_id
    OR family_id = get_my_family_id()
  );

-- Write operations: own recipes only
CREATE POLICY "Users can insert their own recipes" ON public.recipes
  FOR INSERT WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can update their own recipes" ON public.recipes
  FOR UPDATE
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can delete their own recipes" ON public.recipes
  FOR DELETE USING ((select auth.uid()) = user_id);

-- ============================================================
-- 3. Add missing indexes on foreign key columns
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_families_created_by
  ON public.families (created_by);

CREATE INDEX IF NOT EXISTS idx_family_members_user_id
  ON public.family_members (user_id);

CREATE INDEX IF NOT EXISTS idx_meal_plans_recipe_id
  ON public.meal_plans (recipe_id);

CREATE INDEX IF NOT EXISTS idx_recipes_family_id
  ON public.recipes (family_id);

CREATE INDEX IF NOT EXISTS idx_recipes_user_id
  ON public.recipes (user_id);

CREATE INDEX IF NOT EXISTS idx_shopping_items_added_by
  ON public.shopping_items (added_by);
