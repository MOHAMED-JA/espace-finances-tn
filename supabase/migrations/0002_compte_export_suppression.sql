-- Droits de la personne (loi organique 2004-63) : exporter et supprimer son propre compte.
-- Restreint aussi les colonnes modifiables (user_id ne peut jamais être réattribué).

create or replace function public.exporter_mes_donnees()
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'exporte_le', now(),
    'profil', (select to_jsonb(p) from public.profils p where p.id = (select auth.uid())),
    'simulations', coalesce((select jsonb_agg(to_jsonb(s) order by s.cree_le)
                             from public.simulations s where s.user_id = (select auth.uid())), '[]'::jsonb)
  );
$$;

create or replace function public.supprimer_mon_compte()
returns void language plpgsql security definer set search_path = '' as $$
declare uid uuid := (select auth.uid());
begin
  if uid is null then
    raise exception 'Non authentifié' using errcode = '42501';
  end if;
  delete from auth.users where id = uid;  -- cascade : profil et simulations
end;
$$;

revoke all on function public.exporter_mes_donnees(), public.supprimer_mon_compte() from public, anon;
grant execute on function public.exporter_mes_donnees(), public.supprimer_mon_compte() to authenticated;

revoke update on public.simulations from authenticated;
grant update (nom, parametres, resume, favori) on public.simulations to authenticated;
revoke update on public.profils from authenticated;
grant update (nom_affiche) on public.profils to authenticated;
