"""
Persistent MLB prediction-result history.

This module:
- stores completed Home Run, Hit, and Total Base results in GitHub JSON;
- prevents duplicate counting when Streamlit reruns;
- updates an existing result if the final box score changes;
- returns season totals by category and overall;
- contains no Streamlit UI code.
"""

from __future__ import annotations

import base64
import json
from dataclasses import dataclass
from datetime import date, datetime
from typing import Any, Iterable
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen


DEFAULT_RESULTS_PATH = "data/mlb_results_history.json"
DEFAULT_BRANCH = "main"
SUPPORTED_CATEGORIES = {
    "home_runs",
    "hits",
    "total_bases",
}


class MLBResultsHistoryError(RuntimeError):
    """Raised when MLB result history cannot be read or saved."""


@dataclass(frozen=True)
class GitHubResultsConfig:
    """Configuration used to persist MLB result history in GitHub."""

    repository: str
    token: str
    branch: str = DEFAULT_BRANCH
    path: str = DEFAULT_RESULTS_PATH

    def validate(self) -> None:
        """Validate the GitHub configuration."""
        if "/" not in self.repository:
            raise ValueError(
                "repository must use the 'owner/repository' format"
            )

        if not self.token.strip():
            raise ValueError("A GitHub token is required")

        if not self.branch.strip():
            raise ValueError("A GitHub branch is required")

        if not self.path.strip():
            raise ValueError("A results-history path is required")


def _contents_url(config: GitHubResultsConfig) -> str:
    """Return the GitHub Contents API URL for the history file."""
    encoded_path = quote(config.path.strip("/"), safe="/")

    return (
        f"https://api.github.com/repos/"
        f"{config.repository}/contents/{encoded_path}"
        f"?ref={quote(config.branch)}"
    )


def _headers(
    config: GitHubResultsConfig,
    *,
    include_json: bool = False,
) -> dict[str, str]:
    """Return standard GitHub API request headers."""
    headers = {
        "Accept": "application/vnd.github+json",
        "Authorization": f"Bearer {config.token}",
        "User-Agent": "Sach-Sports-Dashboard",
        "X-GitHub-Api-Version": "2022-11-28",
    }

    if include_json:
        headers["Content-Type"] = "application/json"

    return headers


def _empty_history() -> dict[str, Any]:
    """Return a new empty history document."""
    return {
        "version": 1,
        "updated_at": None,
        "results": [],
    }


def _read_response_json(response: Any) -> dict[str, Any]:
    """Read a JSON response body."""
    payload = response.read().decode("utf-8")
    return json.loads(payload)


def load_results_history(
    config: GitHubResultsConfig,
) -> tuple[dict[str, Any], str | None]:
    """
    Load saved MLB result history.

    Returns:
        A tuple containing the history document and the current GitHub SHA.
        The SHA is None when the history file does not exist yet.
    """
    config.validate()

    request = Request(
        _contents_url(config),
        headers=_headers(config),
        method="GET",
    )

    try:
        with urlopen(request, timeout=20) as response:
            payload = _read_response_json(response)

    except HTTPError as exc:
        if exc.code == 404:
            return _empty_history(), None

        raise MLBResultsHistoryError(
            f"GitHub could not load MLB result history: HTTP {exc.code}"
        ) from exc

    except URLError as exc:
        raise MLBResultsHistoryError(
            f"GitHub could not load MLB result history: {exc.reason}"
        ) from exc

    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise MLBResultsHistoryError(
            "The MLB result-history response could not be read."
        ) from exc

    encoded_content = str(payload.get("content") or "").replace("\n", "")
    sha = payload.get("sha")

    if not encoded_content:
        return _empty_history(), sha

    try:
        decoded = base64.b64decode(encoded_content).decode("utf-8")
        history = json.loads(decoded)

    except (ValueError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise MLBResultsHistoryError(
            "The saved MLB result-history file is invalid."
        ) from exc

    if not isinstance(history, dict):
        raise MLBResultsHistoryError(
            "The saved MLB result-history file must contain a JSON object."
        )

    results = history.get("results")

    if not isinstance(results, list):
        history["results"] = []

    history.setdefault("version", 1)
    history.setdefault("updated_at", None)

    return history, sha


def save_results_history(
    config: GitHubResultsConfig,
    history: dict[str, Any],
    current_sha: str | None,
) -> str:
    """Save the complete MLB result-history document to GitHub."""
    config.validate()

    serialized = json.dumps(
        history,
        indent=2,
        sort_keys=True,
        ensure_ascii=False,
    ).encode("utf-8")

    body: dict[str, Any] = {
        "message": "Update MLB prediction result history",
        "content": base64.b64encode(serialized).decode("ascii"),
        "branch": config.branch,
    }

    if current_sha:
        body["sha"] = current_sha

    request = Request(
        _contents_url(config).split("?ref=", 1)[0],
        data=json.dumps(body).encode("utf-8"),
        headers=_headers(config, include_json=True),
        method="PUT",
    )

    try:
        with urlopen(request, timeout=20) as response:
            payload = _read_response_json(response)

    except HTTPError as exc:
        detail = ""

        try:
            error_payload = json.loads(
                exc.read().decode("utf-8")
            )
            detail = str(error_payload.get("message") or "")
        except (ValueError, UnicodeDecodeError, json.JSONDecodeError):
            detail = ""

        message = (
            f"GitHub could not save MLB result history: HTTP {exc.code}"
        )

        if detail:
            message = f"{message} - {detail}"

        raise MLBResultsHistoryError(message) from exc

    except URLError as exc:
        raise MLBResultsHistoryError(
            f"GitHub could not save MLB result history: {exc.reason}"
        ) from exc

    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise MLBResultsHistoryError(
            "GitHub saved the history, but its response could not be read."
        ) from exc

    new_sha = (
        payload.get("content", {}).get("sha")
        or payload.get("commit", {}).get("sha")
    )

    return str(new_sha or "")


def _result_date(
    result_date: date | str | None,
) -> str:
    """Normalize a result date as YYYY-MM-DD."""
    if result_date is None:
        return date.today().isoformat()

    if isinstance(result_date, date):
        return result_date.isoformat()

    return str(result_date)


def _player_key(player: dict[str, Any]) -> str:
    """Return a stable key for a graded player."""
    player_id = player.get("player_id")

    if player_id not in (None, ""):
        return str(player_id)

    player_name = str(
        player.get("player")
        or player.get("player_name")
        or ""
    ).strip()

    if not player_name:
        raise ValueError(
            "A graded result requires player_id, player, or player_name."
        )

    return player_name.casefold()


def _record_key(record: dict[str, Any]) -> str:
    """Return the unique key for one dated category result."""
    return "|".join(
        [
            str(record.get("date") or ""),
            str(record.get("category") or ""),
            str(record.get("player_key") or ""),
        ]
    )


def normalize_graded_results(
    graded_results: Iterable[dict[str, Any]],
    category: str,
    result_date: date | str | None = None,
) -> list[dict[str, Any]]:
    """Convert completed graded results into persistent records."""
    normalized_category = str(category).strip().lower()

    if normalized_category not in SUPPORTED_CATEGORIES:
        raise ValueError(
            "category must be 'home_runs', 'hits', or 'total_bases'"
        )

    normalized_date = _result_date(result_date)
    records: list[dict[str, Any]] = []

    for player in graded_results:
        if not isinstance(player, dict):
            continue

        if not player.get("game_finished"):
            continue

        try:
            player_key = _player_key(player)
        except ValueError:
            continue

        correct = player.get("correct")

        if correct not in (True, False):
            continue

        record = {
            "date": normalized_date,
            "category": normalized_category,
            "player_key": player_key,
            "player_id": player.get("player_id"),
            "player": str(
                player.get("player")
                or player.get("player_name")
                or "Unknown player"
            ),
            "team": str(player.get("team") or ""),
            "opponent": str(player.get("opponent") or ""),
            "rank": player.get("rank"),
            "gi_score": player.get("score"),
            "confidence": str(player.get("confidence") or ""),
            "correct": bool(correct),
            "result_label": str(
                player.get("result_label")
                or "Result unavailable"
            ),
            "actual_hits": int(
                player.get("actual_hits") or 0
            ),
            "actual_home_runs": int(
                player.get("actual_home_runs") or 0
            ),
            "actual_total_bases": int(
                player.get("actual_total_bases") or 0
            ),
        }

        record["record_key"] = _record_key(record)
        records.append(record)

    return records


def merge_results(
    history: dict[str, Any],
    new_records: Iterable[dict[str, Any]],
    updated_at: datetime,
) -> tuple[dict[str, Any], int, int]:
    """
    Merge completed results into history.

    Returns:
        Updated history, number of added records, number of updated records.
    """
    existing_results = history.get("results", [])

    if not isinstance(existing_results, list):
        existing_results = []

    merged_by_key: dict[str, dict[str, Any]] = {}

    for record in existing_results:
        if not isinstance(record, dict):
            continue

        key = str(
            record.get("record_key")
            or _record_key(record)
        )

        if not key.strip(" |"):
            continue

        merged_by_key[key] = {
            **record,
            "record_key": key,
        }

    added_count = 0
    updated_count = 0

    for record in new_records:
        key = str(record.get("record_key") or _record_key(record))

        if key in merged_by_key:
            if merged_by_key[key] != record:
                merged_by_key[key] = record
                updated_count += 1
        else:
            merged_by_key[key] = record
            added_count += 1

    merged_results = sorted(
        merged_by_key.values(),
        key=lambda item: (
            str(item.get("date") or ""),
            str(item.get("category") or ""),
            int(item.get("rank") or 999),
            str(item.get("player") or ""),
        ),
    )

    updated_history = {
        "version": 1,
        "updated_at": updated_at.isoformat(),
        "results": merged_results,
    }

    return updated_history, added_count, updated_count


def summarize_results(
    history: dict[str, Any],
) -> dict[str, Any]:
    """Return overall and category season totals."""
    results = history.get("results", [])

    if not isinstance(results, list):
        results = []

    summaries: dict[str, dict[str, Any]] = {
        category: {
            "category": category,
            "graded": 0,
            "correct": 0,
            "accuracy": 0.0,
        }
        for category in SUPPORTED_CATEGORIES
    }

    overall_graded = 0
    overall_correct = 0

    for result in results:
        if not isinstance(result, dict):
            continue

        category = str(result.get("category") or "").lower()

        if category not in summaries:
            continue

        summaries[category]["graded"] += 1
        overall_graded += 1

        if result.get("correct") is True:
            summaries[category]["correct"] += 1
            overall_correct += 1

    for category_summary in summaries.values():
        graded = int(category_summary["graded"])
        correct = int(category_summary["correct"])

        category_summary["accuracy"] = (
            round((correct / graded) * 100, 1)
            if graded
            else 0.0
        )

    overall_accuracy = (
        round((overall_correct / overall_graded) * 100, 1)
        if overall_graded
        else 0.0
    )

    dates = sorted(
        {
            str(result.get("date"))
            for result in results
            if isinstance(result, dict) and result.get("date")
        }
    )

    return {
        "overall": {
            "graded": overall_graded,
            "correct": overall_correct,
            "accuracy": overall_accuracy,
        },
        "categories": summaries,
        "days_tracked": len(dates),
        "first_date": dates[0] if dates else None,
        "latest_date": dates[-1] if dates else None,
    }


def save_daily_graded_results(
    config: GitHubResultsConfig,
    category_results: dict[str, dict[str, Any]],
    result_date: date | str | None,
    updated_at: datetime,
) -> dict[str, Any]:
    """
    Save completed graded results for all MLB categories.

    category_results must map each category to the dictionary returned by
    grade_top_25().
    """
    history, current_sha = load_results_history(config)
    all_new_records: list[dict[str, Any]] = []

    for category, grade_result in category_results.items():
        if category not in SUPPORTED_CATEGORIES:
            continue

        graded = grade_result.get("graded", [])

        all_new_records.extend(
            normalize_graded_results(
                graded_results=graded,
                category=category,
                result_date=result_date,
            )
        )

    updated_history, added_count, updated_count = merge_results(
        history=history,
        new_records=all_new_records,
        updated_at=updated_at,
    )

    changed = bool(added_count or updated_count)

    if changed:
        save_results_history(
            config=config,
            history=updated_history,
            current_sha=current_sha,
        )

    return {
        "history": updated_history,
        "summary": summarize_results(updated_history),
        "added_count": added_count,
        "updated_count": updated_count,
        "changed": changed,
    }
