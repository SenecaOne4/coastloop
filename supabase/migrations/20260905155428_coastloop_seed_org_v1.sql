insert into public.organizations (name, slug)
values ('CoastLoop', 'coastloop')
on conflict (slug) do update set name = excluded.name;
