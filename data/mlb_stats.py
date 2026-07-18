"""
Live MLB hitting statistics for the Sach Sports Dashboard.

File location:
    data/mlb_stats.py

Purpose:
- Retrieve league-wide MLB hitting statistics in bulk.
- Match those statistics to today's eligible hitters by MLB player ID.
- Supply season and recent-form data to the future Game Intelligence Engine.

Important:
This file gathers and normalizes data. It does not manually select players
and does not contain hard-coded player names.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

import requests

from data.mlb_players import get_today_player_pool
from data.mlb_lineups import get_mlb_lineups

MLB_STATS_URL = "https://statsapi.mlb.com/api/v1/stats"
TORONTO_TIMEZONE = ZoneInfo("America/Toronto")
REQUEST_TIMEOUT_SECONDS = 20


def _request_json(
    params: dict[str, Any],
) -> tuple[dict[str, Any] | None, str | None]:
    """Request MLB statistics and return JSON plus a readable error."""
    try:
        response = requests.get(
            MLB_STATS_URL,
            params=params,
            timeout=REQUEST_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
        return response.json(), None
    except requests.RequestException as exc:
        return None, f"MLB statistics request failed: {exc}"
    except ValueError:
        return None, "MLB returned statistics that could not be read."


def _number(value: Any, default: float = 0.0) -> float:
    """Convert an MLB stat value into a number safely."""
    if value in (None, "", ".---", "-.--"):
        return default

    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _integer(value: Any, default: int = 0) -> int:
    """Convert a value into an integer safely."""
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return default


def _stat_splits(payload: dict[str, Any]) -> list[dict[str, Any]]:
    """Return all stat splits contained in one MLB response."""
    splits: list[dict[str, Any]] = []

    for stat_group in payload.get("stats", []):
        for split in stat_group.get("splits", []):
            splits.append(split)

    return splits


def _normalize_hitting_split(
    split: dict[str, Any],
) -> dict[str, Any] | None:
    """Normalize one MLB hitting-stat split."""
    player = split.get("player") or {}
    stat = split.get("stat") or {}
    team = split.get("team") or {}

    player_id = player.get("id")

    if not player_id:
        return None

    at_bats = _integer(stat.get("atBats"))
    hits = _integer(stat.get("hits"))
    doubles = _integer(stat.get("doubles"))
    triples = _integer(stat.get("triples"))
    home_runs = _integer(stat.get("homeRuns"))

    calculated_total_bases = (
        hits
        + doubles
        + (2 * triples)
        + (3 * home_runs)
    )

    total_bases = _integer(
        stat.get("totalBases"),
        default=calculated_total_bases,
    )

    return {
        "player_id": int(player_id),
        "player_name": player.get("fullName"),
        "stat_team_id": team.get("id"),
        "stat_team_name": team.get("name"),
        "games_played": _integer(stat.get("gamesPlayed")),
        "plate_appearances": _integer(stat.get("plateAppearances")),
        "at_bats": at_bats,
        "runs": _integer(stat.get("runs")),
        "hits": hits,
        "doubles": doubles,
        "triples": triples,
        "home_runs": home_runs,
        "total_bases": total_bases,
        "rbi": _integer(stat.get("rbi")),
        "walks": _integer(stat.get("baseOnBalls")),
        "strikeouts": _integer(stat.get("strikeOuts")),
        "stolen_bases": _integer(stat.get("stolenBases")),
        "caught_stealing": _integer(stat.get("caughtStealing")),
        "avg": _number(stat.get("avg")),
        "obp": _number(stat.get("obp")),
        "slg": _number(stat.get("slg")),
        "ops": _number(stat.get("ops")),
        "babip": _number(stat.get("babip")),
        "hit_by_pitch": _integer(stat.get("hitByPitch")),
        "sac_flies": _integer(stat.get("sacFlies")),
        "extra_base_hits": doubles + triples + home_runs,
        "hits_per_game": (
            round(hits / _integer(stat.get("gamesPlayed")), 3)
            if _integer(stat.get("gamesPlayed")) > 0
            else 0.0
        ),
        "total_bases_per_game": (
            round(
                total_bases / _integer(stat.get("gamesPlayed")),
                3,
            )
            if _integer(stat.get("gamesPlayed")) > 0
            else 0.0
        ),
        "home_runs_per_game": (
            round(
                home_runs / _integer(stat.get("gamesPlayed")),
                3,
            )
            if _integer(stat.get("gamesPlayed")) > 0
            else 0.0
        ),
        "strikeout_rate": (
            round(
                _integer(stat.get("strikeOuts"))
                / _integer(stat.get("plateAppearances")),
                4,
            )
            if _integer(stat.get("plateAppearances")) > 0
            else 0.0
        ),
        "walk_rate": (
            round(
                _integer(stat.get("baseOnBalls"))
                / _integer(stat.get("plateAppearances")),
                4,
            )
            if _integer(stat.get("plateAppearances")) > 0
            else 0.0
        ),
    }


def get_bulk_hitting_stats(
    season: int | None = None,
    start_date: date | str | None = None,
    end_date: date | str | None = None,
) -> dict[str, Any]:
    """
    Retrieve league-wide MLB hitting data in one bulk request.

    When start_date and end_date are provided, the request returns stats
    for that date range. Otherwise it returns season totals.
    """
    today = datetime.now(TORONTO_TIMEZONE).date()
    requested_season = season or today.year

    params: dict[str, Any] = {
        "stats": "season",
        "group": "hitting",
        "season": requested_season,
        "sportIds": 1,
        "playerPool": "ALL",
        "limit": 2500,
        "hydrate": "team",
    }

    stat_label = "season"

    if start_date is not None and end_date is not None:
        start_value = (
            start_date.isoformat()
            if isinstance(start_date, date)
            else str(start_date)
        )
        end_value = (
            end_date.isoformat()
            if isinstance(end_date, date)
            else str(end_date)
        )

        params.update(
            {
                "stats": "byDateRange",
                "startDate": start_value,
                "endDate": end_value,
            }
        )
        stat_label = f"{start_value}_to_{end_value}"

    payload, error = _request_json(params)

    if error or payload is None:
        return {
            "success": False,
            "label": stat_label,
            "season": requested_season,
            "players": [],
            "by_player_id": {},
            "player_count": 0,
            "error": error or "Hitting statistics could not be loaded.",
        }

    normalized: list[dict[str, Any]] = []

    for split in _stat_splits(payload):
        record = _normalize_hitting_split(split)

        if record is not None:
            normalized.append(record)

    by_player_id = {
        record["player_id"]: record
        for record in normalized
    }

    return {
        "success": True,
        "label": stat_label,
        "season": requested_season,
        "players": normalized,
        "by_player_id": by_player_id,
        "player_count": len(normalized),
        "error": None,
    }


def get_recent_hitting_stats(
    days: int = 14,
    end_date: date | str | None = None,
) -> dict[str, Any]:
    """Retrieve league-wide hitting statistics for a recent date window."""
    if days < 1:
        raise ValueError("days must be at least 1")

    if end_date is None:
        range_end = datetime.now(TORONTO_TIMEZONE).date()
    elif isinstance(end_date, date):
        range_end = end_date
    else:
        range_end = date.fromisoformat(str(end_date))

    range_start = range_end - timedelta(days=days - 1)

    return get_bulk_hitting_stats(
        season=range_end.year,
        start_date=range_start,
        end_date=range_end,
    )


def _empty_stats() -> dict[str, Any]:
    """Return a complete empty-stat structure for players with no data."""
    return {
        "games_played": 0,
        "plate_appearances": 0,
        "at_bats": 0,
        "runs": 0,
        "hits": 0,
        "doubles": 0,
        "triples": 0,
        "home_runs": 0,
        "total_bases": 0,
        "rbi": 0,
        "walks": 0,
        "strikeouts": 0,
        "stolen_bases": 0,
        "avg": 0.0,
        "obp": 0.0,
        "slg": 0.0,
        "ops": 0.0,
        "hits_per_game": 0.0,
        "total_bases_per_game": 0.0,
        "home_runs_per_game": 0.0,
        "strikeout_rate": 0.0,
        "walk_rate": 0.0,
        "extra_base_hits": 0,
    }


def get_today_hitters_with_stats(
    schedule_date: date | str | None = None,
    recent_days: int = 14,
) -> dict[str, Any]:
    """
    Match today's eligible hitters to season and recent hitting statistics.

    The result is the normalized dataset that the future Game Intelligence
    Engine will score for Home Runs, Hits, and Total Bases.
    """
    player_pool = get_today_player_pool(
        schedule_date=schedule_date,
        hitters_only=True,
    )

    if not player_pool.get("success"):
        return {
            "success": False,
            "date": player_pool.get("date"),
            "hitters": [],
            "hitter_count": 0,
            "errors": player_pool.get("errors", []),
            "fetched_at": datetime.now(
                TORONTO_TIMEZONE
            ).isoformat(),
        }

    requested_date = date.fromisoformat(
        str(player_pool.get("date"))
    )

    season_stats = get_bulk_hitting_stats(
        season=requested_date.year,
    )
    recent_stats = get_recent_hitting_stats(
        days=recent_days,
        end_date=requested_date,
    )

    errors: list[str] = list(player_pool.get("errors", []))

    if not season_stats.get("success"):
        errors.append(
            season_stats.get("error")
            or "Season statistics were unavailable."
        )

    if not recent_stats.get("success"):
        errors.append(
            recent_stats.get("error")
            or "Recent statistics were unavailable."
        )

    season_lookup = season_stats.get("by_player_id", {})
    recent_lookup = recent_stats.get("by_player_id", {})

    enriched_hitters: list[dict[str, Any]] = []

    for hitter in player_pool.get("hitters", []):
        player_id = hitter.get("player_id")

        season_record = season_lookup.get(
            player_id,
            _empty_stats(),
        )
        recent_record = recent_lookup.get(
            player_id,
            _empty_stats(),
        )

        enriched_hitters.append(
            {
                **hitter,
                "season_stats": season_record,
                "recent_stats": recent_record,
                "recent_days": recent_days,
                "has_season_stats": player_id in season_lookup,
                "has_recent_stats": player_id in recent_lookup,
            }
        )

    enriched_hitters.sort(
        key=lambda item: (
            -item["season_stats"].get("plate_appearances", 0),
            str(item.get("player_name") or ""),
        )
    )

    return {
        "success": bool(enriched_hitters),
        "date": player_pool.get("date"),
        "hitters": enriched_hitters,
        "hitter_count": len(enriched_hitters),
        "team_count": player_pool.get("team_count", 0),
        "game_count": player_pool.get("game_count", 0),
        "recent_days": recent_days,
        "season_stats_loaded": season_stats.get("success", False),
        "recent_stats_loaded": recent_stats.get("success", False),
        "errors": errors,
        "fetched_at": datetime.now(
            TORONTO_TIMEZONE
        ).isoformat(),
    }
def get_confirmed_hitters_with_stats(
    schedule_date: date | str | None = None,
    recent_days: int = 14,
) -> dict[str, Any]:
    """
    Match confirmed MLB lineup hitters to season and recent statistics.

    Only players included in MLB's published batting orders are returned.
    """
    lineup_data = get_mlb_lineups(
        schedule_date=schedule_date,
    )

    confirmed_hitters = lineup_data.get(
        "confirmed_hitters",
        [],
    )

    if not lineup_data.get("success") or not confirmed_hitters:
        return {
            "success": False,
            "date": lineup_data.get("date"),
            "hitters": [],
            "hitter_count": 0,
            "confirmed_game_count": lineup_data.get(
                "confirmed_game_count",
                0,
            ),
            "game_count": lineup_data.get("game_count", 0),
            "errors": lineup_data.get("errors", []),
            "fetched_at": datetime.now(
                TORONTO_TIMEZONE
            ).isoformat(),
        }

    requested_date = date.fromisoformat(
        str(lineup_data.get("date"))
    )

    season_stats = get_bulk_hitting_stats(
        season=requested_date.year,
    )
    recent_stats = get_recent_hitting_stats(
        days=recent_days,
        end_date=requested_date,
    )

    errors: list[str] = list(
        lineup_data.get("errors", [])
    )

    if not season_stats.get("success"):
        errors.append(
            season_stats.get("error")
            or "Season statistics were unavailable."
        )

    if not recent_stats.get("success"):
        errors.append(
            recent_stats.get("error")
            or "Recent statistics were unavailable."
        )

    season_lookup = season_stats.get("by_player_id", {})
    recent_lookup = recent_stats.get("by_player_id", {})

    enriched_hitters: list[dict[str, Any]] = []

    for hitter in confirmed_hitters:
        player_id = hitter.get("player_id")

        season_record = season_lookup.get(
            player_id,
            _empty_stats(),
        )
        recent_record = recent_lookup.get(
            player_id,
            _empty_stats(),
        )

        enriched_hitters.append(
            {
                **hitter,
                "season_stats": season_record,
                "recent_stats": recent_record,
                "recent_days": recent_days,
                "has_season_stats": player_id in season_lookup,
                "has_recent_stats": player_id in recent_lookup,
            }
        )

    enriched_hitters.sort(
        key=lambda item: (
            int(item.get("batting_order") or 99),
            -item["season_stats"].get(
                "plate_appearances",
                0,
            ),
            str(item.get("player_name") or ""),
        )
    )

    return {
        "success": bool(enriched_hitters),
        "date": lineup_data.get("date"),
        "hitters": enriched_hitters,
        "hitter_count": len(enriched_hitters),
        "confirmed_game_count": lineup_data.get(
            "confirmed_game_count",
            0,
        ),
        "game_count": lineup_data.get("game_count", 0),
        "recent_days": recent_days,
        "season_stats_loaded": season_stats.get(
            "success",
            False,
        ),
        "recent_stats_loaded": recent_stats.get(
            "success",
            False,
        ),
        "errors": errors,
        "fetched_at": datetime.now(
            TORONTO_TIMEZONE
        ).isoformat(),
    }
