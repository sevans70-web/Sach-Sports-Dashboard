# Historical saving safeguards

All eight sports retain the existing ten-minute history cycle and six-hour full
Google Drive backup. Existing archive verification and seven Toronto calendar
day retention rules are unchanged; hidden dashboards remain hidden.

* A featured category gets an immutable `protected_featured_original_*` receipt
  before the top-plays response publishes it. The daily selection still preserves
  the first saved choice. Existing selections imported when this feature starts
  are receipts of the existing record, not proof of an earlier lost original.
* Protected receipts enter a persistent local replication outbox before writing.
  Successful cloud replication requires the existing checksum read-back. Failure
  keeps both receipt and job. Two replication workers are allowed at a time.
* A separate guard checks each sport approximately every 30 seconds without
  waiting for the sequential ten-minute cycle. Within five minutes of a known
  game's start, it protects the latest available recorded pregame market rows
  and requests a fresh capture. The original row timestamps remain unchanged;
  no post-start evidence is labelled pregame. Capture requests coalesce.
* Started games are checked every five minutes, beginning one hour after their
  scheduled start, for up to seven days. At most two games per sport are checked
  each guard run. Full official boxscores are protected only after a confirmed
  final state, correct game identity and populated source data. Existing sport
  graders then run; no pick/result is manufactured from the final snapshot.
* Games must have been discovered in saved boards or predictions. Absent quotes,
  unavailable sources and missing Soccer league identity remain explicit gaps.
  Delayed collection, provider outages and restarts can prevent a last-minute
  refresh; an older authentic pregame snapshot remains valid historical evidence.

`GET /api/history/safeguards` reports policy and per-sport last completed guard,
known games, final checks, saved checkpoints, cloud verification and errors.
`POST /api/history/safeguards?sport=nfl` queues an idempotent background guard.
The status and persistent outbox survive app restarts on the existing volume.
