-- 0016 — Double authentification (TOTP, Supabase MFA), exigée côté serveur.
-- Un compte qui a validé un facteur ne lit ni n'écrit ses données qu'avec une session « aal2 »
-- (mot de passe + code à 6 chiffres). Les comptes sans double authentification ne changent pas.

create or replace function public.mfa_ok()
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select coalesce((select auth.jwt()) ->> 'aal', 'aal1') = 'aal2'
      or not exists (
        select 1 from auth.mfa_factors f
        where f.user_id = (select auth.uid()) and f.status = 'verified'
      );
$$;
revoke all on function public.mfa_ok() from public, anon;
grant execute on function public.mfa_ok() to authenticated;

-- Politiques restrictives : elles s'ajoutent (ET) aux politiques existantes de chaque table.
do $$
declare t text;
begin
  foreach t in array array['abonnements', 'consentements', 'objectifs', 'objectifs_versements', 'paiements',
                           'profils', 'rappels_email', 'rappels_envoyes', 'simulations'] loop
    execute format('drop policy if exists "mfa_aal2" on public.%I', t);
    execute format('create policy "mfa_aal2" on public.%I as restrictive for all to authenticated using (public.mfa_ok()) with check (public.mfa_ok())', t);
  end loop;
end $$;

-- Fonctions sensibles appelées par le compte : administration (toutes passent par exiger_admin),
-- suppression du compte, partage avec l'administrateur.
create or replace function public.exiger_admin()
returns void
language plpgsql
stable
security definer
set search_path to ''
as $function$
begin
  if not exists (select 1 from public.admins where user_id = (select auth.uid())) then
    raise exception 'Réservé à l''administrateur' using errcode = '42501';
  end if;
  if not public.mfa_ok() then
    raise exception 'Double authentification requise' using errcode = '42501';
  end if;
end;
$function$;

create or replace function public.supprimer_mon_compte()
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare uid uuid := (select auth.uid());
begin
  if uid is null then
    raise exception 'Non authentifié' using errcode = '42501';
  end if;
  if not public.mfa_ok() then
    raise exception 'Double authentification requise' using errcode = '42501';
  end if;
  delete from auth.users where id = uid;  -- cascade : profil et simulations
end;
$function$;

create or replace function public.partage_admin_definir(p_accord boolean)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if (select auth.uid()) is null then raise exception 'Connexion requise' using errcode = '42501'; end if;
  if not public.mfa_ok() then raise exception 'Double authentification requise' using errcode = '42501'; end if;
  if coalesce(p_accord, false) then
    insert into public.partage_admin (user_id) values ((select auth.uid())) on conflict (user_id) do nothing;
  else
    delete from public.partage_admin where user_id = (select auth.uid());
  end if;
  return public.partage_admin_etat();
end;
$function$;
