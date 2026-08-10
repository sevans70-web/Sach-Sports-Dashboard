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
from data.mlb_lineups import get_mlb_lineups

from data.mlb_pitchers import get_today_probable_pitchers_with_stats
from data.mlb_weather import get_game_weather
from data.mlb_park_factors import get_park_factor

from data.ranking_history import (
    build_daily_ranking_snapshot,
    load_ranking_snapshot,
    save_ranking_snapshot,
)
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

def _clamp(
    value: float,
    minimum: float,
    maximum: float,
) -> float:
    """Keep a numeric value inside a defined range."""
    return max(minimum, min(value, maximum))


def _projection_inputs(
    season: dict[str, Any],
    recent: dict[str, Any],
) -> dict[str, float]:
    """Return blended season and recent production rates per plate appearance."""
    season_pa = max(
        int(season.get("plate_appearances", 0)),
        1,
    )
    recent_pa = max(
        int(recent.get("plate_appearances", 0)),
        1,
    )

    season_hit_rate = (
        _safe_float(season.get("hits")) / season_pa
    )
    recent_hit_rate = (
        _safe_float(recent.get("hits")) / recent_pa
    )

    season_total_base_rate = (
        _safe_float(season.get("total_bases")) / season_pa
    )
    recent_total_base_rate = (
        _safe_float(recent.get("total_bases")) / recent_pa
    )

    season_home_run_rate = (
        _safe_float(season.get("home_runs")) / season_pa
    )
    recent_home_run_rate = (
        _safe_float(recent.get("home_runs")) / recent_pa
    )

    return {
        "hit_rate": (
            (season_hit_rate * 0.65)
            + (recent_hit_rate * 0.35)
        ),
        "total_base_rate": (
            (season_total_base_rate * 0.65)
            + (recent_total_base_rate * 0.35)
        ),
        "home_run_rate": (
            (season_home_run_rate * 0.70)
            + (recent_home_run_rate * 0.30)
        ),
    }

def _projection_adjustment(
    lineup_bonus: float,
    handedness_adjustment: float,
    pitcher_adjustment: float,
) -> float:
    """Return a modest matchup and opportunity multiplier."""
    adjustment = (
        1.0
        + (lineup_bonus * 0.012)
        + (handedness_adjustment * 0.018)
        + (pitcher_adjustment * 0.025)
    )

    return _clamp(
        adjustment,
        0.75,
        1.30,
    )

def _build_projections(
    season: dict[str, Any],
    recent: dict[str, Any],
    lineup_bonus: float,
    handedness_adjustment: float,
    pitcher_adjustment: float,
) -> dict[str, float]:
    """Build baseline player projections and probabilities."""
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
        4.3 + (lineup_bonus * 0.08),
        3.5,
        5.2,
    )

    projected_hit_rate = _clamp(
        inputs["hit_rate"] * adjustment,
        0.0,
        0.60,
    )

    projected_total_base_rate = _clamp(
        inputs["total_base_rate"] * adjustment,
        0.0,
        1.50,
    )

    projected_home_run_rate = _clamp(
        inputs["home_run_rate"] * adjustment,
        0.0,
        0.25,
    )

    projected_hits = _clamp(
        projected_hit_rate * expected_plate_appearances,
        0.0,
        4.0,
    )

    projected_total_bases = _clamp(
        projected_total_base_rate * expected_plate_appearances,
        0.0,
        8.0,
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
        65.0,
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
        95.0,
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
        95.0,
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
    }

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

    lineup_dataset = get_mlb_lineups(
        schedule_date=schedule_date,
    )

    confirmed_lineup_lookup = {
        int(player["player_id"]): player
        for player in lineup_dataset.get("confirmed_hitters", [])
        if player.get("player_id")
    }

    confirmed_team_keys: set[tuple[Any, str]] = set()

    for game in lineup_dataset.get("games", []):
        game_pk = game.get("game_pk")

        if game.get("away_lineup_confirmed"):
            confirmed_team_keys.add(
                (
                    game_pk,
                    str(game.get("away_team") or ""),
                )
            )

        if game.get("home_lineup_confirmed"):
            confirmed_team_keys.add(
                (
                    game_pk,
                    str(game.get("home_team") or ""),
                )
            )

    filtered_hitters: list[dict[str, Any]] = []

    for hitter in hitters:
        player_id = hitter.get("player_id")
        team_key = (
            hitter.get("game_pk"),
            str(hitter.get("team_name") or ""),
        )

        if (
            team_key in confirmed_team_keys
            and int(player_id or 0) not in confirmed_lineup_lookup
        ):
            continue

        filtered_hitters.append(hitter)

    hitters = filtered_hitters
    
    pitcher_dataset = get_today_probable_pitchers_with_stats(
        schedule_date=schedule_date,
    )

    pitcher_lookup = pitcher_dataset.get(
        "by_pitcher_id",
        {},
    )

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
        player_id = hitter.get("player_id")
        confirmed_lineup = confirmed_lineup_lookup.get(
            int(player_id) if player_id else 0,
            {},
        )

        if confirmed_lineup:
            hitter.update(confirmed_lineup)
        season = hitter.get("season_stats", {})
        recent = hitter.get("recent_stats", {})
      
        weather = get_game_weather(
            latitude=hitter.get("venue_latitude"),
            longitude=hitter.get("venue_longitude"),
            game_time=hitter.get("game_datetime"),
            timezone_name=hitter.get(
                "venue_timezone",
                "America/New_York",
            ),
        )
        
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

        park_factor = get_park_factor(
            hitter.get("venue", ""),
            category,
        )

        park_adjustment = _clamp(
            (park_factor - 1.0) * 25.0,
            -3.0,
            3.0,
        )

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

        projections = _build_projections(
            season=season,
            recent=recent,
            lineup_bonus=lineup_bonus,
            handedness_adjustment=handedness_adjustment,
            pitcher_adjustment=pitcher_adjustment,
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
                "confidence": confidence,
                "why": (
                    (
                        [
                            "Opposing pitcher quality "
                            "improves this matchup"
                        ]
                        if pitcher_adjustment >= 2.0
                        else (
                            [
                                "Opposing pitcher quality "
                                "makes this matchup more difficult"
                            ]
                            if pitcher_adjustment <= -2.0
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
    }[category]

    scored_players.sort(
        key=lambda item: (
            -_safe_float(item.get(probability_field)),
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

    return {
        "home_runs": rank_players(
            CATEGORY_HOME_RUNS,
            schedule_date=schedule_date,
            recent_days=recent_days,
            limit=limit,
        ),
        "hits": rank_players(
            CATEGORY_HITS,
            schedule_date=schedule_date,
            recent_days=recent_days,
            limit=limit,
        ),
        "total_bases": rank_players(
            CATEGORY_TOTAL_BASES,
            schedule_date=schedule_date,
            recent_days=recent_days,
            limit=limit,
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

    if existing_snapshot.get("status") == "ready":
        return existing_snapshot

    rankings = get_all_rankings(
        schedule_date=schedule_date,
        recent_days=recent_days,
        limit=limit,
    )

    snapshot = build_daily_ranking_snapshot(
        rankings=rankings,
        schedule_date=schedule_date,
    )

    save_ranking_snapshot(snapshot)

    return snapshot
    
