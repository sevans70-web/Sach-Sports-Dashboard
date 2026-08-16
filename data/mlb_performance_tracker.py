"""Persistent MLB prediction performance history for core markets."""

from __future__ import annotations

import base64
import json
from datetime import date, datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

import requests

from data.mlb_prediction_results import grade_top_25

TORONTO_TIMEZONE = ZoneInfo("America/Toronto")
REPOSITORY = "sevans70-web/Sach-Sports-Dashboard"
BRANCH = "main"
HISTORY_PATH = "data/mlb_performance_history.json"
GITHUB_API = "https://api.github.com"
CORE_CATEGORIES = ("home_runs", "hits", "total_bases")


def _headers(token: str) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }


def _history_url() -> str:
    return f"{GITHUB_API}/repos/{REPOSITORY}/contents/{HISTORY_PATH}"


def load_history(token: str) -> tuple[dict[str, Any], str | None]:
    """Load tracker history plus the GitHub blob SHA when it exists."""
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


def save_history(token: str, history: dict[str, Any], sha: str | None) -> None:
    """Persist history only when the caller has determined content changed."""
    content = json.dumps(history, indent=2, sort_keys=True)
    body: dict[str, Any] = {
        "message": "Update MLB prediction performance history",
        "content": base64.b64encode(content.encode("utf-8")).decode("ascii"),
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


def _player_name(row: dict[str, Any]) -> str:
    return str(row.get("player") or row.get("player_name") or "Player")


def _freeze_prediction(row: dict[str, Any], category: str) -> dict[str, Any]:
    """Freeze pregame prediction fields. Results are filled separately."""
    return {
        "category": category,
        "rank": int(row.get("rank") or 0),
        "player_id": row.get("player_id"),
        "player_name": _player_name(row),
        "team": row.get("team") or row.get("team_name"),
        "opponent": row.get("opponent") or row.get("opponent_name"),
        "gi_score": float(row.get("score") or row.get("gi_score") or 0),
        "home_run_probability": row.get("home_run_probability"),
        "one_plus_hit_probability": row.get("one_plus_hit_probability"),
        "over_1_5_total_bases_probability": row.get("over_1_5_total_bases_probability"),
        "correct": None,
        "result_label": "Pending",
        "game_finished": False,
    }


def _prediction_key(row: dict[str, Any]) -> str:
    player_id = row.get("player_id")
    if player_id not in (None, ""):
        return f"id:{player_id}"
    return f"name:{_player_name(row).strip().casefold()}"


def _apply_final_results(
    predictions: list[dict[str, Any]],
    category: str,
    result_date: str,
) -> list[dict[str, Any]]:
    """Grade frozen predictions and copy only final outcome fields."""
    graded = grade_top_25(
        rankings=predictions,
        category=category,
        result_date=result_date,
        force_refresh=False,
    ).get("graded", [])
    lookup = {_prediction_key(row): row for row in graded}
    updated: list[dict[str, Any]] = []
    for frozen in predictions:
        row = dict(frozen)
        actual = lookup.get(_prediction_key(frozen), {})
        if actual.get("game_finished"):
            row["correct"] = actual.get("correct")
            row["result_label"] = actual.get("result_label", "Final")
            row["game_finished"] = True
            for field in (
                "actual_hits", "actual_home_runs", "actual_total_bases"
            ):
                if field in actual:
                    row[field] = actual[field]
        updated.append(row)
    return updated


def sync_history(
    token: str,
    rankings_by_category: dict[str, list[dict[str, Any]]],
    snapshot_date: str | None = None,
) -> dict[str, Any]:
    """
    Freeze today's core Top 25 once, then resolve old pending records.

    Today's prediction fields are never replaced after the first save.
    """
    today = snapshot_date or datetime.now(TORONTO_TIMEZONE).date().isoformat()
    history, sha = load_history(token)
    history.setdefault("schema_version", 1)
    days = history.setdefault("days", {})
    changed = False

    if today not in days:
        days[today] = {
            "captured_at": datetime.now(TORONTO_TIMEZONE).isoformat(),
            "categories": {
                category: [
                    _freeze_prediction(row, category)
                    for row in rankings_by_category.get(category, [])[:25]
                ]
                for category in CORE_CATEGORIES
            },
        }
        changed = True

    # Resolve prior dates in one batch on a later day. This avoids many
    # same-day GitHub commits/redeploys while still preserving outcomes.
    for day_key, day_record in days.items():
        if day_key >= today:
            continue
        categories = day_record.get("categories", {})
        for category in CORE_CATEGORIES:
            predictions = categories.get(category, [])
            if predictions and any(not row.get("game_finished") for row in predictions):
                resolved = _apply_final_results(predictions, category, day_key)
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
    """Return history with today's live/final grading overlaid in memory only."""
    today = day_key or datetime.now(TORONTO_TIMEZONE).date().isoformat()
    merged = json.loads(json.dumps(history))
    day = merged.get("days", {}).get(today)
    if not day:
        return merged
    categories = day.get("categories", {})
    for category in CORE_CATEGORIES:
        frozen = categories.get(category, [])
        # Grade the frozen predictions against today's current results without
        # rewriting the frozen prediction fields in GitHub.
        categories[category] = _apply_final_results(frozen, category, today)
    return merged


def _period_start(period: str, today: date) -> date:
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
        for row in day_record.get("categories", {}).get(category, []):
            rows.append({**row, "date": day_key})
    return rows


def summarize(rows: list[dict[str, Any]]) -> dict[str, Any]:
    graded = [row for row in rows if isinstance(row.get("correct"), bool)]
    wins = sum(1 for row in graded if row.get("correct") is True)
    losses = sum(1 for row in graded if row.get("correct") is False)
    total = len(graded)
    hit_rate = (wins / total * 100) if total else 0.0

    def tier(start: int, end: int) -> dict[str, Any]:
        subset = [
            row for row in graded
            if start <= int(row.get("rank") or 0) <= end
        ]
        tier_wins = sum(1 for row in subset if row.get("correct") is True)
        count = len(subset)
        return {
            "wins": tier_wins,
            "losses": count - tier_wins,
            "total": count,
            "hit_rate": (tier_wins / count * 100) if count else 0.0,
        }

    winner_scores = [float(row.get("gi_score") or 0) for row in graded if row.get("correct")]
    miss_scores = [float(row.get("gi_score") or 0) for row in graded if row.get("correct") is False]

    return {
        "wins": wins,
        "losses": losses,
        "graded": total,
        "pending": len(rows) - total,
        "hit_rate": hit_rate,
        "top_5": tier(1, 5),
        "six_to_ten": tier(6, 10),
        "eleven_to_25": tier(11, 25),
        "avg_gi_wins": sum(winner_scores) / len(winner_scores) if winner_scores else 0.0,
        "avg_gi_misses": sum(miss_scores) / len(miss_scores) if miss_scores else 0.0,
    }
