-- Mode test des paiements : seuls les comptes « testeurs » (ou à accès offert) peuvent utiliser
-- le paiement simulé. Les autres voient « le paiement en ligne ouvre bientôt » tant qu'aucune
-- vraie passerelle n'est configurée (secret PASSERELLE dans Supabase).
alter table public.abonnements add column testeur boolean not null default false;
comment on column public.abonnements.testeur is 'Compte autorisé à utiliser le paiement de TEST (mode PASSERELLE=test). Réglé par l''administrateur uniquement.';
-- Désigner un testeur (éditeur SQL de Supabase) :
--   update public.abonnements set testeur = true where user_id = (select id from auth.users where email = '...');
