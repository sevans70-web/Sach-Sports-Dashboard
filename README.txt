CFB OWLS LIVE PROPS — NEXT.JS

FILES:
1. frontend/app/api/cfb/rankings/route.ts
   COMPLETE REPLACEMENT FILE.
   Connects the actual CFB Player Rankings API to Owls Insight.
   Reads OWLS_INSIGHT_API_KEY from Railway.
   Pulls NCAAF player props from Owls, aggregates sportsbook lines by player/game,
   keeps sportsbook-only eligibility, enriches players with existing ESPN profile/history
   data for photos and model projections, and returns the existing ranking response shape.

2. README.txt
   This instruction file.

REPLACE:
frontend/app/api/cfb/rankings/route.ts

DO NOT CHANGE:
- CFB dashboard component
- CFB visual layout
- Four detail boxes
- cfb-server.ts
- diagnostic endpoint

COMMIT MESSAGE:
Connect CFB player rankings to Owls Insight props

AFTER DEPLOY:
Open the normal CFB dashboard and check Passing Yards first.
