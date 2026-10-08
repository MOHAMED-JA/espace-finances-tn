-- Espace Finances TN : profils et simulations, protégés par RLS.
-- Chaque utilisateur ne voit et ne modifie que ses propres données.
-- (Migration appliquée sur le projet Supabase « espace-finances-tn ».)

create table public.profils (
  id uuid primary key references auth.users (id) on delete cascade,
  nom_affiche text check (char_length(nom_affiche) <= 80),
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now()
);

create table public.simulations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  outil text not null check (outil in ('salaire', 'assurance_vie', 'credit')),
  nom text not null check (char_length(nom) between 1 and 120),
  parametres jsonb not null default '{}'::jsonb check (pg_column_size(parametres) <= 16384),
  resume jsonb not null default '{}'::jsonb check (pg_column_size(resume) <= 8192),
  favori boolean not null default false,
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now()
);

create index simulations_user_outil_idx on public.simulations (user_id, outil, modifie_le desc);

create or replace function public.maj_modifie_le()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.modifie_le := now();
  return new;
end;
$$;

create trigger profils_modifie_le before update on public.profils
  for each row execute function public.maj_modifie_le();
create trigger simulations_modifie_le before update on public.simulations
  for each row execute function public.maj_modifie_le();

create or replace function public.creer_profil()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profils (id, nom_affiche)
  values (new.id, left(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)), 80));
  return new;
end;
$$;

create trigger auth_creer_profil after insert on auth.users
  for each row execute function public.creer_profil();

create or replace function public.limiter_simulations()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.simulations where user_id = new.user_id) >= 200 then
    raise exception 'Limite de 200 simulations atteinte';
  end if;
  return new;
end;
$$;

create trigger simulations_limite before insert on public.simulations
  for each row execute function public.limiter_simulations();

alter table public.profils enable row level security;
alter table public.simulations enable row level security;

create policy "profil : lecture par son propriétaire" on public.profils
  for select to authenticated using ((select auth.uid()) = id);
create policy "profil : modification par son propriétaire" on public.profils
  for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

create policy "simulations : lecture" on public.simulations
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "simulations : ajout" on public.simulations
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "simulations : modification" on public.simulations
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "simulations : suppression" on public.simulations
  for delete to authenticated using ((select auth.uid()) = user_id);

revoke all on public.profils, public.simulations from anon;
grant select, update on public.profils to authenticated;
grant select, insert, update, delete on public.simulations to authenticated;
revoke execute on function public.creer_profil(), public.limiter_simulations(), public.maj_modifie_le() from public, anon, authenticated;
