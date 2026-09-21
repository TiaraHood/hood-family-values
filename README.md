# Hood Family Values — Connected Edition

This package is configured for the Hood Family Values Supabase project and uses the existing database schema created in Supabase SQL Editor.

## Supabase setup already completed
- `profiles`
- `family_relationships`
- `family_photos`
- `announcements`
- `reunion_info`
- Row Level Security on the application tables
- `family-photos` private Storage bucket

## One remaining Supabase SQL step
Open Supabase SQL Editor, create a new query, and run `storage_policies.sql`. These policies allow authenticated family members to upload into their own folder and read the shared private family album. Private Supabase Storage files are served with time-limited signed URLs.

## Hosting
This is a static website and can be hosted free on GitHub Pages or another static host. `config.js` contains only the browser publishable key, not a service-role/secret key.

## Security
Never add a Supabase `sb_secret_*` or `service_role` key to the website.
