"""Persistent MLB prediction performance history for all tracked hitter markets."""

from __future__ import annotations

import base64
import json
import re
import unicodedata
from datetime import date, datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

import requests

from data.mlb_prediction_results import grade_top_25, get_live_batter_results

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


def _canonical_frozen_rows(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Preserve the official first-captured Top 25 and the best graded copy.

    Live ranking movement never deletes a frozen prediction, but it also must not
    inflate one market/day beyond 25 by appending every later entrant.
    """
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
            raw_settled = isinstance(raw.get("correct"), bool)
            cur_settled = isinstance(current.get("correct"), bool)
            raw_actual = any(k.startswith("actual_") for k in raw)
            cur_actual = any(k.startswith("actual_") for k in current)
            if (raw_settled, raw_actual) > (cur_settled, cur_actual):
                by_key[key] = dict(raw)
    return [by_key[key] for key in order[:25]]


def _loose_name(value: Any) -> str:
    text = unicodedata.normalize("NFKD", str(value or ""))
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = text.replace("’", "'").casefold()
    text = re.sub(r"[^a-z0-9 ]+", " ", text)
    parts = [part for part in text.split() if part not in {"jr", "sr", "ii", "iii", "iv"}]
    return " ".join(parts)


def _apply_loose_actual(row: dict[str, Any], actual: dict[str, Any], category: str) -> dict[str, Any]:
    out = dict(row)
    if not actual:
        return out
    is_final = bool(actual.get("game_finished"))
    is_live = bool(actual.get("result_live"))
    if not (is_final or is_live):
        return out

    hits = int(actual.get("hits") or 0)
    hrs = int(actual.get("home_runs") or 0)
    tb = int(actual.get("total_bases") or 0)
    runs = int(actual.get("runs") or 0)
    rbis = int(actual.get("rbis") or 0)
    walks = int(actual.get("walks") or 0)
    sb = int(actual.get("stolen_bases") or 0)
    hrr = hits + runs + rbis
    actuals = {
        "home_runs": hrs, "hits": hits, "total_bases": tb, "runs": runs,
        "rbis": rbis, "walks": walks, "stolen_bases": sb,
        "hits_runs_rbis": hrr,
    }
    thresholds = {
        "home_runs": 1, "hits": 1, "total_bases": 2, "runs": 1,
        "rbis": 1, "walks": 1, "stolen_bases": 1, "hits_runs_rbis": 2,
    }
    value = actuals[category]
    target_met = value >= thresholds[category]
    # Performance is settled only after MLB marks the game final.  A live
    # player may already have reached the target, but counting that as settled
    # makes Today's overall card show a misleading partial 100% result.
    out["correct"] = bool(target_met) if is_final else None
    out["game_finished"] = is_final
    out["result_live"] = is_live
    out["target_met"] = bool(target_met)
    labels = {
        "home_runs": f"{value} HR", "hits": f"{value} hits",
        "total_bases": f"{value} total bases", "runs": f"{value} runs",
        "rbis": f"{value} RBIs", "walks": f"{value} walks",
        "stolen_bases": f"{value} stolen bases",
        "hits_runs_rbis": f"{value} H+R+RBI",
    }
    prefix = "✅ " if target_met else ("❌ " if is_final else "")
    out["result_label"] = prefix + labels[category]
    out.update({
        "actual_hits": hits, "actual_home_runs": hrs, "actual_total_bases": tb,
        "actual_runs": runs, "actual_rbis": rbis, "actual_walks": walks,
        "actual_stolen_bases": sb, "actual_hits_runs_rbis": hrr,
    })
    return out


def _apply_final_results(predictions: list[dict[str, Any]], category: str, result_date: str) -> list[dict[str, Any]]:
    graded = grade_top_25(
        rankings=predictions,
        category=category,
        result_date=result_date,
        # The worker starts with a fresh process. Reuse the completed-date
        # cache across categories so Yesterday is graded once, not eight times.
        force_refresh=False,
    ).get("graded", [])
    lookup = {_prediction_key(row): row for row in graded}
    live_payload = get_live_batter_results(result_date, force_refresh=False)
    loose_lookup = {
        _loose_name(actual.get("player_name")): actual
        for actual in (live_payload.get("by_player_id") or {}).values()
        if _loose_name(actual.get("player_name"))
    }
    updated: list[dict[str, Any]] = []
    for frozen in predictions:
        row = dict(frozen)
        actual = lookup.get(_prediction_key(frozen), {})
        # Older frozen files sometimes stored a different accent/punctuation
        # spelling. Recover those rows from MLB's player name instead of
        # silently counting them as pending/misses.
        if not (actual.get("game_finished") or actual.get("result_live")):
            loose_actual = loose_lookup.get(_loose_name(_player_name(frozen)), {})
            if loose_actual:
                row = _apply_loose_actual(row, loose_actual, category)
                updated.append(row)
                continue
        if actual.get("game_finished") or actual.get("result_live"):
            target_met = bool(actual.get("target_met"))
            is_final = bool(actual.get("game_finished"))

            # Keep every live result pending.  The live cards can still show
            # what the player has done, but Prediction Performance should only
            # use completed games in its settled count and hit rate.
            row["correct"] = actual.get("correct") if is_final else None

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
        current_rankings = rankings_by_category.get(category, [])[:25]
        if not current_rankings:
            continue

        # Freeze one official Top 25 for this market/day. If earlier builds
        # accidentally appended later entrants, repair the set back to the
        # first-captured 25 while keeping the best graded copy of each row.
        frozen_rows = _canonical_frozen_rows(
            today_categories.setdefault(category, [])
        )
        if frozen_rows != today_categories.get(category, []):
            today_categories[category] = frozen_rows
            changed = True

        # A partial first capture may be completed up to 25, but once 25 exist
        # later ranking movement can never replace or add another prediction.
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

    yesterday = (
        datetime.fromisoformat(today).date() - timedelta(days=1)
    ).isoformat()

    for day_key, day_record in days.items():
        if day_key >= today:
            continue

        categories = day_record.get("categories", {})
        for category in CORE_CATEGORIES:
            predictions = _canonical_frozen_rows(categories.get(category, []))
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
        frozen = _canonical_frozen_rows(categories.get(category, []))
        categories[category] = _apply_final_results(frozen, category, today)
    return merged


def refresh_history_view(
    history: dict[str, Any],
    *,
    recent_days: int = 8,
) -> dict[str, Any]:
    """Reconcile Today + recent history directly against MLB results.

    This deliberately re-grades recent settled rows as well as pending rows.
    That repairs old false totals caused by partial box scores, name formatting,
    or a worker snapshot taken before every game had gone final.
    """
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
        for category in CORE_CATEGORIES:
            rows = _canonical_frozen_rows(categories.get(category, []))
            if not rows:
                continue
            unresolved = any(not isinstance(row.get("correct"), bool) for row in rows)
            if should_reconcile_day or unresolved:
                categories[category] = _apply_final_results(rows, category, day_key)
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
