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
    """Rank developing power using GI + current power evidence, not low-HR totals alone."""
    gi = _num(player.get("gi_score"))
    probability = _num(player.get("home_run_probability"))
    season_hr = _season_hr(player)
    recent_hr = _recent_hr(player)
    pa = _season_pa(player)
    statcast = player.get("statcast", {}) or {}
    barrel = _num(statcast.get("barrel_rate"))
    hard_hit = _num(statcast.get("hard_hit_rate"))
    xslg = _num(statcast.get("xslg"))
    hr_rank = int(_num(player.get("rank") or player.get("hr_rank")))

    score = gi + probability * 0.22
    score += min(recent_hr, 4) * 2.2
    score += min(max(barrel - 7.0, 0.0), 10.0) * 0.65
    score += min(max(hard_hit - 38.0, 0.0), 18.0) * 0.22
    score += min(max(xslg - 0.400, 0.0), 0.250) * 18.0

    # Limited samples can still emerge, but this is a modest context bonus rather
    # than the dominant reason a player qualifies.
    if 0 < pa <= 130:
        score += 1.5

    # Encourage genuinely overlooked candidates without banning Top-25 overlap.
    if hr_rank and hr_rank > 25:
        score += 3.0
    elif 1 <= hr_rank <= 10:
        score -= 1.5

    # Season HR is only a light discovery signal now.
    if season_hr <= 5:
        score += 1.0
    return score

def build_emerging_power_candidates(
    raw_home_run_rankings: list[dict[str, Any]],
    limit: int = 10,
    *,
    enrich_profiles: bool = True,
) -> list[dict[str, Any]]:
    """
    Find overlooked low-HR / limited-sample hitters without using a 'due' heuristic.

    Candidate must show current power/matchup evidence in the existing GI home-run engine.
    Season HR is context, not the primary gate. Rookie/limited-sample hitters can receive Spring Training
    context when MLB exposes it.
    """
    candidates: list[dict[str, Any]] = []

    for player in raw_home_run_rankings:
        season_hr = _season_hr(player)
        pa = _season_pa(player)
        gi = _num(player.get("gi_score"))
        probability = _num(player.get("home_run_probability"))

        statcast = player.get("statcast", {}) or {}
        barrel = _num(statcast.get("barrel_rate"))
        hard_hit = _num(statcast.get("hard_hit_rate"))
        recent_hr = _recent_hr(player)
        why = [str(x) for x in (player.get("why") or []) if str(x).strip()]

        # Evidence-first gate: GI/probability, recent HR activity, Statcast quality,
        # or a specific model reason can qualify a player. No "due" heuristic.
        has_power_evidence = (
            gi >= 48
            or probability >= 8
            or recent_hr >= 1
            or barrel >= 9
            or hard_hit >= 42
            or bool(why)
        )
        if not has_power_evidence:
            continue
        # Keep the feature truly "emerging" without restricting it to tiny HR totals.
        if season_hr > 14 and recent_hr < 2 and gi < 58 and probability < 14:
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
        if enrich_profiles and row.get("limited_sample"):
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
        f"Emerging score is driven by today's GI profile ({gi:.1f})"
        + (f" across a {pa}-PA season sample" if pa else "")
        + f"; season HR ({season_hr}) is context, not the reason for inclusion."
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


    statcast = player.get("statcast", {}) or {}
    barrel = _num(statcast.get("barrel_rate"))
    hard_hit = _num(statcast.get("hard_hit_rate"))
    if barrel or hard_hit:
        pieces = []
        if barrel:
            pieces.append(f"{barrel:.1f}% barrel rate")
        if hard_hit:
            pieces.append(f"{hard_hit:.1f}% hard-hit rate")
        evidence.append("Contact quality: " + " · ".join(pieces) + ".")

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
