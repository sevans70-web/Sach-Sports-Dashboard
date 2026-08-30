"""Emerging-power intelligence for low-HR and limited-sample MLB hitters."""

from __future__ import annotations

from datetime import datetime
from typing import Any
from zoneinfo import ZoneInfo

from data.mlb_player_profile import (
    get_player_bio,
    get_spring_training_hitting,
)


TORONTO_TIMEZONE = ZoneInfo("America/Toronto")


def _num(value: Any) -> float:
    try:
        return float(value or 0)
    except (TypeError, ValueError):
        return 0.0


def _season_hr(player: dict[str, Any]) -> int:
    season = player.get("season_stats", {}) or {}
    return int(_num(season.get("home_runs") or season.get("homeRuns")))


def _season_pa(player: dict[str, Any]) -> int:
    season = player.get("season_stats", {}) or {}
    return int(
        _num(
            season.get("plate_appearances")
            or season.get("plateAppearances")
            or season.get("pa")
        )
    )


def _recent_hr(player: dict[str, Any]) -> int:
    recent = player.get("recent_stats", {}) or {}
    return int(_num(recent.get("home_runs") or recent.get("homeRuns")))


def _candidate_score(player: dict[str, Any]) -> float:
    """Use the existing GI engine as the base, then reward low-HR hidden upside."""
    gi = _num(player.get("gi_score"))
    probability = _num(player.get("home_run_probability"))
    season_hr = _season_hr(player)
    recent_hr = _recent_hr(player)
    pa = _season_pa(player)

    low_hr_bonus = max(0.0, 8.0 - min(season_hr, 8)) * 0.7
    limited_sample_bonus = 3.0 if 0 < pa <= 130 else 0.0
    recent_power_bonus = min(recent_hr, 3) * 1.8

    return gi + (probability * 0.18) + low_hr_bonus + limited_sample_bonus + recent_power_bonus


def build_emerging_power_candidates(
    raw_home_run_rankings: list[dict[str, Any]],
    limit: int = 10,
) -> list[dict[str, Any]]:
    """
    Find overlooked low-HR / limited-sample hitters without using a 'due' heuristic.

    Candidate must have <= 8 season HR and still grade positively in the existing
    GI home-run engine. Rookie/limited-sample hitters can receive Spring Training
    context when MLB exposes it.
    """
    candidates: list[dict[str, Any]] = []

    for player in raw_home_run_rankings:
        season_hr = _season_hr(player)
        pa = _season_pa(player)
        gi = _num(player.get("gi_score"))
        probability = _num(player.get("home_run_probability"))

        if season_hr > 8:
            continue

        # Keep the hook evidence-driven: no one is included simply because
        # their HR total is low.
        why = [str(x) for x in (player.get("why") or []) if str(x).strip()]
        if gi < 50 and probability < 8 and not why:
            continue

        row = dict(player)
        row["season_home_runs"] = season_hr
        row["season_plate_appearances"] = pa
        row["emerging_score"] = _candidate_score(player)
        row["limited_sample"] = bool(0 < pa <= 130)
        candidates.append(row)

    candidates.sort(
        key=lambda p: (
            -float(p.get("emerging_score") or 0),
            int(p.get("season_home_runs") or 0),
        )
    )

    # Only enrich the strongest limited-sample candidates; this keeps the page fast.
    enriched = []
    current_year = datetime.now(TORONTO_TIMEZONE).year
    for row in candidates[: max(limit * 2, 12)]:
        if row.get("limited_sample"):
            player_id = int(row.get("player_id") or 0)
            if player_id:
                bio = get_player_bio(player_id)
                spring = get_spring_training_hitting(player_id, current_year)
                row["player_bio"] = bio
                row["spring_training"] = spring
                debut = str(bio.get("mlb_debut_date") or "")
                row["current_year_debut"] = debut.startswith(str(current_year))
        enriched.append(row)

    return enriched[:limit]


def emerging_power_explanation(player: dict[str, Any]) -> list[str]:
    """Create concise, teachable evidence for why this low-HR hitter is surfaced."""
    evidence: list[str] = []
    season_hr = int(player.get("season_home_runs") or 0)
    pa = int(player.get("season_plate_appearances") or 0)
    gi = _num(player.get("gi_score"))
    probability = _num(player.get("home_run_probability"))

    evidence.append(
        f"Only {season_hr} season HR"
        + (f" in {pa} PA" if pa else "")
        + f", but today's GI profile is {gi:.1f}."
    )

    if probability:
        evidence.append(
            f"Today's model still assigns {probability:.0f}% HR probability, "
            "so the signal comes from matchup/contact inputs rather than a 'due' assumption."
        )

    for reason in (player.get("why") or [])[:2]:
        clean = str(reason).strip()
        if clean:
            evidence.append(clean)

    spring = player.get("spring_training", {}) or {}
    if spring.get("at_bats"):
        evidence.append(
            "Spring Training context: "
            f"{int(spring.get('home_runs') or 0)} HR, "
            f"{int(spring.get('hits') or 0)} hits in "
            f"{int(spring.get('at_bats') or 0)} AB."
        )

    if player.get("current_year_debut"):
        evidence.append(
            "This is a current-year MLB debut, so the regular-season sample is still developing."
        )
    elif player.get("limited_sample"):
        evidence.append(
            "The MLB sample is limited, so recent and Spring Training evidence is weighted as context, not certainty."
        )

    return evidence[:4]
