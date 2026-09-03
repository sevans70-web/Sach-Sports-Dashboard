"""Persistent MLB pitcher projection performance history."""

from __future__ import annotations

import base64
import json
from concurrent.futures import ThreadPoolExecutor, as_completed
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

# One pitcher/game final line is shared by every pitcher market.  Keeping this
# cache at module scope prevents five identical MLB feed calls per pitcher.
_FINAL_PITCHER_RESULT_CACHE: dict[tuple[int, int], dict[str, Any]] = {}


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
    categories = (day_record or {}).get("categories", {}) or {}
    settled = 0
    total = 0
    for rows in categories.values():
        if not isinstance(rows, list):
            continue
        total += len(rows)
        settled += sum(1 for row in rows if isinstance(row, dict) and row.get("game_finished") is True)
    return settled, total, str((day_record or {}).get("captured_at") or "")


def _merge_best_day(existing: dict[str, Any] | None, candidate: dict[str, Any]) -> dict[str, Any]:
    if not existing or _day_quality(candidate) > _day_quality(existing):
        return candidate
    return existing


def _recover_days_from_git_history(
    token: str,
    current_history: dict[str, Any],
    max_commits: int = 60,
) -> tuple[dict[str, Any], bool]:
    merged = {
        "schema_version": int(current_history.get("schema_version") or 1),
        "days": dict(current_history.get("days") or {}),
    }
    recovered = False
    try:
        response = requests.get(
            _history_commits_url(), headers=_headers(token),
            params={"path": HISTORY_PATH, "sha": BRANCH, "per_page": min(max_commits, 100)}, timeout=25,
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


def _canonical_frozen_rows(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Preserve one official first-captured Top 25 per pitcher market/day."""
    by_key: dict[str, dict[str, Any]] = {}
    order: list[str] = []
    for raw in rows or []:
        if not isinstance(raw, dict):
            continue
        key = _prediction_key(raw)
        if not key:
            continue
        if key not in by_key:
            by_key[key] = dict(raw)
            order.append(key)
        else:
            current = by_key[key]
            raw_quality = (
                1 if raw.get("finalized") is True else 0,
                1 if raw.get("actual") is not None else 0,
            )
            cur_quality = (
                1 if current.get("finalized") is True else 0,
                1 if current.get("actual") is not None else 0,
            )
            if raw_quality > cur_quality:
                by_key[key] = dict(raw)
    return [by_key[key] for key in order[:25]]


def _apply_final_results(
    predictions: list[dict[str, Any]],
    category: str,
) -> list[dict[str, Any]]:
    """Resolve pitcher results with one shared, parallel fetch per pitcher/game."""
    actual_field = ACTUAL_FIELDS[category]

    keys: list[tuple[int, int]] = []
    for frozen in predictions:
        if frozen.get("finalized"):
            continue
        key = (
            int(frozen.get("game_pk") or 0),
            int(frozen.get("pitcher_id") or 0),
        )
        if key[0] and key[1] and key not in _FINAL_PITCHER_RESULT_CACHE:
            keys.append(key)

    unique_keys = list(dict.fromkeys(keys))
    if unique_keys:
        with ThreadPoolExecutor(max_workers=min(8, len(unique_keys))) as executor:
            futures = {
                executor.submit(
                    get_pitcher_final_result,
                    game_pk=game_pk,
                    pitcher_id=pitcher_id,
                ): (game_pk, pitcher_id)
                for game_pk, pitcher_id in unique_keys
            }
            for future in as_completed(futures):
                key = futures[future]
                try:
                    _FINAL_PITCHER_RESULT_CACHE[key] = future.result()
                except Exception as exc:
                    _FINAL_PITCHER_RESULT_CACHE[key] = {
                        "game_finished": False,
                        "result_available": False,
                        "error": str(exc),
                    }

    updated: list[dict[str, Any]] = []
    for frozen in predictions:
        row = dict(frozen)
        if row.get("finalized"):
            updated.append(row)
            continue

        key = (
            int(row.get("game_pk") or 0),
            int(row.get("pitcher_id") or 0),
        )
        result = _FINAL_PITCHER_RESULT_CACHE.get(key, {})

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
    *,
    persist: bool = True,
    local_history_path: str | None = None,
) -> dict[str, Any]:
    today = (
        snapshot_date
        or datetime.now(TORONTO_TIMEZONE).date().isoformat()
    )
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

    for category in PITCHER_CATEGORIES:
        current_rankings = rankings_by_category.get(category, [])[:25]
        if not current_rankings:
            continue

        # Freeze one official Top 25. Repair any previously inflated
        # append-only set back to the first-captured 25.
        frozen_rows = _canonical_frozen_rows(
            today_categories.setdefault(category, [])
        )
        if frozen_rows != today_categories.get(category, []):
            today_categories[category] = frozen_rows
            changed = True

        if len(frozen_rows) < 25:
            existing_keys = {_prediction_key(row) for row in frozen_rows}
            captured_at = datetime.now(TORONTO_TIMEZONE).isoformat()
            for ranking in current_rankings:
                frozen = _freeze_prediction(ranking, category)
                key = _prediction_key(frozen)
                if key in existing_keys:
                    continue
                frozen["first_seen_at"] = captured_at
                frozen_rows.append(frozen)
                existing_keys.add(key)
                changed = True
                if len(frozen_rows) >= 25:
                    break
            today_categories[category] = _canonical_frozen_rows(frozen_rows)

    for day_key, day_record in days.items():
        if day_key >= today:
            continue

        categories = day_record.get("categories", {})
        for category in PITCHER_CATEGORIES:
            predictions = _canonical_frozen_rows(categories.get(category, []))
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

    if changed and persist:
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
        frozen = _canonical_frozen_rows(categories.get(category, []))
        categories[category] = _apply_final_results(
            frozen,
            category,
        )

    return merged


def refresh_history_view(
    history: dict[str, Any],
    *,
    recent_days: int = 8,
) -> dict[str, Any]:
    """Reconcile recent pitcher projection rows against final MLB lines."""
    current = datetime.now(TORONTO_TIMEZONE).date()
    cutoff = current - timedelta(days=max(1, int(recent_days)) - 1)
    merged = json.loads(json.dumps(history))
    for day_key, day_record in (merged.get("days") or {}).items():
        try:
            day = date.fromisoformat(day_key)
        except ValueError:
            continue
        if day > current:
            continue
        categories = (day_record or {}).get("categories", {}) or {}
        should_reconcile_day = day >= cutoff
        for category in PITCHER_CATEGORIES:
            rows = _canonical_frozen_rows(categories.get(category, []))
            if not rows:
                continue
            unresolved = any(not row.get("finalized") for row in rows)
            if should_reconcile_day or unresolved:
                # Clear the finalized flag for recent rows so a partial/incorrect
                # historical result can be corrected from the authoritative
                # final pitcher line.
                candidates = [dict(row, finalized=False) if should_reconcile_day else dict(row) for row in rows]
                categories[category] = _apply_final_results(candidates, category)
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
