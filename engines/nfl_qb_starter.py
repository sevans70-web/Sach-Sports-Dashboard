"""NFL QB starter eligibility layer for Sach Sports Dashboard."""

import pandas as pd

from engines.nfl_qb_availability import apply_qb_availability


STARTER_VALUES = {
    "QB1",
    "STARTER",
    "1",
}


def normalize_depth_chart_position(value) -> str:
    """Normalize depth-chart values without guessing when data is missing."""

    if value is None or pd.isna(value):
        return "UNKNOWN"

    return str(value).strip().upper().replace(" ", "")


def is_confirmed_qb1(value) -> bool:
    """Return True only when the source explicitly identifies QB1/starter."""

    normalized = normalize_depth_chart_position(value)

    return normalized in STARTER_VALUES


def apply_qb_starter_eligibility(
    opponent_team: str,
    roster_season: int = 2026,
    baseline_season: int = 2025,
) -> pd.DataFrame:
    """
    Add starter eligibility after availability filtering.

    A healthy backup must not enter Passing Yards rankings simply because
    historical statistics exist. Missing depth-chart information remains
    unconfirmed rather than being guessed.
    """

    qbs = apply_qb_availability(
        opponent_team=opponent_team,
        roster_season=roster_season,
        baseline_season=baseline_season,
    ).copy()

    qbs["normalized_depth_chart_position"] = qbs[
        "depth_chart_position"
    ].apply(normalize_depth_chart_position)

    qbs["starter_confirmed"] = qbs[
        "depth_chart_position"
    ].apply(is_confirmed_qb1)

    qbs["passing_prop_eligible"] = (
        qbs["availability_eligible"]
        & qbs["starter_confirmed"]
    )

    qbs["starter_status"] = qbs.apply(
        _starter_status,
        axis=1,
    )

    qbs["passing_yards_projection_eligible"] = qbs.apply(
        _eligible_projection,
        axis=1,
    )

    return qbs.reset_index(drop=True)


def _starter_status(row: pd.Series) -> str:
    """Explain why a QB is or is not eligible for ranking."""

    if not bool(row.get("availability_eligible")):
        return "Unavailable"

    if bool(row.get("starter_confirmed")):
        return "Confirmed starter"

    depth = row.get("normalized_depth_chart_position")

    if depth == "UNKNOWN":
        return "Starter unconfirmed"

    return "Not QB1"


def _eligible_projection(row: pd.Series):
    """Expose a projection only when the QB passes both eligibility gates."""

    if not bool(row.get("passing_prop_eligible")):
        return pd.NA

    projection = row.get("passing_yards_projection_available")

    if pd.isna(projection):
        return pd.NA

    return round(float(projection), 1)


def get_passing_yards_eligible_qbs(
    opponent_team: str,
    roster_season: int = 2026,
    baseline_season: int = 2025,
) -> pd.DataFrame:
    """Return only confirmed, available QB1 candidates."""

    qbs = apply_qb_starter_eligibility(
        opponent_team=opponent_team,
        roster_season=roster_season,
        baseline_season=baseline_season,
    )

    return qbs[
        qbs["passing_prop_eligible"]
    ].reset_index(drop=True)
