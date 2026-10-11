-- Orbite : acceptation de la politique de confidentialité et des CGV (preuve horodatée, une ligne par version acceptée).
-- Chaque utilisateur ne voit et n'ajoute que ses propres lignes ; aucune modification ni suppression possible depuis
-- l'application (la ligne disparaît seulement avec le compte, par cascade). La date est posée par le serveur.

create table if not exists public.consentements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  version text not null check (version ~ '^\d{4}-\d{2}-\d{2}$'),
  documents text not null default 'confidentialite+cgv' check (documents in ('confidentialite+cgv')),
  accepte_le timestamptz not null default now(),
  unique (user_id, version)
);
create index if not exists consentements_user_idx on public.consentements (user_id, accepte_le desc);

-- Date imposée par le serveur (jamais celle envoyée par le navigateur) et limite de lignes par compte.
create or replace function public.consentements_controler()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.accepte_le := now();
  if (select count(*) from public.consentements where user_id = new.user_id) >= 50 then
    raise exception 'Limite de 50 acceptations atteinte';
  end if;
  return new;
end;
$$;
revoke all on function public.consentements_controler() from public, anon, authenticated;

drop trigger if exists consentements_controle on public.consentements;
create trigger consentements_controle before insert on public.consentements
  for each row execute function public.consentements_controler();

alter table public.consentements enable row level security;
create policy "consentements : lecture" on public.consentements for select to authenticated using ((select auth.uid()) = user_id);
create policy "consentements : ajout" on public.consentements for insert to authenticated with check ((select auth.uid()) = user_id);

revoke all on public.consentements from anon;
revoke all on public.consentements from authenticated;
grant select, insert on public.consentements to authenticated;

-- Export (droit d'accès) : acceptations ajoutées.
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
                                      from public.objectifs_versements v where v.user_id = (select auth.uid())), '[]'::jsonb),
    'consentements', coalesce((select jsonb_agg(jsonb_build_object('version', c.version, 'documents', c.documents, 'accepte_le', c.accepte_le) order by c.accepte_le)
                               from public.consentements c where c.user_id = (select auth.uid())), '[]'::jsonb)
  );
$$;
