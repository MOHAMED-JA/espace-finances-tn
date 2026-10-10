-- Orbite : coordonnées facultatives du profil (email de contact, téléphone).
--   * Saisies par l'utilisateur dans Mon profil › Vous (user_metadata.orbite.emailContact / telephone).
--   * L'administrateur ne les voit QUE si l'utilisateur a coché « J'accepte d'être recontacté·e » (orbite.contactOk = true) ;
--     décocher retire immédiatement le compte de la liste.
--   * Sans email de contact saisi, l'email de connexion est proposé (même compte, aucune donnée en plus).

create or replace function public.admin_contacts()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.exiger_admin();
  return coalesce((select jsonb_agg(x order by x ->> 'accorde_le' desc nulls last) from (
    select jsonb_build_object(
      'id', u.id,
      'nom', trim(coalesce(m.o ->> 'prenom', '') || ' ' || coalesce(m.o ->> 'nom', '')),
      'nom_compte', coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'nom', ''),
      'email', coalesce(nullif(m.o ->> 'emailContact', ''), u.email),
      'telephone', nullif(m.o ->> 'telephone', ''),
      'accorde_le', nullif(m.o ->> 'contactOkLe', ''),
      'rappels_email', coalesce(m.o ->> 'rappelsEmail', '') = 'true'
    ) x
    from auth.users u
    cross join lateral (select u.raw_user_meta_data -> 'orbite' as o) m
    where coalesce(m.o ->> 'contactOk', '') = 'true') t), '[]'::jsonb);
end;
$$;

revoke all on function public.admin_contacts() from public, anon;
grant execute on function public.admin_contacts() to authenticated;
