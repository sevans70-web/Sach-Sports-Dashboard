"""
MLB Game Intelligence Engine v1.

File location:
    engines/game_intelligence.py

Purpose:
- Load today's eligible MLB hitters and their live statistics.
- Calculate separate Home Run, Hit, and Total Base scores.
- Rank the player pool automatically.
- Assign confidence based on score strength and data completeness.
- Generate transparent reasons explaining each ranking.

Important:
- No player names are hard-coded.
- This first version uses season and recent performance data.
- Matchup, lineup, weather, park, handedness, barrel, and hard-hit inputs
  will be added as new data modules become available.
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Any
from zoneinfo import ZoneInfo

from data.mlb_stats import get_today_hitters_with_stats


TORONTO_TIMEZONE = ZoneInfo("America/Toronto")

CATEGORY_HOME_RUNS = "home_runs"
CATEGORY_HITS = "hits"
CATEGORY_TOTAL_BASES = "total_bases"

VALID_CATEGORIES = {
    CATEGORY_HOME_RUNS,
    CATEGORY_HITS,
    CATEGORY_TOTAL_BASES,
}


def _safe_float(value: Any) -> float:
    """Convert a value to float safely."""
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def _percentile_rank(
    value: float,
    population: list[float],
) -> float:
    """
    Return a percentile from 0 to 100.

    Equal values receive the same simple empirical percentile.
    """
    if not population:
        return 0.0

    values = sorted(_safe_float(item) for item in population)
    below_or_equal = sum(1 for item in values if item <= value)

    return round((below_or_equal / len(values)) * 100, 2)


def _weighted_score(
    components: list[tuple[float, float]],
) -> float:
    """
    Calculate a weighted score.

    Each tuple is:
        (percentile_value, weight)
    """
    total_weight = sum(weight for _, weight in components)

    if total_weight <= 0:
        return 0.0

    weighted_total = sum(
        percentile * weight
        for percentile, weight in components
    )

    return round(weighted_total / total_weight, 1)


def _confidence(
    score: float,
    has_season_stats: bool,
    has_recent_stats: bool,
    season_plate_appearances: int,
    recent_plate_appearances: int,
) -> str:
    """Assign evidence confidence from score and data completeness."""
    completeness_points = 0

    if has_season_stats:
        completeness_points += 1
    if has_recent_stats:
        completeness_points += 1
    if season_plate_appearances >= 75:
        completeness_points += 1
    if recent_plate_appearances >= 15:
        completeness_points += 1

    if score >= 75 and completeness_points >= 4:
        return "High"

    if score >= 55 and completeness_points >= 2:
        return "Medium"

    return "Low"


def _risk_flags(
    player: dict[str, Any],
) -> list[str]:
    """Generate transparent data-quality and availability warnings."""
    flags: list[str] = []

    season = player.get("season_stats", {})
    recent = player.get("recent_stats", {})

    if not player.get("has_season_stats"):
        flags.append("Season statistics unavailable")

    if not player.get("has_recent_stats"):
        flags.append("Recent statistics unavailable")

    if int(season.get("plate_appearances", 0)) < 75:
        flags.append("Limited season sample")

    if int(recent.get("plate_appearances", 0)) < 15:
        flags.append("Limited recent sample")

    if str(player.get("game_status", "")).lower() == "final":
        flags.append("Game already completed")

    if (
        str(player.get("opposing_probable_pitcher", "")).strip()
        in {"", "Not announced"}
    ):
        flags.append("Opposing pitcher not announced")

    return flags


def _home_run_reasons(
    season: dict[str, Any],
    recent: dict[str, Any],
    percentiles: dict[str, float],
) -> list[str]:
    """Generate reasons for the Home Run category."""
    reasons: list[str] = []

    if percentiles["season_hr_rate"] >= 75:
        reasons.append(
            "Season home-run rate ranks near the top of today's player pool"
        )

    if percentiles["recent_hr_rate"] >= 75:
        reasons.append(
            "Recent home-run production is stronger than most eligible hitters"
        )

    if percentiles["season_slg"] >= 75:
        reasons.append(
            "Season slugging percentage supports strong power upside"
        )

    if percentiles["recent_slg"] >= 75:
        reasons.append(
            "Recent slugging form is trending positively"
        )

    if percentiles["season_xbh_rate"] >= 75:
        reasons.append(
            "Extra-base-hit production shows consistent damage potential"
        )

    if not reasons:
        reasons.append(
            "The score is based on the player's combined season and recent power profile"
        )

    return reasons[:4]


def _hit_reasons(
    season: dict[str, Any],
    recent: dict[str, Any],
    percentiles: dict[str, float],
) -> list[str]:
    """Generate reasons for the Hits category."""
    reasons: list[str] = []

    if percentiles["season_avg"] >= 75:
        reasons.append(
            "Season batting average ranks highly among today's eligible hitters"
        )

    if percentiles["recent_avg"] >= 75:
        reasons.append(
            "Recent batting average indicates strong current contact form"
        )

    if percentiles["season_hits_rate"] >= 75:
        reasons.append(
            "Season hits-per-game rate is stronger than most of today's pool"
        )

    if percentiles["recent_hits_rate"] >= 75:
        reasons.append(
            "Recent hits-per-game rate supports the current ranking"
        )

    if percentiles["season_obp"] >= 75:
        reasons.append(
            "Strong on-base performance supports consistent plate success"
        )

    if percentiles["low_strikeout"] >= 75:
        reasons.append(
            "Lower strikeout rate improves the player's contact profile"
        )

    if not reasons:
        reasons.append(
            "The score combines season contact ability with recent hitting form"
        )

    return reasons[:4]


def _total_base_reasons(
    season: dict[str, Any],
    recent: dict[str, Any],
    percentiles: dict[str, float],
) -> list[str]:
    """Generate reasons for the Total Bases category."""
    reasons: list[str] = []

    if percentiles["season_tb_rate"] >= 75:
        reasons.append(
            "Season total-bases rate ranks near the top of today's player pool"
        )

    if percentiles["recent_tb_rate"] >= 75:
        reasons.append(
            "Recent total-bases production is trending strongly"
        )

    if percentiles["season_slg"] >= 75:
        reasons.append(
            "Strong season slugging creates multiple paths to total bases"
        )

    if percentiles["recent_slg"] >= 75:
        reasons.append(
            "Recent slugging form supports extra-base upside"
        )

    if percentiles["season_hits_rate"] >= 75:
        reasons.append(
            "Reliable hit production supports the total-base floor"
        )

    if not reasons:
        reasons.append(
            "The score blends hit probability with season and recent power"
        )

    return reasons[:4]


def _build_populations(
    hitters: list[dict[str, Any]],
) -> dict[str, list[float]]:
    """Build metric populations used for percentile scoring."""
    populations: dict[str, list[float]] = {
        "season_hr_rate": [],
        "recent_hr_rate": [],
        "season_hits_rate": [],
        "recent_hits_rate": [],
        "season_tb_rate": [],
        "recent_tb_rate": [],
        "season_avg": [],
        "recent_avg": [],
        "season_obp": [],
        "recent_obp": [],
        "season_slg": [],
        "recent_slg": [],
        "season_ops": [],
        "recent_ops": [],
        "season_xbh_rate": [],
        "recent_xbh_rate": [],
        "low_strikeout": [],
    }

    for hitter in hitters:
        season = hitter.get("season_stats", {})
        recent = hitter.get("recent_stats", {})

        season_games = max(int(season.get("games_played", 0)), 1)
        recent_games = max(int(recent.get("games_played", 0)), 1)

        populations["season_hr_rate"].append(
            _safe_float(season.get("home_runs")) / season_games
        )
        populations["recent_hr_rate"].append(
            _safe_float(recent.get("home_runs")) / recent_games
        )
        populations["season_hits_rate"].append(
            _safe_float(season.get("hits_per_game"))
        )
        populations["recent_hits_rate"].append(
            _safe_float(recent.get("hits_per_game"))
        )
        populations["season_tb_rate"].append(
            _safe_float(season.get("total_bases_per_game"))
        )
        populations["recent_tb_rate"].append(
            _safe_float(recent.get("total_bases_per_game"))
        )
        populations["season_avg"].append(
            _safe_float(season.get("avg"))
        )
        populations["recent_avg"].append(
            _safe_float(recent.get("avg"))
        )
        populations["season_obp"].append(
            _safe_float(season.get("obp"))
        )
        populations["recent_obp"].append(
            _safe_float(recent.get("obp"))
        )
        populations["season_slg"].append(
            _safe_float(season.get("slg"))
        )
        populations["recent_slg"].append(
            _safe_float(recent.get("slg"))
        )
        populations["season_ops"].append(
            _safe_float(season.get("ops"))
        )
        populations["recent_ops"].append(
            _safe_float(recent.get("ops"))
        )
        populations["season_xbh_rate"].append(
            _safe_float(season.get("extra_base_hits")) / season_games
        )
        populations["recent_xbh_rate"].append(
            _safe_float(recent.get("extra_base_hits")) / recent_games
        )
        populations["low_strikeout"].append(
            1.0 - _safe_float(season.get("strikeout_rate"))
        )

    return populations


def _player_percentiles(
    player: dict[str, Any],
    populations: dict[str, list[float]],
) -> dict[str, float]:
    """Calculate all scoring percentiles for one player."""
    season = player.get("season_stats", {})
    recent = player.get("recent_stats", {})

    season_games = max(int(season.get("games_played", 0)), 1)
    recent_games = max(int(recent.get("games_played", 0)), 1)

    raw_values = {
        "season_hr_rate": (
            _safe_float(season.get("home_runs")) / season_games
        ),
        "recent_hr_rate": (
            _safe_float(recent.get("home_runs")) / recent_games
        ),
        "season_hits_rate": _safe_float(
            season.get("hits_per_game")
        ),
        "recent_hits_rate": _safe_float(
            recent.get("hits_per_game")
        ),
        "season_tb_rate": _safe_float(
            season.get("total_bases_per_game")
        ),
        "recent_tb_rate": _safe_float(
            recent.get("total_bases_per_game")
        ),
        "season_avg": _safe_float(season.get("avg")),
        "recent_avg": _safe_float(recent.get("avg")),
        "season_obp": _safe_float(season.get("obp")),
        "recent_obp": _safe_float(recent.get("obp")),
        "season_slg": _safe_float(season.get("slg")),
        "recent_slg": _safe_float(recent.get("slg")),
        "season_ops": _safe_float(season.get("ops")),
        "recent_ops": _safe_float(recent.get("ops")),
        "season_xbh_rate": (
            _safe_float(season.get("extra_base_hits"))
            / season_games
        ),
        "recent_xbh_rate": (
            _safe_float(recent.get("extra_base_hits"))
            / recent_games
        ),
        "low_strikeout": (
            1.0 - _safe_float(season.get("strikeout_rate"))
        ),
    }

    return {
        key: _percentile_rank(value, populations[key])
        for key, value in raw_values.items()
    }


def _category_score(
    category: str,
    percentiles: dict[str, float],
) -> float:
    """Calculate one category score from weighted percentiles."""
    if category == CATEGORY_HOME_RUNS:
        return _weighted_score(
            [
                (percentiles["season_hr_rate"], 24),
                (percentiles["recent_hr_rate"], 22),
                (percentiles["season_slg"], 18),
                (percentiles["recent_slg"], 16),
                (percentiles["season_xbh_rate"], 12),
                (percentiles["season_ops"], 8),
            ]
        )

    if category == CATEGORY_HITS:
        return _weighted_score(
            [
                (percentiles["season_avg"], 22),
                (percentiles["recent_avg"], 22),
                (percentiles["season_hits_rate"], 20),
                (percentiles["recent_hits_rate"], 20),
                (percentiles["season_obp"], 8),
                (percentiles["low_strikeout"], 8),
            ]
        )

    return _weighted_score(
        [
            (percentiles["season_tb_rate"], 24),
            (percentiles["recent_tb_rate"], 24),
            (percentiles["season_slg"], 16),
            (percentiles["recent_slg"], 16),
            (percentiles["season_hits_rate"], 10),
            (percentiles["recent_hits_rate"], 10),
        ]
    )


def _category_reasons(
    category: str,
    season: dict[str, Any],
    recent: dict[str, Any],
    percentiles: dict[str, float],
) -> list[str]:
    """Return the appropriate Why Engine reasons."""
    if category == CATEGORY_HOME_RUNS:
        return _home_run_reasons(season, recent, percentiles)

    if category == CATEGORY_HITS:
        return _hit_reasons(season, recent, percentiles)

    return _total_base_reasons(season, recent, percentiles)


def rank_players(
    category: str,
    schedule_date: date | str | None = None,
    recent_days: int = 14,
    limit: int = 25,
) -> dict[str, Any]:
    """
    Rank today's eligible hitters for one category.

    This first version scores statistical performance only.
    Future versions will add matchup, lineup, weather, park, handedness,
    barrel, and hard-hit factors.
    """
    if category not in VALID_CATEGORIES:
        raise ValueError(
            f"category must be one of: {sorted(VALID_CATEGORIES)}"
        )

    dataset = get_today_hitters_with_stats(
        schedule_date=schedule_date,
        recent_days=recent_days,
    )

    hitters = dataset.get("hitters", [])

    if not dataset.get("success") or not hitters:
        return {
            "success": False,
            "category": category,
            "rankings": [],
            "player_count": 0,
            "errors": dataset.get("errors", []),
            "fetched_at": datetime.now(
                TORONTO_TIMEZONE
            ).isoformat(),
        }

    populations = _build_populations(hitters)
    scored_players: list[dict[str, Any]] = []

    for hitter in hitters:
        season = hitter.get("season_stats", {})
        recent = hitter.get("recent_stats", {})
        percentiles = _player_percentiles(
            hitter,
            populations,
        )

        score = _category_score(category, percentiles)

        confidence = _confidence(
            score=score,
            has_season_stats=bool(
                hitter.get("has_season_stats")
            ),
            has_recent_stats=bool(
                hitter.get("has_recent_stats")
            ),
            season_plate_appearances=int(
                season.get("plate_appearances", 0)
            ),
            recent_plate_appearances=int(
                recent.get("plate_appearances", 0)
            ),
        )

        scored_players.append(
            {
                **hitter,
                "category": category,
                "gi_score": score,
                "confidence": confidence,
                "why": _category_reasons(
                    category,
                    season,
                    recent,
                    percentiles,
                ),
                "risk_flags": _risk_flags(hitter),
                "percentiles": percentiles,
            }
        )

    scored_players.sort(
        key=lambda item: (
            -_safe_float(item.get("gi_score")),
            -int(
                item.get("season_stats", {}).get(
                    "plate_appearances",
                    0,
                )
            ),
            str(item.get("player_name") or ""),
        )
    )

    ranked = []

    for index, player in enumerate(
        scored_players[: max(limit, 1)],
        start=1,
    ):
        ranked.append(
            {
                **player,
                "rank": index,
            }
        )

    return {
        "success": True,
        "category": category,
        "date": dataset.get("date"),
        "rankings": ranked,
        "player_count": len(scored_players),
        "ranked_count": len(ranked),
        "recent_days": recent_days,
        "errors": dataset.get("errors", []),
        "fetched_at": datetime.now(
            TORONTO_TIMEZONE
        ).isoformat(),
        "engine_version": "1.0-statistical",
    }


def get_all_rankings(
    schedule_date: date | str | None = None,
    recent_days: int = 14,
    limit: int = 25,
) -> dict[str, Any]:
    """Return all three MLB ranking categories."""
    return {
        CATEGORY_HOME_RUNS: rank_players(
            CATEGORY_HOME_RUNS,
            schedule_date=schedule_date,
            recent_days=recent_days,
            limit=limit,
        ),
        CATEGORY_HITS: rank_players(
            CATEGORY_HITS,
            schedule_date=schedule_date,
            recent_days=recent_days,
            limit=limit,
        ),
        CATEGORY_TOTAL_BASES: rank_players(
            CATEGORY_TOTAL_BASES,
            schedule_date=schedule_date,
            recent_days=recent_days,
            limit=limit,
        ),
    }
