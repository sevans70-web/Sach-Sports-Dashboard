"""
Live MLB lineups and handedness for the Sach Sports Dashboard.

File location:
    data/mlb_lineups.py

Purpose:
- Load today's MLB games.
- Retrieve each game's official MLB live feed.
- Read confirmed batting orders when MLB has posted them.
- Attach batter handedness, batting-order position, defensive position,
  probable-pitcher identity, and probable-pitcher throwing hand.
- Never invent or hard-code a projected lineup.

Important:
A lineup is only marked confirmed when MLB supplies batting-order entries.
Before lineups are posted, the module returns the game with empty lineups.
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Any
from zoneinfo import ZoneInfo

import requests

from data.mlb_live import get_mlb_schedule
from data.mlb_players import get_player_headshot_url


MLB_LIVE_FEED_URL = (
    "https://statsapi.mlb.com/api/v1.1/game/{game_pk}/feed/live"
)
TORONTO_TIMEZONE = ZoneInfo("America/Toronto")
REQUEST_TIMEOUT_SECONDS = 20


def _request_game_feed(
    game_pk: int,
) -> tuple[dict[str, Any] | None, str | None]:
    """Load one official MLB game feed."""
    url = MLB_LIVE_FEED_URL.format(game_pk=game_pk)

    try:
        response = requests.get(
            url,
            timeout=REQUEST_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
        return response.json(), None
    except requests.RequestException as exc:
        return None, f"MLB game-feed request failed: {exc}"
    except ValueError:
        return None, "MLB returned a game feed that could not be read."


def _person_key(player_id: int | None) -> str:
    """Return MLB's player dictionary key."""
    return f"ID{player_id}" if player_id else ""


def _player_details(
    feed: dict[str, Any],
    player_id: int | None,
) -> dict[str, Any]:
    """Read player details from gameData.players."""
    if not player_id:
        return {}

    players = feed.get("gameData", {}).get("players", {})
    return players.get(_person_key(player_id), {}) or {}


def _probable_pitcher(
    feed: dict[str, Any],
    side: str,
) -> dict[str, Any]:
    """Return probable-pitcher identity and throwing hand."""
    probable = (
        feed.get("gameData", {})
        .get("probablePitchers", {})
        .get(side, {})
        or {}
    )

    player_id = probable.get("id")
    details = _player_details(feed, player_id)
    pitch_hand = details.get("pitchHand", {}) or {}

    return {
        "pitcher_id": player_id,
        "pitcher_name": (
            probable.get("fullName")
            or details.get("fullName")
            or "Not announced"
        ),
        "pitcher_hand": pitch_hand.get("code") or "",
        "pitcher_hand_description": (
            pitch_hand.get("description") or ""
        ),
    }


def _team_boxscore(
    feed: dict[str, Any],
    side: str,
) -> dict[str, Any]:
    """Return one side of the live boxscore."""
    return (
        feed.get("liveData", {})
        .get("boxscore", {})
        .get("teams", {})
        .get(side, {})
        or {}
    )


def _lineup_player(
    feed: dict[str, Any],
    boxscore: dict[str, Any],
    player_id: int,
    batting_order: int,
    team_name: str,
    opponent_name: str,
    is_home: bool,
    opposing_pitcher: dict[str, Any],
    game: dict[str, Any],
) -> dict[str, Any]:
    """Normalize one confirmed lineup player."""
    boxscore_players = boxscore.get("players", {}) or {}
    boxscore_player = (
        boxscore_players.get(_person_key(player_id), {})
        or {}
    )
    person = boxscore_player.get("person", {}) or {}
    position = boxscore_player.get("position", {}) or {}
    details = _player_details(feed, player_id)
    bat_side = details.get("batSide", {}) or {}

    player_name = (
        person.get("fullName")
        or details.get("fullName")
        or f"MLB Player {player_id}"
    )

    return {
        "player_id": player_id,
        "player_name": player_name,
        "headshot_url": get_player_headshot_url(player_id),
        "team_name": team_name,
        "opponent_name": opponent_name,
        "is_home": is_home,
        "batting_order": batting_order,
        "batting_order_label": str(batting_order),
        "position": (
            position.get("name")
            or details.get("primaryPosition", {}).get("name")
            or ""
        ),
        "position_abbreviation": (
            position.get("abbreviation")
            or details.get("primaryPosition", {}).get("abbreviation")
            or ""
        ),
        "bat_side": bat_side.get("code") or "",
        "bat_side_description": bat_side.get("description") or "",
        "opposing_probable_pitcher_id": opposing_pitcher.get(
            "pitcher_id"
        ),
        "opposing_probable_pitcher": opposing_pitcher.get(
            "pitcher_name"
        ),
        "opposing_pitcher_hand": opposing_pitcher.get(
            "pitcher_hand"
        ),
        "opposing_pitcher_hand_description": opposing_pitcher.get(
            "pitcher_hand_description"
        ),
        "game_pk": game.get("game_pk"),
        "game_time": game.get("start_time"),
        "game_status": game.get("status"),
        "venue": game.get("venue"),
        "lineup_confirmed": True,
    }


def _confirmed_lineup(
    feed: dict[str, Any],
    game: dict[str, Any],
    side: str,
    opposing_pitcher: dict[str, Any],
) -> list[dict[str, Any]]:
    """Return MLB's confirmed batting order for one team."""
    boxscore = _team_boxscore(feed, side)
    batting_order_ids = boxscore.get("battingOrder", []) or []

    if side == "away":
        team_name = str(game.get("away_team") or "Away team")
        opponent_name = str(game.get("home_team") or "Home team")
        is_home = False
    else:
        team_name = str(game.get("home_team") or "Home team")
        opponent_name = str(game.get("away_team") or "Away team")
        is_home = True

    lineup: list[dict[str, Any]] = []

    for order_index, raw_player_id in enumerate(
        batting_order_ids,
        start=1,
    ):
        try:
            player_id = int(raw_player_id)
        except (TypeError, ValueError):
            continue

        lineup.append(
            _lineup_player(
                feed=feed,
                boxscore=boxscore,
                player_id=player_id,
                batting_order=order_index,
                team_name=team_name,
                opponent_name=opponent_name,
                is_home=is_home,
                opposing_pitcher=opposing_pitcher,
                game=game,
            )
        )

    return lineup


def get_game_lineups(
    game: dict[str, Any],
) -> dict[str, Any]:
    """Return confirmed lineups and probable-pitcher context for one game."""
    game_pk = game.get("game_pk")

    if not isinstance(game_pk, int):
        return {
            "success": False,
            "game_pk": game_pk,
            "away_lineup": [],
            "home_lineup": [],
            "lineups_confirmed": False,
            "error": "Game ID is unavailable.",
        }

    feed, error = _request_game_feed(game_pk)

    if error or feed is None:
        return {
            "success": False,
            "game_pk": game_pk,
            "away_team": game.get("away_team"),
            "home_team": game.get("home_team"),
            "away_lineup": [],
            "home_lineup": [],
            "lineups_confirmed": False,
            "error": error or "Game feed was unavailable.",
        }

    away_pitcher = _probable_pitcher(feed, "away")
    home_pitcher = _probable_pitcher(feed, "home")

    away_lineup = _confirmed_lineup(
        feed=feed,
        game=game,
        side="away",
        opposing_pitcher=home_pitcher,
    )
    home_lineup = _confirmed_lineup(
        feed=feed,
        game=game,
        side="home",
        opposing_pitcher=away_pitcher,
    )

    return {
        "success": True,
        "game_pk": game_pk,
        "away_team": game.get("away_team"),
        "home_team": game.get("home_team"),
        "game_time": game.get("start_time"),
        "game_status": game.get("status"),
        "venue": game.get("venue"),
        "away_probable_pitcher": away_pitcher,
        "home_probable_pitcher": home_pitcher,
        "away_lineup": away_lineup,
        "home_lineup": home_lineup,
        "away_lineup_confirmed": len(away_lineup) >= 9,
        "home_lineup_confirmed": len(home_lineup) >= 9,
        "lineups_confirmed": (
            len(away_lineup) >= 9
            and len(home_lineup) >= 9
        ),
        "error": None,
    }


def get_mlb_lineups(
    schedule_date: date | str | None = None,
) -> dict[str, Any]:
    """
    Return all available confirmed MLB lineups for one date.

    Players are only included when MLB has published them in the batting order.
    """
    schedule = get_mlb_schedule(schedule_date)
    fetched_at = datetime.now(TORONTO_TIMEZONE).isoformat()

    if not schedule.get("success"):
        return {
            "success": False,
            "date": schedule.get("date"),
            "games": [],
            "confirmed_hitters": [],
            "game_count": 0,
            "confirmed_game_count": 0,
            "confirmed_hitter_count": 0,
            "errors": [schedule.get("error")],
            "fetched_at": fetched_at,
        }

    games: list[dict[str, Any]] = []
    confirmed_hitters: list[dict[str, Any]] = []
    errors: list[str] = []

    for game in schedule.get("games", []):
        result = get_game_lineups(game)
        games.append(result)

        confirmed_hitters.extend(result.get("away_lineup", []))
        confirmed_hitters.extend(result.get("home_lineup", []))

        if result.get("error"):
            errors.append(
                f"{game.get('away_team')} at "
                f"{game.get('home_team')}: {result['error']}"
            )

    confirmed_hitters.sort(
        key=lambda player: (
            str(player.get("game_time") or ""),
            str(player.get("team_name") or ""),
            int(player.get("batting_order") or 99),
        )
    )

    return {
        "success": bool(games),
        "date": schedule.get("date"),
        "games": games,
        "confirmed_hitters": confirmed_hitters,
        "game_count": len(games),
        "confirmed_game_count": sum(
            1 for game in games if game.get("lineups_confirmed")
        ),
        "confirmed_hitter_count": len(confirmed_hitters),
        "errors": errors,
        "fetched_at": fetched_at,
    }


def get_today_confirmed_hitters() -> list[dict[str, Any]]:
    """Convenience function returning today's confirmed lineup hitters."""
    result = get_mlb_lineups()
    return result.get("confirmed_hitters", [])
