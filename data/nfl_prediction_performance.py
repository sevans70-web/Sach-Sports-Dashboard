"""Read and summarize real, frozen NFL prediction results by market."""
from __future__ import annotations

import json
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

TORONTO_TIMEZONE = ZoneInfo("America/Toronto")
HISTORY_PATH = Path(__file__).with_name("nfl_prediction_performance_history.json")


def load_history() -> dict[str, Any]:
    try:
        payload = json.loads(HISTORY_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {"schema_version": 1, "days": {}}
    if not isinstance(payload, dict):
        return {"schema_version": 1, "days": {}}
    payload.setdefault("schema_version", 1)
    payload.setdefault("days", {})
    return payload


def _start(period: str, today: date) -> date:
    if period == "Week":
        return today - timedelta(days=6)
    if period == "Month":
        return today.replace(day=1)
    return today.replace(month=1, day=1)


def records_for_period(history: dict[str, Any], market: str, period: str) -> list[dict[str, Any]]:
    today = datetime.now(TORONTO_TIMEZONE).date()
    start = _start(period, today)
    rows: list[dict[str, Any]] = []
    for day_key, day_record in (history.get("days") or {}).items():
        try:
            day = date.fromisoformat(day_key)
        except ValueError:
            continue
        if not start <= day <= today:
            continue
        market_rows = (day_record or {}).get("markets", {}).get(market, [])
        for row in market_rows if isinstance(market_rows, list) else []:
            if isinstance(row, dict):
                rows.append({**row, "date": day_key})
    return rows


def summarize(rows: list[dict[str, Any]]) -> dict[str, Any]:
    settled = [row for row in rows if isinstance(row.get("correct"), bool)]
    wins = sum(row.get("correct") is True for row in settled)

    def tier(first: int, last: int) -> dict[str, float | int]:
        group = [row for row in settled if first <= int(row.get("rank") or 0) <= last]
        group_wins = sum(row.get("correct") is True for row in group)
        return {"wins": group_wins, "total": len(group), "rate": (100 * group_wins / len(group)) if group else 0.0}

    return {
        "wins": wins, "losses": len(settled) - wins, "settled": len(settled),
        "pending": len(rows) - len(settled),
        "hit_rate": (100 * wins / len(settled)) if settled else 0.0,
        "tiers": {"top_5": tier(1, 5), "six_to_ten": tier(6, 10), "eleven_to_25": tier(11, 25)},
    }
