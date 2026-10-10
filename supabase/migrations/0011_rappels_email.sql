-- Orbite : rappels par email (Brevo), envoyés chaque jour à 12 h 30 (heure de Tunis) par la fonction serveur « rappels-email ».
--   * Le navigateur calcule les rappels (mêmes modules que l'application) et enregistre un PLAN daté, textes SANS MONTANT :
--     rappels_plan_enregistrer(plan). La fonction serveur n'envoie que les rappels échus, jamais deux fois (rappels_envoyes).
--   * Destinataires : comptes avec user_metadata.orbite.rappelsEmail = true, non désinscrits, email de connexion vérifié.
--     Adresse : celle de connexion, ou l'adresse de contact une fois CONFIRMÉE par un clic (email de confirmation limité).
--   * Désinscription en un clic par un jeton aléatoire propre à chaque compte (aucune connexion, ne révèle rien d'autre).
--   * Les tables sont fermées : lecture de sa propre ligne seulement ; toute écriture passe par les fonctions ci-dessous.
--   * Le déclenchement quotidien (pg_cron → pg_net) présente un jeton tiré au hasard dans le coffre (Vault) : aucune valeur
--     secrète n'apparaît dans ce dépôt.

create extension if not exists pg_cron;
create extension if not exists pg_net;

create table if not exists public.rappels_email (
  user_id uuid primary key references auth.users (id) on delete cascade,
  plan jsonb not null default '[]'::jsonb,
  plan_maj timestamptz,
  jeton uuid not null default gen_random_uuid() unique,
  desinscrit_le timestamptz,
  adresse_confirmee text,
  confirmation_adresse text,
  confirmation_jeton uuid unique,
  confirmation_envoyee_le timestamptz,
  confirmation_nb integer not null default 0,
  dernier_envoi timestamptz
);
create table if not exists public.rappels_envoyes (
  user_id uuid not null references auth.users (id) on delete cascade,
  rappel_id text not null,
  envoye_le timestamptz not null default now(),
  primary key (user_id, rappel_id)
);
alter table public.rappels_email enable row level security;
alter table public.rappels_envoyes enable row level security;
drop policy if exists "rappels_email : sa ligne" on public.rappels_email;
create policy "rappels_email : sa ligne" on public.rappels_email for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "rappels_envoyes : ses envois" on public.rappels_envoyes;
create policy "rappels_envoyes : ses envois" on public.rappels_envoyes for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.rappels_email, public.rappels_envoyes from anon;
revoke insert, update, delete, truncate on public.rappels_email, public.rappels_envoyes from authenticated;

-- Garde des fonctions réservées à la fonction serveur : en plus du retrait des droits (revoke plus bas), chacune vérifie
-- elle-même le rôle de l'appel. Protection maintenue même si un droit d'exécution était rendu par erreur.
create or replace function public.rappels_exiger_serveur()
returns void language plpgsql stable security invoker set search_path = '' as $$
begin
  if coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'Réservé au serveur' using errcode = '42501';
  end if;
end;
$$;

-- ---------- Côté utilisateur connecté ----------
create or replace function public.rappels_etat_de(p_user uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if p_user is distinct from (select auth.uid()) then perform public.rappels_exiger_serveur(); end if;
  return coalesce((select jsonb_build_object(
    'desinscrit_le', r.desinscrit_le, 'adresse_confirmee', r.adresse_confirmee,
    'confirmation_adresse', r.confirmation_adresse, 'confirmation_envoyee_le', r.confirmation_envoyee_le,
    'dernier_envoi', r.dernier_envoi, 'plan_maj', r.plan_maj)
    from public.rappels_email r where r.user_id = p_user), '{}'::jsonb);
end;
$$;
revoke all on function public.rappels_etat_de(uuid) from public, anon, authenticated;

create or replace function public.rappels_plan_enregistrer(p_plan jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := (select auth.uid());
begin
  if uid is null then raise exception 'Non authentifié' using errcode = '42501'; end if;
  if p_plan is null or jsonb_typeof(p_plan) <> 'array' or jsonb_array_length(p_plan) > 40 or octet_length(p_plan::text) > 32000 then
    raise exception 'Plan de rappels invalide' using errcode = '22023';
  end if;
  insert into public.rappels_email (user_id, plan, plan_maj) values (uid, p_plan, now())
  on conflict (user_id) do update set plan = excluded.plan, plan_maj = excluded.plan_maj;
  return public.rappels_etat_de(uid);
end;
$$;

create or replace function public.rappels_mon_etat()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := (select auth.uid());
begin
  if uid is null then raise exception 'Non authentifié' using errcode = '42501'; end if;
  return public.rappels_etat_de(uid);
end;
$$;

-- L'utilisateur recoche « Recevoir mes rappels par email » dans son profil : la désinscription précédente est levée.
create or replace function public.rappels_reactiver()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := (select auth.uid());
begin
  if uid is null then raise exception 'Non authentifié' using errcode = '42501'; end if;
  insert into public.rappels_email (user_id) values (uid) on conflict (user_id) do update set desinscrit_le = null;
  return public.rappels_etat_de(uid);
end;
$$;
revoke all on function public.rappels_plan_enregistrer(jsonb), public.rappels_mon_etat(), public.rappels_reactiver() from public, anon;
grant execute on function public.rappels_plan_enregistrer(jsonb), public.rappels_mon_etat(), public.rappels_reactiver() to authenticated;

-- ---------- Liens des emails (sans connexion, par jeton) ----------
-- Désinscription : bloque les envois et décoche aussi la case du profil.
create or replace function public.rappels_desinscrire(p_jeton uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid;
begin
  update public.rappels_email set desinscrit_le = coalesce(desinscrit_le, now()) where jeton = p_jeton returning user_id into uid;
  if uid is null then return jsonb_build_object('ok', false); end if;
  update auth.users set raw_user_meta_data = jsonb_set(raw_user_meta_data, '{orbite,rappelsEmail}', 'false'::jsonb)
    where id = uid and jsonb_typeof(raw_user_meta_data -> 'orbite') = 'object';
  return jsonb_build_object('ok', true, 'prenom', (select left(u.raw_user_meta_data -> 'orbite' ->> 'prenom', 40) from auth.users u where u.id = uid));
end;
$$;

-- « Réactiver les emails » depuis la page de désinscription.
create or replace function public.rappels_reabonner(p_jeton uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid;
begin
  update public.rappels_email set desinscrit_le = null where jeton = p_jeton returning user_id into uid;
  if uid is null then return jsonb_build_object('ok', false); end if;
  update auth.users set raw_user_meta_data = jsonb_set(raw_user_meta_data, '{orbite,rappelsEmail}', 'true'::jsonb)
    where id = uid and jsonb_typeof(raw_user_meta_data -> 'orbite') = 'object';
  return jsonb_build_object('ok', true);
end;
$$;

-- Confirmation d'une adresse de contact (lien valable 7 jours).
create or replace function public.rappels_confirmer_adresse(p_jeton uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare a text;
begin
  update public.rappels_email
     set adresse_confirmee = confirmation_adresse, confirmation_adresse = null, confirmation_jeton = null, confirmation_nb = 0
   where confirmation_jeton = p_jeton and confirmation_envoyee_le > now() - interval '7 days'
  returning adresse_confirmee into a;
  if a is null then return jsonb_build_object('ok', false); end if;
  return jsonb_build_object('ok', true, 'adresse', a);
end;
$$;
revoke all on function public.rappels_desinscrire(uuid), public.rappels_reabonner(uuid), public.rappels_confirmer_adresse(uuid) from public;
grant execute on function public.rappels_desinscrire(uuid), public.rappels_reabonner(uuid), public.rappels_confirmer_adresse(uuid) to anon, authenticated;

-- ---------- Réservé à la fonction serveur (service_role) ----------
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
  cross join lateral (select u.raw_user_meta_data -> 'orbite' as o) m
  left join public.abonnements a on a.user_id = u.id
  where r.desinscrit_le is null
    and coalesce(m.o ->> 'rappelsEmail', '') = 'true'
    and u.email_confirmed_at is not null
    and (p_user is null or u.id = p_user));
end;
$$;

-- Prépare un email de confirmation. Limites : une demande par heure, 5 au plus en 7 jours pour une même adresse en attente.
-- Renvoie le jeton à mettre dans le lien, ou null si la limite est atteinte.
create or replace function public.rappels_demander_confirmation(p_user uuid, p_adresse text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare r public.rappels_email; adr text := lower(trim(p_adresse)); j uuid := gen_random_uuid();
begin
  perform public.rappels_exiger_serveur();
  select * into r from public.rappels_email where user_id = p_user for update;
  if not found or adr is null or adr = '' or length(adr) > 120 then return null; end if;
  if r.confirmation_envoyee_le is not null and r.confirmation_envoyee_le > now() - interval '1 hour' then return null; end if;
  if r.confirmation_adresse = adr and r.confirmation_nb >= 5 and r.confirmation_envoyee_le > now() - interval '7 days' then return null; end if;
  update public.rappels_email set
    confirmation_nb = case when confirmation_adresse = adr and confirmation_envoyee_le > now() - interval '7 days' then confirmation_nb + 1 else 1 end,
    confirmation_adresse = adr, confirmation_jeton = j, confirmation_envoyee_le = now()
  where user_id = p_user;
  return j;
end;
$$;

create or replace function public.rappels_noter_envoi(p_user uuid, p_ids text[])
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.rappels_exiger_serveur();
  insert into public.rappels_envoyes (user_id, rappel_id)
    select p_user, x from unnest(p_ids) x where x ~ '^[A-Za-z0-9_-]{1,80}$'
  on conflict do nothing;
  update public.rappels_email set dernier_envoi = now() where user_id = p_user;
end;
$$;

create or replace function public.rappels_verifier_cron(p_jeton text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.rappels_exiger_serveur();
  return coalesce(length(p_jeton) >= 32 and exists (
    select 1 from vault.decrypted_secrets s where s.name = 'rappels_cron' and s.decrypted_secret = p_jeton), false);
end;
$$;
revoke all on function public.rappels_destinataires(uuid), public.rappels_demander_confirmation(uuid, text),
  public.rappels_noter_envoi(uuid, text[]), public.rappels_verifier_cron(text) from public, anon, authenticated;
grant execute on function public.rappels_destinataires(uuid), public.rappels_demander_confirmation(uuid, text),
  public.rappels_noter_envoi(uuid, text[]), public.rappels_verifier_cron(text) to service_role;

-- ---------- Export des données personnelles : inclut les rappels par email ----------
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
                                 from public.rappels_envoyes e where e.user_id = (select auth.uid())), '[]'::jsonb)
  );
$$;

-- ---------- Déclenchement quotidien : 11 h 30 UTC = 12 h 30 à Tunis (UTC+1 toute l'année) ----------
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'rappels_cron') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'rappels_cron', 'Jeton du déclenchement quotidien des rappels par email');
  end if;
end $$;

select cron.unschedule(jobid) from cron.job where jobname = 'orbite-rappels-email';
select cron.schedule('orbite-rappels-email', '30 11 * * *', $cmd$
  select net.http_post(
    url := 'https://txrwgqgnqdkipwtwpevl.supabase.co/functions/v1/rappels-email',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-orbite-cron', (select decrypted_secret from vault.decrypted_secrets where name = 'rappels_cron')),
    body := '{"action":"quotidien"}'::jsonb,
    timeout_milliseconds := 120000);
$cmd$);
