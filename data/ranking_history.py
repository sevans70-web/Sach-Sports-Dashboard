"""
MLB ranking history utilities.

File location:
    data/ranking_history.py

Purpose:
- Build dated snapshots of MLB Game Intelligence rankings.
- Prepare ranking data for permanent history storage.
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Any
from zoneinfo import ZoneInfo


TORONTO_TIMEZONE = ZoneInfo("America/Toronto")


def build_daily_ranking_snapshot(
    rankings: dict[str, list[dict[str, Any]]],
    schedule_date: date | str | None = None,
) -> dict[str, Any]:
    """Build a dated snapshot containing all MLB ranking categories."""

    if schedule_date is None:
        snapshot_date = datetime.now(TORONTO_TIMEZONE).date().isoformat()
    elif isinstance(schedule_date, date):
        snapshot_date = schedule_date.isoformat()
    else:
        snapshot_date = str(schedule_date)
    has_rankings = any(
        category_rankings
        for category_rankings in rankings.values()
    )

    if not has_rankings:
    return {
        "schedule_date": snapshot_date,
        "saved_at": datetime.now(TORONTO_TIMEZONE).isoformat(),
        "rankings": rankings,
        "status": "ready",
    }
    return {
        "schedule_date": snapshot_date,
        "saved_at": datetime.now(TORONTO_TIMEZONE).isoformat(),
        "rankings": rankings,
    }
