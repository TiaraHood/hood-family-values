-- Hood Family Values storage policies for the PRIVATE family-photos bucket.
-- Run this once in Supabase SQL Editor after creating the bucket.

create policy "Family members can upload their own family photos"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'family-photos'
  and (storage.foldername(name))[2] = (select auth.uid()::text)
  and (storage.foldername(name))[1] in ('avatars', 'photos')
);

create policy "Authenticated family members can read family photos"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'family-photos'
);

create policy "Family members can delete their own uploads"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'family-photos'
  and owner_id = (select auth.uid()::text)
);
