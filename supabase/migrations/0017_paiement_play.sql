-- 0017 — Paiement par Google Play (application Android, Trusted Web Activity tn.orbite.app).
-- La fonction serveur « paiement » (action « play ») vérifie l'achat auprès de Google, puis l'enregistre ici avec
-- passerelle = 'play' et l'EMPREINTE du jeton d'achat (SHA-256, jamais le jeton lui-même) dans reference_passerelle.
-- L'index unique garantit qu'un même achat n'active l'abonnement qu'une seule fois, pour un seul compte.

alter table public.paiements drop constraint if exists paiements_passerelle_check;
alter table public.paiements add constraint paiements_passerelle_check
  check (passerelle in ('test', 'konnect', 'flouci', 'clictopay', 'play'));

create unique index if not exists paiements_play_achat on public.paiements (reference_passerelle) where passerelle = 'play';
