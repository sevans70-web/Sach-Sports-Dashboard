"""
Railway background job for MLB.

Computes rankings, freezes performance predictions, and stores all durable state
in Supabase away from the Streamlit request cycle.
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
from data.mlb_emerging_power import build_emerging_power_candidates
from data.mlb_emerging_power_tracker import (
    sync_history as sync_emerging_history,
    refresh_history_view as refresh_emerging_history_view,
)
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


def _history_seed(source_name: str, local_path: str, temp_path: str) -> tuple[dict, Path]:
    seed = get_latest_source_payload(source_name=source_name).get("payload") or {}
    if not isinstance(seed.get("days"), dict):
        try:
            seed = json.loads(Path(local_path).read_text(encoding="utf-8"))
        except Exception:
            seed = {"schema_version": 1, "days": {}}
    tmp = Path(temp_path)
    tmp.write_text(json.dumps(seed, ensure_ascii=False), encoding="utf-8")
    return seed, tmp


def run() -> dict:
    now = datetime.now(TORONTO_TIMEZONE)
    ranking_date = now.date()

    foundation = ensure_mlb_foundation()
    league_id = foundation["league_id"]
    market_ids = foundation["market_ids"]

    run_id = start_refresh_run(league_id=league_id, job_name=JOB_NAME)
    saved_snapshots = []
    processed = 0

    try:
        # Use one wider batter pass. Only the official Top 25 is persisted to
        # ranking tables/performance; the wider HR pool feeds Emerging Power.
        batter_result = get_all_rankings(
            schedule_date=ranking_date,
            recent_days=14,
            limit=75,
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
            rankings = list(result.get("rankings") or [])[:25]
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
                    "complete_top_25": len(rankings) >= 25,
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
        if pitcher_has_rows:
            save_source_snapshot(
                league_id=league_id,
                source_name="mlb_pitcher_intelligence",
                source_type="pitcher_rankings",
                game_date=ranking_date,
                payload=pitcher_result,
            )

        for category in PITCHER_MARKETS:
            rankings = list(pitcher_rankings.get(category) or [])[:25]
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

        # Official Batter Top-25 history.
        batter_rankings_by_category = {
            category: list((batter_result.get(category) or {}).get("rankings") or [])[:25]
            for category in BATTER_MARKETS
        }
        batter_seed, batter_seed_path = _history_seed(
            "mlb_batter_performance_history",
            "data/mlb_performance_history.json",
            "/tmp/sach_mlb_batter_performance_history.json",
        )
        batter_history = sync_batter_history(
            "",
            batter_rankings_by_category,
            snapshot_date=ranking_date.isoformat(),
            persist=False,
            local_history_path=str(batter_seed_path),
        )
        batter_history = refresh_batter_history_view(batter_history, recent_days=8)
        save_latest_source_snapshot(
            league_id=league_id,
            source_name="mlb_batter_performance_history",
            source_type="performance_history",
            game_date=ranking_date,
            payload=batter_history,
        )

        # Official Pitcher history.
        pitcher_seed, pitcher_seed_path = _history_seed(
            "mlb_pitcher_performance_history",
            "data/mlb_pitcher_performance_history.json",
            "/tmp/sach_mlb_pitcher_performance_history.json",
        )
        pitcher_history = sync_pitcher_history(
            "",
            pitcher_rankings,
            snapshot_date=ranking_date.isoformat(),
            persist=False,
            local_history_path=str(pitcher_seed_path),
        )
        pitcher_history = refresh_pitcher_history_view(pitcher_history, recent_days=8)
        save_latest_source_snapshot(
            league_id=league_id,
            source_name="mlb_pitcher_performance_history",
            source_type="performance_history",
            game_date=ranking_date,
            payload=pitcher_history,
        )

        # Separate Emerging Power history. This never changes official HR Top 25 metrics.
        raw_hr_pool = list((batter_result.get("home_runs") or {}).get("rankings") or [])
        emerging_candidates = build_emerging_power_candidates(raw_hr_pool, limit=10)
        emerging_seed = (
            get_latest_source_payload(source_name="mlb_emerging_power_history")
            .get("payload") or {"schema_version": 1, "days": {}}
        )
        if not isinstance(emerging_seed.get("days"), dict):
            emerging_seed = {"schema_version": 1, "days": {}}

        emerging_history = sync_emerging_history(
            emerging_seed,
            emerging_candidates,
            snapshot_date=ranking_date.isoformat(),
        )
        emerging_history = refresh_emerging_history_view(
            emerging_history,
            recent_days=8,
        )
        save_latest_source_snapshot(
            league_id=league_id,
            source_name="mlb_emerging_power_history",
            source_type="performance_history",
            game_date=ranking_date,
            payload=emerging_history,
        )

        finish_refresh_run(
            run_id=run_id,
            status="success",
            records_processed=processed,
            metadata={
                "ranking_date": ranking_date.isoformat(),
                "snapshots": saved_snapshots,
                "performance_history": ["batter", "pitcher", "emerging_power"],
                "emerging_power_candidates": len(emerging_candidates),
            },
        )

        summary = {
            "success": True,
            "ranking_date": ranking_date.isoformat(),
            "records_processed": processed,
            "snapshots": saved_snapshots,
            "performance_history": ["batter", "pitcher", "emerging_power"],
            "emerging_power_candidates": len(emerging_candidates),
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
