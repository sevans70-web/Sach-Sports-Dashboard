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


def _candidate_score(player: dict[str, Any], repeat_count: int = 0) -> float:
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

    # Emerging Power is intentionally biased toward developing/overlooked bats.
    if 0 < pa <= 175:
        score += 5.0
    elif 0 < pa <= 325:
        score += 2.5

    # Reward low-HR profiles and strongly de-emphasize established sluggers.
    if season_hr <= 5:
        score += 5.0
    elif season_hr <= 10:
        score += 3.0
    elif season_hr <= 15:
        score += 1.0

    # Players already prominent in the normal HR rankings should not dominate
    # the discovery feature.
    if hr_rank and hr_rank > 25:
        score += 4.0
    elif 1 <= hr_rank <= 10:
        score -= 8.0
    elif 11 <= hr_rank <= 25:
        score -= 4.0

    # Rotate the watch list. Repetition is allowed only when the signal remains
    # clearly strong; each recent appearance carries a meaningful penalty.
    score -= max(0, int(repeat_count)) * 6.0
    return score

def build_emerging_power_candidates(
    raw_home_run_rankings: list[dict[str, Any]],
    limit: int = 10,
    *,
    enrich_profiles: bool = True,
    recent_appearances: dict[str, int] | None = None,
) -> list[dict[str, Any]]:
    """
    Find overlooked low-HR / limited-sample hitters without using a 'due' heuristic.

    Candidate must show current power/matchup evidence in the existing GI home-run engine.
    Season HR is context, not the primary gate. Rookie/limited-sample hitters can receive Spring Training
    context when MLB exposes it.
    """
    candidates: list[dict[str, Any]] = []
    recent_appearances = recent_appearances or {}

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

        # Hard identity gate: this feature is for overlooked/developing power,
        # not the players already being surfaced in the normal Top 25.
        hr_rank = int(_num(player.get("rank") or player.get("hr_rank")))
        if 1 <= hr_rank <= 25:
            continue

        # Established sluggers do not belong here. Keep a low-HR pool, with a
        # small allowance for developing/limited-sample hitters.
        if season_hr > 18:
            continue
        if season_hr > 15 and not (0 < pa <= 325):
            continue

        # Evidence-first gate: require actual upside evidence from the existing
        # model/contact signals. No "due" heuristic.
        has_power_evidence = (
            gi >= 52
            or probability >= 10
            or recent_hr >= 1
            or barrel >= 9
            or hard_hit >= 42
            or bool(why)
        )
        if not has_power_evidence:
            continue

        player_key = str(
            player.get("player_id")
            or player.get("player_name")
            or player.get("player")
            or ""
        ).strip().casefold()
        repeat_count = int(recent_appearances.get(player_key, 0) or 0)

        # If a player has already appeared on two or more recent Emerging Power
        # lists, require a stronger current signal before allowing another repeat.
        if repeat_count >= 2 and gi < 62 and probability < 15 and recent_hr < 2:
            continue

        row = dict(player)
        row["season_home_runs"] = season_hr
        row["season_plate_appearances"] = pa
        row["recent_emerging_appearances"] = repeat_count
        row["emerging_score"] = _candidate_score(player, repeat_count=repeat_count)
        row["limited_sample"] = bool(0 < pa <= 325)
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

    if player.get("current_year_debut"):
        profile = "current-year rookie/debut"
    elif player.get("limited_sample"):
        profile = "developing/limited MLB sample"
    elif season_hr <= 10:
        profile = "low-HR overlooked bat"
    else:
        profile = "under-the-radar power profile"

    evidence.append(
        f"{profile.capitalize()}: {season_hr} season HR, GI {gi:.1f}"
        + (f" across {pa} PA" if pa else "")
        + ". Surfaced because current matchup/contact evidence is stronger than the season-HR total alone suggests."
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
