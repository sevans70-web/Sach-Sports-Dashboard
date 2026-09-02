"""
Fast MLB dashboard reads from Supabase.

The Railway worker computes MLB rankings and writes completed snapshots.
The Streamlit web app uses this module to read those completed snapshots
instead of recalculating the ranking engines on a page click.
"""

from __future__ import annotations

from datetime import datetime
from zoneinfo import ZoneInfo
from typing import Any

from database.mlb_repository import (
    BATTER_MARKETS,
    PITCHER_MARKETS,
    get_latest_rankings,
)

TORONTO_TIMEZONE = ZoneInfo("America/Toronto")


def _today_text() -> str:
    return datetime.now(TORONTO_TIMEZONE).date().isoformat()


def load_batter_rankings_from_supabase(limit: int = 25) -> dict[str, Any]:
    """Return today's completed batter rankings in the existing page shape."""
    ranking_date = _today_text()
    result: dict[str, Any] = {}

    for category, (market_code, _name, _stat_key) in BATTER_MARKETS.items():
        snapshot = get_latest_rankings(
            market_code=market_code,
            ranking_date=ranking_date,
            limit=limit,
        )

        rankings = list(snapshot.get("rankings") or [])
        snapshot_meta = snapshot.get("snapshot") or {}

        result[category] = {
            "success": bool(rankings),
            "category": category,
            "date": ranking_date,
            "rankings": rankings,
            "ranked_count": len(rankings),
            "player_count": len(rankings),
            "fetched_at": snapshot_meta.get("snapshot_time"),
            "engine_version": snapshot_meta.get("model_version"),
            "source": "supabase",
            "errors": [] if rankings else [snapshot.get("error") or "No completed snapshot yet"],
        }

    return result


def load_pitcher_rankings_from_supabase(limit: int = 25) -> dict[str, Any]:
    """Return today's completed pitcher rankings in the existing component shape."""
    ranking_date = _today_text()
    rankings_by_category: dict[str, list[dict[str, Any]]] = {}
    errors: list[str] = []
    newest_snapshot_time = None

    for category, (market_code, _name, _stat_key) in PITCHER_MARKETS.items():
        snapshot = get_latest_rankings(
            market_code=market_code,
            ranking_date=ranking_date,
            limit=limit,
        )

        rows = list(snapshot.get("rankings") or [])
        rankings_by_category[category] = rows

        snapshot_meta = snapshot.get("snapshot") or {}
        snapshot_time = snapshot_meta.get("snapshot_time")
        if snapshot_time and (
            newest_snapshot_time is None or str(snapshot_time) > str(newest_snapshot_time)
        ):
            newest_snapshot_time = snapshot_time

        if not rows:
            errors.append(
                f"{category}: {snapshot.get('error') or 'No completed snapshot yet'}"
            )

    pitcher_count = max(
        (len(rows) for rows in rankings_by_category.values()),
        default=0,
    )

    return {
        "success": any(bool(rows) for rows in rankings_by_category.values()),
        "rankings": rankings_by_category,
        "pitcher_count": pitcher_count,
        "date": ranking_date,
        "errors": errors,
        "fetched_at": newest_snapshot_time,
        "source": "supabase",
    }
