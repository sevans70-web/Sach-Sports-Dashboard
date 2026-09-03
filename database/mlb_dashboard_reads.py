"""
Fast MLB dashboard reads from Supabase.

Railway computes MLB rankings away from the Streamlit request cycle and stores:
- normalized Top-25 snapshots + movement
- full lossless engine payloads (photos, matchup context, lineup context)
- performance-history snapshots

The dashboard reads those completed snapshots and only uses local bundled history
as a safety fallback if the worker has not written a performance snapshot yet.
"""

from __future__ import annotations

from datetime import datetime
import json
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

from database.mlb_repository import (
    BATTER_MARKETS,
    PITCHER_MARKETS,
    get_latest_rankings,
    get_latest_source_payload,
)

TORONTO_TIMEZONE = ZoneInfo("America/Toronto")


def _today_text() -> str:
    return datetime.now(TORONTO_TIMEZONE).date().isoformat()


def _identity_key(row: dict[str, Any], *, pitcher: bool = False) -> str:
    if pitcher:
        value = row.get("pitcher_id") or row.get("pitcher_name")
    else:
        value = row.get("player_id") or row.get("player_name") or row.get("player")
    return str(value or "").strip().casefold()


def _overlay_durable_fields(
    complete_rows: list[dict[str, Any]],
    normalized_rows: list[dict[str, Any]],
    *,
    pitcher: bool = False,
) -> list[dict[str, Any]]:
    """Keep the full engine row while overlaying durable rank/movement/identity."""
    durable = {
        _identity_key(row, pitcher=pitcher): row
        for row in normalized_rows
        if _identity_key(row, pitcher=pitcher)
    }

    merged: list[dict[str, Any]] = []
    for index, source_row in enumerate(complete_rows[:25], start=1):
        row = dict(source_row)
        match = durable.get(_identity_key(row, pitcher=pitcher), {})

        if match:
            for key in (
                "rank",
                "movement",
                "headshot_url",
                "position_abbreviation",
                "projection",
                "benchmark_probability",
            ):
                if match.get(key) not in (None, ""):
                    if key in {"headshot_url", "position_abbreviation"} and row.get(key):
                        continue
                    row[key] = match.get(key)

        row["rank"] = int(row.get("rank") or index)
        merged.append(row)

    # If a source snapshot is unavailable/incomplete, normalized rows still
    # provide a complete fallback path.
    if len(merged) < min(25, len(normalized_rows)):
        seen = {_identity_key(row, pitcher=pitcher) for row in merged}
        for row in normalized_rows:
            key = _identity_key(row, pitcher=pitcher)
            if key and key not in seen:
                merged.append(dict(row))
                seen.add(key)
            if len(merged) >= 25:
                break

    return merged


def load_batter_rankings_from_supabase(limit: int = 25) -> dict[str, Any]:
    """Return today's complete batter Top 25 with durable movement."""
    ranking_date = _today_text()
    source = get_latest_source_payload(
        source_name="mlb_game_intelligence",
        game_date=ranking_date,
    )
    source_payload = source.get("payload") or {}

    result: dict[str, Any] = {}
    for category, (market_code, _name, _stat_key) in BATTER_MARKETS.items():
        normalized = get_latest_rankings(
            market_code=market_code,
            ranking_date=ranking_date,
            limit=limit,
        )
        normalized_rows = list(normalized.get("rankings") or [])

        source_category = source_payload.get(category) or {}
        complete_rows = list(source_category.get("rankings") or [])
        rankings = _overlay_durable_fields(
            complete_rows or normalized_rows,
            normalized_rows,
            pitcher=False,
        )[:limit]

        snapshot_meta = normalized.get("snapshot") or source.get("snapshot") or {}
        result[category] = {
            **({k: v for k, v in source_category.items() if k != "rankings"}),
            "success": bool(rankings),
            "category": category,
            "date": ranking_date,
            "rankings": rankings,
            "ranked_count": len(rankings),
            "player_count": source_category.get("player_count", len(rankings)),
            "fetched_at": (
                source_category.get("fetched_at")
                or snapshot_meta.get("snapshot_time")
                or snapshot_meta.get("created_at")
            ),
            "engine_version": (
                source_category.get("engine_version")
                or snapshot_meta.get("model_version")
            ),
            "source": "supabase",
            "errors": [] if rankings else [
                normalized.get("error")
                or source.get("error")
                or "No completed snapshot yet"
            ],
        }

    return result


def load_pitcher_rankings_from_supabase(limit: int = 25) -> dict[str, Any]:
    """Return today's complete pitcher Top 25 with photos/context preserved."""
    ranking_date = _today_text()
    source = get_latest_source_payload(
        source_name="mlb_pitcher_intelligence",
        game_date=ranking_date,
    )
    source_payload = source.get("payload") or {}
    source_rankings = source_payload.get("rankings") or {}

    rankings_by_category: dict[str, list[dict[str, Any]]] = {}
    errors: list[str] = []
    newest_snapshot_time = (
        source_payload.get("fetched_at")
        or (source.get("snapshot") or {}).get("created_at")
    )

    for category, (market_code, _name, _stat_key) in PITCHER_MARKETS.items():
        normalized = get_latest_rankings(
            market_code=market_code,
            ranking_date=ranking_date,
            limit=limit,
        )
        normalized_rows = list(normalized.get("rankings") or [])
        complete_rows = list(source_rankings.get(category) or [])

        rows = _overlay_durable_fields(
            complete_rows or normalized_rows,
            normalized_rows,
            pitcher=True,
        )[:limit]
        rankings_by_category[category] = rows

        snapshot_meta = normalized.get("snapshot") or {}
        snapshot_time = snapshot_meta.get("snapshot_time")
        if snapshot_time and (
            newest_snapshot_time is None
            or str(snapshot_time) > str(newest_snapshot_time)
        ):
            newest_snapshot_time = snapshot_time

        if not rows:
            errors.append(
                f"{category}: "
                f"{normalized.get('error') or source.get('error') or 'No completed snapshot yet'}"
            )

    pitcher_count = max(
        (len(rows) for rows in rankings_by_category.values()),
        default=0,
    )

    return {
        **({k: v for k, v in source_payload.items() if k != "rankings"}),
        "success": any(bool(rows) for rows in rankings_by_category.values()),
        "rankings": rankings_by_category,
        "pitcher_count": source_payload.get("pitcher_count", pitcher_count),
        "date": ranking_date,
        "errors": errors,
        "fetched_at": newest_snapshot_time,
        "source": "supabase",
    }


def _load_local_history(path: str) -> dict[str, Any]:
    try:
        payload = json.loads(Path(path).read_text(encoding="utf-8"))
        if isinstance(payload, dict):
            return payload
    except Exception:
        pass
    return {"schema_version": 1, "days": {}}


def load_performance_history_from_supabase(role: str) -> dict[str, Any]:
    """Load durable performance history, with the shipped JSON as fallback."""
    normalized_role = str(role or "").strip().lower()
    if normalized_role == "pitcher":
        source_name = "mlb_pitcher_performance_history"
        local_path = "data/mlb_pitcher_performance_history.json"
    else:
        source_name = "mlb_batter_performance_history"
        local_path = "data/mlb_performance_history.json"

    stored = get_latest_source_payload(source_name=source_name)
    payload = stored.get("payload") or {}
    if isinstance(payload, dict) and isinstance(payload.get("days"), dict):
        return payload

    return _load_local_history(local_path)
