-- 0019 — Sécurité (revue du 22 oct. 2026) : profil financier protégé et double authentification partout.
-- 1. Le profil financier (salaire, crédits, épargne, contacts…) quitte les métadonnées du compte
--    (auth.users.raw_user_meta_data -> 'orbite'), que le jeton de session transporte et qu'une session
--    sans code (aal1) pouvait lire. Il vit désormais dans public.profils_financiers : règles d'accès par compte
--    et double authentification exigée (même règle que les autres tables, voir 0016).
--    Reprise : les profils existants sont copiés ici ; l'application efface ensuite la copie des métadonnées
--    au premier enregistrement. Le nettoyage final des métadonnées est la migration 0020, à appliquer plus tard.
-- 2. Les fonctions qui lisaient le profil dans les métadonnées le lisent ici (à défaut, dans les métadonnées
--    d'un compte pas encore repris).
-- 3. Les fonctions de rappels appelées par le compte exigent la double authentification (public.mfa_ok()).

create table public.profils_financiers (
  user_id uuid primary key references auth.users (id) on delete cascade,
  donnees jsonb not null default '{}'::jsonb
    check (jsonb_typeof(donnees) = 'object' and octet_length(donnees::text) <= 262144),
  maj_le timestamptz not null default now()
);

create or replace function public.profils_financiers_horodater()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.maj_le := now();
  return new;
end;
$$;
create trigger profils_financiers_horodater before insert or update on public.profils_financiers
  for each row execute function public.profils_financiers_horodater();
revoke all on function public.profils_financiers_horodater() from public, anon, authenticated;

alter table public.profils_financiers enable row level security;
revoke all on public.profils_financiers from anon, authenticated;
grant select, insert, update, delete on public.profils_financiers to authenticated;
create policy "proprietaire" on public.profils_financiers for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "mfa_aal2" on public.profils_financiers as restrictive for all to authenticated
  using (public.mfa_ok()) with check (public.mfa_ok());

-- Reprise des profils existants (rien n'est effacé des métadonnées ici).
insert into public.profils_financiers (user_id, donnees)
select u.id, u.raw_user_meta_data -> 'orbite'
from auth.users u
where jsonb_typeof(u.raw_user_meta_data -> 'orbite') = 'object'
on conflict (user_id) do nothing;

-- Profil d'un compte, pour les fonctions serveur : la table d'abord, les métadonnées d'un compte pas encore repris à défaut.
create or replace function public.profil_de(p_user uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select f.donnees from public.profils_financiers f where f.user_id = p_user),
    (select case when jsonb_typeof(u.raw_user_meta_data -> 'orbite') = 'object' then u.raw_user_meta_data -> 'orbite' end
       from auth.users u where u.id = p_user),
    '{}'::jsonb);
$$;
revoke all on function public.profil_de(uuid) from public, anon, authenticated;

-- ---------- Lecteurs du profil ----------
create or replace function public.nom_client(p_user uuid)
returns text language sql stable security definer set search_path = '' as $$
  select coalesce(nullif(trim(
    coalesce(o ->> 'prenom', '') || ' ' ||
    coalesce(left(nullif(o ->> 'nom', ''), 1) || '.', '')), ''), 'Client')
  from (select public.profil_de(p_user) as o) x;
$$;

create or replace function public.conseiller_clients()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r jsonb;
begin
  perform public.exiger_conseiller();
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', p.client_id, 'nom', public.nom_client(p.client_id), 'accorde_le', p.accorde_le,
    'profil', public.profil_de(p.client_id)
  ) order by p.accorde_le desc), '[]'::jsonb) into r
  from public.partages_conseiller p
  where p.conseiller_id = (select auth.uid());
  perform public.noter_consultation(p.client_id) from public.partages_conseiller p where p.conseiller_id = (select auth.uid());
  return r;
end;
$$;

create or replace function public.admin_fiche(p_user uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r jsonb;
begin
  perform public.exiger_admin();
  select jsonb_build_object(
    'id', u.id, 'email', u.email, 'inscrit_le', u.created_at, 'derniere_connexion', u.last_sign_in_at,
    'accorde_le', p.accorde_le,
    'profil', public.profil_de(u.id)
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

create or replace function public.admin_fiches()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.exiger_admin();
  return coalesce((select jsonb_agg(x order by x ->> 'accorde_le' desc) from (
    select jsonb_build_object(
      'id', u.id, 'email', u.email, 'accorde_le', p.accorde_le,
      'nom', trim(coalesce(m.o ->> 'prenom', '') || ' ' || coalesce(m.o ->> 'nom', '')),
      'nom_compte', coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'nom', '')
    ) x
    from public.partage_admin p join auth.users u on u.id = p.user_id
    cross join lateral (select public.profil_de(u.id) as o) m) t), '[]'::jsonb);
end;
$$;

create or replace function public.admin_contacts()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.exiger_admin();
  return coalesce((select jsonb_agg(x order by x ->> 'accorde_le' desc nulls last) from (
    select jsonb_build_object(
      'id', u.id,
      'nom', trim(coalesce(m.o ->> 'prenom', '') || ' ' || coalesce(m.o ->> 'nom', '')),
      'nom_compte', coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'nom', ''),
      'email', coalesce(nullif(m.o ->> 'emailContact', ''), u.email),
      'telephone', nullif(m.o ->> 'telephone', ''),
      'accorde_le', nullif(m.o ->> 'contactOkLe', ''),
      'rappels_email', coalesce(m.o ->> 'rappelsEmail', '') = 'true'
    ) x
    from auth.users u
    cross join lateral (select public.profil_de(u.id) as o) m
    where coalesce(m.o ->> 'contactOk', '') = 'true') t), '[]'::jsonb);
end;
$$;

create or replace function public.rappels_destinataires(p_user uuid default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.rappels_exiger_serveur();
  return (select coalesce(jsonb_agg(jsonb_build_object(
    'user_id', u.id,
    'email', u.email,
    'prenom', left(coalesce(m.o ->> 'prenom', ''), 40),
    'contact', coalesce(m.o ->> 'emailContact', ''),
    'plan', r.plan,
    'jeton', r.jeton,
    'adresse_confirmee', r.adresse_confirmee,
    'confirmation_adresse', r.confirmation_adresse,
    'confirmation_envoyee_le', r.confirmation_envoyee_le,
    'envoyes', coalesce((select jsonb_agg(e.rappel_id) from public.rappels_envoyes e where e.user_id = u.id), '[]'::jsonb),
    'acces', jsonb_build_object(
      'etat', case when a.offert then 'offert' when a.fin is not null and a.fin > now() then 'actif'
                   when a.essai_fin > now() then 'essai' else 'expire' end,
      'essai_fin', a.essai_fin, 'fin', a.fin)
  )), '[]'::jsonb)
  from public.rappels_email r
  join auth.users u on u.id = r.user_id
  cross join lateral (select public.profil_de(u.id) as o) m
  left join public.abonnements a on a.user_id = u.id
  where r.desinscrit_le is null
    and coalesce(m.o ->> 'rappelsEmail', '') = 'true'
    and u.email_confirmed_at is not null
    and (p_user is null or u.id = p_user));
end;
$$;

-- Désinscription / réinscription en un clic (lien de l'e-mail, sans connexion) : la préférence change dans la table
-- et, pour un compte pas encore repris, dans les métadonnées.
create or replace function public.rappels_desinscrire(p_jeton uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid;
begin
  update public.rappels_email set desinscrit_le = coalesce(desinscrit_le, now()) where jeton = p_jeton returning user_id into uid;
  if uid is null then return jsonb_build_object('ok', false); end if;
  update public.profils_financiers set donnees = jsonb_set(donnees, '{rappelsEmail}', 'false'::jsonb) where user_id = uid;
  update auth.users set raw_user_meta_data = jsonb_set(raw_user_meta_data, '{orbite,rappelsEmail}', 'false'::jsonb)
    where id = uid and jsonb_typeof(raw_user_meta_data -> 'orbite') = 'object';
  return jsonb_build_object('ok', true, 'prenom', left(public.profil_de(uid) ->> 'prenom', 40));
end;
$$;

create or replace function public.rappels_reabonner(p_jeton uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid;
begin
  update public.rappels_email set desinscrit_le = null where jeton = p_jeton returning user_id into uid;
  if uid is null then return jsonb_build_object('ok', false); end if;
  update public.profils_financiers set donnees = jsonb_set(donnees, '{rappelsEmail}', 'true'::jsonb) where user_id = uid;
  update auth.users set raw_user_meta_data = jsonb_set(raw_user_meta_data, '{orbite,rappelsEmail}', 'true'::jsonb)
    where id = uid and jsonb_typeof(raw_user_meta_data -> 'orbite') = 'object';
  return jsonb_build_object('ok', true);
end;
$$;

-- Export « Mes données » : le profil financier en fait partie.
create or replace function public.exporter_mes_donnees()
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'exporte_le', now(),
    'profil', (select to_jsonb(p) from public.profils p where p.id = (select auth.uid())),
    'profil_financier', (select f.donnees from public.profils_financiers f where f.user_id = (select auth.uid())),
    'simulations', coalesce((select jsonb_agg(to_jsonb(s) order by s.cree_le)
                             from public.simulations s where s.user_id = (select auth.uid())), '[]'::jsonb),
    'abonnement', (select to_jsonb(a) from public.abonnements a where a.user_id = (select auth.uid())),
    'paiements', coalesce((select jsonb_agg(jsonb_build_object('formule', x.formule, 'montant_millimes', x.montant_millimes,
                             'statut', x.statut, 'cree_le', x.cree_le, 'paye_le', x.paye_le, 'reference', x.reference) order by x.cree_le)
                           from public.paiements x where x.user_id = (select auth.uid())), '[]'::jsonb),
    'rappels_email', (select jsonb_build_object('plan', r.plan, 'plan_maj', r.plan_maj, 'desinscrit_le', r.desinscrit_le,
                             'adresse_confirmee', r.adresse_confirmee, 'dernier_envoi', r.dernier_envoi)
                      from public.rappels_email r where r.user_id = (select auth.uid())),
    'rappels_envoyes', coalesce((select jsonb_agg(jsonb_build_object('rappel', e.rappel_id, 'envoye_le', e.envoye_le) order by e.envoye_le)
                                 from public.rappels_envoyes e where e.user_id = (select auth.uid())), '[]'::jsonb),
    'objectifs', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'type', o.type, 'libelle', o.libelle, 'cible', o.cible, 'depart', o.depart,
                             'echeance', o.echeance, 'credit', o.credit, 'cree_le', o.cree_le) order by o.cree_le)
                           from public.objectifs o where o.user_id = (select auth.uid())), '[]'::jsonb),
    'objectifs_versements', coalesce((select jsonb_agg(jsonb_build_object('objectif', v.objectif_id, 'montant', v.montant, 'le', v.le) order by v.le)
                                      from public.objectifs_versements v where v.user_id = (select auth.uid())), '[]'::jsonb),
    'consentements', coalesce((select jsonb_agg(jsonb_build_object('version', c.version, 'documents', c.documents, 'accepte_le', c.accepte_le) order by c.accepte_le)
                               from public.consentements c where c.user_id = (select auth.uid())), '[]'::jsonb)
  );
$$;

-- ---------- Rappels : double authentification exigée (revue de sécurité, constat 1) ----------
create or replace function public.rappels_mon_etat()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := (select auth.uid());
begin
  if uid is null then raise exception 'Non authentifié' using errcode = '42501'; end if;
  if not public.mfa_ok() then raise exception 'Double authentification requise' using errcode = '42501'; end if;
  return public.rappels_etat_de(uid);
end;
$$;

create or replace function public.rappels_plan_enregistrer(p_plan jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := (select auth.uid());
begin
  if uid is null then raise exception 'Non authentifié' using errcode = '42501'; end if;
  if not public.mfa_ok() then raise exception 'Double authentification requise' using errcode = '42501'; end if;
  if p_plan is null or jsonb_typeof(p_plan) <> 'array' or jsonb_array_length(p_plan) > 40 or octet_length(p_plan::text) > 32000 then
    raise exception 'Plan de rappels invalide' using errcode = '22023';
  end if;
  insert into public.rappels_email (user_id, plan, plan_maj) values (uid, p_plan, now())
  on conflict (user_id) do update set plan = excluded.plan, plan_maj = excluded.plan_maj;
  return public.rappels_etat_de(uid);
end;
$$;

create or replace function public.rappels_reactiver()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := (select auth.uid());
begin
  if uid is null then raise exception 'Non authentifié' using errcode = '42501'; end if;
  if not public.mfa_ok() then raise exception 'Double authentification requise' using errcode = '42501'; end if;
  insert into public.rappels_email (user_id) values (uid) on conflict (user_id) do update set desinscrit_le = null;
  return public.rappels_etat_de(uid);
end;
$$;
