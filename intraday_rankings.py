"""
Persistent intraday ranking snapshots for the MLB dashboard.

This module:
- normalizes the current Top 25 rankings;
- saves ranking snapshots as JSON;
- loads the most recent snapshot;
- compares every current Top 25 player with the previous snapshot;
- identifies players who entered or left the Top 25;
- returns structured movement data for the Streamlit page.

The module contains no Streamlit UI code. The page decides how movement
should be displayed.
"""

from __future__ import annotations

import base64
import json
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Iterable
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen


DEFAULT_SNAPSHOT_PATH = "data/intraday_rankings.json"
DEFAULT_BRANCH = "main"
MAX_RANKINGS = 25


class RankingSnapshotError(RuntimeError):
    """Raised when a persistent ranking snapshot cannot be read or saved."""


@dataclass(frozen=True)
class GitHubSnapshotConfig:
    """Configuration needed to persist snapshots in a GitHub repository."""

    repository: str
    token: str
    branch: str = DEFAULT_BRANCH
    path: str = DEFAULT_SNAPSHOT_PATH

    def validate(self) -> None:
        """Validate the configuration before making a GitHub request."""
        if "/" not in self.repository:
            raise ValueError("repository must use the 'owner/repository' format")
        if not self.token.strip():
            raise ValueError("A GitHub token is required")
        if not self.branch.strip():
            raise ValueError("A GitHub branch is required")
        if not self.path.strip():
            raise ValueError("A snapshot file path is required")


def player_key(player: dict[str, Any]) -> str:
    """Return a stable identifier for a player."""
    player_id = player.get("player_id")
    if player_id not in (None, ""):
        return str(player_id)

    name = str(player.get("player") or player.get("player_name") or "").strip()
    if not name:
        raise ValueError(
            "Each ranking record requires player_id, player, or player_name"
        )
    return name.casefold()


def player_name(player: dict[str, Any]) -> str:
    """Return the display name from a ranking record."""
    name = str(
        player.get("player") or player.get("player_name") or "Unknown player"
    ).strip()
    return name or "Unknown player"


def normalize_rankings(
    rankings: Iterable[dict[str, Any]],
    limit: int = MAX_RANKINGS,
) -> list[dict[str, Any]]:
    """Normalize, sort, and limit ranking records."""
    normalized: list[dict[str, Any]] = []
    seen_keys: set[str] = set()

    for fallback_rank, original in enumerate(rankings, start=1):
        if not isinstance(original, dict):
            continue

        try:
            key = player_key(original)
        except ValueError:
            continue

        if key in seen_keys:
            continue

        raw_rank = original.get("rank", fallback_rank)
        try:
            rank = int(raw_rank)
        except (TypeError, ValueError):
            rank = fallback_rank

        if rank < 1:
            continue

        normalized.append(
            {
                "player_key": key,
                "player_id": original.get("player_id"),
                "player": player_name(original),
                "rank": rank,
                "team": str(original.get("team", "")).strip(),
                "score": original.get("score"),
            }
        )
        seen_keys.add(key)

    normalized.sort(key=lambda item: item["rank"])
    return normalized[:limit]


def rankings_signature(
    rankings: Iterable[dict[str, Any]],
) -> list[list[Any]]:
    """Return a JSON-safe signature used to detect ranking changes."""
    return [
        [item["player_key"], item["rank"], item.get("score")]
        for item in normalize_rankings(rankings)
    ]


def create_snapshot(
    category_rankings: dict[str, Iterable[dict[str, Any]]],
    captured_at: datetime,
) -> dict[str, Any]:
    """Create a complete timestamped snapshot for every ranking category."""
    categories = {
        str(category): normalize_rankings(rankings)
        for category, rankings in category_rankings.items()
    }
    return {
        "version": 1,
        "captured_at": captured_at.isoformat(),
        "categories": categories,
    }


def compare_rankings(
    current_rankings: Iterable[dict[str, Any]],
    previous_rankings: Iterable[dict[str, Any]],
) -> dict[str, list[dict[str, Any]]]:
    """Compare two Top 25 ranking lists."""
    current = normalize_rankings(current_rankings)
    previous = normalize_rankings(previous_rankings)

    previous_lookup = {item["player_key"]: item for item in previous}
    current_lookup = {item["player_key"]: item for item in current}

    current_with_movement: list[dict[str, Any]] = []

    for item in current:
        previous_item = previous_lookup.get(item["player_key"])
        current_rank = item["rank"]

        if previous_item is None:
            movement = {
                "status": "new",
                "current": current_rank,
                "previous": None,
                "change": None,
                "label": "NEW",
            }
        else:
            previous_rank = previous_item["rank"]
            change = previous_rank - current_rank

            if change > 0:
                status = "up"
                label = f"↑ {change}"
            elif change < 0:
                status = "down"
                label = f"↓ {abs(change)}"
            else:
                status = "unchanged"
                label = "—"

            movement = {
                "status": status,
                "current": current_rank,
                "previous": previous_rank,
                "change": change,
                "label": label,
            }

        current_with_movement.append({**item, "movement": movement})

    departed: list[dict[str, Any]] = []
    for item in previous:
        if item["player_key"] in current_lookup:
            continue

        departed.append(
            {
                **item,
                "movement": {
                    "status": "out",
                    "current": None,
                    "previous": item["rank"],
                    "change": None,
                    "label": "OUT",
                },
            }
        )

    departed.sort(key=lambda item: item["rank"])
    return {"current": current_with_movement, "departed": departed}


def build_movement_summary(
    comparison: dict[str, list[dict[str, Any]]],
    maximum_items: int = 8,
) -> list[str]:
    """Build concise summaries for the most meaningful Top 25 changes."""
    messages: list[tuple[int, str]] = []

    for item in comparison.get("current", []):
        movement = item.get("movement", {})
        status = movement.get("status")
        name = item.get("player", "Unknown player")
        current_rank = movement.get("current")

        if status == "new":
            messages.append(
                (10_000, f"🆕 {name} — entered the Top 25 at #{current_rank}")
            )
        elif status == "up":
            change = int(movement.get("change", 0))
            messages.append(
                (abs(change), f"⬆️ {name} — up {change} spots to #{current_rank}")
            )
        elif status == "down":
            change = abs(int(movement.get("change", 0)))
            messages.append(
                (change, f"⬇️ {name} — down {change} spots to #{current_rank}")
            )

    for item in comparison.get("departed", []):
        name = item.get("player", "Unknown player")
        previous_rank = item.get("rank")
        messages.append(
            (10_000, f"↩️ {name} — left the Top 25, previously #{previous_rank}")
        )

    messages.sort(key=lambda entry: entry[0], reverse=True)
    return [message for _, message in messages[:maximum_items]]


def categories_changed(
    current_snapshot: dict[str, Any],
    previous_snapshot: dict[str, Any] | None,
) -> bool:
    """Return True when any stored category differs from the last snapshot."""
    if not previous_snapshot:
        return True

    current_categories = current_snapshot.get("categories", {})
    previous_categories = previous_snapshot.get("categories", {})

    if set(current_categories) != set(previous_categories):
        return True

    for category, current_rankings in current_categories.items():
        previous_rankings = previous_categories.get(category, [])
        if rankings_signature(current_rankings) != rankings_signature(
            previous_rankings
        ):
            return True

    return False


def compare_snapshot_category(
    current_snapshot: dict[str, Any],
    previous_snapshot: dict[str, Any] | None,
    category: str,
) -> dict[str, list[dict[str, Any]]]:
    """Compare one category from two complete snapshots."""
    current_categories = current_snapshot.get("categories", {})
    previous_categories = (
        previous_snapshot.get("categories", {}) if previous_snapshot else {}
    )

    return compare_rankings(
        current_categories.get(category, []),
        previous_categories.get(category, []),
    )


def _github_api_url(config: GitHubSnapshotConfig) -> str:
    """Build the GitHub Contents API URL for the snapshot file."""
    encoded_path = quote(config.path.strip("/"), safe="/")
    return (
        "https://api.github.com/repos/"
        f"{config.repository}/contents/{encoded_path}"
    )


def _github_headers(config: GitHubSnapshotConfig) -> dict[str, str]:
    """Return standard headers for GitHub API requests."""
    return {
        "Accept": "application/vnd.github+json",
        "Authorization": f"Bearer {config.token}",
        "User-Agent": "Sach-Sports-Dashboard",
        "X-GitHub-Api-Version": "2022-11-28",
    }


def _request_json(
    request: Request,
    expected_statuses: tuple[int, ...],
) -> tuple[int, dict[str, Any]]:
    """Execute an HTTP request and decode its JSON response."""
    try:
        with urlopen(request, timeout=20) as response:
            status = response.status
            raw_body = response.read().decode("utf-8")
    except HTTPError as error:
        raw_body = error.read().decode("utf-8", errors="replace")
        if error.code in expected_statuses:
            payload = json.loads(raw_body) if raw_body else {}
            return error.code, payload

        raise RankingSnapshotError(
            f"GitHub snapshot request failed with status {error.code}: "
            f"{raw_body}"
        ) from error
    except URLError as error:
        raise RankingSnapshotError(
            f"Unable to reach GitHub: {error.reason}"
        ) from error

    if status not in expected_statuses:
        raise RankingSnapshotError(f"Unexpected GitHub status code: {status}")

    payload = json.loads(raw_body) if raw_body else {}
    return status, payload


def load_github_snapshot(
    config: GitHubSnapshotConfig,
) -> tuple[dict[str, Any] | None, str | None]:
    """Load the persistent snapshot from GitHub."""
    config.validate()

    request = Request(
        f"{_github_api_url(config)}?ref={quote(config.branch)}",
        headers=_github_headers(config),
        method="GET",
    )
    status, payload = _request_json(request, expected_statuses=(200, 404))

    if status == 404:
        return None, None

    encoded_content = payload.get("content", "")
    sha = payload.get("sha")
    if not encoded_content or not sha:
        raise RankingSnapshotError(
            "GitHub returned an incomplete snapshot response"
        )

    try:
        decoded = base64.b64decode(encoded_content).decode("utf-8")
        snapshot = json.loads(decoded)
    except (ValueError, UnicodeDecodeError, json.JSONDecodeError) as error:
        raise RankingSnapshotError(
            "The stored ranking snapshot is not valid JSON"
        ) from error

    if not isinstance(snapshot, dict):
        raise RankingSnapshotError(
            "The stored ranking snapshot must be a JSON object"
        )

    return snapshot, str(sha)


def save_github_snapshot(
    config: GitHubSnapshotConfig,
    snapshot: dict[str, Any],
    existing_sha: str | None = None,
    commit_message: str = "Update intraday MLB ranking snapshot",
) -> str:
    """Create or replace the persistent GitHub snapshot."""
    config.validate()

    json_text = json.dumps(
        snapshot,
        indent=2,
        ensure_ascii=False,
        sort_keys=True,
    )
    encoded_content = base64.b64encode(
        json_text.encode("utf-8")
    ).decode("ascii")

    body: dict[str, Any] = {
        "message": commit_message,
        "content": encoded_content,
        "branch": config.branch,
    }
    if existing_sha:
        body["sha"] = existing_sha

    request = Request(
        _github_api_url(config),
        data=json.dumps(body).encode("utf-8"),
        headers={
            **_github_headers(config),
            "Content-Type": "application/json",
        },
        method="PUT",
    )
    _, payload = _request_json(request, expected_statuses=(200, 201))

    new_sha = payload.get("content", {}).get("sha")
    if not new_sha:
        raise RankingSnapshotError(
            "GitHub saved the snapshot but did not return its new SHA"
        )

    return str(new_sha)


def load_compare_and_save(
    config: GitHubSnapshotConfig,
    category_rankings: dict[str, Iterable[dict[str, Any]]],
    captured_at: datetime,
) -> dict[str, Any]:
    """Run the complete persistent intraday movement workflow."""
    previous_snapshot, existing_sha = load_github_snapshot(config)
    current_snapshot = create_snapshot(
        category_rankings=category_rankings,
        captured_at=captured_at,
    )

    comparisons: dict[str, dict[str, list[dict[str, Any]]]] = {}
    summaries: dict[str, list[str]] = {}

    for category in current_snapshot.get("categories", {}):
        comparison = compare_snapshot_category(
            current_snapshot=current_snapshot,
            previous_snapshot=previous_snapshot,
            category=category,
        )
        comparisons[category] = comparison
        summaries[category] = build_movement_summary(comparison)

    should_save = categories_changed(current_snapshot, previous_snapshot)
    if should_save:
        save_github_snapshot(
            config=config,
            snapshot=current_snapshot,
            existing_sha=existing_sha,
        )

    return {
        "previous_snapshot": previous_snapshot,
        "current_snapshot": current_snapshot,
        "comparisons": comparisons,
        "summaries": summaries,
        "snapshot_saved": should_save,
    }
