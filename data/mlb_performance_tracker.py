"""Persistent MLB prediction performance history for all tracked hitter markets."""

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
CORE_CATEGORIES = (
    "home_runs",
    "hits",
    "total_bases",
    "runs",
    "rbis",
    "walks",
    "stolen_bases",
    "hits_runs_rbis",
)


def _headers(token: str) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }


def _history_url() -> str:
    return f"{GITHUB_API}/repos/{REPOSITORY}/contents/{HISTORY_PATH}"


def _history_commits_url() -> str:
    return f"{GITHUB_API}/repos/{REPOSITORY}/commits"


def _load_history_at_sha(token: str, sha: str) -> dict[str, Any]:
    """Read one older copy of the history file from GitHub."""
    response = requests.get(
        _history_url(),
        headers=_headers(token),
        params={"ref": sha},
        timeout=20,
    )
    if response.status_code != 200:
        return {"schema_version": 1, "days": {}}

    payload = response.json()
    raw = base64.b64decode(payload.get("content", "")).decode("utf-8").strip()
    if not raw:
        return {"schema_version": 1, "days": {}}

    try:
        history = json.loads(raw)
    except json.JSONDecodeError:
        return {"schema_version": 1, "days": {}}

    if not isinstance(history, dict):
        return {"schema_version": 1, "days": {}}

    history.setdefault("schema_version", 1)
    history.setdefault("days", {})
    return history


def _day_quality(day_record: dict[str, Any]) -> tuple[int, int, str]:
    """Score a stored day by settled rows first, then total rows and capture time."""
    categories = (day_record or {}).get("categories", {}) or {}
    settled = 0
    total = 0
    for rows in categories.values():
        if not isinstance(rows, list):
            continue
        total += len(rows)
        settled += sum(
            1 for row in rows
            if isinstance(row, dict) and isinstance(row.get("correct"), bool)
        )
    return settled, total, str((day_record or {}).get("captured_at") or "")


def _merge_best_day(existing: dict[str, Any] | None, candidate: dict[str, Any]) -> dict[str, Any]:
    """Keep the most complete stored version of a historical day."""
    if not existing:
        return candidate
    if _day_quality(candidate) > _day_quality(existing):
        return candidate
    return existing


def _recover_days_from_git_history(
    token: str,
    current_history: dict[str, Any],
    max_commits: int = 60,
) -> tuple[dict[str, Any], bool]:
    """
    Recover historical day records from Git and keep the most complete version
    of each date. This protects against a later deploy replacing a fully graded
    day with an earlier all-Pending snapshot of the same date.
    """
    merged = {
        "schema_version": int(current_history.get("schema_version") or 1),
        "days": dict(current_history.get("days") or {}),
    }
    recovered = False

    try:
        response = requests.get(
            _history_commits_url(),
            headers=_headers(token),
            params={"path": HISTORY_PATH, "sha": BRANCH, "per_page": min(max_commits, 100)},
            timeout=25,
        )
        response.raise_for_status()
        commits = response.json()
    except Exception:
        return merged, False

    if not isinstance(commits, list):
        return merged, False

    for commit in commits[:max_commits]:
        sha = str((commit or {}).get("sha") or "").strip()
        if not sha:
            continue
        older = _load_history_at_sha(token, sha)
        for day_key, day_record in (older.get("days") or {}).items():
            if not isinstance(day_record, dict):
                continue
            before = merged["days"].get(day_key)
            best = _merge_best_day(before, day_record)
            if best != before:
                merged["days"][day_key] = best
                recovered = True

    merged["days"] = {key: merged["days"][key] for key in sorted(merged["days"])}
    return merged, recovered

def load_history(token: str) -> tuple[dict[str, Any], str | None]:
    """
    Load current history and automatically repair missing historical days
    from older Git revisions of this same file.
    """
    response = requests.get(
        _history_url(),
        headers=_headers(token),
        params={"ref": BRANCH},
        timeout=20,
    )

    if response.status_code == 404:
        history = {"schema_version": 1, "days": {}}
        sha = None
    else:
        response.raise_for_status()
        payload = response.json()
        sha = payload.get("sha")
        raw = base64.b64decode(payload.get("content", "")).decode("utf-8").strip()

        if not raw:
            history = {"schema_version": 1, "days": {}}
        else:
            try:
                history = json.loads(raw)
            except json.JSONDecodeError:
                history = {"schema_version": 1, "days": {}}

        if not isinstance(history, dict):
            history = {"schema_version": 1, "days": {}}

        history.setdefault("schema_version", 1)
        history.setdefault("days", {})

    # Git-history recovery is a disaster-recovery path, not a normal navigation step.
    # Once the repository has a real history window, avoid dozens of GitHub requests
    # on ordinary Streamlit reruns. Empty/near-empty history still self-recovers.
    current_days = history.get("days") or {}
    should_recover = len(current_days) < 2
    if should_recover:
        history, recovered = _recover_days_from_git_history(token, history)
        if recovered:
            history["_history_recovered"] = True

    return history, sha

def save_history(token: str, history: dict[str, Any], sha: str | None) -> None:
    content = json.dumps(history, indent=2, sort_keys=True)
    body: dict[str, Any] = {
        "message": "Update MLB prediction performance history",
        "content": base64.b64encode(content.encode("utf-8")).decode("ascii"),
        "branch": BRANCH,
    }
    if sha:
        body["sha"] = sha
    response = requests.put(_history_url(), headers=_headers(token), json=body, timeout=25)
    response.raise_for_status()


def _player_name(row: dict[str, Any]) -> str:
    return str(row.get("player") or row.get("player_name") or "Player")


def _freeze_prediction(row: dict[str, Any], category: str) -> dict[str, Any]:
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
        "one_plus_run_probability": row.get("one_plus_run_probability"),
        "one_plus_rbi_probability": row.get("one_plus_rbi_probability"),
        "one_plus_walk_probability": row.get("one_plus_walk_probability"),
        "one_plus_stolen_base_probability": row.get("one_plus_stolen_base_probability"),
        "over_1_5_hits_runs_rbis_probability": row.get(
            "over_1_5_hits_runs_rbis_probability"
        ),
        "projected_hits_runs_rbis": row.get("projected_hits_runs_rbis"),
        "correct": None,
        "result_label": "Pending",
        "game_finished": False,
    }


def _prediction_key(row: dict[str, Any]) -> str:
    player_id = row.get("player_id")
    if player_id not in (None, ""):
        return f"id:{player_id}"
    return f"name:{_player_name(row).strip().casefold()}"


def _apply_final_results(predictions: list[dict[str, Any]], category: str, result_date: str) -> list[dict[str, Any]]:
    graded = grade_top_25(
        rankings=predictions,
        category=category,
        result_date=result_date,
        # Historical grading must never reuse an earlier partial/live cache.
        force_refresh=True,
    ).get("graded", [])
    lookup = {_prediction_key(row): row for row in graded}
    updated: list[dict[str, Any]] = []
    for frozen in predictions:
        row = dict(frozen)
        actual = lookup.get(_prediction_key(frozen), {})
        if actual.get("game_finished") or actual.get("result_live"):
            target_met = bool(actual.get("target_met"))
            is_final = bool(actual.get("game_finished"))

            # A live success is already settled: once a hitter has homered,
            # recorded a hit, crossed a one-plus threshold, etc., it cannot
            # turn into a miss later in the game. Live misses stay pending.
            if is_final:
                row["correct"] = actual.get("correct")
            elif target_met:
                row["correct"] = True
            else:
                row["correct"] = None

            row["result_label"] = actual.get(
                "result_label",
                "Final" if is_final else "Live",
            )
            row["game_finished"] = is_final
            row["result_live"] = bool(actual.get("result_live"))

            for field in (
                "actual_hits", "actual_home_runs", "actual_total_bases",
                "actual_runs", "actual_rbis", "actual_walks", "actual_stolen_bases",
                "actual_hits_runs_rbis",
            ):
                if field in actual:
                    row[field] = actual[field]
        updated.append(row)
    return updated


def sync_history(
    token: str,
    rankings_by_category: dict[str, list[dict[str, Any]]],
    snapshot_date: str | None = None,
    *,
    persist: bool = True,
    local_history_path: str | None = None,
) -> dict[str, Any]:
    today = snapshot_date or datetime.now(TORONTO_TIMEZONE).date().isoformat()
    if not persist and local_history_path:
        try:
            with open(local_history_path, "r", encoding="utf-8") as handle:
                history = json.load(handle)
            if not isinstance(history, dict):
                history = {"schema_version": 1, "days": {}}
        except Exception:
            history = {"schema_version": 1, "days": {}}
        sha = None
    else:
        history, sha = load_history(token)
    history.setdefault("schema_version", 1)
    days = history.setdefault("days", {})
    changed = bool(history.pop("_history_recovered", False))

    if today not in days:
        days[today] = {
            "captured_at": datetime.now(TORONTO_TIMEZONE).isoformat(),
            "categories": {},
        }
        changed = True

    today_categories = days[today].setdefault("categories", {})
    for category in CORE_CATEGORIES:
        if category in today_categories:
            continue
        current_rankings = rankings_by_category.get(category, [])[:25]
        if not current_rankings:
            continue
        today_categories[category] = [_freeze_prediction(row, category) for row in current_rankings]
        changed = True

    yesterday = (
        datetime.fromisoformat(today).date() - timedelta(days=1)
    ).isoformat()

    for day_key, day_record in days.items():
        if day_key >= today:
            continue

        categories = day_record.get("categories", {})
        for category in CORE_CATEGORIES:
            predictions = categories.get(category, [])
            if not predictions:
                continue

            # Always re-grade yesterday until the next day is underway.
            # Older days are re-graded only if something is still unresolved.
            should_regrade = (
                day_key == yesterday
                or any(not row.get("game_finished") for row in predictions)
            )
            if not should_regrade:
                continue

            resolved = _apply_final_results(predictions, category, day_key)
            if resolved != predictions:
                categories[category] = resolved
                changed = True

    if changed and persist:
        save_history(token, history, sha)
    return history


def current_day_view(history: dict[str, Any], rankings_by_category: dict[str, list[dict[str, Any]]], day_key: str | None = None) -> dict[str, Any]:
    today = day_key or datetime.now(TORONTO_TIMEZONE).date().isoformat()
    merged = json.loads(json.dumps(history))
    day = merged.get("days", {}).get(today)
    if not day:
        return merged
    categories = day.get("categories", {})
    for category in CORE_CATEGORIES:
        frozen = categories.get(category, [])
        categories[category] = _apply_final_results(frozen, category, today)
    return merged


def _period_start(period: str, today: date) -> date:
    if period == "Today":
        return today
    if period == "7 Days":
        return today - timedelta(days=6)
    if period == "Week":
        # Backward compatibility for any older stored/session value.
        return today - timedelta(days=6)
    if period == "Month":
        return today.replace(day=1)
    return today.replace(month=1, day=1)


def records_for_period(history: dict[str, Any], category: str, period: str, today: date | None = None) -> list[dict[str, Any]]:
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
        subset = [row for row in graded if start <= int(row.get("rank") or 0) <= end]
        tier_wins = sum(1 for row in subset if row.get("correct") is True)
        count = len(subset)
        return {
            "wins": tier_wins, "losses": count - tier_wins, "total": count,
            "hit_rate": (tier_wins / count * 100) if count else 0.0,
        }

    winner_scores = [float(row.get("gi_score") or 0) for row in graded if row.get("correct")]
    miss_scores = [float(row.get("gi_score") or 0) for row in graded if row.get("correct") is False]

    return {
        "wins": wins, "losses": losses, "graded": total,
        "pending": len(rows) - total, "hit_rate": hit_rate,
        "top_5": tier(1, 5), "six_to_ten": tier(6, 10), "eleven_to_25": tier(11, 25),
        "avg_gi_wins": sum(winner_scores) / len(winner_scores) if winner_scores else 0.0,
        "avg_gi_misses": sum(miss_scores) / len(miss_scores) if miss_scores else 0.0,
    }


def all_records_for_period(
    history: dict[str, Any],
    period: str,
    today: date | None = None,
) -> list[dict[str, Any]]:
    """Return every tracked batter prediction across all prop categories."""
    rows: list[dict[str, Any]] = []
    for category in CORE_CATEGORIES:
        rows.extend(records_for_period(history, category, period, today=today))
    return rows


def summarize_overall(rows: list[dict[str, Any]]) -> dict[str, Any]:
    """Summarize the MLB batter model as one combined prediction system."""
    overall = summarize(rows)
    graded = [row for row in rows if isinstance(row.get("correct"), bool)]
    top_5_rows = [row for row in graded if 1 <= int(row.get("rank") or 0) <= 5]
    full_top_25_rows = [row for row in graded if 1 <= int(row.get("rank") or 0) <= 25]

    def compact(subset: list[dict[str, Any]]) -> dict[str, Any]:
        wins = sum(1 for row in subset if row.get("correct") is True)
        total = len(subset)
        return {
            "wins": wins,
            "losses": total - wins,
            "total": total,
            "hit_rate": (wins / total * 100) if total else 0.0,
        }

    return {
        **overall,
        "top_5_overall": compact(top_5_rows),
        "top_25_overall": compact(full_top_25_rows),
    }
