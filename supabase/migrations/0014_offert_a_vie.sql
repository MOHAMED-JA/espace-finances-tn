-- Orbite : accès offert à vie par l'administrateur, et retirable (choix de l'utilisateur, 12 oct. 2026).
-- Trois portées : un compte, tous les comptes existants, les comptes créés à partir de maintenant.
-- L'accès « offert » existait déjà (état « offert » de mon_acces) : on ajoute qui l'a donné et quand.
-- Retirer l'accès remet le compte dans son état d'avant (essai ou abonnement payé : leurs dates ne sont jamais touchées).
-- Un accès offert à la main avant cette migration (offert_par vide) n'est retiré que compte par compte.

alter table public.abonnements
  add column offert_par text check (offert_par in ('compte', 'tous', 'nouveaux')),
  add column offert_le timestamptz;

-- Réglages de l'application (lisibles et modifiables seulement par les fonctions d'administration).
create table public.reglages (
  cle text primary key check (cle ~ '^[a-z_]{3,40}$'),
  valeur jsonb not null,
  modifie_le timestamptz not null default now()
);
alter table public.reglages enable row level security;
revoke all on public.reglages from anon, authenticated;
insert into public.reglages (cle, valeur) values ('offert_nouveaux', 'false'::jsonb) on conflict (cle) do nothing;

-- Inscription : essai de 3 jours, ou accès offert à vie si l'administrateur l'a choisi pour les nouveaux comptes.
create or replace function public.creer_abonnement()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  a_vie boolean := coalesce((select valeur = 'true'::jsonb from public.reglages where cle = 'offert_nouveaux'), false);
begin
  insert into public.abonnements (user_id, offert, offert_par, offert_le)
  values (new.id, a_vie, case when a_vie then 'nouveaux' end, case when a_vie then now() end)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

-- ---------- Administration ----------
create or replace function public.admin_offert_etat()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.exiger_admin();
  return jsonb_build_object(
    'nouveaux', coalesce((select valeur = 'true'::jsonb from public.reglages where cle = 'offert_nouveaux'), false),
    'offerts', (select count(*) from public.abonnements where offert),
    'offerts_admin', (select count(*) from public.abonnements where offert and offert_par is not null),
    'comptes', (select count(*) from auth.users)
  );
end;
$$;

-- Un compte : offrir ou retirer.
create or replace function public.admin_offrir(p_user uuid, p_offert boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform public.exiger_admin();
  if p_user is null or not exists (select 1 from auth.users where id = p_user) then
    raise exception 'Compte introuvable' using errcode = '22023';
  end if;
  insert into public.abonnements (user_id) values (p_user) on conflict (user_id) do nothing;
  if coalesce(p_offert, false) then
    update public.abonnements set offert = true, offert_par = 'compte', offert_le = now() where user_id = p_user and not offert;
  else
    update public.abonnements set offert = false, offert_par = null, offert_le = null where user_id = p_user and offert;
  end if;
  return public.admin_offert_etat();
end;
$$;

-- Tous les comptes existants : offrir, ou retirer l'accès donné par l'administrateur.
create or replace function public.admin_offrir_tous(p_offert boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform public.exiger_admin();
  insert into public.abonnements (user_id) select id from auth.users on conflict (user_id) do nothing;
  if coalesce(p_offert, false) then
    update public.abonnements set offert = true, offert_par = 'tous', offert_le = now() where not offert;
  else
    update public.abonnements set offert = false, offert_par = null, offert_le = null where offert and offert_par is not null;
  end if;
  return public.admin_offert_etat();
end;
$$;

-- Comptes créés à partir de maintenant.
create or replace function public.admin_offrir_nouveaux(p_actif boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform public.exiger_admin();
  insert into public.reglages (cle, valeur, modifie_le) values ('offert_nouveaux', to_jsonb(coalesce(p_actif, false)), now())
  on conflict (cle) do update set valeur = excluded.valeur, modifie_le = now();
  return public.admin_offert_etat();
end;
$$;

-- Tableau de bord : identifiant du compte et origine de l'accès offert (pour les actions par compte).
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
      a.essai_fin, a.fin, a.offert, a.offert_par, a.formule, a.testeur,
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
        select jsonb_build_object('id', id, 'nom', nom, 'email', email, 'methode', methode, 'inscrit_le', created_at,
          'derniere_connexion', last_sign_in_at, 'etat', etat, 'formule', formule, 'testeur', coalesce(testeur, false), 'offert_par', offert_par) x
        from u order by last_sign_in_at desc nulls last limit 200) t), '[]'::jsonb),
    'alertes_non_lues', (select count(*) from public.admin_alertes where not lue),
    'offert_nouveaux', coalesce((select valeur = 'true'::jsonb from public.reglages where cle = 'offert_nouveaux'), false),
    'offerts_admin', (select count(*) from u where offert and offert_par is not null)
  ) into r;
  return r;
end;
$$;


revoke all on function public.creer_abonnement() from public, anon, authenticated;
revoke all on function public.admin_offert_etat(), public.admin_offrir(uuid, boolean), public.admin_offrir_tous(boolean), public.admin_offrir_nouveaux(boolean), public.admin_tableau() from public, anon;
grant execute on function public.admin_offert_etat(), public.admin_offrir(uuid, boolean), public.admin_offrir_tous(boolean), public.admin_offrir_nouveaux(boolean), public.admin_tableau() to authenticated;
