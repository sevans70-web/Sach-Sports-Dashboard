"""Persistent MLB pitcher projection performance history."""

from __future__ import annotations

import base64
import json
from datetime import date, datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

import requests

from data.mlb_pitcher_results import get_pitcher_final_result

TORONTO_TIMEZONE = ZoneInfo("America/Toronto")
REPOSITORY = "sevans70-web/Sach-Sports-Dashboard"
BRANCH = "main"
HISTORY_PATH = "data/mlb_pitcher_performance_history.json"
GITHUB_API = "https://api.github.com"

PITCHER_CATEGORIES = (
    "strikeouts",
    "outs_recorded",
    "hits_allowed",
    "walks_allowed",
    "earned_runs",
)

PROJECTION_FIELDS = {
    "strikeouts": "projected_strikeouts",
    "outs_recorded": "projected_outs_recorded",
    "hits_allowed": "projected_hits_allowed",
    "walks_allowed": "projected_walks_allowed",
    "earned_runs": "projected_earned_runs",
}

ACTUAL_FIELDS = {
    "strikeouts": "actual_strikeouts",
    "outs_recorded": "actual_outs_recorded",
    "hits_allowed": "actual_hits_allowed",
    "walks_allowed": "actual_walks_allowed",
    "earned_runs": "actual_earned_runs",
}


def _headers(token: str) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }


def _history_url() -> str:
    return f"{GITHUB_API}/repos/{REPOSITORY}/contents/{HISTORY_PATH}"


def load_history(token: str) -> tuple[dict[str, Any], str | None]:
    response = requests.get(
        _history_url(),
        headers=_headers(token),
        params={"ref": BRANCH},
        timeout=20,
    )
    if response.status_code == 404:
        return {"schema_version": 1, "days": {}}, None

    response.raise_for_status()
    payload = response.json()
    raw = base64.b64decode(payload.get("content", "")).decode("utf-8")
    return json.loads(raw), payload.get("sha")


def save_history(
    token: str,
    history: dict[str, Any],
    sha: str | None,
) -> None:
    content = json.dumps(history, indent=2, sort_keys=True)
    body: dict[str, Any] = {
        "message": "Update MLB pitcher projection performance history",
        "content": base64.b64encode(
            content.encode("utf-8")
        ).decode("ascii"),
        "branch": BRANCH,
    }
    if sha:
        body["sha"] = sha

    response = requests.put(
        _history_url(),
        headers=_headers(token),
        json=body,
        timeout=25,
    )
    response.raise_for_status()


def _pitcher_name(row: dict[str, Any]) -> str:
    return str(row.get("pitcher_name") or "Pitcher")


def _freeze_prediction(
    row: dict[str, Any],
    category: str,
) -> dict[str, Any]:
    projection_field = PROJECTION_FIELDS[category]
    projection = row.get(projection_field)

    if projection is None:
        projection = row.get("projection")

    return {
        "category": category,
        "rank": int(row.get("rank") or 0),
        "pitcher_id": row.get("pitcher_id"),
        "pitcher_name": _pitcher_name(row),
        "team": row.get("team_name"),
        "opponent": row.get("opponent_name"),
        "game_pk": row.get("game_pk"),
        "gi_score": float(row.get("gi_score") or 0),
        "projection": float(projection or 0),
        "lineup_context_confirmed": bool(
            row.get("lineup_context_confirmed")
        ),
        "finalized": False,
        "actual": None,
        "absolute_error": None,
        "result_label": "Pending",
    }


def _prediction_key(row: dict[str, Any]) -> str:
    pitcher_id = row.get("pitcher_id")
    game_pk = row.get("game_pk")
    return f"{game_pk}:{pitcher_id}"


def _apply_final_results(
    predictions: list[dict[str, Any]],
    category: str,
) -> list[dict[str, Any]]:
    actual_field = ACTUAL_FIELDS[category]
    result_cache: dict[str, dict[str, Any]] = {}
    updated: list[dict[str, Any]] = []

    for frozen in predictions:
        row = dict(frozen)

        if row.get("finalized"):
            updated.append(row)
            continue

        key = _prediction_key(row)
        result = result_cache.get(key)
        if result is None:
            result = get_pitcher_final_result(
                game_pk=int(row.get("game_pk") or 0),
                pitcher_id=int(row.get("pitcher_id") or 0),
            )
            result_cache[key] = result

        if result.get("game_finished") and result.get("result_available"):
            actual = float(result.get(actual_field) or 0)
            projection = float(row.get("projection") or 0)
            error = abs(projection - actual)

            row["finalized"] = True
            row["actual"] = actual
            row["absolute_error"] = round(error, 3)
            row["result_label"] = (
                f"Projected {projection:.1f} · Actual {actual:g} · "
                f"Error {error:.1f}"
            )

            for field in (
                "actual_strikeouts",
                "actual_outs_recorded",
                "actual_hits_allowed",
                "actual_walks_allowed",
                "actual_earned_runs",
                "innings_pitched",
                "pitches",
            ):
                if field in result:
                    row[field] = result[field]

        updated.append(row)

    return updated


def sync_history(
    token: str,
    rankings_by_category: dict[str, list[dict[str, Any]]],
    snapshot_date: str | None = None,
) -> dict[str, Any]:
    today = (
        snapshot_date
        or datetime.now(TORONTO_TIMEZONE).date().isoformat()
    )
    history, sha = load_history(token)
    history.setdefault("schema_version", 1)
    days = history.setdefault("days", {})
    changed = False

    if today not in days:
        days[today] = {
            "captured_at": datetime.now(TORONTO_TIMEZONE).isoformat(),
            "categories": {},
        }
        changed = True

    today_categories = days[today].setdefault("categories", {})

    for category in PITCHER_CATEGORIES:
        if category in today_categories:
            continue

        current_rankings = rankings_by_category.get(category, [])[:25]
        if not current_rankings:
            continue

        today_categories[category] = [
            _freeze_prediction(row, category)
            for row in current_rankings
        ]
        changed = True

    for day_key, day_record in days.items():
        if day_key >= today:
            continue

        categories = day_record.get("categories", {})
        for category in PITCHER_CATEGORIES:
            predictions = categories.get(category, [])
            if predictions and any(
                not row.get("finalized")
                for row in predictions
            ):
                resolved = _apply_final_results(
                    predictions,
                    category,
                )
                if resolved != predictions:
                    categories[category] = resolved
                    changed = True

    if changed:
        save_history(token, history, sha)

    return history


def current_day_view(
    history: dict[str, Any],
    rankings_by_category: dict[str, list[dict[str, Any]]],
    day_key: str | None = None,
) -> dict[str, Any]:
    today = (
        day_key
        or datetime.now(TORONTO_TIMEZONE).date().isoformat()
    )
    merged = json.loads(json.dumps(history))
    day = merged.get("days", {}).get(today)

    if not day:
        return merged

    categories = day.get("categories", {})
    for category in PITCHER_CATEGORIES:
        frozen = categories.get(category, [])
        categories[category] = _apply_final_results(
            frozen,
            category,
        )

    return merged


def _period_start(period: str, today: date) -> date:
    if period == "Today":
        return today
    if period == "Week":
        return today - timedelta(days=today.weekday())
    if period == "Month":
        return today.replace(day=1)
    return today.replace(month=1, day=1)


def records_for_period(
    history: dict[str, Any],
    category: str,
    period: str,
    today: date | None = None,
) -> list[dict[str, Any]]:
    current = today or datetime.now(TORONTO_TIMEZONE).date()
    start = _period_start(period, current)
    rows: list[dict[str, Any]] = []

    for day_key, day_record in history.get("days", {}).items():
        try:
            day = date.fromisoformat(day_key)
        except ValueError:
            continue

        if not (start <= day <= current):
            continue

        for row in (
            day_record.get("categories", {})
            .get(category, [])
        ):
            rows.append({**row, "date": day_key})

    return rows


def summarize_projection_accuracy(
    rows: list[dict[str, Any]],
) -> dict[str, Any]:
    graded = [
        row
        for row in rows
        if row.get("finalized")
        and isinstance(row.get("absolute_error"), (int, float))
    ]

    errors = [
        float(row.get("absolute_error") or 0)
        for row in graded
    ]

    def tier(start: int, end: int) -> dict[str, Any]:
        subset = [
            row
            for row in graded
            if start <= int(row.get("rank") or 0) <= end
        ]
        subset_errors = [
            float(row.get("absolute_error") or 0)
            for row in subset
        ]
        count = len(subset)
        within_one = sum(
            1 for error in subset_errors if error <= 1.0
        )

        return {
            "graded": count,
            "mean_absolute_error": (
                sum(subset_errors) / count
                if count
                else 0.0
            ),
            "within_one_rate": (
                within_one / count * 100
                if count
                else 0.0
            ),
        }

    count = len(graded)
    within_half = sum(1 for error in errors if error <= 0.5)
    within_one = sum(1 for error in errors if error <= 1.0)

    return {
        "graded": count,
        "pending": len(rows) - count,
        "mean_absolute_error": (
            sum(errors) / count
            if count
            else 0.0
        ),
        "within_half_rate": (
            within_half / count * 100
            if count
            else 0.0
        ),
        "within_one_rate": (
            within_one / count * 100
            if count
            else 0.0
        ),
        "top_5": tier(1, 5),
        "six_to_ten": tier(6, 10),
        "eleven_to_25": tier(11, 25),
    }
