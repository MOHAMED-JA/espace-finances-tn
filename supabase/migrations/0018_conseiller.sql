-- 0018 — Mode conseiller (lot C, maquette C4 validée le 16 oct. 2026).
-- Un conseiller (banque, assurance, expert-comptable) voit, en lecture seule, l'Orbite des clients qui l'ont accepté.
-- Principes :
--   * Le rôle « conseiller » n'est donné que par l'administrateur.
--   * Le conseiller doit avoir activé la double authentification : toutes ses fonctions exigent une session « aal2 ».
--   * Le client accepte avec un code d'invitation à usage unique (valable 7 jours) et retire son accord à tout moment ;
--     le retrait est immédiat.
--   * Chaque consultation est journalisée ; le client voit l'historique dans Paramètres › Partage.
--   * Aucune table n'est lisible directement : tout passe par des fonctions SECURITY DEFINER.

create table public.conseillers (
  user_id uuid primary key references auth.users (id) on delete cascade,
  nom text not null check (char_length(nom) between 2 and 60),
  ajoute_le timestamptz not null default now()
);
create table public.conseiller_invitations (
  code text primary key check (code ~ '^[A-HJ-NP-Z2-9]{10}$'),
  conseiller_id uuid not null references public.conseillers (user_id) on delete cascade,
  cree_le timestamptz not null default now(),
  expire_le timestamptz not null default now() + interval '7 days',
  utilisee_par uuid references auth.users (id) on delete set null,
  utilisee_le timestamptz
);
create index conseiller_invitations_conseiller on public.conseiller_invitations (conseiller_id, cree_le desc);
create table public.partages_conseiller (
  client_id uuid not null references auth.users (id) on delete cascade,
  conseiller_id uuid not null references public.conseillers (user_id) on delete cascade,
  accorde_le timestamptz not null default now(),
  primary key (client_id, conseiller_id)
);
create index partages_conseiller_conseiller on public.partages_conseiller (conseiller_id);
create table public.conseiller_consultations (
  id bigint generated always as identity primary key,
  conseiller_id uuid references public.conseillers (user_id) on delete set null,
  client_id uuid not null references auth.users (id) on delete cascade,
  consulte_le timestamptz not null default now()
);
create index conseiller_consultations_client on public.conseiller_consultations (client_id, consulte_le desc);

alter table public.conseillers enable row level security;
alter table public.conseiller_invitations enable row level security;
alter table public.partages_conseiller enable row level security;
alter table public.conseiller_consultations enable row level security;
revoke all on public.conseillers, public.conseiller_invitations, public.partages_conseiller, public.conseiller_consultations from anon, authenticated;

-- ---------- Outils ----------
-- Conseiller connecté avec la double authentification (aal2 exigée, même sans autre règle).
create or replace function public.exiger_conseiller()
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.conseillers where user_id = (select auth.uid())) then
    raise exception 'Réservé aux conseillers' using errcode = '42501';
  end if;
  if coalesce((select auth.jwt()) ->> 'aal', 'aal1') <> 'aal2' then
    raise exception 'Double authentification requise' using errcode = '42501';
  end if;
end;
$$;
-- Nom affiché d'un client : prénom et initiale du nom (jamais l'e-mail).
create or replace function public.nom_client(p_user uuid)
returns text language sql stable security definer set search_path = '' as $$
  select coalesce(nullif(trim(
    coalesce(u.raw_user_meta_data -> 'orbite' ->> 'prenom', '') || ' ' ||
    coalesce(left(nullif(u.raw_user_meta_data -> 'orbite' ->> 'nom', ''), 1) || '.', '')), ''), 'Client')
  from auth.users u where u.id = p_user;
$$;
-- Journalise une consultation (une seule par quart d'heure et par client, pour un historique lisible).
create or replace function public.noter_consultation(p_client uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.conseiller_consultations
                 where conseiller_id = (select auth.uid()) and client_id = p_client and consulte_le > now() - interval '15 minutes') then
    insert into public.conseiller_consultations (conseiller_id, client_id) values ((select auth.uid()), p_client);
  end if;
end;
$$;

-- ---------- Tout compte connecté ----------
create or replace function public.conseiller_moi()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'conseiller', exists (select 1 from public.conseillers where user_id = (select auth.uid())),
    'nom', (select nom from public.conseillers where user_id = (select auth.uid())),
    'aal2', coalesce((select auth.jwt()) ->> 'aal', 'aal1') = 'aal2'
  );
$$;

-- ---------- Côté client ----------
create or replace function public.partage_conseiller_etat()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'conseiller', c.user_id, 'nom', c.nom, 'accorde_le', p.accorde_le,
    'consultations', (select count(*) from public.conseiller_consultations k where k.client_id = p.client_id and k.conseiller_id = c.user_id),
    'dernieres', coalesce((select jsonb_agg(k.consulte_le order by k.consulte_le desc) from (
      select consulte_le from public.conseiller_consultations k where k.client_id = p.client_id and k.conseiller_id = c.user_id
      order by consulte_le desc limit 20) k), '[]'::jsonb)
  ) order by p.accorde_le desc), '[]'::jsonb)
  from public.partages_conseiller p join public.conseillers c on c.user_id = p.conseiller_id
  where p.client_id = (select auth.uid());
$$;

-- Qui invite ? (avant d'accepter) : le nom du conseiller seulement.
create or replace function public.partage_conseiller_voir(p_code text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare r jsonb;
begin
  if (select auth.uid()) is null then raise exception 'Connexion requise' using errcode = '42501'; end if;
  select jsonb_build_object('nom', c.nom, 'expire_le', i.expire_le) into r
  from public.conseiller_invitations i join public.conseillers c on c.user_id = i.conseiller_id
  where i.code = upper(trim(p_code)) and i.utilisee_par is null and i.expire_le > now() and i.conseiller_id <> (select auth.uid());
  if r is null then raise exception 'Code inconnu, déjà utilisé ou expiré' using errcode = 'P0002'; end if;
  return r;
end;
$$;

create or replace function public.partage_conseiller_accepter(p_code text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_conseiller uuid;
begin
  if (select auth.uid()) is null then raise exception 'Connexion requise' using errcode = '42501'; end if;
  if not public.mfa_ok() then raise exception 'Double authentification requise' using errcode = '42501'; end if;
  update public.conseiller_invitations set utilisee_par = (select auth.uid()), utilisee_le = now()
  where code = upper(trim(p_code)) and utilisee_par is null and expire_le > now() and conseiller_id <> (select auth.uid())
  returning conseiller_id into v_conseiller;
  if v_conseiller is null then raise exception 'Code inconnu, déjà utilisé ou expiré' using errcode = 'P0002'; end if;
  insert into public.partages_conseiller (client_id, conseiller_id) values ((select auth.uid()), v_conseiller)
  on conflict (client_id, conseiller_id) do nothing;
  return public.partage_conseiller_etat();
end;
$$;

create or replace function public.partage_conseiller_retirer(p_conseiller uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null then raise exception 'Connexion requise' using errcode = '42501'; end if;
  if not public.mfa_ok() then raise exception 'Double authentification requise' using errcode = '42501'; end if;
  delete from public.partages_conseiller where client_id = (select auth.uid()) and conseiller_id = p_conseiller;
  return public.partage_conseiller_etat();
end;
$$;

-- ---------- Côté conseiller (double authentification exigée) ----------
create or replace function public.conseiller_inviter()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_code text;
  v_alpha constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_octets bytea;
begin
  perform public.exiger_conseiller();
  if (select count(*) from public.conseiller_invitations where conseiller_id = (select auth.uid()) and utilisee_par is null and expire_le > now()) >= 20 then
    raise exception 'Trop d''invitations en attente (20 au plus)' using errcode = '54000';
  end if;
  loop
    v_octets := extensions.gen_random_bytes(10);
    v_code := '';
    for i in 0..9 loop v_code := v_code || substr(v_alpha, (get_byte(v_octets, i) % 32) + 1, 1); end loop;
    exit when not exists (select 1 from public.conseiller_invitations where code = v_code);
  end loop;
  insert into public.conseiller_invitations (code, conseiller_id) values (v_code, (select auth.uid()));
  return jsonb_build_object('code', v_code, 'expire_le', now() + interval '7 days');
end;
$$;

-- Clients qui ont accepté, avec leur profil Orbite (lecture seule) ; chaque lecture est journalisée.
create or replace function public.conseiller_clients()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r jsonb;
begin
  perform public.exiger_conseiller();
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', p.client_id, 'nom', public.nom_client(p.client_id), 'accorde_le', p.accorde_le,
    'profil', coalesce(u.raw_user_meta_data -> 'orbite', '{}'::jsonb)
  ) order by p.accorde_le desc), '[]'::jsonb) into r
  from public.partages_conseiller p join auth.users u on u.id = p.client_id
  where p.conseiller_id = (select auth.uid());
  perform public.noter_consultation(p.client_id) from public.partages_conseiller p where p.conseiller_id = (select auth.uid());
  return r;
end;
$$;

create or replace function public.conseiller_invitations_en_cours()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.exiger_conseiller();
  return coalesce((select jsonb_agg(jsonb_build_object('code', code, 'expire_le', expire_le) order by cree_le desc)
    from public.conseiller_invitations where conseiller_id = (select auth.uid()) and utilisee_par is null and expire_le > now()), '[]'::jsonb);
end;
$$;

-- ---------- Côté administrateur ----------
create or replace function public.admin_conseillers()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.exiger_admin();
  return coalesce((select jsonb_agg(jsonb_build_object('id', c.user_id, 'nom', c.nom, 'email', u.email, 'ajoute_le', c.ajoute_le,
    'clients', (select count(*) from public.partages_conseiller p where p.conseiller_id = c.user_id)) order by c.ajoute_le desc)
    from public.conseillers c join auth.users u on u.id = c.user_id), '[]'::jsonb);
end;
$$;

create or replace function public.admin_conseiller_definir(p_email text, p_nom text, p_actif boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_user uuid;
begin
  perform public.exiger_admin();
  select id into v_user from auth.users where lower(email) = lower(trim(p_email));
  if v_user is null then raise exception 'Aucun compte avec cette adresse' using errcode = 'P0002'; end if;
  if coalesce(p_actif, false) then
    insert into public.conseillers (user_id, nom) values (v_user, trim(p_nom))
    on conflict (user_id) do update set nom = excluded.nom;
  else
    delete from public.conseillers where user_id = v_user;
  end if;
  return public.admin_conseillers();
end;
$$;

-- ---------- Droits ----------
revoke all on function public.exiger_conseiller(), public.nom_client(uuid), public.noter_consultation(uuid) from public, anon, authenticated;
revoke all on function public.conseiller_moi(), public.partage_conseiller_etat(), public.partage_conseiller_voir(text), public.partage_conseiller_accepter(text),
  public.partage_conseiller_retirer(uuid), public.conseiller_inviter(), public.conseiller_clients(), public.conseiller_invitations_en_cours(),
  public.admin_conseillers(), public.admin_conseiller_definir(text, text, boolean) from public, anon;
grant execute on function public.conseiller_moi(), public.partage_conseiller_etat(), public.partage_conseiller_voir(text), public.partage_conseiller_accepter(text),
  public.partage_conseiller_retirer(uuid), public.conseiller_inviter(), public.conseiller_clients(), public.conseiller_invitations_en_cours(),
  public.admin_conseillers(), public.admin_conseiller_definir(text, text, boolean) to authenticated;
