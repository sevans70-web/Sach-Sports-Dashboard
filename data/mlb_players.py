"""
Live MLB player pool for the Sach Sports Dashboard.

File location:
    data/mlb_players.py

Purpose:
- Read today's MLB games from data/mlb_live.py.
- Identify every team playing today.
- Retrieve each team's active roster.
- Match players to today's opponent and game.
- Separate hitters from pitchers.
- Provide official MLB player headshot URLs.

Important:
This file does not rank or recommend players.
It supplies the real player pool that the Game Intelligence Engine
will analyze later.
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Any
from zoneinfo import ZoneInfo

import requests

from data.mlb_live import get_mlb_schedule


MLB_TEAM_ROSTER_URL = (
    "https://statsapi.mlb.com/api/v1/teams/{team_id}/roster"
)
MLB_PERSON_URL = "https://statsapi.mlb.com/api/v1/people/{player_id}"

TORONTO_TIMEZONE = ZoneInfo("America/Toronto")
REQUEST_TIMEOUT_SECONDS = 15

# MLB position abbreviations that are treated as pitchers.
PITCHER_POSITIONS = {
    "P",
    "SP",
    "RP",
    "CP",
    "TWP",
}


def get_player_headshot_url(
    player_id: int | None,
    size: int = 180,
) -> str | None:
    """
    Return an official MLB player headshot URL.

    MLB's image service returns a transparent player cutout when available.
    """
    if not player_id:
        return None

    return (
        "https://img.mlbstatic.com/mlb-photos/image/upload/"
        f"d_people:generic:headshot:67:current.png/"
        f"w_{size},q_auto:best/v1/people/{player_id}/headshot/67/current"
    )


def _request_json(
    url: str,
    params: dict[str, Any] | None = None,
) -> tuple[dict[str, Any] | None, str | None]:
    """Make a GET request and return JSON plus a readable error."""
    try:
        response = requests.get(
            url,
            params=params,
            timeout=REQUEST_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
        return response.json(), None
    except requests.RequestException as exc:
        return None, f"Request failed: {exc}"
    except ValueError:
        return None, "The server returned data that could not be read."


def _team_game_context(
    games: list[dict[str, Any]],
) -> dict[int, dict[str, Any]]:
    """
    Build a lookup containing today's opponent and game information
    for each team.
    """
    context: dict[int, dict[str, Any]] = {}

    for game in games:
        away_team_id = game.get("away_team_id")
        home_team_id = game.get("home_team_id")

        away_context = {
            "team_id": away_team_id,
            "team_name": game.get("away_team"),
            "opponent_id": home_team_id,
            "opponent_name": game.get("home_team"),
            "is_home": False,
            "game_pk": game.get("game_pk"),
            "game_time": game.get("start_time"),
            "game_status": game.get("status"),
            "venue": game.get("venue"),
            "probable_pitcher": game.get("away_probable_pitcher"),
            "opposing_probable_pitcher": game.get(
                "home_probable_pitcher"
            ),
        }

        home_context = {
            "team_id": home_team_id,
            "team_name": game.get("home_team"),
            "opponent_id": away_team_id,
            "opponent_name": game.get("away_team"),
            "is_home": True,
            "game_pk": game.get("game_pk"),
            "game_time": game.get("start_time"),
            "game_status": game.get("status"),
            "venue": game.get("venue"),
            "probable_pitcher": game.get("home_probable_pitcher"),
            "opposing_probable_pitcher": game.get(
                "away_probable_pitcher"
            ),
        }

        if isinstance(away_team_id, int):
            context[away_team_id] = away_context

        if isinstance(home_team_id, int):
            context[home_team_id] = home_context

    return context


def _parse_roster_player(
    roster_entry: dict[str, Any],
    context: dict[str, Any],
) -> dict[str, Any] | None:
    """Convert one roster entry into a normalized player record."""
    person = roster_entry.get("person") or {}
    position = roster_entry.get("position") or {}

    player_id = person.get("id")
    player_name = person.get("fullName")

    if not player_id or not player_name:
        return None

    position_abbreviation = str(
        position.get("abbreviation") or ""
    ).upper()

    position_name = str(
        position.get("name")
        or position.get("type")
        or "Unknown"
    )

    is_pitcher = position_abbreviation in PITCHER_POSITIONS

    return {
        "player_id": int(player_id),
        "player_name": str(player_name),
        "jersey_number": roster_entry.get("jerseyNumber"),
        "position": position_name,
        "position_abbreviation": position_abbreviation,
        "status": (
            roster_entry.get("status", {}).get("description")
            if isinstance(roster_entry.get("status"), dict)
            else roster_entry.get("status")
        ),
        "is_pitcher": is_pitcher,
        "is_hitter": not is_pitcher,
        "headshot_url": get_player_headshot_url(int(player_id)),
        **context,
    }


def get_team_active_roster(
    team_id: int,
    roster_date: date | str | None = None,
) -> dict[str, Any]:
    """
    Retrieve one MLB team's active roster.

    Returns a dictionary containing the normalized players and any error.
    """
    if roster_date is None:
        requested_date = datetime.now(
            TORONTO_TIMEZONE
        ).date().isoformat()
    elif isinstance(roster_date, date):
        requested_date = roster_date.isoformat()
    else:
        requested_date = str(roster_date)

    url = MLB_TEAM_ROSTER_URL.format(team_id=team_id)
    params = {
        "rosterType": "active",
        "date": requested_date,
    }

    payload, error = _request_json(url, params=params)

    if error or payload is None:
        return {
            "success": False,
            "team_id": team_id,
            "date": requested_date,
            "roster": [],
            "error": error or "Roster could not be loaded.",
        }

    return {
        "success": True,
        "team_id": team_id,
        "date": requested_date,
        "roster": payload.get("roster", []),
        "error": None,
    }


def get_today_player_pool(
    schedule_date: date | str | None = None,
    hitters_only: bool = False,
) -> dict[str, Any]:
    """
    Retrieve the active player pool for all teams playing on one date.

    Parameters
    ----------
    schedule_date:
        Date object or YYYY-MM-DD string. Defaults to today's Toronto date.

    hitters_only:
        When True, pitchers are excluded.

    Returns
    -------
    dict
        A normalized response containing players, teams, errors and counts.
    """
    schedule = get_mlb_schedule(schedule_date)

    if not schedule.get("success"):
        return {
            "success": False,
            "date": schedule.get("date"),
            "players": [],
            "hitters": [],
            "pitchers": [],
            "teams": [],
            "player_count": 0,
            "hitter_count": 0,
            "pitcher_count": 0,
            "errors": [schedule.get("error")],
            "fetched_at": datetime.now(
                TORONTO_TIMEZONE
            ).isoformat(),
        }

    games = schedule.get("games", [])
    context_by_team = _team_game_context(games)

    all_players: list[dict[str, Any]] = []
    errors: list[str] = []

    for team_id, context in context_by_team.items():
        roster_result = get_team_active_roster(
            team_id=team_id,
            roster_date=schedule.get("date"),
        )

        if not roster_result.get("success"):
            errors.append(
                f"{context.get('team_name', team_id)}: "
                f"{roster_result.get('error')}"
            )
            continue

        for roster_entry in roster_result.get("roster", []):
            player = _parse_roster_player(
                roster_entry=roster_entry,
                context=context,
            )

            if player is not None:
                all_players.append(player)

    # Remove duplicate player IDs defensively.
    unique_players: dict[int, dict[str, Any]] = {}

    for player in all_players:
        unique_players[player["player_id"]] = player

    players = list(unique_players.values())
    players.sort(
        key=lambda item: (
            str(item.get("team_name") or ""),
            str(item.get("player_name") or ""),
        )
    )

    hitters = [
        player
        for player in players
        if player.get("is_hitter")
    ]

    pitchers = [
        player
        for player in players
        if player.get("is_pitcher")
    ]

    selected_players = hitters if hitters_only else players

    return {
        "success": bool(players) or not errors,
        "date": schedule.get("date"),
        "players": selected_players,
        "hitters": hitters,
        "pitchers": pitchers,
        "teams": list(context_by_team.values()),
        "game_count": len(games),
        "team_count": len(context_by_team),
        "player_count": len(players),
        "hitter_count": len(hitters),
        "pitcher_count": len(pitchers),
        "errors": errors,
        "fetched_at": datetime.now(
            TORONTO_TIMEZONE
        ).isoformat(),
    }


def get_today_hitters(
    schedule_date: date | str | None = None,
) -> list[dict[str, Any]]:
    """Convenience function returning only today's active hitters."""
    result = get_today_player_pool(
        schedule_date=schedule_date,
        hitters_only=True,
    )
    return result.get("hitters", [])


def get_player_profile(
    player_id: int,
) -> dict[str, Any]:
    """
    Retrieve basic profile information for one MLB player.

    This is intended for future player detail pages.
    """
    url = MLB_PERSON_URL.format(player_id=player_id)
    payload, error = _request_json(
        url,
        params={
            "hydrate": "currentTeam",
        },
    )

    if error or payload is None:
        return {
            "success": False,
            "player": None,
            "error": error or "Player profile could not be loaded.",
        }

    people = payload.get("people", [])

    if not people:
        return {
            "success": False,
            "player": None,
            "error": "The requested player was not found.",
        }

    player = people[0]

    return {
        "success": True,
        "player": {
            "player_id": player.get("id"),
            "player_name": player.get("fullName"),
            "first_name": player.get("firstName"),
            "last_name": player.get("lastName"),
            "primary_position": (
                player.get("primaryPosition") or {}
            ).get("name"),
            "primary_position_abbreviation": (
                player.get("primaryPosition") or {}
            ).get("abbreviation"),
            "bat_side": (
                player.get("batSide") or {}
            ).get("code"),
            "pitch_hand": (
                player.get("pitchHand") or {}
            ).get("code"),
            "current_team_id": (
                player.get("currentTeam") or {}
            ).get("id"),
            "current_team_name": (
                player.get("currentTeam") or {}
            ).get("name"),
            "headshot_url": get_player_headshot_url(
                player.get("id")
            ),
        },
        "error": None,
    }
