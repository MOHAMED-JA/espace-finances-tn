-- Orbite : suivi du TMM (point 5, choix de l'utilisateur du 12 oct. 2026 : saisi chaque mois par l'administrateur,
-- historique de 24 mois affiché). Le dernier TMM saisi s'applique à tout Orbite (capacité, crédit, Et si…).
-- Aucune donnée personnelle : une ligne par mois, le taux publié par la Banque centrale de Tunisie.

create table public.tmm_mensuel (
  mois date primary key check (extract(day from mois) = 1 and mois >= date '2000-01-01' and mois <= date '2100-12-01'),
  taux numeric(6, 3) not null check (taux > 0 and taux < 30),
  saisi_le timestamptz not null default now()
);
alter table public.tmm_mensuel enable row level security;
revoke all on public.tmm_mensuel from public, anon, authenticated;

-- Lecture : les derniers mois (24 par défaut, 240 au plus), du plus récent au plus ancien.
create or replace function public.tmm_historique(p_mois integer default 24)
returns table (mois date, taux numeric) language sql stable security definer set search_path = '' as $$
  select t.mois, t.taux from public.tmm_mensuel t
  order by t.mois desc
  limit least(greatest(coalesce(p_mois, 24), 1), 240);
$$;

-- Administration : saisir (ou corriger) le TMM d'un mois, ou le retirer.
create or replace function public.admin_tmm_saisir(p_mois date, p_taux numeric)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare m date;
begin
  perform public.exiger_admin();
  if p_mois is null or p_taux is null or p_taux <= 0 or p_taux >= 30 then
    raise exception 'TMM invalide' using errcode = '22023';
  end if;
  m := date_trunc('month', p_mois)::date;
  if m > date_trunc('month', now() at time zone 'Africa/Tunis')::date then
    raise exception 'Mois à venir' using errcode = '22023';
  end if;
  insert into public.tmm_mensuel (mois, taux) values (m, round(p_taux, 3))
  on conflict (mois) do update set taux = excluded.taux, saisi_le = now();
  return jsonb_build_object('mois', m, 'taux', round(p_taux, 3));
end;
$$;

create or replace function public.admin_tmm_supprimer(p_mois date)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.exiger_admin();
  delete from public.tmm_mensuel where mois = date_trunc('month', p_mois)::date;
end;
$$;

revoke all on function public.tmm_historique(integer), public.admin_tmm_saisir(date, numeric), public.admin_tmm_supprimer(date) from public, anon;
grant execute on function public.tmm_historique(integer), public.admin_tmm_saisir(date, numeric), public.admin_tmm_supprimer(date) to authenticated;
