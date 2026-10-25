-- 0021 — Durcissement après un test d'intrusion simulé (25 oct. 2026).
-- 1. Droits inutiles retirés : TRUNCATE (vide une table en ignorant les règles par compte), TRIGGER et REFERENCES
--    n'ont rien à faire chez anon et authenticated. L'API web ne les expose pas ; on ferme quand même la porte.
-- 2. Photo de profil : un seul fichier par compte, « <id>/avatar.webp » (avant : n'importe quel nom dans son dossier,
--    donc des milliers d'images de 1 Mo pouvaient remplir le stockage).
-- 3. Limites d'appels par compte (fenêtre fixe) contre l'essai en masse :
--    codes promo (verifier_code et offres_en_cours avec un code) 20 par heure, code de parrainage 10 par heure,
--    code de conseiller 20 par heure, compteurs d'usage 600 par heure (au-delà : ignorés sans erreur).

-- ---------- 1. Droits ----------
do $$
declare t record;
begin
  for t in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm') loop
    execute format('revoke truncate, trigger, references on public.%I from anon, authenticated', t.relname);
  end loop;
end $$;

-- ---------- 2. Photo de profil ----------
drop policy if exists "avatars : ajout de sa photo" on storage.objects;
drop policy if exists "avatars : remplacement de sa photo" on storage.objects;
create policy "avatars : ajout de sa photo" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and name = (select auth.uid())::text || '/avatar.webp');
create policy "avatars : remplacement de sa photo" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'avatars' and name = (select auth.uid())::text || '/avatar.webp');

-- ---------- 3. Limites d'appels ----------
create table if not exists public.limites_appels (
  user_id uuid not null references auth.users (id) on delete cascade,
  action text not null check (char_length(action) <= 40),
  debut timestamptz not null default now(),
  nombre integer not null default 0,
  primary key (user_id, action)
);
alter table public.limites_appels enable row level security;
revoke all on public.limites_appels from anon, authenticated;

-- Vrai si l'appel est permis (et compté) ; faux au-delà de p_max appels dans la fenêtre. Sans compte : faux.
create or replace function public.limiter_appels(p_action text, p_max integer, p_fenetre interval)
returns boolean language plpgsql security definer set search_path = '' as $$
declare uid uuid := (select auth.uid()); n integer;
begin
  if uid is null then return false; end if;
  insert into public.limites_appels as l (user_id, action, debut, nombre) values (uid, p_action, now(), 1)
  on conflict (user_id, action) do update set
    debut = case when l.debut < now() - p_fenetre then now() else l.debut end,
    nombre = case when l.debut < now() - p_fenetre then 1 else l.nombre + 1 end
  returning nombre into n;
  return n <= p_max;
end;
$$;
revoke all on function public.limiter_appels(text, integer, interval) from public, anon, authenticated;

create or replace function public.verifier_code(p_code text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  c public.codes_promo;
  code_norm text := upper(btrim(coalesce(p_code, '')));
begin
  if (select auth.uid()) is null then raise exception 'Non authentifié' using errcode = '42501'; end if;
  if not public.limiter_appels('code_promo', 20, interval '1 hour') then
    return jsonb_build_object('valide', false, 'message', 'Trop d''essais de code : réessayez dans une heure.');
  end if;
  select * into c from public.codes_promo where code = code_norm and not automatique;
  if not found or not c.actif or c.debut > now() then return jsonb_build_object('valide', false, 'message', 'Ce code n''existe pas.'); end if;
  if c.fin is not null and c.fin <= now() then return jsonb_build_object('valide', false, 'message', 'Ce code a expiré.'); end if;
  if c.max_utilisations is not null and c.utilisations >= c.max_utilisations then return jsonb_build_object('valide', false, 'message', 'Ce code a atteint son nombre maximal d''utilisations.'); end if;
  return jsonb_build_object('valide', true, 'code', c.code, 'remise_pct', c.remise_pct, 'libelle', c.libelle, 'formules', c.formules, 'fin', c.fin);
end;
$$;

-- Les prix affichés avec un code révèlent s'il est valide : même limite que verifier_code (au-delà, prix sans le code).
create or replace function public.offres_en_cours(p_code text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare code text := case when (select auth.uid()) is null then null else nullif(btrim(coalesce(p_code, '')), '') end;
begin
  if code is not null and not public.limiter_appels('code_promo', 20, interval '1 hour') then code := null; end if;
  return (select coalesce(jsonb_agg(public.prix_formule(f.cle, code) order by f.ordre), '[]'::jsonb) from public.formules f where f.actif);
end;
$$;

create or replace function public.utiliser_code_parrain(p_code text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  p uuid;
  u auth.users;
begin
  if uid is null then raise exception 'Non authentifié' using errcode = '42501'; end if;
  if not public.limiter_appels('code_parrain', 10, interval '1 hour') then
    return jsonb_build_object('ok', false, 'message', 'Trop d''essais : réessayez dans une heure.');
  end if;
  select user_id into p from public.parrains where code = upper(btrim(coalesce(p_code, '')));
  if p is null then return jsonb_build_object('ok', false, 'message', 'Ce code de parrainage n''existe pas.'); end if;
  if p = uid then return jsonb_build_object('ok', false, 'message', 'Vous ne pouvez pas utiliser votre propre code.'); end if;
  if exists (select 1 from public.parrainages where filleul = uid) then return jsonb_build_object('ok', false, 'message', 'Un code de parrainage est déjà enregistré sur votre compte.'); end if;
  select * into u from auth.users where id = uid;
  if u.created_at <= now() - interval '14 days' or exists (select 1 from public.paiements where user_id = uid and statut = 'paye') then
    return jsonb_build_object('ok', false, 'message', 'Le parrainage est réservé aux nouveaux comptes, avant leur premier abonnement.');
  end if;
  insert into public.parrainages (filleul, parrain) values (uid, p);
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.partage_conseiller_voir(p_code text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r jsonb;
begin
  if (select auth.uid()) is null then raise exception 'Connexion requise' using errcode = '42501'; end if;
  if not public.limiter_appels('code_conseiller', 20, interval '1 hour') then
    raise exception 'Trop d''essais : réessayez dans une heure' using errcode = 'P0001';
  end if;
  select jsonb_build_object('nom', c.nom, 'expire_le', i.expire_le) into r
  from public.conseiller_invitations i join public.conseillers c on c.user_id = i.conseiller_id
  where i.code = upper(trim(p_code)) and i.utilisee_par is null and i.expire_le > now() and i.conseiller_id <> (select auth.uid());
  if r is null then raise exception 'Code inconnu, déjà utilisé ou expiré' using errcode = 'P0002'; end if;
  return r;
end;
$$;

create or replace function public.compter_usage(p_type text, p_cle text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null then return; end if;
  if not (
    (p_type = 'vue' and p_cle in ('orbite', 'profil', 'salaire', 'epargne', 'credit', 'simulations', 'abonnement', 'compte', 'admin', 'vie', 'foyer', 'assistant'))
    or (p_type = 'simulation' and p_cle in ('salaire', 'epargne', 'credit', 'vie', 'fiscal', 'foyer', 'assistant'))
  ) then return; end if;
  if not public.limiter_appels('compter_usage', 600, interval '1 hour') then return; end if;
  insert into public.statistiques (jour, type, cle, nombre) values (current_date, p_type, p_cle, 1)
  on conflict (jour, type, cle) do update set nombre = public.statistiques.nombre + 1;
end;
$$;
