-- 0022 — Limite des codes de conseiller réellement comptée (vérifiée en production le 27 oct. 2026).
-- Avec 0021, partage_conseiller_voir levait une erreur pour un code faux : l'erreur annule toute la transaction,
-- y compris le compteur d'essais, qui ne montait donc jamais. Désormais, un code faux ou une limite atteinte
-- renvoient { erreur, message } sans erreur SQL : l'essai reste compté. Même règle pour partage_conseiller_accepter,
-- qu'un robot pouvait appeler directement. Les deux partagent la limite « code_conseiller » (20 par heure).
-- Le client (session.js) transforme { erreur, message } en erreur, comme avant.

create or replace function public.partage_conseiller_voir(p_code text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r jsonb;
begin
  if (select auth.uid()) is null then raise exception 'Connexion requise' using errcode = '42501'; end if;
  if not public.limiter_appels('code_conseiller', 20, interval '1 hour') then
    return jsonb_build_object('erreur', 'P0001', 'message', 'Trop d''essais : réessayez dans une heure');
  end if;
  select jsonb_build_object('nom', c.nom, 'expire_le', i.expire_le) into r
  from public.conseiller_invitations i join public.conseillers c on c.user_id = i.conseiller_id
  where i.code = upper(trim(p_code)) and i.utilisee_par is null and i.expire_le > now() and i.conseiller_id <> (select auth.uid());
  if r is null then return jsonb_build_object('erreur', 'P0002', 'message', 'Code inconnu, déjà utilisé ou expiré'); end if;
  return r;
end;
$$;

create or replace function public.partage_conseiller_accepter(p_code text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_conseiller uuid;
begin
  if (select auth.uid()) is null then raise exception 'Connexion requise' using errcode = '42501'; end if;
  if not public.mfa_ok() then raise exception 'Double authentification requise' using errcode = '42501'; end if;
  if not public.limiter_appels('code_conseiller', 20, interval '1 hour') then
    return jsonb_build_object('erreur', 'P0001', 'message', 'Trop d''essais : réessayez dans une heure');
  end if;
  update public.conseiller_invitations set utilisee_par = (select auth.uid()), utilisee_le = now()
  where code = upper(trim(p_code)) and utilisee_par is null and expire_le > now() and conseiller_id <> (select auth.uid())
  returning conseiller_id into v_conseiller;
  if v_conseiller is null then return jsonb_build_object('erreur', 'P0002', 'message', 'Code inconnu, déjà utilisé ou expiré'); end if;
  insert into public.partages_conseiller (client_id, conseiller_id) values ((select auth.uid()), v_conseiller)
  on conflict (client_id, conseiller_id) do nothing;
  return public.partage_conseiller_etat();
end;
$$;
