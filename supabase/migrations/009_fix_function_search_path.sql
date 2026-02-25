-- Fix mutable search_path security warning on SECURITY DEFINER functions.
-- All table references updated to fully-qualified public.* names.

CREATE OR REPLACE FUNCTION public.create_family(family_name text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
  declare
    new_family public.families;
  begin
    insert into public.families (name, created_by)
    values (family_name, auth.uid())
    returning * into new_family;

    insert into public.family_members (family_id, user_id)
    values (new_family.id, auth.uid());

    return json_build_object(
      'id',          new_family.id,
      'name',        new_family.name,
      'invite_code', new_family.invite_code
    );
  end;
$$;

CREATE OR REPLACE FUNCTION public.get_my_family_id()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
    select family_id from public.family_members where user_id = auth.uid() limit 1;
$$;

CREATE OR REPLACE FUNCTION public.join_family_by_code(code text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
  declare
    fam_id uuid;
  begin
    select id into fam_id from public.families where invite_code = upper(trim(code));
    if fam_id is null then
      raise exception 'No family found with that code';
    end if;
    insert into public.family_members (family_id, user_id)
    values (fam_id, auth.uid())
    on conflict do nothing;
    return fam_id;
  end;
$$;
