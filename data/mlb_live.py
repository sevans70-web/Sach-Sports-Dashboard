"""
Live MLB schedule data for the Sach Sports Dashboard.

File location:
    data/mlb_live.py

This module retrieves:
- Today's MLB games
- Start times
- Game status
- Live/final scores
- Home and away teams
- Venue
- Probable pitchers

No API key is required for this first schedule connection.
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Any
from zoneinfo import ZoneInfo

import requests


MLB_SCHEDULE_URL = "https://statsapi.mlb.com/api/v1/schedule"
TORONTO_TIMEZONE = ZoneInfo("America/Toronto")
REQUEST_TIMEOUT_SECONDS = 15


def _safe_get(mapping: dict[str, Any], *keys: str, default: Any = None) -> Any:
    """Safely read nested dictionary values."""
    current: Any = mapping

    for key in keys:
        if not isinstance(current, dict):
            return default

        current = current.get(key)

        if current is None:
            return default

    return current


def _format_game_time(raw_game_date: str | None) -> str:
    """Convert the MLB UTC game timestamp to Toronto local time."""
    if not raw_game_date:
        return "Time unavailable"

    try:
        utc_time = datetime.fromisoformat(raw_game_date.replace("Z", "+00:00"))
        local_time = utc_time.astimezone(TORONTO_TIMEZONE)
        return local_time.strftime("%-I:%M %p ET")
    except (TypeError, ValueError):
        return "Time unavailable"


def _pitcher_name(game: dict[str, Any], side: str) -> str:
    """Return a probable pitcher name, or a clear pending message."""
    pitcher = _safe_get(
        game,
        "teams",
        side,
        "probablePitcher",
        "fullName",
    )

    return str(pitcher) if pitcher else "Not announced"


def _team_record(game: dict[str, Any], side: str) -> str:
    """Return a team's wins-losses record when available."""
    wins = _safe_get(game, "teams", side, "leagueRecord", "wins")
    losses = _safe_get(game, "teams", side, "leagueRecord", "losses")

    if wins is None or losses is None:
        return ""

    return f"{wins}-{losses}"


def _parse_game(game: dict[str, Any]) -> dict[str, Any]:
    """Convert one MLB API game record into a clean dashboard record."""
    away_team = _safe_get(
        game,
        "teams",
        "away",
        "team",
        "name",
        default="Away team",
    )
    home_team = _safe_get(
        game,
        "teams",
        "home",
        "team",
        "name",
        default="Home team",
    )

    away_score = _safe_get(game, "teams", "away", "score")
    home_score = _safe_get(game, "teams", "home", "score")

    detailed_status = _safe_get(
        game,
        "status",
        "detailedState",
        default="Status unavailable",
    )
    abstract_status = _safe_get(
        game,
        "status",
        "abstractGameState",
        default="Preview",
    )

    venue = _safe_get(
        game,
        "venue",
        "name",
        default="Venue unavailable",
    )

    game_pk = game.get("gamePk")

    return {
        "game_pk": game_pk,
        "game_date": game.get("gameDate"),
        "start_time": _format_game_time(game.get("gameDate")),
        "status": str(detailed_status),
        "status_group": str(abstract_status),
        "away_team": str(away_team),
        "away_team_id": _safe_get(game, "teams", "away", "team", "id"),
        "away_record": _team_record(game, "away"),
        "away_score": away_score,
        "away_probable_pitcher": _pitcher_name(game, "away"),
        "home_team": str(home_team),
        "home_team_id": _safe_get(game, "teams", "home", "team", "id"),
        "home_record": _team_record(game, "home"),
        "home_score": home_score,
        "home_probable_pitcher": _pitcher_name(game, "home"),
        "venue": str(venue),
        "is_live": str(abstract_status).lower() == "live",
        "is_final": str(abstract_status).lower() == "final",
        "is_preview": str(abstract_status).lower() == "preview",
    }


def get_mlb_schedule(
    schedule_date: date | str | None = None,
) -> dict[str, Any]:
    """
    Retrieve the MLB schedule for one date.

    Parameters
    ----------
    schedule_date:
        A datetime.date object or a YYYY-MM-DD string.
        When omitted, today's Toronto date is used.

    Returns
    -------
    dict
        {
            "success": bool,
            "date": "YYYY-MM-DD",
            "games": list[dict],
            "game_count": int,
            "fetched_at": str,
            "error": str | None,
        }
    """
    if schedule_date is None:
        requested_date = datetime.now(TORONTO_TIMEZONE).date().isoformat()
    elif isinstance(schedule_date, date):
        requested_date = schedule_date.isoformat()
    else:
        requested_date = str(schedule_date)

    params = {
        "sportId": 1,
        "date": requested_date,
        "hydrate": "team,probablePitcher,venue,linescore",
    }

    fetched_at = datetime.now(TORONTO_TIMEZONE).isoformat()

    try:
        response = requests.get(
            MLB_SCHEDULE_URL,
            params=params,
            timeout=REQUEST_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
        payload = response.json()
    except requests.RequestException as exc:
        return {
            "success": False,
            "date": requested_date,
            "games": [],
            "game_count": 0,
            "fetched_at": fetched_at,
            "error": f"MLB schedule request failed: {exc}",
        }
    except ValueError:
        return {
            "success": False,
            "date": requested_date,
            "games": [],
            "game_count": 0,
            "fetched_at": fetched_at,
            "error": "MLB returned data that could not be read.",
        }

    games: list[dict[str, Any]] = []

    for date_block in payload.get("dates", []):
        for game in date_block.get("games", []):
            games.append(_parse_game(game))

    games.sort(key=lambda item: item.get("game_date") or "")

    return {
        "success": True,
        "date": requested_date,
        "games": games,
        "game_count": len(games),
        "fetched_at": fetched_at,
        "error": None,
    }


def get_today_mlb_schedule() -> dict[str, Any]:
    """Convenience function for today's Toronto-date MLB schedule."""
    return get_mlb_schedule()


def get_team_logo_url(team_id: int | None) -> str | None:
    """Return an MLB-hosted team logo URL when a team ID is available."""
    if not team_id:
        return None

    return (
        "https://www.mlbstatic.com/team-logos/"
        f"{team_id}.svg"
    )
