from __future__ import annotations

from math import exp
from typing import Any

from data.mlb_lineups import get_mlb_lineups, get_previous_day_lineup_projection
from data.mlb_pitchers import get_today_probable_pitchers_with_stats


PITCHER_CATEGORIES = (
    "strikeouts",
    "outs_recorded",
    "hits_allowed",
    "walks_allowed",
    "earned_runs",
)


def _clamp(value: float, minimum: float, maximum: float) -> float:
    return max(minimum, min(maximum, value))


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


def _probability_from_projection(
    projection: float,
    benchmark: float,
    steepness: float = 1.45,
) -> float:
    difference = projection - benchmark
    logistic = 1.0 / (1.0 + exp(-steepness * difference))
    return round(_clamp(logistic * 100.0, 5.0, 95.0), 1)


def _opponent_lineup_for_pitcher(
    pitcher: dict[str, Any],
    games_by_pk: dict[int, dict[str, Any]],
) -> tuple[list[dict[str, Any]], str]:
    """Return opponent lineup plus context status."""
    game_pk = _safe_int(pitcher.get("game_pk"))
    game = games_by_pk.get(game_pk, {})
    if not game:
        return [], "unavailable"

    side = "away" if pitcher.get("is_home") is True else "home"
    lineup = list(game.get(f"{side}_lineup") or [])
    if len(lineup) < 9:
        return lineup, "unavailable"
    if bool(game.get(f"{side}_lineup_confirmed")):
        return lineup, "confirmed"
    if bool(game.get(f"{side}_lineup_projected")):
        return lineup, "projected"
    return lineup, "projected"


def _lineup_handedness_weights(
    pitcher_hand: str,
    lineup: list[dict[str, Any]],
) -> tuple[float, float, bool]:
    if len(lineup) < 9:
        return 0.5, 0.5, False

    left = 0.0
    right = 0.0
    normalized_hand = str(pitcher_hand or "").upper()

    for hitter in lineup[:9]:
        bat_side = str(hitter.get("bat_side") or "").upper()

        if bat_side == "L":
            left += 1
        elif bat_side == "R":
            right += 1
        elif bat_side == "S":
            if normalized_hand == "L":
                right += 1
            else:
                left += 1
        else:
            left += 0.5
            right += 0.5

    total = left + right
    if total <= 0:
        return 0.5, 0.5, False

    return left / total, right / total, True


def _weighted_split_rate(
    overall: float,
    pitcher: dict[str, Any],
    field: str,
    left_weight: float,
    right_weight: float,
    use_splits: bool,
) -> float:
    if not use_splits:
        return overall

    splits = pitcher.get("platoon_splits") or {}
    vs_lhb = splits.get("vs_lhb") or {}
    vs_rhb = splits.get("vs_rhb") or {}

    left_value = _safe_float(vs_lhb.get(field), overall)
    right_value = _safe_float(vs_rhb.get(field), overall)

    if left_value <= 0 and overall > 0:
        left_value = overall
    if right_value <= 0 and overall > 0:
        right_value = overall

    return (left_value * left_weight) + (right_value * right_weight)


def _starter_workload(stats: dict[str, Any]) -> tuple[float, float]:
    starts = max(_safe_int(stats.get("games_started")), 0)
    outs = max(_safe_int(stats.get("innings_outs")), 0)

    if starts <= 0 or outs <= 0:
        return 15.0, 5.0

    avg_outs = _clamp(outs / starts, 9.0, 21.0)
    avg_innings = _clamp(avg_outs / 3.0, 3.0, 7.0)
    return avg_outs, avg_innings


def _reliability(stats: dict[str, Any]) -> float:
    starts = _safe_int(stats.get("games_started"))
    innings = _safe_float(stats.get("innings_pitched_decimal"))
    starts_factor = _clamp(starts / 12.0, 0.20, 1.0)
    innings_factor = _clamp(innings / 60.0, 0.20, 1.0)
    return round((starts_factor * 0.65) + (innings_factor * 0.35), 3)


def _score_projection(
    projection: float,
    benchmark: float,
    reliability: float,
    scale: float,
) -> float:
    raw = 50.0 + ((projection - benchmark) * scale)
    raw = _clamp(raw, 5.0, 95.0)
    adjusted = 50.0 + ((raw - 50.0) * reliability)
    return round(_clamp(adjusted, 0.0, 100.0), 1)


def _pitcher_headshot_url(pitcher_id: int) -> str:
    return (
        "https://img.mlbstatic.com/mlb-photos/image/upload/"
        f"w_180,q_auto:best/v1/people/{pitcher_id}/headshot/67/current"
    )


def _build_pitcher_row(
    pitcher: dict[str, Any],
    games_by_pk: dict[int, dict[str, Any]],
) -> dict[str, Any]:
    stats = pitcher.get("season_stats") or {}
    pitcher_id = _safe_int(pitcher.get("pitcher_id"))
    pitcher_hand = str(pitcher.get("pitcher_hand") or "")

    lineup, lineup_context_status = _opponent_lineup_for_pitcher(pitcher, games_by_pk)
    left_weight, right_weight, usable_lineup_context = _lineup_handedness_weights(
        pitcher_hand,
        lineup,
    )
    confirmed_context = lineup_context_status == "confirmed" and usable_lineup_context
    projected_context = lineup_context_status == "projected" and usable_lineup_context

    avg_outs, avg_innings = _starter_workload(stats)

    k9 = _weighted_split_rate(
        _safe_float(stats.get("strikeouts_per_nine")),
        pitcher,
        "strikeouts_per_nine",
        left_weight,
        right_weight,
        usable_lineup_context,
    )
    h9 = _weighted_split_rate(
        _safe_float(stats.get("hits_per_nine")),
        pitcher,
        "hits_per_nine",
        left_weight,
        right_weight,
        usable_lineup_context,
    )
    bb9 = _weighted_split_rate(
        _safe_float(stats.get("walks_per_nine")),
        pitcher,
        "walks_per_nine",
        left_weight,
        right_weight,
        usable_lineup_context,
    )
    era = _weighted_split_rate(
        _safe_float(stats.get("era")),
        pitcher,
        "era",
        left_weight,
        right_weight,
        usable_lineup_context,
    )

    projected_strikeouts = (k9 * avg_innings) / 9.0
    projected_hits_allowed = (h9 * avg_innings) / 9.0
    projected_walks_allowed = (bb9 * avg_innings) / 9.0
    projected_earned_runs = (era * avg_innings) / 9.0
    projected_outs = avg_outs

    reliability = _reliability(stats)

    projections = {
        "strikeouts": round(projected_strikeouts, 2),
        "outs_recorded": round(projected_outs, 1),
        "hits_allowed": round(projected_hits_allowed, 2),
        "walks_allowed": round(projected_walks_allowed, 2),
        "earned_runs": round(projected_earned_runs, 2),
    }

    benchmarks = {
        "strikeouts": 4.5,
        "outs_recorded": 17.5,
        "hits_allowed": 4.5,
        "walks_allowed": 1.5,
        "earned_runs": 2.5,
    }

    score_scales = {
        "strikeouts": 8.0,
        "outs_recorded": 4.0,
        "hits_allowed": 8.0,
        "walks_allowed": 12.0,
        "earned_runs": 10.0,
    }

    probabilities = {
        category: _probability_from_projection(
            projections[category],
            benchmarks[category],
            0.28 if category == "outs_recorded" else 1.45,
        )
        for category in PITCHER_CATEGORIES
    }

    scores = {
        category: _score_projection(
            projections[category],
            benchmarks[category],
            reliability,
            score_scales[category],
        )
        for category in PITCHER_CATEGORIES
    }

    if confirmed_context:
        context_text = (
            f"Confirmed opponent lineup: {left_weight * 100:.0f}% LHB / "
            f"{right_weight * 100:.0f}% RHB."
        )
    elif projected_context:
        context_text = (
            f"Projected opponent lineup: {left_weight * 100:.0f}% LHB / "
            f"{right_weight * 100:.0f}% RHB; matchup splits are included."
        )
    else:
        context_text = "Opponent lineup is unavailable; season rates carry more weight."

    base = {
        "pitcher_id": pitcher_id,
        "pitcher_name": pitcher.get("pitcher_name") or "Pitcher unavailable",
        "headshot_url": _pitcher_headshot_url(pitcher_id) if pitcher_id else "",
        "team_name": pitcher.get("team_name") or "TBD",
        "opponent_name": pitcher.get("opponent_name") or "TBD",
        "is_home": pitcher.get("is_home"),
        "game_pk": pitcher.get("game_pk"),
        "game_time": pitcher.get("game_time"),
        "game_status": pitcher.get("game_status"),
        "venue": pitcher.get("venue"),
        "pitcher_hand": pitcher_hand,
        "season_stats": stats,
        "lineup_context_confirmed": confirmed_context,
        "lineup_context_projected": projected_context,
        "lineup_context_available": usable_lineup_context,
        "lineup_context_status": lineup_context_status,
        "reliability": reliability,
        "projected_strikeouts": projections["strikeouts"],
        "projected_outs_recorded": projections["outs_recorded"],
        "projected_hits_allowed": projections["hits_allowed"],
        "projected_walks_allowed": projections["walks_allowed"],
        "projected_earned_runs": projections["earned_runs"],
        "context_text": context_text,
        "k9": round(k9, 2),
        "h9": round(h9, 2),
        "bb9": round(bb9, 2),
        "era_matchup": round(era, 2),
    }

    return {
        **base,
        "scores": scores,
        "projections": projections,
        "probabilities": probabilities,
    }


def _reason_for(category: str, row: dict[str, Any]) -> str:
    if category == "strikeouts":
        return (
            f"{row['k9']:.1f} K/9 with a {row['projected_strikeouts']:.1f} "
            f"strikeout projection. {row['context_text']}"
        )
    if category == "outs_recorded":
        return (
            f"Season workload supports about {row['projected_outs_recorded']:.1f} "
            f"outs. {row['context_text']}"
        )
    if category == "hits_allowed":
        return (
            f"{row['h9']:.1f} H/9 produces a {row['projected_hits_allowed']:.1f} "
            f"hits-allowed projection. {row['context_text']}"
        )
    if category == "walks_allowed":
        return (
            f"{row['bb9']:.1f} BB/9 produces a {row['projected_walks_allowed']:.1f} "
            f"walks-allowed projection. {row['context_text']}"
        )
    return (
        f"Matchup-weighted ERA profile projects {row['projected_earned_runs']:.1f} "
        f"earned runs. {row['context_text']}"
    )


def get_pitcher_rankings(limit: int = 25) -> dict[str, Any]:
    lineups = get_mlb_lineups()

    projection = get_previous_day_lineup_projection(
        current_lineup_data=lineups,
    )
    projected_rows = projection.get("projected_hitters", []) if projection.get("success") else []

    by_game_team: dict[tuple[int, int], list[dict[str, Any]]] = {}
    for player in projected_rows:
        game_pk = _safe_int(player.get("game_pk"))
        team_id = _safe_int(player.get("team_id"))
        if game_pk and team_id:
            by_game_team.setdefault((game_pk, team_id), []).append(player)

    for game in lineups.get("games", []):
        game_pk = _safe_int(game.get("game_pk"))
        for side in ("away", "home"):
            if bool(game.get(f"{side}_lineup_confirmed")):
                game[f"{side}_lineup_projected"] = False
                continue

            team_id = _safe_int(game.get(f"{side}_team_id"))
            projected = by_game_team.get((game_pk, team_id), [])
            if projected:
                game[f"{side}_lineup"] = sorted(
                    projected,
                    key=lambda row: _safe_int(
                        row.get("batting_order") or row.get("projected_batting_order"),
                        99,
                    ),
                )[:9]
                game[f"{side}_lineup_projected"] = True
            else:
                game[f"{side}_lineup_projected"] = False

    pitcher_data = get_today_probable_pitchers_with_stats(lineup_data=lineups)

    games_by_pk = {
        _safe_int(game.get("game_pk")): game
        for game in lineups.get("games", [])
        if game.get("game_pk")
    }

    rows = [
        _build_pitcher_row(pitcher, games_by_pk)
        for pitcher in pitcher_data.get("pitchers", [])
        if pitcher.get("has_season_stats")
    ]

    rankings: dict[str, list[dict[str, Any]]] = {}

    for category in PITCHER_CATEGORIES:
        ordered = sorted(
            rows,
            key=lambda item: (
                -_safe_float(item.get("scores", {}).get(category)),
                -_safe_float(item.get("projections", {}).get(category)),
                str(item.get("pitcher_name") or ""),
            ),
        )[: max(1, int(limit))]

        rankings[category] = [
            {
                **row,
                "rank": rank,
                "category": category,
                "gi_score": row["scores"][category],
                "projection": row["projections"][category],
                "benchmark_probability": row["probabilities"][category],
                "why": _reason_for(category, row),
            }
            for rank, row in enumerate(ordered, start=1)
        ]

    return {
        "success": bool(rows),
        "rankings": rankings,
        "pitcher_count": len(rows),
        "date": pitcher_data.get("date"),
        "errors": pitcher_data.get("errors", []),
        "fetched_at": pitcher_data.get("fetched_at"),
    }
