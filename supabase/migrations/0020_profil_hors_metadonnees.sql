-- 0020 — À appliquer une à deux semaines APRÈS la 0019, quand la nouvelle version de l'application est partout
-- (service worker « orbite-2026-10-22a » ou plus récent). Elle termine la reprise du profil financier :
-- 1. les profils encore présents dans les métadonnées sont copiés dans la table (comptes revenus entre-temps : rien
--    ne change, la table l'emporte) ;
-- 2. la copie des métadonnées est effacée : le jeton de session ne transporte plus aucune donnée financière.
-- Vérification avant : select count(*) from auth.users where raw_user_meta_data ? 'orbite';

insert into public.profils_financiers (user_id, donnees)
select u.id, u.raw_user_meta_data -> 'orbite'
from auth.users u
where jsonb_typeof(u.raw_user_meta_data -> 'orbite') = 'object'
on conflict (user_id) do nothing;

update auth.users set raw_user_meta_data = raw_user_meta_data - 'orbite'
where raw_user_meta_data ? 'orbite';
