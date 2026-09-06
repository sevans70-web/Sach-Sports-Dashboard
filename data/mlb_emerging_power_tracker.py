"""Durable, separate performance tracking for MLB Emerging Power."""

from __future__ import annotations

from copy import deepcopy
from datetime import date, datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from data.mlb_prediction_results import grade_top_25

TORONTO_TIMEZONE = ZoneInfo("America/Toronto")
CATEGORY = "emerging_power"


def _day(value: date | str | None = None) -> str:
    if value is None:
        return datetime.now(TORONTO_TIMEZONE).date().isoformat()
    if isinstance(value, date):
        return value.isoformat()
    return str(value)


def _key(row: dict[str, Any]) -> str:
    return str(
        row.get("player_id")
        or row.get("player_name")
        or row.get("player")
        or ""
    ).strip().casefold()


def _freeze(row: dict[str, Any], rank: int) -> dict[str, Any]:
    return {
        **deepcopy(row),
        "rank": int(rank),
        "emerging_rank": int(rank),
        "first_seen_at": datetime.now(TORONTO_TIMEZONE).isoformat(),
        "tracking_source": "emerging_power",
    }


def _canonical(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Keep the first frozen daily candidate set; retain better graded copies."""
    by_key: dict[str, dict[str, Any]] = {}
    order: list[str] = []
    for raw in rows or []:
        if not isinstance(raw, dict):
            continue
        key = _key(raw)
        if not key:
            continue
        if key not in by_key:
            by_key[key] = dict(raw)
            order.append(key)
            continue
        current = by_key[key]
        quality_raw = (
            1 if isinstance(raw.get("correct"), bool) else 0,
            1 if "actual_home_runs" in raw else 0,
        )
        quality_current = (
            1 if isinstance(current.get("correct"), bool) else 0,
            1 if "actual_home_runs" in current else 0,
        )
        if quality_raw > quality_current:
            by_key[key] = dict(raw)
    return [by_key[k] for k in order[:10]]


def sync_history(
    history: dict[str, Any] | None,
    candidates: list[dict[str, Any]],
    *,
    snapshot_date: date | str | None = None,
) -> dict[str, Any]:
    """Freeze the first Emerging Power list for a day, then grade it."""
    out = deepcopy(history or {"schema_version": 1, "days": {}})
    out.setdefault("schema_version", 1)
    days = out.setdefault("days", {})
    day_key = _day(snapshot_date)
    day_record = days.setdefault(
        day_key,
        {
            "captured_at": datetime.now(TORONTO_TIMEZONE).isoformat(),
            "categories": {CATEGORY: []},
        },
    )
    categories = day_record.setdefault("categories", {})
    frozen = _canonical(categories.setdefault(CATEGORY, []))

    # Freeze the first complete daily set. Early worker runs can legitimately
    # find only a few qualifiers before every lineup is available; keep those
    # rows and fill the remaining slots later instead of permanently tracking
    # only the four-player preview shown by the UI.
    if len(frozen) < 10:
        existing = {_key(row) for row in frozen}
        for candidate in (candidates or [])[:10]:
            key = _key(candidate)
            if not key or key in existing:
                continue
            frozen.append(_freeze(candidate, len(frozen) + 1))
            existing.add(key)
            if len(frozen) >= 10:
                break
        categories[CATEGORY] = _canonical(frozen)

    graded = grade_top_25(
        rankings=frozen,
        category="home_runs",
        result_date=day_key,
        force_refresh=False,
    ).get("graded") or frozen
    categories[CATEGORY] = _canonical(graded)
    return out


def refresh_history_view(
    history: dict[str, Any] | None,
    recent_days: int = 8,
) -> dict[str, Any]:
    out = deepcopy(history or {"schema_version": 1, "days": {}})
    days = out.setdefault("days", {})
    today = datetime.now(TORONTO_TIMEZONE).date()
    cutoff = today - timedelta(days=max(1, int(recent_days)) - 1)

    for day_key, day_record in list(days.items()):
        try:
            parsed = date.fromisoformat(str(day_key))
        except ValueError:
            continue
        if parsed < cutoff:
            continue
        categories = (day_record or {}).setdefault("categories", {})
        frozen = _canonical(categories.get(CATEGORY, []))
        if not frozen:
            continue
        graded = grade_top_25(
            rankings=frozen,
            category="home_runs",
            result_date=day_key,
            force_refresh=False,
        ).get("graded") or frozen
        categories[CATEGORY] = _canonical(graded)
    return out


def records_for_period(
    history: dict[str, Any],
    period: str,
    *,
    today: date | None = None,
) -> list[dict[str, Any]]:
    now = today or datetime.now(TORONTO_TIMEZONE).date()
    label = str(period or "Today")
    if label == "Today":
        start = end = now
    elif label == "Yesterday":
        start = end = now - timedelta(days=1)
    elif label == "7 Days":
        start, end = now - timedelta(days=6), now
    elif label == "Month":
        start, end = now.replace(day=1), now
    else:  # Season
        start, end = date(now.year, 1, 1), now

    rows: list[dict[str, Any]] = []
    for day_key, day_record in (history.get("days") or {}).items():
        try:
            d = date.fromisoformat(str(day_key))
        except ValueError:
            continue
        if start <= d <= end:
            for row in (
                (day_record or {}).get("categories", {}).get(CATEGORY, []) or []
            ):
                rows.append({**row, "tracking_date": day_key})
    return rows


def summarize(rows: list[dict[str, Any]]) -> dict[str, Any]:
    graded = [row for row in rows if isinstance(row.get("correct"), bool)]
    wins = sum(1 for row in graded if row.get("correct") is True)
    pending = len(rows) - len(graded)
    hit_rate = round((wins / len(graded)) * 100, 1) if graded else 0.0
    return {
        "tracked": len(rows),
        "graded": len(graded),
        "wins": wins,
        "pending": pending,
        "hit_rate": hit_rate,
    }
