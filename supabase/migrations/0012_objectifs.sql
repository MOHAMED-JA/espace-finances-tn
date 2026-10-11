-- Orbite : « Ma progression » (lot 3) — objectifs et versements, protégés par RLS.
-- Chaque utilisateur ne voit et ne modifie que ses propres lignes ; limites : 12 objectifs, 600 versements.
-- Les montants restent dans la base (jamais dans les emails de rappel, qui n'emploient que le type de l'objectif).
-- (Appliquée sur le projet Supabase le 11 oct. 2026 ; droits et RLS vérifiés avec un essai annulé.)

create table if not exists public.objectifs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  type text not null check (type in ('projet', 'precaution', 'credit', 'impot')),
  libelle text not null default '' check (char_length(libelle) <= 60),
  cible numeric(12, 3) not null default 0 check (cible >= 0 and cible <= 100000000),
  depart numeric(12, 3) not null default 0 check (depart >= 0 and depart <= 100000000),
  echeance date check (echeance between date '2000-01-01' and date '2100-12-31'),
  credit smallint check (credit between 0 and 49),
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now(),
  check (type = 'credit' or credit is null)
);
create index if not exists objectifs_user_idx on public.objectifs (user_id, cree_le);

create table if not exists public.objectifs_versements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  objectif_id uuid not null references public.objectifs (id) on delete cascade,
  montant numeric(12, 3) not null check (montant > 0 and montant <= 10000000),
  le date not null default current_date check (le between date '2000-01-01' and date '2100-12-31'),
  cree_le timestamptz not null default now()
);
create index if not exists objectifs_versements_user_idx on public.objectifs_versements (user_id, le);
create index if not exists objectifs_versements_objectif_idx on public.objectifs_versements (objectif_id);

drop trigger if exists objectifs_modifie_le on public.objectifs;
create trigger objectifs_modifie_le before update on public.objectifs
  for each row execute function public.maj_modifie_le();

-- Limites par utilisateur, et un versement ne peut viser qu'un objectif de son auteur.
create or replace function public.objectifs_limiter()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.objectifs where user_id = new.user_id) >= 12 then
    raise exception 'Limite de 12 objectifs atteinte';
  end if;
  return new;
end;
$$;
create or replace function public.objectifs_versements_limiter()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.objectifs o where o.id = new.objectif_id and o.user_id = new.user_id) then
    raise exception 'Objectif introuvable';
  end if;
  if (select count(*) from public.objectifs_versements where user_id = new.user_id) >= 600 then
    raise exception 'Limite de 600 versements atteinte';
  end if;
  return new;
end;
$$;
revoke all on function public.objectifs_limiter(), public.objectifs_versements_limiter() from public, anon, authenticated;

drop trigger if exists objectifs_limite on public.objectifs;
create trigger objectifs_limite before insert on public.objectifs
  for each row execute function public.objectifs_limiter();
drop trigger if exists objectifs_versements_limite on public.objectifs_versements;
create trigger objectifs_versements_limite before insert or update on public.objectifs_versements
  for each row execute function public.objectifs_versements_limiter();

alter table public.objectifs enable row level security;
alter table public.objectifs_versements enable row level security;

create policy "objectifs : lecture" on public.objectifs for select to authenticated using ((select auth.uid()) = user_id);
create policy "objectifs : ajout" on public.objectifs for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "objectifs : modification" on public.objectifs for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "objectifs : suppression" on public.objectifs for delete to authenticated using ((select auth.uid()) = user_id);
create policy "versements : lecture" on public.objectifs_versements for select to authenticated using ((select auth.uid()) = user_id);
create policy "versements : ajout" on public.objectifs_versements for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "versements : suppression" on public.objectifs_versements for delete to authenticated using ((select auth.uid()) = user_id);

revoke all on public.objectifs, public.objectifs_versements from anon;
grant select, insert, update, delete on public.objectifs to authenticated;
grant select, insert, delete on public.objectifs_versements to authenticated;
revoke update, truncate, references, trigger on public.objectifs_versements from authenticated;
revoke truncate, references, trigger on public.objectifs from authenticated;

-- Export (droit d'accès) : objectifs et versements ajoutés.
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
                                      from public.objectifs_versements v where v.user_id = (select auth.uid())), '[]'::jsonb)
  );
$$;
