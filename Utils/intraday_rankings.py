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
                "opponent": str(original.get("opponent", "")).strip(),
                "score": original.get("score"),
                "gi_score": original.get("gi_score", original.get("score")),
                "home_run_probability": original.get("home_run_probability"),
                "one_plus_hit_probability": original.get("one_plus_hit_probability"),
                "over_1_5_total_bases_probability": original.get(
                    "over_1_5_total_bases_probability"
                ),
                "one_plus_run_probability": original.get("one_plus_run_probability"),
                "one_plus_rbi_probability": original.get("one_plus_rbi_probability"),
                "one_plus_walk_probability": original.get("one_plus_walk_probability"),
                "one_plus_stolen_base_probability": original.get(
                    "one_plus_stolen_base_probability"
                ),
                "over_1_5_hits_runs_rbis_probability": original.get(
                    "over_1_5_hits_runs_rbis_probability"
                ),
                "projected_hits_runs_rbis": original.get(
                    "projected_hits_runs_rbis"
                ),
                "lineup_status": original.get("lineup_status"),
                "lineup_confirmed": bool(original.get("lineup_confirmed", False)),
                "batting_order": original.get("batting_order"),
                "projected_batting_order": original.get("projected_batting_order"),
                "opposing_probable_pitcher": original.get(
                    "opposing_probable_pitcher"
                ),
            }
        )
        seen_keys.add(key)

    normalized.sort(key=lambda item: item["rank"])
    return normalized[:limit]


def rankings_signature(
    rankings: Iterable[dict[str, Any]],
) -> list[list[Any]]:
    """
    Return the movement signature used to detect a real ranking change.

    Movement is based only on who is in the Top 25 and each player's rank.
    GI-score fluctuations must not advance the movement baseline, otherwise
    a refresh can erase NEW / up / down indicators even when ranks did not move.
    """
    return [
        [item["player_key"], item["rank"]]
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
    """
    Build the outside-card movement summary.

    Current players show NEW / up / down movement on their cards.
    This outside summary is reserved only for players who left the Top 25.
    """
    messages: list[str] = []

    for item in comparison.get("departed", []):
        name = item.get("player", "Unknown player")
        previous_rank = item.get("rank")
        messages.append(
            f"↩️ {name} — left the Top 25, previously #{previous_rank}"
        )

    return messages[:maximum_items]



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



def append_audit_snapshot(
    stored_snapshot: dict[str, Any] | None,
    current_snapshot: dict[str, Any],
    maximum_entries: int = 300,
) -> list[dict[str, Any]]:
    """Preserve a bounded owner-only history of material Top-25 changes."""
    existing: list[dict[str, Any]] = []

    if stored_snapshot:
        raw_existing = stored_snapshot.get("audit_history", [])
        if isinstance(raw_existing, list):
            existing = [
                item for item in raw_existing
                if isinstance(item, dict)
            ]

    existing.append(
        {
            "captured_at": current_snapshot.get("captured_at"),
            "categories": current_snapshot.get("categories", {}),
        }
    )
    return existing[-maximum_entries:]



def load_compare_and_save(
    config: GitHubSnapshotConfig,
    category_rankings: dict[str, Iterable[dict[str, Any]]],
    captured_at: datetime,
) -> dict[str, Any]:
    """
    Run the persistent intraday movement workflow.

    A stored snapshot is used for movement only when it belongs to the
    same Toronto calendar day as the current rankings. The first valid
    rankings of a new day therefore treat every player as NEW.
    """
    current_snapshot = create_snapshot(
        category_rankings=category_rankings,
        captured_at=captured_at,
    )

    # Never replace a valid GitHub movement snapshot with a temporary empty
    # result from an upstream data outage.
    if not any(current_snapshot.get("categories", {}).values()):
        return {
            "previous_snapshot": None,
            "current_snapshot": current_snapshot,
            "comparisons": {},
            "summaries": {},
            "snapshot_saved": False,
            "is_new_day": True,
        }

    stored_snapshot, existing_sha = load_github_snapshot(config)

    previous_snapshot = stored_snapshot
    is_new_day = True

    if stored_snapshot and stored_snapshot.get("previous_categories"):
        previous_snapshot = {
            "version": stored_snapshot.get("version", 1),
            "captured_at": stored_snapshot.get("captured_at"),
            "categories": stored_snapshot.get(
                "previous_categories",
                {},
            ),
        }
    if stored_snapshot:
        stored_captured_at = stored_snapshot.get("captured_at")

        if stored_captured_at:
            try:
                stored_datetime = datetime.fromisoformat(
                    str(stored_captured_at)
                )

                if stored_datetime.tzinfo is None:
                    stored_datetime = stored_datetime.replace(
                        tzinfo=captured_at.tzinfo
                    )

                stored_date = stored_datetime.astimezone(
                    captured_at.tzinfo
                ).date()

                current_date = captured_at.date()

                is_new_day = stored_date != current_date

            except (TypeError, ValueError):
                is_new_day = True

    if is_new_day:
        previous_snapshot = None

    comparisons: dict[
        str,
        dict[str, list[dict[str, Any]]],
    ] = {}

    summaries: dict[str, list[str]] = {}

    for category in current_snapshot.get("categories", {}):
        comparison = compare_snapshot_category(
            current_snapshot=current_snapshot,
            previous_snapshot=previous_snapshot,
            category=category,
        )

        comparisons[category] = comparison
        summaries[category] = build_movement_summary(
            comparison
        )

    # Save only when the current ranking itself changed from the last
    # stored current ranking. Using previous_snapshot here caused a browser
    # refresh to save the same ranking again and advance the baseline,
    # which erased the movement indicators.
    should_save = (
        is_new_day
        or categories_changed(
            current_snapshot=current_snapshot,
            previous_snapshot=stored_snapshot,
        )
    )

    if should_save:
        snapshot_to_save = dict(current_snapshot)
    
        if stored_snapshot and not is_new_day:
            snapshot_to_save["previous_categories"] = stored_snapshot.get(
                "categories",
                {},
            )
    
        snapshot_to_save["audit_history"] = append_audit_snapshot(
            stored_snapshot=stored_snapshot,
            current_snapshot=current_snapshot,
        )

        save_github_snapshot(
            config=config,
            snapshot=snapshot_to_save,
            existing_sha=existing_sha,
        )
        
    return {
        "previous_snapshot": previous_snapshot,
        "current_snapshot": current_snapshot,
        "comparisons": comparisons,
        "summaries": summaries,
        "snapshot_saved": should_save,
        "is_new_day": is_new_day,
     }
