-- Orbite : codes promo, offre de lancement (code « automatique ») et parrainage (un mois offert au parrain et au filleul).
-- Le prix d'une commande est TOUJOURS calculé par le serveur (fonction prix_formule) : le navigateur n'envoie qu'un code.

-- ---------- Codes promo ----------
create table public.codes_promo (
  code text primary key check (code ~ '^[A-Z0-9-]{3,20}$'),
  libelle text not null default '' check (char_length(libelle) <= 80),
  remise_pct integer not null check (remise_pct between 1 and 90),
  formules text[] check (formules is null or cardinality(formules) between 1 and 10),  -- null : toutes les formules
  debut timestamptz not null default now(),
  fin timestamptz,
  max_utilisations integer check (max_utilisations is null or max_utilisations > 0),
  utilisations integer not null default 0 check (utilisations >= 0),
  automatique boolean not null default false,  -- offre de lancement : appliquée sans saisie
  actif boolean not null default true,
  cree_le timestamptz not null default now()
);
alter table public.codes_promo enable row level security;
revoke all on public.codes_promo from anon, authenticated;

alter table public.paiements
  add column code_promo text references public.codes_promo (code) on update cascade on delete set null,
  add column prix_initial_millimes integer check (prix_initial_millimes is null or prix_initial_millimes > 0);

create or replace function public.code_valide(c public.codes_promo, p_formule text)
returns boolean language sql stable set search_path = '' as $$
  select c.actif and c.debut <= now() and (c.fin is null or c.fin > now())
    and (c.max_utilisations is null or c.utilisations < c.max_utilisations)
    and (c.formules is null or p_formule = any (c.formules));
$$;

-- Prix d'une formule : la meilleure remise entre l'offre automatique en cours et le code saisi (s'il est valide).
create or replace function public.prix_formule(p_formule text, p_code text default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  f public.formules;
  meilleur public.codes_promo;
  saisi public.codes_promo;
  code_norm text := upper(btrim(coalesce(p_code, '')));
  prix integer;
begin
  select * into f from public.formules where cle = p_formule and actif;
  if not found then return null; end if;
  select * into meilleur from public.codes_promo c where c.automatique and public.code_valide(c, f.cle) order by c.remise_pct desc limit 1;
  if code_norm <> '' then
    select * into saisi from public.codes_promo c where c.code = code_norm and not c.automatique and public.code_valide(c, f.cle);
    if found and (meilleur.code is null or saisi.remise_pct > meilleur.remise_pct) then meilleur := saisi; end if;
  end if;
  prix := case when meilleur.code is null then f.prix_millimes
    else greatest(1000, (round(f.prix_millimes * (100 - meilleur.remise_pct) / 100.0 / 100.0) * 100)::integer) end;
  return jsonb_build_object('formule', f.cle, 'prix_initial', f.prix_millimes, 'prix', prix,
    'code', meilleur.code, 'remise_pct', coalesce(meilleur.remise_pct, 0), 'libelle', meilleur.libelle,
    'automatique', coalesce(meilleur.automatique, false), 'fin', meilleur.fin);
end;
$$;

-- Prix affichés sur la page d'abonnement (et l'accueil) : offre de lancement comprise.
create or replace function public.offres_en_cours(p_code text default null)
returns jsonb language sql stable security definer set search_path = '' as $$
  -- Un visiteur non connecté ne voit que l'offre automatique (pas de test de codes sans compte).
  select coalesce(jsonb_agg(public.prix_formule(f.cle, case when (select auth.uid()) is null then null else p_code end) order by f.ordre), '[]'::jsonb)
  from public.formules f where f.actif;
$$;

-- Vérifie un code saisi (message clair, sans révéler la liste des codes).
create or replace function public.verifier_code(p_code text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  c public.codes_promo;
  code_norm text := upper(btrim(coalesce(p_code, '')));
begin
  if (select auth.uid()) is null then raise exception 'Non authentifié' using errcode = '42501'; end if;
  select * into c from public.codes_promo where code = code_norm and not automatique;
  if not found or not c.actif or c.debut > now() then return jsonb_build_object('valide', false, 'message', 'Ce code n''existe pas.'); end if;
  if c.fin is not null and c.fin <= now() then return jsonb_build_object('valide', false, 'message', 'Ce code a expiré.'); end if;
  if c.max_utilisations is not null and c.utilisations >= c.max_utilisations then return jsonb_build_object('valide', false, 'message', 'Ce code a atteint son nombre maximal d''utilisations.'); end if;
  return jsonb_build_object('valide', true, 'code', c.code, 'remise_pct', c.remise_pct, 'libelle', c.libelle, 'formules', c.formules, 'fin', c.fin);
end;
$$;

-- ---------- Parrainage ----------
create table public.parrains (
  user_id uuid primary key references auth.users (id) on delete cascade,
  code text not null unique check (code ~ '^[A-Z0-9]{8}$'),
  cree_le timestamptz not null default now()
);
create table public.parrainages (
  filleul uuid primary key references auth.users (id) on delete cascade,
  parrain uuid not null references auth.users (id) on delete cascade,
  cree_le timestamptz not null default now(),
  recompense_le timestamptz,
  check (filleul <> parrain)
);
create index parrainages_parrain_idx on public.parrainages (parrain);
alter table public.parrains enable row level security;
alter table public.parrainages enable row level security;
revoke all on public.parrains, public.parrainages from anon, authenticated;

-- Code de parrainage de l'utilisateur (créé à la première demande) et bilan.
create or replace function public.mon_parrainage()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  c text;
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  essai integer := 0;
  u auth.users;
begin
  if uid is null then raise exception 'Non authentifié' using errcode = '42501'; end if;
  select code into c from public.parrains where user_id = uid;
  while c is null and essai < 8 loop
    essai := essai + 1;
    c := (select string_agg(substr(alphabet, 1 + floor(random() * length(alphabet))::integer, 1), '') from generate_series(1, 8));
    begin
      insert into public.parrains (user_id, code) values (uid, c);
    exception when unique_violation then c := null;
    end;
  end loop;
  select * into u from auth.users where id = uid;
  return jsonb_build_object(
    'code', c,
    'filleuls', (select count(*) from public.parrainages where parrain = uid),
    'recompenses', (select count(*) from public.parrainages where parrain = uid and recompense_le is not null),
    'parrain_saisi', exists (select 1 from public.parrainages where filleul = uid),
    'filleul_recompense', exists (select 1 from public.parrainages where filleul = uid and recompense_le is not null),
    -- Un code parrain se saisit dans les 14 jours suivant l'inscription, avant tout paiement.
    'peut_saisir', not exists (select 1 from public.parrainages where filleul = uid)
      and u.created_at > now() - interval '14 days'
      and not exists (select 1 from public.paiements where user_id = uid and statut = 'paye')
  );
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

-- ---------- Activation : comptage du code promo et récompense du parrainage ----------
create or replace function public.activer_paiement(p_reference text, p_reference_passerelle text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  p public.paiements;
  f public.formules;
  depart timestamptz;
  nouvelle_fin timestamptz;
  pa public.parrainages;
begin
  select * into p from public.paiements where reference = p_reference for update;
  if not found then
    raise exception 'Paiement inconnu';
  end if;
  if p.statut = 'paye' then
    return jsonb_build_object('deja', true, 'reference', p.reference);
  end if;
  select * into f from public.formules where cle = p.formule;
  insert into public.abonnements (user_id) values (p.user_id) on conflict (user_id) do nothing;
  select greatest(now(), coalesce(fin, now()), case when offert then now() else essai_fin end) into depart from public.abonnements where user_id = p.user_id for update;
  nouvelle_fin := depart + make_interval(months => f.mois);
  update public.paiements
    set statut = 'paye', paye_le = now(), reference_passerelle = coalesce(p_reference_passerelle, reference_passerelle)
    where id = p.id;
  if p.code_promo is not null then
    update public.codes_promo set utilisations = utilisations + 1 where code = p.code_promo;
  end if;
  -- Premier paiement d'un filleul : un mois offert à lui et à son parrain (une seule fois).
  select * into pa from public.parrainages where filleul = p.user_id and recompense_le is null for update;
  if found then
    nouvelle_fin := nouvelle_fin + interval '1 month';
    insert into public.abonnements (user_id) values (pa.parrain) on conflict (user_id) do nothing;
    update public.abonnements
      set fin = greatest(now(), coalesce(fin, now()), case when offert then now() else essai_fin end) + interval '1 month'
      where user_id = pa.parrain;
    update public.parrainages set recompense_le = now() where filleul = pa.filleul;
  end if;
  update public.abonnements set fin = nouvelle_fin, formule = f.cle where user_id = p.user_id;
  return jsonb_build_object('deja', false, 'reference', p.reference, 'fin', nouvelle_fin, 'parrainage', pa.filleul is not null);
end;
$$;

-- ---------- Administration des codes ----------
create or replace function public.admin_codes()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.exiger_admin();
  return jsonb_build_object(
    'codes', coalesce((select jsonb_agg(to_jsonb(c) order by c.cree_le desc) from public.codes_promo c), '[]'::jsonb),
    'parrainages', (select count(*) from public.parrainages),
    'parrainages_recompenses', (select count(*) from public.parrainages where recompense_le is not null),
    'parrains_actifs', (select count(distinct parrain) from public.parrainages)
  );
end;
$$;

create or replace function public.admin_code_enregistrer(p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  c public.codes_promo;
begin
  perform public.exiger_admin();
  insert into public.codes_promo (code, libelle, remise_pct, formules, debut, fin, max_utilisations, automatique, actif)
  values (
    upper(btrim(p ->> 'code')),
    coalesce(p ->> 'libelle', ''),
    (p ->> 'remise_pct')::integer,
    case when jsonb_typeof(p -> 'formules') = 'array' and jsonb_array_length(p -> 'formules') > 0
      then array(select jsonb_array_elements_text(p -> 'formules')) else null end,
    coalesce((p ->> 'debut')::timestamptz, now()),
    (p ->> 'fin')::timestamptz,
    (p ->> 'max_utilisations')::integer,
    coalesce((p ->> 'automatique')::boolean, false),
    coalesce((p ->> 'actif')::boolean, true)
  )
  on conflict (code) do update set libelle = excluded.libelle, remise_pct = excluded.remise_pct, formules = excluded.formules,
    debut = excluded.debut, fin = excluded.fin, max_utilisations = excluded.max_utilisations, automatique = excluded.automatique, actif = excluded.actif
  returning * into c;
  return to_jsonb(c);
end;
$$;

create or replace function public.admin_code_activer(p_code text, p_actif boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.exiger_admin();
  update public.codes_promo set actif = p_actif where code = p_code;
end;
$$;

-- ---------- Droits ----------
revoke all on function public.code_valide(public.codes_promo, text), public.prix_formule(text, text), public.offres_en_cours(text),
  public.verifier_code(text), public.mon_parrainage(), public.utiliser_code_parrain(text), public.admin_codes(),
  public.admin_code_enregistrer(jsonb), public.admin_code_activer(text, boolean) from public, anon;
revoke all on function public.prix_formule(text, text), public.code_valide(public.codes_promo, text) from authenticated;
grant execute on function public.offres_en_cours(text) to anon, authenticated;
grant execute on function public.verifier_code(text), public.mon_parrainage(), public.utiliser_code_parrain(text),
  public.admin_codes(), public.admin_code_enregistrer(jsonb), public.admin_code_activer(text, boolean) to authenticated;
revoke all on function public.activer_paiement(text, text) from public, anon, authenticated;
