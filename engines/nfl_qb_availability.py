"""NFL QB availability layer for Sach Sports Dashboard."""
import pandas as pd
from engines.nfl_passing_season_blend import build_passing_yards_blended_projection

STATUS_RULES = {
    "ACTIVE": ("Available", True, 1.00),
    "QUESTIONABLE": ("Monitor", True, 0.96),
    "DOUBTFUL": ("High Risk", False, 0.00),
    "OUT": ("Out", False, 0.00),
    "INACTIVE": ("Inactive", False, 0.00),
    "IR": ("Injured Reserve", False, 0.00),
    "PUP": ("PUP", False, 0.00),
}

def normalize_player_status(status):
    if status is None or pd.isna(status):
        return "UNKNOWN"
    value = str(status).strip().upper()
    aliases = {
        "Q": "QUESTIONABLE", "D": "DOUBTFUL", "O": "OUT",
        "RESERVE/INJURED": "IR", "INJURED RESERVE": "IR",
        "RESERVE/PUP": "PUP", "PHYSICALLY UNABLE TO PERFORM": "PUP",
    }
    return aliases.get(value, value)

def availability_rule(status):
    normalized = normalize_player_status(status)
    label, eligible, multiplier = STATUS_RULES.get(
        normalized, ("Status Unconfirmed", True, 1.00)
    )
    return normalized, label, eligible, multiplier

def apply_qb_availability(opponent_team, roster_season=2026, baseline_season=2025):
    """Apply availability without guessing which healthy QB is the starter."""
    df = build_passing_yards_blended_projection(
        opponent_team=opponent_team,
        roster_season=roster_season,
        baseline_season=baseline_season,
    ).copy()

    rules = df["status"].apply(availability_rule)
    df["normalized_status"] = rules.apply(lambda x: x[0])
    df["availability_label"] = rules.apply(lambda x: x[1])
    df["availability_eligible"] = rules.apply(lambda x: x[2])
    df["availability_multiplier"] = rules.apply(lambda x: x[3])

    def adjusted(row):
        projection = row.get("passing_yards_projection_blended")
        if pd.isna(projection) or not bool(row["availability_eligible"]):
            return pd.NA
        return round(float(projection) * float(row["availability_multiplier"]), 1)

    df["passing_yards_projection_available"] = df.apply(adjusted, axis=1)
    df["availability_note"] = df.apply(
        lambda r: (
            "Eligible pending starter confirmation"
            if r["availability_label"] == "Available"
            else "Eligible but injury status requires monitoring"
            if r["availability_label"] == "Monitor"
            else "Exclude from Passing Yards ranking"
            if not r["availability_eligible"]
            else "Eligibility requires status confirmation"
        ),
        axis=1,
    )
    return df.reset_index(drop=True)

def get_available_qb_projection(player_id, opponent_team, roster_season=2026, baseline_season=2025):
    df = apply_qb_availability(opponent_team, roster_season, baseline_season)
    row = df[df["player_id"] == player_id]
    return {} if row.empty else row.iloc[0].to_dict()
