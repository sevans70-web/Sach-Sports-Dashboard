"""
MLB Game Intelligence Engine v1.

File location:
    engines/game_intelligence.py

Purpose:
- Load today's eligible MLB hitters and their live statistics.
- Calculate separate Home Run, Hit, and Total Base scores.
- Rank the player pool automatically.
- Generate transparent data-quality warnings for each ranking.
- Generate transparent reasons explaining each ranking.

Important:
- No player names are hard-coded.
- This first version uses season and recent performance data.
- Matchup, lineup, weather, park, handedness, barrel, and hard-hit inputs
  will be added as new data modules become available.
"""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date, datetime
from typing import Any
from zoneinfo import ZoneInfo

from data.mlb_stats import get_today_hitters_with_stats
from data.mlb_lineups import get_mlb_lineups

from data.mlb_pitchers import get_today_probable_pitchers_with_stats
from data.mlb_weather import get_game_weather
from data.mlb_park_factors import get_park_factor
from data.mlb_statcast import load_statcast_batter_metrics

from data.ranking_history import (
    build_daily_ranking_snapshot,
    load_ranking_snapshot,
    save_ranking_snapshot,
)
TORONTO_TIMEZONE = ZoneInfo("America/Toronto")

CATEGORY_HOME_RUNS = "home_runs"
CATEGORY_HITS = "hits"
CATEGORY_TOTAL_BASES = "total_bases"
CATEGORY_RUNS = "runs"
CATEGORY_RBIS = "rbis"
CATEGORY_WALKS = "walks"
CATEGORY_STOLEN_BASES = "stolen_bases"

VALID_CATEGORIES = {
    CATEGORY_HOME_RUNS,
    CATEGORY_HITS,
    CATEGORY_TOTAL_BASES,
    CATEGORY_RUNS,
    CATEGORY_RBIS,
    CATEGORY_WALKS,
    CATEGORY_STOLEN_BASES,
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


def _statcast_percentile(
    value: float | None,
    population: list[float],
) -> float:
    """Return a neutral percentile when Statcast data is unavailable."""
    if value is None or not population:
        return 50.0
    return _percentile_rank(value, population)


def _hr_statcast_score(
    metrics: dict[str, Any] | None,
    populations: dict[str, list[float]],
) -> tuple[float, float]:
    """Return sample-weighted Statcast power score and reliability."""
    if not metrics:
        return 50.0, 0.0

    reliability = _clamp(
        _safe_float(metrics.get("sample_weight")),
        0.0,
        1.0,
    )

    barrel_pct = _statcast_percentile(
        metrics.get("barrel_rate"),
        populations.get("statcast_barrel_rate", []),
    )
    hard_hit_pct = _statcast_percentile(
        metrics.get("hard_hit_rate"),
        populations.get("statcast_hard_hit_rate", []),
    )
    xiso_pct = _statcast_percentile(
        metrics.get("xiso"),
        populations.get("statcast_xiso", []),
    )
    xslg_pct = _statcast_percentile(
        metrics.get("xslg"),
        populations.get("statcast_xslg", []),
    )

    raw_score = _weighted_score(
        [
            (barrel_pct, 40),
            (hard_hit_pct, 25),
            (xiso_pct, 20),
            (xslg_pct, 15),
        ]
    )

    # Pull small samples toward neutral instead of letting them dominate.
    weighted_score = 50.0 + ((raw_score - 50.0) * reliability)
    return round(weighted_score, 2), reliability


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
    
def _lineup_position_bonus(
    batting_order: int,
) -> float:
    """
    Return a lineup-position bonus.

    Higher lineup spots generally receive more plate appearances.
    """

    bonuses = {
        1: 8.0,
        2: 7.0,
        3: 6.0,
        4: 5.0,
        5: 3.5,
        6: 2.0,
        7: 1.0,
        8: 0.5,
        9: 0.0,
    }

    return bonuses.get(
        batting_order,
        0.0,
    )

def _handedness_matchup_adjustment(
    bat_side: str,
    pitcher_hand: str,
) -> float:
    """
    Return a small platoon-matchup adjustment.

    Opposite-handed matchups receive a modest bonus.
    Same-handed matchups receive a modest penalty.
    Switch hitters receive a bonus when the pitcher hand is known.
    """

    batter = str(bat_side or "").upper()
    pitcher = str(pitcher_hand or "").upper()

    if pitcher not in {"L", "R"}:
        return 0.0

    if batter == "S":
        return 2.5

    if batter in {"L", "R"} and batter != pitcher:
        return 2.0

    if batter in {"L", "R"} and batter == pitcher:
        return -1.5

    return 0.0

def _pitcher_quality_adjustment(
    category: str,
    pitcher_stats: dict[str, Any],
) -> float:
    """Return a market-specific hitter adjustment for the opposing pitcher."""
    era = _safe_float(pitcher_stats.get("era"))
    whip = _safe_float(pitcher_stats.get("whip"))
    k_rate = _safe_float(pitcher_stats.get("strikeout_rate"))
    hr9 = _safe_float(pitcher_stats.get("home_runs_per_nine"))
    h9 = _safe_float(pitcher_stats.get("hits_per_nine"))

    adjustment = 0.0

    if category == CATEGORY_HOME_RUNS:
        if hr9 >= 1.50:
            adjustment += 3.0
        elif hr9 >= 1.20:
            adjustment += 1.5
        elif 0 < hr9 <= 0.75:
            adjustment -= 2.5

        if k_rate >= 0.28:
            adjustment -= 1.5
        elif 0 < k_rate <= 0.18:
            adjustment += 1.0

        if era >= 4.75:
            adjustment += 1.0
        elif 0 < era <= 3.25:
            adjustment -= 1.0

    elif category == CATEGORY_HITS:
        if h9 >= 9.5:
            adjustment += 2.5
        elif 0 < h9 <= 7.0:
            adjustment -= 2.5

        if whip >= 1.35:
            adjustment += 2.0
        elif 0 < whip <= 1.10:
            adjustment -= 2.0

        if k_rate >= 0.28:
            adjustment -= 2.0
        elif 0 < k_rate <= 0.18:
            adjustment += 1.5

    elif category == CATEGORY_WALKS:
        bb9 = _safe_float(pitcher_stats.get("walks_per_nine"))
        if bb9 >= 4.0:
            adjustment += 3.0
        elif bb9 >= 3.2:
            adjustment += 1.5
        elif 0 < bb9 <= 2.0:
            adjustment -= 2.5

        if whip >= 1.35:
            adjustment += 1.0
        elif 0 < whip <= 1.05:
            adjustment -= 1.0

    elif category in {CATEGORY_RUNS, CATEGORY_RBIS}:
        if h9 >= 9.5:
            adjustment += 1.5
        elif 0 < h9 <= 7.0:
            adjustment -= 1.5
        if whip >= 1.35:
            adjustment += 1.5
        elif 0 < whip <= 1.10:
            adjustment -= 1.5
        if era >= 4.75:
            adjustment += 1.5
        elif 0 < era <= 3.25:
            adjustment -= 1.0

    elif category == CATEGORY_STOLEN_BASES:
        # Pitcher quality has only a small indirect effect on stolen-base
        # opportunity until pitcher/catcher running-control data is added.
        if whip >= 1.40:
            adjustment += 0.75
        elif 0 < whip <= 1.05:
            adjustment -= 0.75

    else:
        if h9 >= 9.5:
            adjustment += 1.5
        elif 0 < h9 <= 7.0:
            adjustment -= 1.5

        if hr9 >= 1.50:
            adjustment += 2.0
        elif 0 < hr9 <= 0.75:
            adjustment -= 1.5

        if whip >= 1.35:
            adjustment += 1.5
        elif 0 < whip <= 1.10:
            adjustment -= 1.5

        if era >= 4.75:
            adjustment += 1.0
        elif 0 < era <= 3.25:
            adjustment -= 1.0

    return _clamp(adjustment, -6.0, 6.0)

  
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
        
    if not player.get("lineup_confirmed"):
        flags.append("Starting lineup not yet confirmed")
    
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



def _extended_prop_reasons(
    category: str,
    percentiles: dict[str, float],
) -> list[str]:
    """Generate category-specific reasons for the expanded hitter props."""
    reasons: list[str] = []

    if category == CATEGORY_RUNS:
        if percentiles["season_run_rate"] >= 75:
            reasons.append("Season run-scoring rate is among the strongest in today's pool")
        if percentiles["recent_run_rate"] >= 75:
            reasons.append("Recent run production is trending strongly")
        if percentiles["season_obp"] >= 75:
            reasons.append("Strong on-base ability creates more scoring opportunities")
        if percentiles["season_ops"] >= 75:
            reasons.append("Overall offensive production supports run-scoring upside")

    elif category == CATEGORY_RBIS:
        if percentiles["season_rbi_rate"] >= 75:
            reasons.append("Season RBI rate ranks highly among today's eligible hitters")
        if percentiles["recent_rbi_rate"] >= 75:
            reasons.append("Recent RBI production is stronger than most of today's pool")
        if percentiles["season_slg"] >= 75:
            reasons.append("Strong slugging supports run-producing contact")
        if percentiles["season_hits_rate"] >= 75:
            reasons.append("Reliable hit production creates a solid RBI foundation")

    elif category == CATEGORY_WALKS:
        if percentiles["season_walk_rate"] >= 75:
            reasons.append("Season walk rate ranks near the top of today's player pool")
        if percentiles["recent_walk_rate"] >= 75:
            reasons.append("Recent plate discipline supports the walk outlook")
        if percentiles["season_obp"] >= 75:
            reasons.append("Strong on-base percentage supports patient plate appearances")
        if percentiles["low_strikeout"] >= 75:
            reasons.append("Lower strikeout rate supports deeper plate appearances")

    elif category == CATEGORY_STOLEN_BASES:
        if percentiles["season_sb_rate"] >= 75:
            reasons.append("Season stolen-base rate is among the best in today's pool")
        if percentiles["recent_sb_rate"] >= 75:
            reasons.append("Recent stolen-base activity shows current running intent")
        if percentiles["sb_success"] >= 75:
            reasons.append("Strong stolen-base efficiency supports continued green-light usage")
        if percentiles["season_obp"] >= 75:
            reasons.append("On-base ability creates more opportunities to attempt a steal")

    if not reasons:
        labels = {
            CATEGORY_RUNS: "run-scoring",
            CATEGORY_RBIS: "run-production",
            CATEGORY_WALKS: "plate-discipline",
            CATEGORY_STOLEN_BASES: "stolen-base",
        }
        reasons.append(
            f"The score combines season and recent {labels.get(category, 'offensive')} indicators"
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
        "season_run_rate": [],
        "recent_run_rate": [],
        "season_rbi_rate": [],
        "recent_rbi_rate": [],
        "season_walk_rate": [],
        "recent_walk_rate": [],
        "season_sb_rate": [],
        "recent_sb_rate": [],
        "sb_success": [],
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
        populations["season_run_rate"].append(
            _safe_float(season.get("runs")) / season_games
        )
        populations["recent_run_rate"].append(
            _safe_float(recent.get("runs")) / recent_games
        )
        populations["season_rbi_rate"].append(
            _safe_float(season.get("rbi")) / season_games
        )
        populations["recent_rbi_rate"].append(
            _safe_float(recent.get("rbi")) / recent_games
        )
        populations["season_walk_rate"].append(
            _safe_float(season.get("walk_rate"))
        )
        populations["recent_walk_rate"].append(
            _safe_float(recent.get("walk_rate"))
        )
        populations["season_sb_rate"].append(
            _safe_float(season.get("stolen_bases")) / season_games
        )
        populations["recent_sb_rate"].append(
            _safe_float(recent.get("stolen_bases")) / recent_games
        )
        sb = _safe_float(season.get("stolen_bases"))
        cs = _safe_float(season.get("caught_stealing"))
        populations["sb_success"].append(
            sb / (sb + cs) if (sb + cs) > 0 else 0.0
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
        "season_run_rate": _safe_float(season.get("runs")) / season_games,
        "recent_run_rate": _safe_float(recent.get("runs")) / recent_games,
        "season_rbi_rate": _safe_float(season.get("rbi")) / season_games,
        "recent_rbi_rate": _safe_float(recent.get("rbi")) / recent_games,
        "season_walk_rate": _safe_float(season.get("walk_rate")),
        "recent_walk_rate": _safe_float(recent.get("walk_rate")),
        "season_sb_rate": _safe_float(season.get("stolen_bases")) / season_games,
        "recent_sb_rate": _safe_float(recent.get("stolen_bases")) / recent_games,
        "sb_success": (
            _safe_float(season.get("stolen_bases"))
            / max(
                _safe_float(season.get("stolen_bases"))
                + _safe_float(season.get("caught_stealing")),
                1.0,
            )
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

    if category == CATEGORY_RUNS:
        return _weighted_score(
            [
                (percentiles["season_run_rate"], 28),
                (percentiles["recent_run_rate"], 26),
                (percentiles["season_obp"], 20),
                (percentiles["recent_obp"], 14),
                (percentiles["season_ops"], 12),
            ]
        )

    if category == CATEGORY_RBIS:
        return _weighted_score(
            [
                (percentiles["season_rbi_rate"], 28),
                (percentiles["recent_rbi_rate"], 26),
                (percentiles["season_slg"], 18),
                (percentiles["recent_slg"], 14),
                (percentiles["season_hits_rate"], 14),
            ]
        )

    if category == CATEGORY_WALKS:
        return _weighted_score(
            [
                (percentiles["season_walk_rate"], 32),
                (percentiles["recent_walk_rate"], 28),
                (percentiles["season_obp"], 18),
                (percentiles["recent_obp"], 12),
                (percentiles["low_strikeout"], 10),
            ]
        )

    if category == CATEGORY_STOLEN_BASES:
        return _weighted_score(
            [
                (percentiles["season_sb_rate"], 36),
                (percentiles["recent_sb_rate"], 30),
                (percentiles["sb_success"], 18),
                (percentiles["season_obp"], 10),
                (percentiles["recent_obp"], 6),
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

    if category in {
        CATEGORY_RUNS,
        CATEGORY_RBIS,
        CATEGORY_WALKS,
        CATEGORY_STOLEN_BASES,
    }:
        return _extended_prop_reasons(category, percentiles)

    return _total_base_reasons(season, recent, percentiles)

def _clamp(
    value: float,
    minimum: float,
    maximum: float,
) -> float:
    """Keep a numeric value inside a defined range."""
    return max(minimum, min(value, maximum))


def _projection_opportunities(
    stats: dict[str, Any],
) -> int:
    """Return a valid plate-appearance denominator for projection rates."""
    reported = int(stats.get("plate_appearances", 0) or 0)

    if reported > 0:
        return reported

    return max(
        int(stats.get("at_bats", 0) or 0)
        + int(stats.get("walks", 0) or 0)
        + int(stats.get("hit_by_pitch", 0) or 0)
        + int(stats.get("sac_flies", 0) or 0),
        0,
    )


def _blended_projection_rate(
    season: dict[str, Any],
    recent: dict[str, Any],
    stat_name: str,
    recent_weight_cap: float,
    baseline_rate: float,
    prior_opportunities: int,
) -> float:
    """Blend player production with a stable baseline and recent form."""
    season_opportunities = _projection_opportunities(season)
    recent_opportunities = _projection_opportunities(recent)

    stabilized_season_rate = (
        _safe_float(season.get(stat_name))
        + (baseline_rate * prior_opportunities)
    ) / (
        season_opportunities + prior_opportunities
    )

    if recent_opportunities <= 0:
        return stabilized_season_rate

    stabilized_recent_rate = (
        _safe_float(recent.get(stat_name))
        + (baseline_rate * prior_opportunities)
    ) / (
        recent_opportunities + prior_opportunities
    )

    recent_weight = min(
        recent_weight_cap,
        recent_opportunities / 100.0,
    )

    return (
        stabilized_season_rate * (1.0 - recent_weight)
        + stabilized_recent_rate * recent_weight
    )


def _projection_inputs(
    season: dict[str, Any],
    recent: dict[str, Any],
) -> dict[str, float]:
    """Return sample-aware season and recent production rates."""
    return {
        "hit_rate": _blended_projection_rate(
            season,
            recent,
            "hits",
            0.30,
            0.240,
            120,
        ),
        "total_base_rate": _blended_projection_rate(
            season,
            recent,
            "total_bases",
            0.30,
            0.390,
            120,
        ),
        "home_run_rate": _blended_projection_rate(
            season,
            recent,
            "home_runs",
            0.25,
            0.032,
            200,
        ),
        "run_rate": _blended_projection_rate(
            season, recent, "runs", 0.30, 0.120, 120
        ),
        "rbi_rate": _blended_projection_rate(
            season, recent, "rbi", 0.30, 0.115, 120
        ),
        "walk_rate": _blended_projection_rate(
            season, recent, "walks", 0.30, 0.085, 150
        ),
        "stolen_base_rate": _blended_projection_rate(
            season, recent, "stolen_bases", 0.25, 0.015, 220
        ),
    }


def _projection_adjustment(
    lineup_bonus: float,
    handedness_adjustment: float,
    pitcher_adjustment: float,
) -> float:
    """Return a conservative matchup and opportunity multiplier."""
    adjustment = (
        1.0
        + (lineup_bonus * 0.010)
        + (handedness_adjustment * 0.012)
        + (pitcher_adjustment * 0.018)
    )

    return _clamp(
        adjustment,
        0.85,
        1.15,
    )


def _build_projections(
    season: dict[str, Any],
    recent: dict[str, Any],
    lineup_bonus: float,
    handedness_adjustment: float,
    pitcher_adjustment: float,
) -> dict[str, float]:
    """Build sample-aware player projections and probabilities."""
    inputs = _projection_inputs(
        season,
        recent,
    )

    adjustment = _projection_adjustment(
        lineup_bonus=lineup_bonus,
        handedness_adjustment=handedness_adjustment,
        pitcher_adjustment=pitcher_adjustment,
    )

    expected_plate_appearances = _clamp(
        4.1 + (lineup_bonus * 0.06),
        3.6,
        4.8,
    )

    projected_hit_rate = _clamp(
        inputs["hit_rate"] * adjustment,
        0.0,
        0.40,
    )

    projected_total_base_rate = _clamp(
        inputs["total_base_rate"] * adjustment,
        0.0,
        0.85,
    )

    projected_home_run_rate = _clamp(
        inputs["home_run_rate"] * adjustment,
        0.0,
        0.12,
    )

    projected_hits = _clamp(
        projected_hit_rate * expected_plate_appearances,
        0.0,
        2.0,
    )

    projected_total_bases = _clamp(
        projected_total_base_rate * expected_plate_appearances,
        0.0,
        4.0,
    )

    home_run_probability = _clamp(
        (
            1.0
            - (
                (1.0 - projected_home_run_rate)
                ** expected_plate_appearances
            )
        )
        * 100,
        0.0,
        100.0,
    )

    one_plus_hit_probability = _clamp(
        (
            1.0
            - (
                (1.0 - projected_hit_rate)
                ** expected_plate_appearances
            )
        )
        * 100,
        0.0,
        100.0,
    )

    over_1_5_total_bases_probability = _clamp(
        (
            1.0
            - (
                2.71828 ** (-projected_total_bases)
                * (1.0 + projected_total_bases)
            )
        )
        * 100,
        0.0,
        100.0,
    )

    projected_runs = _clamp(
        inputs["run_rate"] * expected_plate_appearances * adjustment, 0.0, 2.0
    )
    projected_rbis = _clamp(
        inputs["rbi_rate"] * expected_plate_appearances * adjustment, 0.0, 2.5
    )
    projected_walks = _clamp(
        inputs["walk_rate"] * expected_plate_appearances * adjustment, 0.0, 2.0
    )
    projected_stolen_bases = _clamp(
        inputs["stolen_base_rate"] * expected_plate_appearances, 0.0, 1.2
    )

    run_probability = _clamp((1.0 - 2.71828 ** (-projected_runs)) * 100, 0.0, 100.0)
    rbi_probability = _clamp((1.0 - 2.71828 ** (-projected_rbis)) * 100, 0.0, 100.0)
    walk_probability = _clamp((1.0 - 2.71828 ** (-projected_walks)) * 100, 0.0, 100.0)
    stolen_base_probability = _clamp(
        (1.0 - 2.71828 ** (-projected_stolen_bases)) * 100, 0.0, 100.0
    )

    return {
        "projected_hits": round(projected_hits, 2),
        "projected_total_bases": round(
            projected_total_bases,
            2,
        ),
        "home_run_probability": round(
            home_run_probability,
            1,
        ),
        "one_plus_hit_probability": round(
            one_plus_hit_probability,
            1,
        ),
        "over_1_5_total_bases_probability": round(
            over_1_5_total_bases_probability,
            1,
        ),
        "projected_runs": round(projected_runs, 2),
        "projected_rbis": round(projected_rbis, 2),
        "projected_walks": round(projected_walks, 2),
        "projected_stolen_bases": round(projected_stolen_bases, 2),
        "one_plus_run_probability": round(run_probability, 1),
        "one_plus_rbi_probability": round(rbi_probability, 1),
        "one_plus_walk_probability": round(walk_probability, 1),
        "one_plus_stolen_base_probability": round(stolen_base_probability, 1),
    }

def _load_ranking_context(
    schedule_date: date | str | None,
    recent_days: int,
) -> dict[str, Any]:
    """Load shared ranking inputs once for all three categories."""
    try:
        dataset = get_today_hitters_with_stats(
            schedule_date=schedule_date,
            recent_days=recent_days,
        )
    except Exception as exc:
        dataset = {
            "success": False,
            "hitters": [],
            "errors": [f"Player data unavailable: {exc}"],
        }

    try:
        lineup_dataset = get_mlb_lineups(
            schedule_date=schedule_date,
        )
    except Exception as exc:
        lineup_dataset = {
            "success": False,
            "confirmed_hitters": [],
            "games": [],
            "errors": [f"Lineup data unavailable: {exc}"],
        }

    confirmed_lineup_lookup = {
        int(player["player_id"]): player
        for player in lineup_dataset.get("confirmed_hitters", [])
        if player.get("player_id")
    }
    confirmed_team_ids: set[tuple[Any, int]] = set()
    confirmed_team_names: set[tuple[Any, str]] = set()

    for game in lineup_dataset.get("games", []):
        game_pk = game.get("game_pk")
        for side in ("away", "home"):
            if not game.get(f"{side}_lineup_confirmed"):
                continue

            team_id = game.get(f"{side}_team_id")
            if team_id:
                confirmed_team_ids.add((game_pk, int(team_id)))

            team_name = str(game.get(f"{side}_team") or "").strip()
            if team_name:
                confirmed_team_names.add((game_pk, team_name))

    hitters = []
    for hitter in dataset.get("hitters", []):
        game_pk = hitter.get("game_pk")
        team_id = int(hitter.get("team_id") or 0)
        team_name = str(hitter.get("team_name") or "").strip()
        player_id = int(hitter.get("player_id") or 0)

        team_lineup_confirmed = (
            (team_id and (game_pk, team_id) in confirmed_team_ids)
            or (
                team_name
                and (game_pk, team_name) in confirmed_team_names
            )
        )

        if (
            team_lineup_confirmed
            and player_id not in confirmed_lineup_lookup
        ):
            continue
        hitters.append(hitter)

    try:
        pitcher_dataset = get_today_probable_pitchers_with_stats(
            schedule_date=schedule_date,
            lineup_data=lineup_dataset,
        )
    except Exception:
        pitcher_dataset = {"by_pitcher_id": {}}

    # Fetch one weather record per game in parallel. Previously these
    # requests were made sequentially while scoring the first category,
    # which could make a cold Streamlit deployment take minutes.
    weather_cache: dict[Any, dict[str, Any]] = {}
    weather_inputs: dict[Any, dict[str, Any]] = {}

    for hitter in hitters:
        weather_key = hitter.get("game_pk") or (
            hitter.get("venue_latitude"),
            hitter.get("venue_longitude"),
            hitter.get("game_datetime"),
        )
        if weather_key not in weather_inputs:
            weather_inputs[weather_key] = hitter

    def _load_weather(item: tuple[Any, dict[str, Any]]) -> tuple[Any, dict[str, Any]]:
        weather_key, hitter = item
        try:
            result = get_game_weather(
                latitude=hitter.get("venue_latitude"),
                longitude=hitter.get("venue_longitude"),
                game_time=hitter.get("game_datetime"),
                timezone_name=hitter.get("venue_timezone", "America/New_York"),
            )
        except Exception as exc:
            result = {
                "success": False,
                "error": f"Weather unavailable: {exc}",
            }
        return weather_key, result

    worker_count = min(8, max(len(weather_inputs), 1))
    with ThreadPoolExecutor(max_workers=worker_count) as executor:
        futures = [
            executor.submit(_load_weather, item)
            for item in weather_inputs.items()
        ]
        for future in as_completed(futures):
            weather_key, result = future.result()
            weather_cache[weather_key] = result

    statcast_snapshot = load_statcast_batter_metrics(
        year=datetime.now(TORONTO_TIMEZONE).year,
        minimum_pa=10,
    )
    statcast_players = (
        statcast_snapshot.get("players", {})
        if statcast_snapshot.get("available")
        else {}
    )

    statcast_populations = {
        "statcast_barrel_rate": [],
        "statcast_hard_hit_rate": [],
        "statcast_xiso": [],
        "statcast_xslg": [],
    }
    for metrics in statcast_players.values():
        for key, source_key in (
            ("statcast_barrel_rate", "barrel_rate"),
            ("statcast_hard_hit_rate", "hard_hit_rate"),
            ("statcast_xiso", "xiso"),
            ("statcast_xslg", "xslg"),
        ):
            value = metrics.get(source_key)
            if value is not None:
                statcast_populations[key].append(_safe_float(value))

    return {
        "dataset": dataset,
        "hitters": hitters,
        "lineup_dataset": lineup_dataset,
        "confirmed_lineup_lookup": confirmed_lineup_lookup,
        "pitcher_lookup": pitcher_dataset.get("by_pitcher_id", {}),
        "populations": _build_populations(hitters),
        "statcast_players": statcast_players,
        "statcast_populations": statcast_populations,
        "statcast_available": bool(statcast_players),
        "statcast_error": statcast_snapshot.get("error", ""),
        "weather_cache": weather_cache,
    }


def rank_players(
    category: str,
    schedule_date: date | str | None = None,
    recent_days: int = 14,
    limit: int = 25,
    _shared_context: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """
    Rank today's eligible hitters for one category.

    Rankings combine statistical performance with matchup, lineup, weather,
    park and handedness context. Home Run rankings also use sample-weighted
    Statcast barrel, hard-hit, xISO and xSLG power quality when available.
    """
    if category not in VALID_CATEGORIES:
        raise ValueError(
            f"category must be one of: {sorted(VALID_CATEGORIES)}"
        )

    context = _shared_context or _load_ranking_context(
        schedule_date=schedule_date,
        recent_days=recent_days,
    )
    dataset = context["dataset"]
    hitters = context["hitters"]
    lineup_dataset = context["lineup_dataset"]

    confirmed_lineup_lookup = context["confirmed_lineup_lookup"]

    pitcher_lookup = context["pitcher_lookup"]

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

    populations = context["populations"]
    statcast_players = context.get("statcast_players", {})
    statcast_populations = context.get("statcast_populations", {})
    scored_players: list[dict[str, Any]] = []

    for hitter in hitters:
        player_id = hitter.get("player_id")
        confirmed_lineup = confirmed_lineup_lookup.get(
            int(player_id) if player_id else 0,
            {},
        )

        if confirmed_lineup:
            hitter = {**hitter, **confirmed_lineup}
        season = hitter.get("season_stats", {})
        recent = hitter.get("recent_stats", {})
      
        weather_key = hitter.get("game_pk") or (
            hitter.get("venue_latitude"),
            hitter.get("venue_longitude"),
            hitter.get("game_datetime"),
        )
        weather_cache = context["weather_cache"]
        if weather_key not in weather_cache:
            try:
                weather_cache[weather_key] = get_game_weather(
                    latitude=hitter.get("venue_latitude"),
                    longitude=hitter.get("venue_longitude"),
                    game_time=hitter.get("game_datetime"),
                    timezone_name=hitter.get(
                        "venue_timezone",
                        "America/New_York",
                    ),
                )
            except Exception as exc:
                weather_cache[weather_key] = {
                    "success": False,
                    "error": f"Weather unavailable: {exc}",
                }
        weather = weather_cache[weather_key]
        
        pitcher = pitcher_lookup.get(
            hitter.get("opposing_probable_pitcher_id"),
            {},
        )

        pitcher_stats = pitcher.get(
            "season_stats",
            {},
        )
        percentiles = _player_percentiles(
            hitter,
            populations,
        )

        base_score = _category_score(
            category,
            percentiles,
        )

        statcast_metrics = None
        statcast_score = 50.0
        statcast_reliability = 0.0
        if category == CATEGORY_HOME_RUNS and player_id:
            statcast_metrics = statcast_players.get(int(player_id))
            statcast_score, statcast_reliability = _hr_statcast_score(
                statcast_metrics,
                statcast_populations,
            )

        season_opportunities = _projection_opportunities(season)
        sample_reliability = _clamp(
            season_opportunities / 200.0,
            0.0,
            1.0,
        )
        base_score = (
            50.0
            + ((base_score - 50.0) * sample_reliability)
        )

        handedness_adjustment = _handedness_matchup_adjustment(
            hitter.get("bat_side", ""),
            hitter.get("opposing_pitcher_hand", ""),
        )

        if hitter.get("lineup_confirmed"):
            batting_order = hitter.get("batting_order")

            try:
                batting_order = int(batting_order)
            except (TypeError, ValueError):
                batting_order = 9

            lineup_bonus = float(
                _lineup_position_bonus(batting_order)
            )
        else:
            lineup_bonus = 0.0

        pitcher_adjustment = _pitcher_quality_adjustment(
            category,
            pitcher_stats,
        )
        weather_adjustment = 0.0

        if weather.get("success"):
            temperature = _safe_float(
                weather.get("temperature_f", 70)
            )
            wind_speed = _safe_float(
                weather.get("wind_speed_mph", 0)
            )

            if category == CATEGORY_HOME_RUNS:
                if temperature >= 85:
                    weather_adjustment += 2.0
                elif temperature >= 78:
                    weather_adjustment += 1.0
                elif temperature <= 50:
                    weather_adjustment -= 2.0

                if wind_speed >= 15:
                    weather_adjustment -= 1.0

            elif category == CATEGORY_TOTAL_BASES:
                if temperature >= 85:
                    weather_adjustment += 1.5
                elif temperature >= 78:
                    weather_adjustment += 0.75
                elif temperature <= 50:
                    weather_adjustment -= 1.5

                if wind_speed >= 15:
                    weather_adjustment -= 0.5

            else:
                if temperature >= 85:
                    weather_adjustment += 0.75
                elif temperature <= 50:
                    weather_adjustment -= 0.75

                if wind_speed >= 15:
                    weather_adjustment -= 0.25

        park_category = category
        if category in {CATEGORY_RUNS, CATEGORY_RBIS}:
            park_category = CATEGORY_TOTAL_BASES
        elif category == CATEGORY_WALKS:
            park_category = CATEGORY_HITS
        elif category == CATEGORY_STOLEN_BASES:
            park_category = CATEGORY_HITS

        park_factor = get_park_factor(
            hitter.get("venue", ""),
            park_category,
        )

        park_adjustment = _clamp(
            (park_factor - 1.0) * 25.0,
            -3.0,
            3.0,
        )

        projections = _build_projections(
            season=season,
            recent=recent,
            lineup_bonus=lineup_bonus,
            handedness_adjustment=handedness_adjustment,
            pitcher_adjustment=pitcher_adjustment,
        )

        if category == CATEGORY_HOME_RUNS:
            hr_probability = _safe_float(
                projections.get("home_run_probability")
            )

            matchup_score = _clamp(
                50.0
                + (lineup_bonus * 4.0)
                + (handedness_adjustment * 4.0)
                + (pitcher_adjustment * 4.0)
                + (weather_adjustment * 3.0)
                + (park_adjustment * 3.0),
                0.0,
                100.0,
            )

            if statcast_metrics:
                score = round(
                    (hr_probability * 0.45)
                    + (base_score * 0.20)
                    + (matchup_score * 0.15)
                    + (statcast_score * 0.20),
                    1,
                )
            else:
                # Preserve the established HR model when Statcast is unavailable.
                score = round(
                    (hr_probability * 0.55)
                    + (base_score * 0.30)
                    + (matchup_score * 0.15),
                    1,
                )

        else:
            score = min(
                max(
                    round(
                        (base_score * 0.75)
                        + lineup_bonus
                        + (handedness_adjustment * 1.5)
                        + (pitcher_adjustment * 1.5)
                        + weather_adjustment
                        + park_adjustment,
                        1,
                    ),
                    0.0,
                ),
                100.0,
            )

        score = _clamp(
            score,
            0.0,
            100.0,
        )

        scored_players.append(
            {
                **hitter,
                **projections,
                "category": category,
                "base_score": base_score,
                "lineup_bonus": lineup_bonus,
                "handedness_adjustment": handedness_adjustment,
                "pitcher_adjustment": pitcher_adjustment,
                "gi_score": score,
                "weather": weather,
                "park_factor": park_factor,
                "park_adjustment": park_adjustment,
                "statcast": statcast_metrics or {},
                "statcast_power_score": statcast_score if statcast_metrics else None,
                "statcast_sample_weight": statcast_reliability if statcast_metrics else 0.0,
                "why": (
                    (
                        [
                            "Opposing pitcher profile improves this matchup"
                        ]
                        if pitcher_adjustment >= 2.0
                        else (
                            [
                                "Opposing pitcher profile creates a tougher matchup"
                            ]
                            if pitcher_adjustment <= -2.0
                            else []
                        )
                    )
                    + (
                        [
                            "Confirmed batting-order position improves expected opportunities"
                        ]
                        if lineup_bonus >= 2.0
                        else []
                    )
                    + (
                        [
                            "Ballpark conditions provide a favorable environment"
                        ]
                        if park_adjustment >= 1.0
                        else (
                            [
                                "Ballpark conditions slightly reduce the offensive outlook"
                            ]
                            if park_adjustment <= -1.0
                            else []
                        )
                    )
                    + (
                        [
                            "Game temperature provides a favorable hitting environment"
                        ]
                        if weather_adjustment >= 1.0
                        else (
                            [
                                "Weather conditions reduce the offensive outlook"
                            ]
                            if weather_adjustment <= -1.0
                            else []
                        )
                    )
                    + (
                        [
                            "Statcast barrel and hard-hit quality strengthen the home-run profile"
                        ]
                        if (
                            category == CATEGORY_HOME_RUNS
                            and statcast_metrics
                            and statcast_score >= 70.0
                        )
                        else (
                            [
                                "Statcast contact quality is below the strongest power profiles"
                            ]
                            if (
                                category == CATEGORY_HOME_RUNS
                                and statcast_metrics
                                and statcast_score <= 35.0
                            )
                            else []
                        )
                    )
                    + _category_reasons(
                        category,
                        season,
                        recent,
                        percentiles,
                    )
                )[:4],
                "risk_flags": _risk_flags(hitter),
                "percentiles": percentiles,
            }
        )

    probability_field = {
        CATEGORY_HOME_RUNS: "home_run_probability",
        CATEGORY_HITS: "one_plus_hit_probability",
        CATEGORY_TOTAL_BASES: "over_1_5_total_bases_probability",
        CATEGORY_RUNS: "one_plus_run_probability",
        CATEGORY_RBIS: "one_plus_rbi_probability",
        CATEGORY_WALKS: "one_plus_walk_probability",
        CATEGORY_STOLEN_BASES: "one_plus_stolen_base_probability",
    }[category]

    scored_players.sort(
        key=lambda item: (
            -_safe_float(item.get("gi_score")),
            -_safe_float(item.get(probability_field)),
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

    complete_top_25 = len(ranked) == min(limit, 25)

    has_full_team_slate = (
        dataset.get("team_count", 0)
        == dataset.get("game_count", 0) * 2
    )

    return {
        "success": bool(ranked),
        "complete_top_25": complete_top_25,
        "has_full_team_slate": has_full_team_slate,
        "category": category,
        "date": dataset.get("date"),
        "rankings": ranked,
        "player_count": len(scored_players),
        "ranked_count": len(ranked),
        "game_count": dataset.get("game_count", 0),
        "team_count": dataset.get("team_count", 0),
        "hitter_count": dataset.get("hitter_count", 0),
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
    """Return rankings for all supported MLB categories."""

    context = _load_ranking_context(
        schedule_date=schedule_date,
        recent_days=recent_days,
    )

    return {
        "home_runs": rank_players(
            CATEGORY_HOME_RUNS,
            schedule_date=schedule_date,
            recent_days=recent_days,
            limit=limit,
            _shared_context=context,
        ),
        "hits": rank_players(
            CATEGORY_HITS,
            schedule_date=schedule_date,
            recent_days=recent_days,
            limit=limit,
            _shared_context=context,
        ),
        "total_bases": rank_players(
            CATEGORY_TOTAL_BASES,
            schedule_date=schedule_date,
            recent_days=recent_days,
            limit=limit,
            _shared_context=context,
        ),
        "runs": rank_players(
            CATEGORY_RUNS, schedule_date=schedule_date, recent_days=recent_days,
            limit=limit, _shared_context=context,
        ),
        "rbis": rank_players(
            CATEGORY_RBIS, schedule_date=schedule_date, recent_days=recent_days,
            limit=limit, _shared_context=context,
        ),
        "walks": rank_players(
            CATEGORY_WALKS, schedule_date=schedule_date, recent_days=recent_days,
            limit=limit, _shared_context=context,
        ),
        "stolen_bases": rank_players(
            CATEGORY_STOLEN_BASES, schedule_date=schedule_date, recent_days=recent_days,
            limit=limit, _shared_context=context,
        ),
    }

def get_daily_ranking_snapshot(
    schedule_date: date | str | None = None,
    recent_days: int = 14,
    limit: int = 25,
) -> dict[str, Any]:
    """Return the first saved ranking snapshot for the requested date."""

    snapshot_date = (
        schedule_date
        if schedule_date is not None
        else datetime.now(TORONTO_TIMEZONE).date()
    )

    existing_snapshot = load_ranking_snapshot(snapshot_date)

    existing_rankings = existing_snapshot.get("rankings", {})
    existing_snapshot_has_players = any(
        bool(category_result.get("rankings"))
        for category_result in existing_rankings.values()
        if isinstance(category_result, dict)
    )

    requested_date = (
        snapshot_date.isoformat()
        if isinstance(snapshot_date, date)
        else str(snapshot_date)
    )

    existing_ranking_dates = {
        str(category_result.get("date"))
        for category_result in existing_rankings.values()
        if isinstance(category_result, dict)
        and category_result.get("rankings")
        and category_result.get("date")
    }

    # Reuse a saved snapshot only when its populated category payloads are
    # explicitly stamped for the requested slate.  This also invalidates a
    # bad snapshot that older rollover code may already have saved under
    # today's filename while its rankings still belonged to yesterday.
    existing_snapshot_matches_requested_date = (
        existing_snapshot.get("schedule_date") == requested_date
        and existing_ranking_dates == {requested_date}
    )

    if (
        existing_snapshot.get("status") == "ready"
        and existing_snapshot_has_players
        and existing_snapshot_matches_requested_date
    ):
        return existing_snapshot

    # Resolve the calendar date once and pass that exact date through every
    # provider call.  Passing None here allowed downstream MLB endpoints to
    # independently decide what "today" meant around midnight, which could
    # label the previous slate as the new day's Top 25.
    rankings = get_all_rankings(
        schedule_date=snapshot_date,
        recent_days=recent_days,
        limit=limit,
    )

    ranking_dates = {
        str(category_result.get("date"))
        for category_result in rankings.values()
        if isinstance(category_result, dict)
        and category_result.get("rankings")
        and category_result.get("date")
    }

    # Never freeze yesterday's provider payload into today's permanent
    # snapshot.  Returning an empty/transient result lets the next Streamlit
    # refresh retry until MLB data is actually available for requested_date.
    if ranking_dates and ranking_dates != {requested_date}:
        return {
            "schedule_date": requested_date,
            "saved_at": datetime.now(TORONTO_TIMEZONE).isoformat(),
            "rankings": {},
            "status": "waiting_for_current_slate",
            "provider_dates": sorted(ranking_dates),
        }

    snapshot = build_daily_ranking_snapshot(
        rankings=rankings,
        schedule_date=snapshot_date,
    )

    save_ranking_snapshot(snapshot)

    return snapshot
    
