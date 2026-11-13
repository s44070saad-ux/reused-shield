# Reused-Content Shield (working title)

Audit a faceless/automation YouTube channel for reused-content / "inauthentic content"
risk **before** applying for monetization — plus a Provenance Vault and an Appeal Pack
for the 21-day appeal clock.

- Landing + waitlist (Supabase, insert-only)
- Supabase Auth accounts (free beta, no payments in v1)
- Channel risk audit from **public** YouTube Data API v3 metadata only
  (channels.list + playlistItems.list + videos.list ≈ 3 quota units per audit;
  thumbnails perceptually hashed server-side with sharp)
- Per-video flags, plain-language reasons, impact-ordered fix list
- Guided self-check (self-reported, always shown separately)
- Provenance Vault: timestamped scripts / voiceover / sources / project-file evidence
- Appeal Pack: audit + provenance + factual letter builder + 21-day / 30-90-day deadline tracker

The score is a **risk estimate from public signals**. Only YouTube decides monetization.

Setup: see SETUP.md. Schema: `supabase/schema.sql`.
Product name lives in one place: `lib/config.ts` (`PRODUCT_NAME`).
