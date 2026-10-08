-- Orbite : tableau de bord administrateur, alertes de nouvelles inscriptions, statistiques anonymes d'usage.
-- Principes :
--   * Aucune table n'est lisible directement : tout passe par des fonctions qui vérifient le rôle admin.
--   * Les statistiques d'usage sont anonymes : un compteur par jour, type et clé (page ou simulateur),
--     sans identifiant d'utilisateur ni contenu de profil.
--   * La liste des administrateurs n'est modifiable que depuis l'éditeur SQL de Supabase :
--       insert into public.admins (user_id) select id from auth.users where email = '...';

-- ---------- Administrateurs ----------
create table public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  ajoute_le timestamptz not null default now()
);
alter table public.admins enable row level security;
revoke all on public.admins from anon, authenticated;

create or replace function public.est_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.admins where user_id = (select auth.uid()));
$$;

-- Garde commune des fonctions d'administration.
create or replace function public.exiger_admin()
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.admins where user_id = (select auth.uid())) then
    raise exception 'Réservé à l''administrateur' using errcode = '42501';
  end if;
end;
$$;

-- ---------- Alertes (nouvelles inscriptions) ----------
create table public.admin_alertes (
  id bigint generated always as identity primary key,
  type text not null check (type in ('inscription')),
  user_id uuid references auth.users (id) on delete set null,
  libelle text not null check (char_length(libelle) <= 200),
  cree_le timestamptz not null default now(),
  lue boolean not null default false
);
create index admin_alertes_recentes on public.admin_alertes (cree_le desc);
alter table public.admin_alertes enable row level security;
revoke all on public.admin_alertes from anon, authenticated;

create or replace function public.alerte_inscription()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.admin_alertes (type, user_id, libelle)
  values ('inscription', new.id, left(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'nom', '') ||
    case when coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'nom', '') = '' then '' else ' · ' end ||
    coalesce(new.email, ''), 200));
  return new;
end;
$$;
create trigger auth_alerte_inscription after insert on auth.users
  for each row execute function public.alerte_inscription();

-- ---------- Statistiques anonymes d'usage ----------
create table public.statistiques (
  jour date not null default current_date,
  type text not null check (type in ('vue', 'simulation')),
  cle text not null check (cle ~ '^[a-z0-9_-]{1,32}$'),
  nombre integer not null default 0 check (nombre >= 0),
  primary key (jour, type, cle)
);
alter table public.statistiques enable row level security;
revoke all on public.statistiques from anon, authenticated;

-- Incrémente un compteur. Les clés sont limitées à une liste fermée : impossible d'y glisser des données personnelles.
create or replace function public.compter_usage(p_type text, p_cle text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null then return; end if;
  if not (
    (p_type = 'vue' and p_cle in ('orbite', 'profil', 'salaire', 'epargne', 'credit', 'simulations', 'abonnement', 'compte', 'admin', 'vie', 'foyer', 'assistant'))
    or (p_type = 'simulation' and p_cle in ('salaire', 'epargne', 'credit', 'vie', 'fiscal', 'foyer', 'assistant'))
  ) then return; end if;
  insert into public.statistiques (jour, type, cle, nombre) values (current_date, p_type, p_cle, 1)
  on conflict (jour, type, cle) do update set nombre = public.statistiques.nombre + 1;
end;
$$;

-- ---------- Tableau de bord ----------
create or replace function public.admin_tableau()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  r jsonb;
  debut_jour timestamptz := date_trunc('day', now() at time zone 'Africa/Tunis') at time zone 'Africa/Tunis';
begin
  perform public.exiger_admin();
  with u as (
    select u.id, u.email, u.created_at, u.last_sign_in_at,
      coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'nom', '') as nom,
      coalesce(u.raw_app_meta_data ->> 'provider', 'email') as methode,
      a.essai_fin, a.fin, a.offert, a.formule, a.testeur,
      case when a.offert then 'offert' when a.fin > now() then 'actif' when a.essai_fin > now() then 'essai' else 'expire' end as etat,
      exists (select 1 from public.paiements p where p.user_id = u.id and p.statut = 'paye' and p.passerelle <> 'test') as a_paye
    from auth.users u left join public.abonnements a on a.user_id = u.id
  )
  select jsonb_build_object(
    'maintenant', now(),
    'inscrits', (select count(*) from u),
    'nouveaux_jour', (select count(*) from u where created_at >= debut_jour),
    'nouveaux_7j', (select count(*) from u where created_at > now() - interval '7 days'),
    'nouveaux_30j', (select count(*) from u where created_at > now() - interval '30 days'),
    'connectes_jour', (select count(*) from u where last_sign_in_at >= debut_jour),
    'connectes_7j', (select count(*) from u where last_sign_in_at > now() - interval '7 days'),
    'essais', (select count(*) from u where etat = 'essai'),
    'abonnes', (select count(*) from u where etat = 'actif'),
    'offerts', (select count(*) from u where etat = 'offert'),
    'expires', (select count(*) from u where etat = 'expire'),
    'par_formule', coalesce((select jsonb_object_agg(formule, n) from (select formule, count(*) n from u where etat = 'actif' and formule is not null group by formule) f), '{}'::jsonb),
    -- Revenus réels : les paiements simulés (passerelle « test ») sont comptés à part.
    'revenus_total', coalesce((select sum(montant_millimes) from public.paiements where statut = 'paye' and passerelle <> 'test'), 0),
    'revenus_30j', coalesce((select sum(montant_millimes) from public.paiements where statut = 'paye' and passerelle <> 'test' and paye_le > now() - interval '30 days'), 0),
    'paiements_30j', (select count(*) from public.paiements where statut = 'paye' and passerelle <> 'test' and paye_le > now() - interval '30 days'),
    'paiements_test', (select count(*) from public.paiements where statut = 'paye' and passerelle = 'test'),
    -- Conversion : parmi les comptes dont l'essai est terminé (et non offerts), part de ceux qui ont payé au moins une fois.
    'essais_termines', (select count(*) from u where essai_fin <= now() and not coalesce(offert, false)),
    'convertis', (select count(*) from u where essai_fin <= now() and not coalesce(offert, false) and a_paye),
    -- Désabonnements : comptes ayant déjà payé dont l'abonnement est arrivé à échéance sans renouvellement.
    'desabonnes', (select count(*) from u where a_paye and etat = 'expire'),
    'inscriptions_30j', coalesce((select jsonb_agg(jsonb_build_object('jour', j, 'n', n) order by j) from (
        select (created_at at time zone 'Africa/Tunis')::date j, count(*) n from u where created_at > now() - interval '30 days' group by 1) s), '[]'::jsonb),
    'utilisateurs', coalesce((select jsonb_agg(x order by x ->> 'derniere_connexion' desc nulls last) from (
        select jsonb_build_object('nom', nom, 'email', email, 'methode', methode, 'inscrit_le', created_at,
          'derniere_connexion', last_sign_in_at, 'etat', etat, 'formule', formule, 'testeur', coalesce(testeur, false)) x
        from u order by last_sign_in_at desc nulls last limit 200) t), '[]'::jsonb),
    'alertes_non_lues', (select count(*) from public.admin_alertes where not lue)
  ) into r;
  return r;
end;
$$;

create or replace function public.admin_alertes_liste()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.exiger_admin();
  return coalesce((select jsonb_agg(jsonb_build_object('id', id, 'type', type, 'libelle', libelle, 'cree_le', cree_le, 'lue', lue) order by cree_le desc)
    from (select * from public.admin_alertes order by cree_le desc limit 50) a), '[]'::jsonb);
end;
$$;

create or replace function public.admin_alertes_lues()
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.exiger_admin();
  update public.admin_alertes set lue = true where not lue;
end;
$$;

create or replace function public.admin_statistiques(p_jours integer default 30)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  j integer := least(greatest(coalesce(p_jours, 30), 1), 365);
begin
  perform public.exiger_admin();
  return jsonb_build_object(
    'jours', j,
    'vues', coalesce((select jsonb_agg(jsonb_build_object('cle', cle, 'n', n) order by n desc) from (
        select cle, sum(nombre) n from public.statistiques where type = 'vue' and jour > current_date - j group by cle) s), '[]'::jsonb),
    'simulations', coalesce((select jsonb_agg(jsonb_build_object('cle', cle, 'n', n) order by n desc) from (
        select cle, sum(nombre) n from public.statistiques where type = 'simulation' and jour > current_date - j group by cle) s), '[]'::jsonb),
    'par_jour', coalesce((select jsonb_agg(jsonb_build_object('jour', jour, 'n', n) order by jour) from (
        select jour, sum(nombre) n from public.statistiques where type = 'vue' and jour > current_date - j group by jour) s), '[]'::jsonb)
  );
end;
$$;

-- ---------- Droits ----------
revoke all on function public.est_admin(), public.exiger_admin(), public.alerte_inscription(), public.compter_usage(text, text),
  public.admin_tableau(), public.admin_alertes_liste(), public.admin_alertes_lues(), public.admin_statistiques(integer) from public, anon;
revoke all on function public.alerte_inscription(), public.exiger_admin() from authenticated;
grant execute on function public.est_admin(), public.compter_usage(text, text), public.admin_tableau(),
  public.admin_alertes_liste(), public.admin_alertes_lues(), public.admin_statistiques(integer) to authenticated;
