"""Controlled CFB sportsbook refresh job.

Run this from Railway cron when desired. It makes one filtered SportsGameOdds
request and stores the result in Supabase for the dashboard to reuse.
"""
from data.cfb_odds import refresh_cfb_sportsbook_cache


if __name__ == "__main__":
    result = refresh_cfb_sportsbook_cache(force=True)
    print(result.get("message", result.get("status", "CFB refresh complete")))
