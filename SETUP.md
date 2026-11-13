# Setup

## Env vars (Vercel + local .env.local)
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `YOUTUBE_API_KEY` — server-side only, YouTube Data API v3 key from Google Cloud Console

## Supabase
1. New project (do NOT reuse PharmaHub/Velora/RichCalls projects).
2. SQL Editor → run `supabase/schema.sql`.
3. Authentication → URL Configuration → Site URL = the Vercel domain,
   Redirect URLs = `<vercel-domain>/dashboard` and `<vercel-domain>/login`.

## YouTube API key
Google Cloud Console → create project → enable "YouTube Data API v3" →
Credentials → API key. Default quota 10,000 units/day; one audit ≈ 3 units.
