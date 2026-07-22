"""
MLB ranking history utilities.

File location:
    data/ranking_history.py

Purpose:
- Build dated snapshots of MLB Game Intelligence rankings.
- Prepare ranking data for permanent history storage.
"""

from __future__ import annotations

import json
from datetime import date, datetime
from pathlib import Path
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
            "rankings": {},
            "status": "empty",
        }
    return {
        "schedule_date": snapshot_date,
        "saved_at": datetime.now(TORONTO_TIMEZONE).isoformat(),
        "rankings": rankings,
        "status": "ready",
    }      
    
def save_ranking_snapshot(
    snapshot: dict[str, Any],
    history_directory: str | Path = "data/ranking_history",
) -> dict[str, Any]:
    """Save a ready MLB ranking snapshot as a dated JSON file."""

    if snapshot.get("status") != "ready":
        return {
            "status": "skipped",
            "reason": "Snapshot contains no rankings.",
            "path": None,
        }

    schedule_date = str(snapshot.get("schedule_date", "")).strip()

    if not schedule_date:
        return {
            "status": "skipped",
            "reason": "Snapshot has no schedule date.",
            "path": None,
        }

    directory = Path(history_directory)
    directory.mkdir(parents=True, exist_ok=True)

    file_path = directory / f"{schedule_date}.json"

    with file_path.open("w", encoding="utf-8") as history_file:
        json.dump(
            snapshot,
            history_file,
            indent=2,
            ensure_ascii=False,
            default=str,
        )

    return {
        "status": "saved",
        "reason": None,
        "path": str(file_path),
    }
def load_ranking_snapshot(
    schedule_date: date | str,
    history_directory: str | Path = "data/ranking_history",
) -> dict[str, Any]:
    """Load a saved MLB ranking snapshot for a specific date."""

    if isinstance(schedule_date, date):
        snapshot_date = schedule_date.isoformat()
    else:
        snapshot_date = str(schedule_date).strip()

    if not snapshot_date:
        return {
            "schedule_date": None,
            "rankings": {},
            "status": "missing",
        }

    file_path = Path(history_directory) / f"{snapshot_date}.json"

    if not file_path.exists():
        return {
            "schedule_date": snapshot_date,
            "rankings": {},
            "status": "missing",
        }

    try:
        with file_path.open("r", encoding="utf-8") as history_file:
            snapshot = json.load(history_file)
    except (OSError, json.JSONDecodeError):
        return {
            "schedule_date": snapshot_date,
            "rankings": {},
            "status": "error",
        }

    return snapshot
