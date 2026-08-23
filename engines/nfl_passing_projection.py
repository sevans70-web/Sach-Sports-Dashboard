"""NFL Passing Yards projection foundation."""

import pandas as pd

from engines.nfl_passing_matchup import get_passing_matchup
from engines.nfl_passing_yards import build_passing_yards_foundation


def _clamp(value, low, high):
    return max(low, min(high, value))


def build_passing_yards_projection(
    opponent_team,
    roster_season=2026,
    baseline_season=2025,
):
    """Combine historical QB baseline with opponent passing matchup."""

    qbs = build_passing_yards_foundation(
        roster_season,
        baseline_season,
    ).copy()

    matchup = get_passing_matchup(
        opponent_team,
        baseline_season,
    )

    idx = matchup.get("passing_matchup_index")

    multiplier = (
        1.0
        if idx is None or pd.isna(idx)
        else _clamp(
            float(idx) / 100.0,
            0.88,
            1.12,
        )
    )

    qbs["opponent_team"] = str(opponent_team).upper()
    qbs["passing_matchup_index"] = idx
    qbs["passing_matchup_label"] = matchup.get(
        "passing_matchup_label",
        "Unknown",
    )
    qbs["matchup_multiplier"] = float(
        round(multiplier, 3)
    )

    # Force projection inputs to numeric before rounding.
    # This prevents missing merged baseline values from being treated
    # as pandas NaT/datetime objects.
    qbs["passing_yards_projection_base"] = pd.to_numeric(
        qbs["passing_baseline_score"],
        errors="coerce",
    )

    qbs["passing_yards_projection_matchup"] = pd.to_numeric(
        qbs["passing_yards_projection_base"],
        errors="coerce",
    ) * float(multiplier)

    qbs["passing_yards_projection_matchup"] = (
        qbs["passing_yards_projection_matchup"]
        .astype("Float64")
        .round(1)
    )

    qbs["projection_data_status"] = qbs.apply(
        _status,
        axis=1,
    )

    return qbs.reset_index(drop=True)


def _status(row):
    if row.get("passing_data_status") == "No prior NFL baseline":
        return "Needs current-season data"

    if pd.isna(
        row.get("passing_yards_projection_base")
    ):
        return "Insufficient historical data"

    if row.get("passing_matchup_label") == "Unknown":
        return "Baseline only"

    return "Historical + matchup"


def get_qb_passing_projection(
    player_id,
    opponent_team,
    roster_season=2026,
    baseline_season=2025,
):
    """Return one QB projection foundation."""

    df = build_passing_yards_projection(
        opponent_team,
        roster_season,
        baseline_season,
    )

    row = df[df["player_id"] == player_id]

    return (
        {}
        if row.empty
        else row.iloc[0].to_dict()
    )
