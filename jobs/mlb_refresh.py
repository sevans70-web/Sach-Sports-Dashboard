"""
Railway background job for MLB.

Run manually:
    python -m jobs.mlb_refresh

The job computes batter and pitcher rankings away from the Streamlit request
cycle, then stores completed snapshots in Supabase.
"""

from __future__ import annotations

from datetime import datetime
import json
from pathlib import Path
import traceback
from zoneinfo import ZoneInfo

from database.mlb_repository import (
    BATTER_MARKETS,
    PITCHER_MARKETS,
    ensure_mlb_foundation,
    finish_refresh_run,
    get_latest_source_payload,
    save_ranking_category,
    save_latest_source_snapshot,
    save_source_snapshot,
    start_refresh_run,
)
from engines.game_intelligence import get_all_rankings
from engines.mlb_pitcher_intelligence import get_pitcher_rankings
from data.mlb_performance_tracker import (
    sync_history as sync_batter_history,
    refresh_history_view as refresh_batter_history_view,
)
from data.mlb_pitcher_performance_tracker import (
    sync_history as sync_pitcher_history,
    refresh_history_view as refresh_pitcher_history_view,
)


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

        pitcher_rankings = pitcher_result.get("rankings") or {}
        pitcher_has_rows = any(
            bool(pitcher_rankings.get(category))
            for category in PITCHER_MARKETS
        )
        # Never replace a known-good pitcher payload with an empty transient
        # provider response. This was the cause of the five blank Pitcher tabs.
        if pitcher_has_rows:
            save_source_snapshot(
                league_id=league_id,
                source_name="mlb_pitcher_intelligence",
                source_type="pitcher_rankings",
                game_date=ranking_date,
                payload=pitcher_result,
            )

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

        # Persist the existing MLB performance history in Supabase as part of
        # the same worker run.  This is intentionally idempotent at the UI
        # level: the dashboard always reads the newest history snapshot.
        # The long-lived JSON files remain in the repository as a recovery
        # source, so the migration cannot erase the history already collected.
        batter_rankings_by_category = {
            category: list((batter_result.get(category) or {}).get("rankings") or [])
            for category in BATTER_MARKETS
        }
        batter_history_seed = get_latest_source_payload(
            source_name="mlb_batter_performance_history"
        ).get("payload") or {}
        if not isinstance(batter_history_seed.get("days"), dict):
            try:
                batter_history_seed = json.loads(
                    Path("data/mlb_performance_history.json").read_text(encoding="utf-8")
                )
            except Exception:
                batter_history_seed = {"schema_version": 1, "days": {}}
        batter_seed_path = Path("/tmp/sach_mlb_batter_performance_history.json")
        batter_seed_path.write_text(
            json.dumps(batter_history_seed, ensure_ascii=False),
            encoding="utf-8",
        )
        batter_history = sync_batter_history(
            "",
            batter_rankings_by_category,
            snapshot_date=ranking_date.isoformat(),
            persist=False,
            local_history_path=str(batter_seed_path),
        )
        batter_history = refresh_batter_history_view(
            batter_history, recent_days=8
        )
        save_latest_source_snapshot(
            league_id=league_id,
            source_name="mlb_batter_performance_history",
            source_type="performance_history",
            game_date=ranking_date,
            payload=batter_history,
        )

        pitcher_history_seed = get_latest_source_payload(
            source_name="mlb_pitcher_performance_history"
        ).get("payload") or {}
        if not isinstance(pitcher_history_seed.get("days"), dict):
            try:
                pitcher_history_seed = json.loads(
                    Path("data/mlb_pitcher_performance_history.json").read_text(encoding="utf-8")
                )
            except Exception:
                pitcher_history_seed = {"schema_version": 1, "days": {}}
        pitcher_seed_path = Path("/tmp/sach_mlb_pitcher_performance_history.json")
        pitcher_seed_path.write_text(
            json.dumps(pitcher_history_seed, ensure_ascii=False),
            encoding="utf-8",
        )
        pitcher_history = sync_pitcher_history(
            "",
            pitcher_rankings,
            snapshot_date=ranking_date.isoformat(),
            persist=False,
            local_history_path=str(pitcher_seed_path),
        )
        pitcher_history = refresh_pitcher_history_view(
            pitcher_history, recent_days=8
        )
        save_latest_source_snapshot(
            league_id=league_id,
            source_name="mlb_pitcher_performance_history",
            source_type="performance_history",
            game_date=ranking_date,
            payload=pitcher_history,
        )

        finish_refresh_run(
            run_id=run_id,
            status="success",
            records_processed=processed,
            metadata={
                "ranking_date": ranking_date.isoformat(),
                "snapshots": saved_snapshots,
                "performance_history": ["batter", "pitcher"],
            },
        )

        summary = {
            "success": True,
            "ranking_date": ranking_date.isoformat(),
            "records_processed": processed,
            "snapshots": saved_snapshots,
            "performance_history": ["batter", "pitcher"],
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
