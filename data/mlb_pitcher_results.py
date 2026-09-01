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


def _game_phase(feed: dict[str, Any]) -> str:
    status = feed.get("gameData", {}).get("status", {}) or {}
    abstract_state = str(status.get("abstractGameState") or "").strip().lower()
    detailed_state = str(status.get("detailedState") or "").strip().lower()
    coded_state = str(status.get("codedGameState") or "").strip().upper()

    if _game_is_final(feed):
        return "final"
    if abstract_state == "live" or detailed_state in {
        "live", "in progress", "manager challenge", "review", "delayed", "warmup"
    } or coded_state in {"I", "M", "N"}:
        return "live"
    return "pregame"


def _status_label(feed: dict[str, Any]) -> str:
    status = feed.get("gameData", {}).get("status", {}) or {}
    return str(status.get("detailedState") or status.get("abstractGameState") or "").strip()


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


def get_pitcher_game_result(game_pk: int, pitcher_id: int) -> dict[str, Any]:
    """Return current pitcher line for live games and final line for completed games."""
    if not game_pk or not pitcher_id:
        return {"game_phase":"pregame","game_live":False,"game_finished":False,
                "result_available":False,"status_label":"","error":"Game or pitcher ID is unavailable."}
    try:
        response = requests.get(MLB_FEED_URL.format(game_pk=int(game_pk)), timeout=12)
        response.raise_for_status()
        feed = response.json()
    except Exception as exc:
        return {"game_phase":"unknown","game_live":False,"game_finished":False,
                "result_available":False,"status_label":"","error":f"MLB game feed unavailable: {exc}"}

    phase = _game_phase(feed)
    status_label = _status_label(feed)
    if phase == "pregame":
        return {"game_phase":"pregame","game_live":False,"game_finished":False,
                "result_available":False,"status_label":status_label,"error":None}

    teams = feed.get("liveData", {}).get("boxscore", {}).get("teams", {}) or {}
    stats = None
    for side in ("away", "home"):
        stats = _pitcher_stats_from_team(teams.get(side, {}) or {}, int(pitcher_id))
        if stats is not None:
            break

    return {
        "game_phase": phase,
        "game_live": phase == "live",
        "game_finished": phase == "final",
        "result_available": stats is not None,
        "status_label": status_label,
        "error": None,
        **(stats or {}),
    }


def get_pitcher_final_result(
    game_pk: int,
    pitcher_id: int,
    result_date: date | str | None = None,
) -> dict[str, Any]:
    """Return final pitching line only when the game is complete."""
    result = get_pitcher_game_result(game_pk=game_pk, pitcher_id=pitcher_id)
    if not result.get("game_finished"):
        return {
            "game_finished": False,
            "result_available": False,
            "error": result.get("error"),
        }
    return result
