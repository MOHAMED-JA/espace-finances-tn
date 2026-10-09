-- Orbite : fiches individuelles visibles par l'administrateur, UNIQUEMENT avec l'accord explicite de l'utilisateur.
-- Principes :
--   * Sans accord, l'administrateur ne voit que ce que montrait déjà le tableau de bord (nom, e-mail, connexions, statut).
--   * L'accord se donne et se retire à tout moment depuis Paramètres → Vos données ; le retrait est immédiat.
--   * Chaque consultation d'une fiche est journalisée, et l'utilisateur voit la date de la dernière consultation.
--   * Aucune table n'est lisible directement : tout passe par des fonctions SECURITY DEFINER.

create table public.partage_admin (
  user_id uuid primary key references auth.users (id) on delete cascade,
  accorde_le timestamptz not null default now(),
  version smallint not null default 1
);
alter table public.partage_admin enable row level security;
revoke all on public.partage_admin from anon, authenticated;

create table public.admin_consultations (
  id bigint generated always as identity primary key,
  admin_id uuid references auth.users (id) on delete set null,
  user_id uuid not null references auth.users (id) on delete cascade,
  consulte_le timestamptz not null default now()
);
create index admin_consultations_user on public.admin_consultations (user_id, consulte_le desc);
alter table public.admin_consultations enable row level security;
revoke all on public.admin_consultations from anon, authenticated;

-- ---------- Côté utilisateur ----------
create or replace function public.partage_admin_etat()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'accorde', exists (select 1 from public.partage_admin where user_id = (select auth.uid())),
    'accorde_le', (select accorde_le from public.partage_admin where user_id = (select auth.uid())),
    'derniere_consultation', (select max(consulte_le) from public.admin_consultations where user_id = (select auth.uid())),
    'consultations', (select count(*) from public.admin_consultations where user_id = (select auth.uid()))
  );
$$;

create or replace function public.partage_admin_definir(p_accord boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null then raise exception 'Connexion requise' using errcode = '42501'; end if;
  if coalesce(p_accord, false) then
    insert into public.partage_admin (user_id) values ((select auth.uid())) on conflict (user_id) do nothing;
  else
    delete from public.partage_admin where user_id = (select auth.uid());
  end if;
  return public.partage_admin_etat();
end;
$$;

-- ---------- Côté administrateur ----------
-- Liste des comptes qui ont donné leur accord (sans le contenu du profil).
create or replace function public.admin_fiches()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.exiger_admin();
  return coalesce((select jsonb_agg(x order by x ->> 'accorde_le' desc) from (
    select jsonb_build_object(
      'id', u.id, 'email', u.email, 'accorde_le', p.accorde_le,
      'nom', trim(coalesce(u.raw_user_meta_data -> 'orbite' ->> 'prenom', '') || ' ' || coalesce(u.raw_user_meta_data -> 'orbite' ->> 'nom', '')),
      'nom_compte', coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'nom', '')
    ) x
    from public.partage_admin p join auth.users u on u.id = p.user_id) t), '[]'::jsonb);
end;
$$;

-- Fiche complète d'un compte consentant ; la consultation est journalisée.
create or replace function public.admin_fiche(p_user uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  r jsonb;
begin
  perform public.exiger_admin();
  select jsonb_build_object(
    'id', u.id, 'email', u.email, 'inscrit_le', u.created_at, 'derniere_connexion', u.last_sign_in_at,
    'accorde_le', p.accorde_le,
    'profil', coalesce(u.raw_user_meta_data -> 'orbite', '{}'::jsonb)
  ) into r
  from public.partage_admin p join auth.users u on u.id = p.user_id
  where p.user_id = p_user;
  if r is null then
    raise exception 'Ce compte n''a pas donné son accord' using errcode = '42501';
  end if;
  insert into public.admin_consultations (admin_id, user_id) values ((select auth.uid()), p_user);
  return r;
end;
$$;

-- ---------- Droits ----------
revoke all on function public.partage_admin_etat(), public.partage_admin_definir(boolean), public.admin_fiches(), public.admin_fiche(uuid) from public, anon;
grant execute on function public.partage_admin_etat(), public.partage_admin_definir(boolean), public.admin_fiches(), public.admin_fiche(uuid) to authenticated;
