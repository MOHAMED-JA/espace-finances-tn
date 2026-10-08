-- Orbite : abonnements payants (essai gratuit de 3 jours, formules prépayées de 1, 6 ou 12 mois).
-- Principe de sécurité : l'utilisateur ne peut que LIRE ses données d'abonnement.
-- Toute écriture (création de commande, activation après paiement vérifié) passe par la
-- fonction serveur « paiement » (clé de service) : un navigateur ne peut jamais s'offrir un abonnement.

-- ---------- Formules (lisibles par tous : la page d'abonnement affiche les prix du serveur) ----------
create table public.formules (
  cle text primary key check (cle ~ '^[a-z]{3,20}$'),
  libelle text not null check (char_length(libelle) <= 40),
  mois integer not null check (mois between 1 and 36),
  prix_millimes integer not null check (prix_millimes between 1000 and 10000000),
  ordre integer not null default 0,
  actif boolean not null default true
);

insert into public.formules (cle, libelle, mois, prix_millimes, ordre) values
  ('mensuel', 'Mensuel', 1, 9900, 1),
  ('semestriel', 'Semestriel', 6, 49900, 2),
  ('annuel', 'Annuel', 12, 79900, 3);

-- ---------- Abonnement : une ligne par compte ----------
create table public.abonnements (
  user_id uuid primary key references auth.users (id) on delete cascade,
  essai_fin timestamptz not null default (now() + interval '3 days'),
  fin timestamptz,
  formule text references public.formules (cle),
  offert boolean not null default false,
  modifie_le timestamptz not null default now()
);

-- ---------- Paiements : historique et suivi des commandes ----------
create table public.paiements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  formule text not null references public.formules (cle),
  montant_millimes integer not null check (montant_millimes > 0),
  passerelle text not null check (passerelle in ('test', 'konnect', 'flouci', 'clictopay')),
  reference text not null unique,
  reference_passerelle text,
  statut text not null default 'cree' check (statut in ('cree', 'paye', 'echec', 'annule')),
  detail jsonb not null default '{}'::jsonb check (pg_column_size(detail) <= 4096),
  cree_le timestamptz not null default now(),
  paye_le timestamptz
);

create index paiements_user_idx on public.paiements (user_id, cree_le desc);

create trigger abonnements_modifie_le before update on public.abonnements
  for each row execute function public.maj_modifie_le();

-- ---------- Essai gratuit à l'inscription (une seule fois par compte) ----------
create or replace function public.creer_abonnement()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.abonnements (user_id) values (new.id) on conflict (user_id) do nothing;
  return new;
end;
$$;

create trigger auth_creer_abonnement after insert on auth.users
  for each row execute function public.creer_abonnement();

-- Comptes existants : ils reçoivent eux aussi 3 jours d'essai à partir d'aujourd'hui.
insert into public.abonnements (user_id) select id from auth.users on conflict (user_id) do nothing;

-- ---------- État d'accès de l'utilisateur connecté ----------
create or replace function public.mon_acces()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  a public.abonnements;
  etat text;
begin
  if uid is null then
    raise exception 'Non authentifié' using errcode = '42501';
  end if;
  insert into public.abonnements (user_id) values (uid) on conflict (user_id) do nothing;
  select * into a from public.abonnements where user_id = uid;
  etat := case
    when a.offert then 'offert'
    when a.fin is not null and a.fin > now() then 'actif'
    when a.essai_fin > now() then 'essai'
    else 'expire'
  end;
  return jsonb_build_object(
    'etat', etat,
    'essai_fin', a.essai_fin,
    'fin', a.fin,
    'formule', a.formule,
    'maintenant', now()
  );
end;
$$;

-- ---------- Activation après paiement VÉRIFIÉ (réservée au serveur) ----------
-- Idempotente : un même paiement n'étend l'abonnement qu'une seule fois.
-- La nouvelle période commence à la fin de l'abonnement en cours, ou de l'essai, s'ils sont encore actifs :
-- payer pendant l'essai ne fait perdre aucun jour.
create or replace function public.activer_paiement(p_reference text, p_reference_passerelle text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  p public.paiements;
  f public.formules;
  depart timestamptz;
  nouvelle_fin timestamptz;
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
  update public.abonnements set fin = nouvelle_fin, formule = f.cle where user_id = p.user_id;
  update public.paiements
    set statut = 'paye', paye_le = now(), reference_passerelle = coalesce(p_reference_passerelle, reference_passerelle)
    where id = p.id;
  return jsonb_build_object('deja', false, 'reference', p.reference, 'fin', nouvelle_fin);
end;
$$;

-- ---------- Règles d'accès (RLS) ----------
alter table public.formules enable row level security;
alter table public.abonnements enable row level security;
alter table public.paiements enable row level security;

create policy "formules : lecture publique" on public.formules
  for select to anon, authenticated using (actif);
create policy "abonnement : lecture par son propriétaire" on public.abonnements
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "paiements : lecture par son propriétaire" on public.paiements
  for select to authenticated using ((select auth.uid()) = user_id);

revoke all on public.formules, public.abonnements, public.paiements from anon, authenticated;
grant select on public.formules to anon, authenticated;
grant select on public.abonnements, public.paiements to authenticated;

revoke all on function public.creer_abonnement(), public.activer_paiement(text, text) from public, anon, authenticated;
revoke all on function public.mon_acces() from public, anon;
grant execute on function public.mon_acces() to authenticated;

-- ---------- Export des données personnelles : inclut désormais l'abonnement et les paiements ----------
create or replace function public.exporter_mes_donnees()
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'exporte_le', now(),
    'profil', (select to_jsonb(p) from public.profils p where p.id = (select auth.uid())),
    'simulations', coalesce((select jsonb_agg(to_jsonb(s) order by s.cree_le)
                             from public.simulations s where s.user_id = (select auth.uid())), '[]'::jsonb),
    'abonnement', (select to_jsonb(a) from public.abonnements a where a.user_id = (select auth.uid())),
    'paiements', coalesce((select jsonb_agg(jsonb_build_object('formule', x.formule, 'montant_millimes', x.montant_millimes,
                             'statut', x.statut, 'cree_le', x.cree_le, 'paye_le', x.paye_le, 'reference', x.reference) order by x.cree_le)
                           from public.paiements x where x.user_id = (select auth.uid())), '[]'::jsonb)
  );
$$;
