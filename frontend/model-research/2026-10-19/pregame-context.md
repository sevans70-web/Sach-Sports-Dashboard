# NBA pregame evidence capture

NBA ranking and existing research-capture paths now retain exact-fixture official summary evidence before tipoff. Each player context contains game/player/team/opponent IDs, official event season, scheduled time, retrieval time, source URL and SHA-256 of the retrieved source payload. Provider publication time remains unknown. The normal public-provider transport can reuse responses for 30 seconds; retrieval time is not presented as a provider update time.

The adapter preserves explicit starter flags and reported player/teammate injury statuses with source notes. Cards reuse their existing availability-note display for a reported injury. An unlisted player remains availability-unknown; roster membership or an empty injury list does not establish health or expected minutes. Unpublished lineups remain unconfirmed.

Live/completed summaries, after-tipoff reads, wrong fixture IDs, ambiguous team identities, another team and changed tipoff times cannot become this player's pregame evidence. Source failures retain cards with null context. Concurrent NBA markets share one summary read per fixture, with four source requests at most in a batch. Existing research archives carry the added context through their existing retention and backup path; no new wagering records or storage configuration are introduced.

The adapter supports NBA, WNBA and CBB source formats; this bundle connects **NBA only**. No cross-sport deployment claim is made for the other formats. Football and hockey context ingestion remain separate work.

Live official-source check on 19 October 2026: all 25 current NBA points-board players joined to their exact fixtures, teams and scheduled times across events 401909088, 401909089 and 401909090. Those six team sections contained 14 injury entries, including three day-to-day reports for players represented on the board. No explicit starters were published in those retrieved summaries, so none were inferred. These observations describe the retrieved sources, not permanent lineup or injury conclusions.

Expected minutes, usage, rotation share, opponent features and complete availability are explicitly missing. This is the start of prospective pregame context collection, not a reconstructed historical feature dataset. The forecasts still need those inputs and independent validation. No GI score or betting pick is enabled.
