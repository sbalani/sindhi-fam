# Vansh v0.13.0

## Voice interpretation
- Fixed names such as "is called Paco" / "is named Serena" so `called` and `named` are not saved as part of the name.
- Stops filler such as "I repeat" from leaking into names.
- Keeps scanning an entire recording for multiple relationship clauses.
- Understands half-brother / half-sister, stepbrother / stepsister, stepfather / stepmother, and adoptive father / mother qualifiers.
- Stores a relationship qualifier separately from the core graph relationship so a half-sister remains a sibling connection without being shown as a full sibling.
- Understands simple remarriage statements such as "my father remarried to a girl named Maria" as a spouse connection instead of naming the father "remarried...".

## My Family
- The owner of a private family graph can delete any incorrect non-self family record in that graph.
- My Family cards show the direct relationship to you where Vansh can determine it, including Half-sister, Stepbrother, Stepfather, etc.

## Places
- Added a dedicated Places page with a world map for your own family story.
- Family map popups may show names because they contain only people already visible in your private tree.
- Location selection stores city/country plus latitude/longitude when available.
- Voice-import locations are geocoded before saving when the place-search service is available.
- Old free-text places are listed as "needs location matching" so they can be corrected.

## Sindhis worldwide
- Added an anonymous community world map.
- The Supabase RPC returns only aggregated city/country counts and coordinates; it does not return names, emails, member IDs, user IDs, or family IDs.
- Country totals are based on distinct mapped people, not a sum of city rows.

## Required database update
Run `RUN_THIS_IN_SUPABASE_FOR_V013.sql` in Supabase SQL Editor before testing v0.13.

## Place search
For local development, `voice_backend/2 - START VOICE BACKEND.bat` now also exposes a rate-limited `/places/search` endpoint.
For deployment, an equivalent Supabase Edge Function is included at `supabase/functions/search-places/index.ts`.
