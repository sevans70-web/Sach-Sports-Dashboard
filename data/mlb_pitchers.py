"""
Live MLB pitching statistics for the Sach Sports Dashboard.

File location:
    data/mlb_pitchers.py

Purpose:
- Retrieve league-wide MLB pitching statistics in bulk.
- Match those statistics to today's probable pitchers.
- Normalize pitcher quality metrics for the Game Intelligence Engine.

Important:
This file gathers and normalizes data. It does not score hitters.
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Any
from zoneinfo import ZoneInfo

import requests

from data.mlb_lineups import get_mlb_lineups


MLB_STATS_URL = "https://statsapi.mlb.com/api/v1/stats"
TORONTO_TIMEZONE = ZoneInfo("America/Toronto")
REQUEST_TIMEOUT_SECONDS = 20


def _request_json(
    params: dict[str, Any],
) -> tuple[dict[str, Any] | None, str | None]:
    """Request MLB pitching statistics and return JSON plus a readable error."""
    try:
        response = requests.get(
            MLB_STATS_URL,
            params=params,
            timeout=REQUEST_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
        return response.json(), None
    except requests.RequestException as exc:
        return None, f"MLB pitching-statistics request failed: {exc}"
    except ValueError:
        return None, "MLB returned pitching statistics that could not be read."


def _number(value: Any, default: float = 0.0) -> float:
    """Convert an MLB stat value into a float safely."""
    if value in (None, "", ".---", "-.--"):
        return default

    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _integer(value: Any, default: int = 0) -> int:
    """Convert an MLB stat value into an integer safely."""
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return default


def _innings_to_outs(value: Any) -> int:
    """Convert baseball innings notation into outs."""
    text = str(value or "0.0").strip()

    if "." not in text:
        return _integer(text) * 3

    whole_text, partial_text = text.split(".", 1)
    whole_innings = _integer(whole_text)
    partial_outs = _integer(partial_text[:1])

    if partial_outs not in {0, 1, 2}:
        partial_outs = 0

    return (whole_innings * 3) + partial_outs


def _outs_to_innings(outs: int) -> float:
    """Return decimal innings for rate calculations."""
    return outs / 3.0 if outs > 0 else 0.0


def _stat_splits(payload: dict[str, Any]) -> list[dict[str, Any]]:
    """Return all stat splits contained in one MLB response."""
    splits: list[dict[str, Any]] = []

    for stat_group in payload.get("stats", []):
        for split in stat_group.get("splits", []):
            splits.append(split)

    return splits


def _normalize_pitching_split(
    split: dict[str, Any],
) -> dict[str, Any] | None:
    """Normalize one MLB pitching-stat split."""
    player = split.get("player") or {}
    stat = split.get("stat") or {}
    team = split.get("team") or {}

    player_id = player.get("id")

    if not player_id:
        return None

    innings_pitched_display = str(stat.get("inningsPitched") or "0.0")
    innings_outs = _innings_to_outs(innings_pitched_display)
    innings_pitched = _outs_to_innings(innings_outs)

    batters_faced = _integer(stat.get("battersFaced"))
    strikeouts = _integer(stat.get("strikeOuts"))
    walks = _integer(stat.get("baseOnBalls"))
    hit_by_pitch = _integer(stat.get("hitBatsmen"))
    home_runs = _integer(stat.get("homeRuns"))
    hits = _integer(stat.get("hits"))
    earned_runs = _integer(stat.get("earnedRuns"))

    strikeout_rate = strikeouts / batters_faced if batters_faced > 0 else 0.0
    walk_rate = walks / batters_faced if batters_faced > 0 else 0.0
    home_runs_per_nine = (
        (home_runs * 9) / innings_pitched if innings_pitched > 0 else 0.0
    )
    hits_per_nine = (
        (hits * 9) / innings_pitched if innings_pitched > 0 else 0.0
    )
    strikeouts_per_nine = (
        (strikeouts * 9) / innings_pitched if innings_pitched > 0 else 0.0
    )
    walks_per_nine = (
        (walks * 9) / innings_pitched if innings_pitched > 0 else 0.0
    )

    calculated_era = (
        (earned_runs * 9) / innings_pitched if innings_pitched > 0 else 0.0
    )
    calculated_whip = (
        (walks + hits) / innings_pitched if innings_pitched > 0 else 0.0
    )

    return {
        "pitcher_id": int(player_id),
        "pitcher_name": player.get("fullName"),
        "stat_team_id": team.get("id"),
        "stat_team_name": team.get("name"),
        "games_played": _integer(stat.get("gamesPlayed")),
        "games_started": _integer(stat.get("gamesStarted")),
        "wins": _integer(stat.get("wins")),
        "losses": _integer(stat.get("losses")),
        "saves": _integer(stat.get("saves")),
        "innings_pitched": innings_pitched_display,
        "innings_pitched_decimal": round(innings_pitched, 3),
        "innings_outs": innings_outs,
        "batters_faced": batters_faced,
        "hits_allowed": hits,
        "runs_allowed": _integer(stat.get("runs")),
        "earned_runs": earned_runs,
        "home_runs_allowed": home_runs,
        "walks_allowed": walks,
        "strikeouts": strikeouts,
        "hit_batters": hit_by_pitch,
        "era": _number(stat.get("era"), calculated_era),
        "whip": _number(stat.get("whip"), calculated_whip),
        "strikeout_rate": round(strikeout_rate, 4),
        "walk_rate": round(walk_rate, 4),
        "strikeout_minus_walk_rate": round(strikeout_rate - walk_rate, 4),
        "strikeouts_per_nine": round(strikeouts_per_nine, 3),
        "walks_per_nine": round(walks_per_nine, 3),
        "home_runs_per_nine": round(home_runs_per_nine, 3),
        "hits_per_nine": round(hits_per_nine, 3),
    }


def get_bulk_pitching_stats(
    season: int | None = None,
) -> dict[str, Any]:
    """Retrieve league-wide MLB season pitching data in one bulk request."""
    today = datetime.now(TORONTO_TIMEZONE).date()
    requested_season = season or today.year

    params: dict[str, Any] = {
        "stats": "season",
        "group": "pitching",
        "season": requested_season,
        "sportIds": 1,
        "playerPool": "ALL",
        "limit": 2500,
        "hydrate": "team",
    }

    payload, error = _request_json(params)

    if error or payload is None:
        return {
            "success": False,
            "season": requested_season,
            "pitchers": [],
            "by_pitcher_id": {},
            "pitcher_count": 0,
            "error": error or "Pitching statistics could not be loaded.",
        }

    normalized: list[dict[str, Any]] = []

    for split in _stat_splits(payload):
        record = _normalize_pitching_split(split)
        if record is not None:
            normalized.append(record)

    by_pitcher_id = {
        record["pitcher_id"]: record
        for record in normalized
    }

    return {
        "success": True,
        "season": requested_season,
        "pitchers": normalized,
        "by_pitcher_id": by_pitcher_id,
        "pitcher_count": len(normalized),
        "error": None,
    }


def _empty_pitcher_stats() -> dict[str, Any]:
    """Return a complete empty-stat structure when MLB has no pitcher data."""
    return {
        "games_played": 0,
        "games_started": 0,
        "wins": 0,
        "losses": 0,
        "saves": 0,
        "innings_pitched": "0.0",
        "innings_pitched_decimal": 0.0,
        "innings_outs": 0,
        "batters_faced": 0,
        "hits_allowed": 0,
        "runs_allowed": 0,
        "earned_runs": 0,
        "home_runs_allowed": 0,
        "walks_allowed": 0,
        "strikeouts": 0,
        "hit_batters": 0,
        "era": 0.0,
        "whip": 0.0,
        "strikeout_rate": 0.0,
        "walk_rate": 0.0,
        "strikeout_minus_walk_rate": 0.0,
        "strikeouts_per_nine": 0.0,
        "walks_per_nine": 0.0,
        "home_runs_per_nine": 0.0,
        "hits_per_nine": 0.0,
    }


def _probable_pitcher_record(
    game: dict[str, Any],
    side: str,
    stats_lookup: dict[int, dict[str, Any]],
) -> dict[str, Any] | None:
    """Build one probable-pitcher record from lineup and season data."""
    pitcher = game.get(f"{side}_probable_pitcher") or {}
    pitcher_id = pitcher.get("pitcher_id")

    if not pitcher_id:
        return None

    try:
        normalized_id = int(pitcher_id)
    except (TypeError, ValueError):
        return None

    season_stats = stats_lookup.get(
        normalized_id,
        _empty_pitcher_stats(),
    )

    opponent_side = "home" if side == "away" else "away"

    return {
        "pitcher_id": normalized_id,
        "pitcher_name": pitcher.get("pitcher_name") or "Not announced",
        "pitcher_hand": pitcher.get("pitcher_hand") or "",
        "pitcher_hand_description": (
            pitcher.get("pitcher_hand_description") or ""
        ),
        "team_name": game.get(f"{side}_team"),
        "opponent_name": game.get(f"{opponent_side}_team"),
        "is_home": side == "home",
        "game_pk": game.get("game_pk"),
        "game_time": game.get("game_time"),
        "game_status": game.get("game_status"),
        "venue": game.get("venue"),
        "season_stats": season_stats,
        "has_season_stats": normalized_id in stats_lookup,
    }


def get_today_probable_pitchers_with_stats(
    schedule_date: date | str | None = None,
) -> dict[str, Any]:
    """Match today's probable pitchers to season pitching statistics."""
    lineups = get_mlb_lineups(schedule_date=schedule_date)
    fetched_at = datetime.now(TORONTO_TIMEZONE).isoformat()

    if not lineups.get("success"):
        return {
            "success": False,
            "date": lineups.get("date"),
            "pitchers": [],
            "by_pitcher_id": {},
            "pitcher_count": 0,
            "errors": lineups.get("errors", []),
            "fetched_at": fetched_at,
        }

    requested_date = date.fromisoformat(str(lineups.get("date")))
    season_stats = get_bulk_pitching_stats(season=requested_date.year)

    errors: list[str] = list(lineups.get("errors", []))

    if not season_stats.get("success"):
        errors.append(
            season_stats.get("error")
            or "Season pitching statistics were unavailable."
        )

    stats_lookup = season_stats.get("by_pitcher_id", {})
    probable_pitchers: list[dict[str, Any]] = []
    seen_pitcher_ids: set[int] = set()

    for game in lineups.get("games", []):
        for side in ("away", "home"):
            record = _probable_pitcher_record(
                game=game,
                side=side,
                stats_lookup=stats_lookup,
            )

            if record is None:
                continue

            pitcher_id = record["pitcher_id"]

            if pitcher_id in seen_pitcher_ids:
                continue

            seen_pitcher_ids.add(pitcher_id)
            probable_pitchers.append(record)

    probable_pitchers.sort(
        key=lambda item: (
            str(item.get("game_time") or ""),
            str(item.get("team_name") or ""),
            str(item.get("pitcher_name") or ""),
        )
    )

    by_pitcher_id = {
        record["pitcher_id"]: record
        for record in probable_pitchers
    }

    return {
        "success": bool(probable_pitchers),
        "date": lineups.get("date"),
        "pitchers": probable_pitchers,
        "by_pitcher_id": by_pitcher_id,
        "pitcher_count": len(probable_pitchers),
        "errors": errors,
        "fetched_at": fetched_at,
    }
