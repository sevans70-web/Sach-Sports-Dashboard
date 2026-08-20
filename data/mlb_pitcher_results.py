"""Final MLB pitcher results used to validate pitcher projections."""

from __future__ import annotations

from datetime import date
from typing import Any

import requests


MLB_FEED_URL = "https://statsapi.mlb.com/api/v1.1/game/{game_pk}/feed/live"


def _safe_float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _safe_int(value: Any, default: int = 0) -> int:
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return default


def _game_is_final(feed: dict[str, Any]) -> bool:
    status = feed.get("gameData", {}).get("status", {}) or {}
    abstract_state = str(status.get("abstractGameState") or "").lower()
    detailed_state = str(status.get("detailedState") or "").lower()
    coded_state = str(status.get("codedGameState") or "").upper()

    return (
        abstract_state == "final"
        or detailed_state in {"final", "game over", "completed early"}
        or coded_state in {"F", "O"}
    )


def _pitcher_stats_from_team(
    team_boxscore: dict[str, Any],
    pitcher_id: int,
) -> dict[str, Any] | None:
    players = team_boxscore.get("players", {}) or {}
    player = players.get(f"ID{pitcher_id}", {}) or {}

    if not player:
        return None

    pitching = (player.get("stats", {}) or {}).get("pitching", {}) or {}
    if not pitching:
        return None

    innings_pitched = _safe_float(pitching.get("inningsPitched"))
    outs_recorded = int(round(innings_pitched * 3))

    # Baseball decimals use .1/.2 for outs; convert exactly when supplied as text.
    raw_ip = str(pitching.get("inningsPitched") or "")
    if "." in raw_ip:
        whole, fraction = raw_ip.split(".", 1)
        try:
            outs_recorded = (int(whole) * 3) + int(fraction[:1] or "0")
        except ValueError:
            pass

    return {
        "actual_strikeouts": _safe_int(pitching.get("strikeOuts")),
        "actual_outs_recorded": outs_recorded,
        "actual_hits_allowed": _safe_int(pitching.get("hits")),
        "actual_walks_allowed": _safe_int(pitching.get("baseOnBalls")),
        "actual_earned_runs": _safe_int(pitching.get("earnedRuns")),
        "innings_pitched": raw_ip,
        "pitches": _safe_int(pitching.get("numberOfPitches")),
    }


def get_pitcher_final_result(
    game_pk: int,
    pitcher_id: int,
    result_date: date | str | None = None,
) -> dict[str, Any]:
    """Return final pitching line for one pitcher when the game is complete."""
    if not game_pk or not pitcher_id:
        return {
            "game_finished": False,
            "result_available": False,
            "error": "Game or pitcher ID is unavailable.",
        }

    try:
        response = requests.get(
            MLB_FEED_URL.format(game_pk=int(game_pk)),
            timeout=20,
        )
        response.raise_for_status()
        feed = response.json()
    except Exception as exc:
        return {
            "game_finished": False,
            "result_available": False,
            "error": f"MLB game feed unavailable: {exc}",
        }

    game_finished = _game_is_final(feed)
    if not game_finished:
        return {
            "game_finished": False,
            "result_available": False,
            "error": None,
        }

    teams = (
        feed.get("liveData", {})
        .get("boxscore", {})
        .get("teams", {})
        or {}
    )

    stats = None
    for side in ("away", "home"):
        stats = _pitcher_stats_from_team(
            teams.get(side, {}) or {},
            int(pitcher_id),
        )
        if stats is not None:
            break

    if stats is None:
        return {
            "game_finished": True,
            "result_available": False,
            "error": "Final pitcher line was not found in the MLB boxscore.",
        }

    return {
        "game_finished": True,
        "result_available": True,
        "error": None,
        **stats,
    }
