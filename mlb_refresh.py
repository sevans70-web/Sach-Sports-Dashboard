"""
Railway background job for MLB.

Run manually:
    python -m jobs.mlb_refresh

The job computes batter and pitcher rankings away from the Streamlit request
cycle, then stores completed snapshots in Supabase.
"""

from __future__ import annotations

from datetime import datetime
import traceback
from zoneinfo import ZoneInfo

from database.mlb_repository import (
    BATTER_MARKETS,
    PITCHER_MARKETS,
    ensure_mlb_foundation,
    finish_refresh_run,
    save_ranking_category,
    save_source_snapshot,
    start_refresh_run,
)
from engines.game_intelligence import get_all_rankings
from engines.mlb_pitcher_intelligence import get_pitcher_rankings


TORONTO_TIMEZONE = ZoneInfo("America/Toronto")
JOB_NAME = "mlb_rankings_refresh"


def run() -> dict:
    now = datetime.now(TORONTO_TIMEZONE)
    ranking_date = now.date()

    foundation = ensure_mlb_foundation()
    league_id = foundation["league_id"]
    market_ids = foundation["market_ids"]

    run_id = start_refresh_run(
        league_id=league_id,
        job_name=JOB_NAME,
    )

    saved_snapshots = []
    processed = 0

    try:
        batter_result = get_all_rankings(
            schedule_date=ranking_date,
            recent_days=14,
            limit=25,
        )

        save_source_snapshot(
            league_id=league_id,
            source_name="mlb_game_intelligence",
            source_type="batter_rankings",
            game_date=ranking_date,
            payload=batter_result,
        )

        for category in BATTER_MARKETS:
            result = batter_result.get(category) or {}
            rankings = list(result.get("rankings") or [])
            if not rankings:
                continue

            saved = save_ranking_category(
                league_id=league_id,
                market_id=market_ids[category],
                ranking_date=ranking_date,
                category=category,
                rankings=rankings,
                role="batter",
                model_version=str(result.get("engine_version") or "mlb-batter-v1"),
                metadata={
                    "fetched_at": result.get("fetched_at"),
                    "game_count": result.get("game_count"),
                    "player_count": result.get("player_count"),
                    "complete_top_25": result.get("complete_top_25"),
                    "has_full_team_slate": result.get("has_full_team_slate"),
                    "errors": result.get("errors") or [],
                },
            )
            saved_snapshots.append(saved)
            processed += len(rankings)

        pitcher_result = get_pitcher_rankings(limit=25)

        save_source_snapshot(
            league_id=league_id,
            source_name="mlb_pitcher_intelligence",
            source_type="pitcher_rankings",
            game_date=ranking_date,
            payload=pitcher_result,
        )

        pitcher_rankings = pitcher_result.get("rankings") or {}
        for category in PITCHER_MARKETS:
            rankings = list(pitcher_rankings.get(category) or [])
            if not rankings:
                continue

            saved = save_ranking_category(
                league_id=league_id,
                market_id=market_ids[category],
                ranking_date=ranking_date,
                category=category,
                rankings=rankings,
                role="pitcher",
                model_version="mlb-pitcher-v1",
                metadata={
                    "fetched_at": pitcher_result.get("fetched_at"),
                    "pitcher_count": pitcher_result.get("pitcher_count"),
                    "errors": pitcher_result.get("errors") or [],
                },
            )
            saved_snapshots.append(saved)
            processed += len(rankings)

        finish_refresh_run(
            run_id=run_id,
            status="success",
            records_processed=processed,
            metadata={
                "ranking_date": ranking_date.isoformat(),
                "snapshots": saved_snapshots,
            },
        )

        summary = {
            "success": True,
            "ranking_date": ranking_date.isoformat(),
            "records_processed": processed,
            "snapshots": saved_snapshots,
        }
        print(summary)
        return summary

    except Exception as exc:
        finish_refresh_run(
            run_id=run_id,
            status="failed",
            records_processed=processed,
            error_message=str(exc),
            metadata={
                "ranking_date": ranking_date.isoformat(),
                "traceback": traceback.format_exc(),
            },
        )
        raise


if __name__ == "__main__":
    run()
