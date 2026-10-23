-- Club logo: a square image shown as a round avatar on club cards and the club page header.
--
-- Stored like the gallery photos: a public URL in the `club-assets` bucket, under the club's own
-- folder (`<orgId>/<uuid>.<ext>`). The app renders it only after checking it lives in that folder
-- (lib/club-profile.ts), so a forged URL is never shown.

ALTER TABLE public.organizations
  ADD COLUMN logo_url text;

ALTER TABLE public.organizations
  ADD CONSTRAINT organizations_logo_url_len CHECK (logo_url IS NULL OR char_length(logo_url) <= 500);

-- Column-level SELECT is in force on this table: the logo is public, like the gallery
-- (RLS still limits anon to approved clubs).
GRANT SELECT (logo_url) ON public.organizations TO anon, authenticated;
-- Writes: none from clients. The owner sets it through a Server Action that uses the service role
-- after a role check (lib/actions/club-profile.ts), exactly like the gallery.
