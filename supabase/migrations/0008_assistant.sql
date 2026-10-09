-- Orbite : Assistant (IA). Seul un compteur de questions par jour est conservé (quota anti-abus) :
-- ni les questions ni les réponses ne sont enregistrées par Orbite.
create table public.assistant_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  jour date not null default current_date,
  questions integer not null default 0 check (questions >= 0),
  primary key (user_id, jour)
);
alter table public.assistant_usage enable row level security;
revoke all on public.assistant_usage from anon, authenticated;

-- Réserve une question (appelée par la fonction serveur avec la clé de service) : vrai si le quota du jour le permet.
create or replace function public.assistant_reserver(p_user uuid, p_quota integer)
returns integer language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  insert into public.assistant_usage (user_id, jour, questions) values (p_user, current_date, 1)
  on conflict (user_id, jour) do update set questions = public.assistant_usage.questions + 1
  returning questions into n;
  if n > p_quota then
    update public.assistant_usage set questions = questions - 1 where user_id = p_user and jour = current_date;
    return -1;
  end if;
  return p_quota - n;
end;
$$;
revoke all on function public.assistant_reserver(uuid, integer) from public, anon, authenticated;

-- Rend une question réservée quand l'appel au modèle a échoué (elle n'est pas décomptée).
create or replace function public.assistant_rendre(p_user uuid)
returns void language sql security definer set search_path = '' as $$
  update public.assistant_usage set questions = greatest(0, questions - 1) where user_id = p_user and jour = current_date;
$$;
revoke all on function public.assistant_rendre(uuid) from public, anon, authenticated;
