"""Read and summarize WNBA prediction performance.

The UI is intentionally overall-first: every saved WNBA prop prediction contributes to
one dashboard record, while the prop/market is retained on each row for future analysis.
"""
from __future__ import annotations

import json
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

TORONTO_TIMEZONE = ZoneInfo("America/Toronto")
HISTORY_PATH = Path(__file__).with_name("wnba_prediction_performance_history.json")


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


def _bounds(period: str, today: date) -> tuple[date, date]:
    if period == "Today":
        return today, today
    if period == "Yesterday":
        yesterday = today - timedelta(days=1)
        return yesterday, yesterday
    if period == "7 Days":
        return today - timedelta(days=6), today
    if period == "Month":
        return today.replace(day=1), today
    # WNBA season/year view. The current season lives inside the calendar year.
    return today.replace(month=1, day=1), today


def _day_rows(day_record: Any) -> list[dict[str, Any]]:
    if not isinstance(day_record, dict):
        return []

    # Preferred WNBA schema: {"predictions": [...]}
    predictions = day_record.get("predictions")
    if isinstance(predictions, list):
        return [row for row in predictions if isinstance(row, dict)]

    # Also accept a market-bucket schema so future writers can save by category
    # without forcing a migration of the performance reader.
    rows: list[dict[str, Any]] = []
    markets = day_record.get("markets")
    if isinstance(markets, dict):
        for market, market_rows in markets.items():
            if not isinstance(market_rows, list):
                continue
            for row in market_rows:
                if isinstance(row, dict):
                    rows.append({"market": row.get("market") or market, **row})
    return rows


def records_for_period(history: dict[str, Any], period: str) -> list[dict[str, Any]]:
    today = datetime.now(TORONTO_TIMEZONE).date()
    start, end = _bounds(period, today)
    rows: list[dict[str, Any]] = []

    for day_key, day_record in (history.get("days") or {}).items():
        try:
            day = date.fromisoformat(day_key)
        except (TypeError, ValueError):
            continue
        if not start <= day <= end:
            continue
        for row in _day_rows(day_record):
            rows.append({**row, "date": row.get("date") or day_key})

    rows.sort(key=lambda row: (str(row.get("date") or ""), str(row.get("player_name") or row.get("player") or "")))
    return rows


def normalized_result(row: dict[str, Any]) -> str:
    raw = str(row.get("result") or row.get("status") or "").strip().upper()
    aliases = {
        "WIN": "HIT", "WON": "HIT", "CORRECT": "HIT", "TRUE": "HIT",
        "LOSS": "MISS", "LOST": "MISS", "INCORRECT": "MISS", "FALSE": "MISS",
        "PUSHED": "PUSH", "VOID": "PUSH",
        "OPEN": "PENDING", "UNSETTLED": "PENDING", "SCHEDULED": "PENDING",
    }
    if raw in {"HIT", "MISS", "PUSH", "PENDING"}:
        return raw
    if raw in aliases:
        return aliases[raw]
    if isinstance(row.get("correct"), bool):
        return "HIT" if row["correct"] else "MISS"
    return "PENDING"


def summarize(rows: list[dict[str, Any]]) -> dict[str, Any]:
    results = [normalized_result(row) for row in rows]
    hits = results.count("HIT")
    misses = results.count("MISS")
    pushes = results.count("PUSH")
    pending = results.count("PENDING")
    graded = hits + misses + pushes
    decisions = hits + misses

    return {
        "hits": hits,
        "misses": misses,
        "pushes": pushes,
        "pending": pending,
        "graded": graded,
        "predictions": len(rows),
        # Sportsbook-style hit rate excludes pushes from the denominator.
        "hit_rate": (100.0 * hits / decisions) if decisions else 0.0,
    }
