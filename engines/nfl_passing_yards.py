"""NFL Passing Yards foundation for Sach Sports Dashboard."""

import pandas as pd
import streamlit as st

from data.nfl_player_baseline import get_prop_eligible_player_baseline
from data.nfl_stats import load_nfl_weekly_player_stats


@st.cache_data(ttl=21600, show_spinner=False)
def build_passing_yards_foundation(
    roster_season: int = 2026,
    baseline_season: int = 2025,
) -> pd.DataFrame:
    """
    Build the historical foundation for the NFL Passing Yards engine.

    This is NOT the final prop projection yet.
    It prepares the stable baseline metrics that later receive current 2026 usage,
    matchup, injuries, weather, sportsbook line, GI and recommendation logic.
    """

    players = get_prop_eligible_player_baseline(
        roster_season=roster_season,
        baseline_season=baseline_season,
    ).copy()

    qbs = players[players["position"] == "QB"].copy()

    weekly = load_nfl_weekly_player_stats(baseline_season).copy()
    weekly = weekly[weekly["position"] == "QB"].copy()
    weekly["week"] = pd.to_numeric(weekly["week"], errors="coerce")
    weekly = weekly.sort_values(["player_id", "week"])

    recent_rows = []

    for player_id, group in weekly.groupby("player_id"):
        group = group.sort_values("week")
        last_5 = group.tail(5)
        last_3 = group.tail(3)

        season_attempts = group["attempts"].sum()
        season_yards = group["passing_yards"].sum()
        season_completions = group["completions"].sum()

        recent_rows.append(
            {
                "player_id": player_id,
                "last_5_passing_yards_per_game": (
                    last_5["passing_yards"].mean()
                    if not last_5.empty else pd.NA
                ),
                "last_3_passing_yards_per_game": (
                    last_3["passing_yards"].mean()
                    if not last_3.empty else pd.NA
                ),
                "last_5_attempts_per_game": (
                    last_5["attempts"].mean()
                    if not last_5.empty else pd.NA
                ),
                "season_yards_per_attempt": (
                    season_yards / season_attempts
                    if season_attempts > 0 else pd.NA
                ),
                "season_completion_rate": (
                    season_completions / season_attempts
                    if season_attempts > 0 else pd.NA
                ),
            }
        )

    recent = pd.DataFrame(recent_rows)

    if not recent.empty:
        qbs = qbs.merge(
            recent,
            on="player_id",
            how="left",
            validate="one_to_one",
        )

    qbs["passing_data_status"] = qbs.apply(
        lambda row: (
            "Established baseline"
            if bool(row.get("has_previous_season_stats"))
            and float(row.get("attempts", 0) or 0) >= 100
            else (
                "Limited baseline"
                if bool(row.get("has_previous_season_stats"))
                else "No prior NFL baseline"
            )
        ),
        axis=1,
    )

    qbs["passing_baseline_score"] = qbs.apply(
        _calculate_historical_baseline,
        axis=1,
    )

    return qbs.reset_index(drop=True)


def _calculate_historical_baseline(row: pd.Series):
    """Blend season and recent production into a historical passing baseline."""

    season_avg = row.get("passing_yards_per_game")
    last_5 = row.get("last_5_passing_yards_per_game")
    last_3 = row.get("last_3_passing_yards_per_game")

    if pd.isna(season_avg):
        return pd.NA

    values = [
        (season_avg, 0.55),
        (last_5, 0.25),
        (last_3, 0.20),
    ]

    weighted_total = 0.0
    weight_total = 0.0

    for value, weight in values:
        if pd.notna(value):
            weighted_total += float(value) * weight
            weight_total += weight

    if weight_total == 0:
        return pd.NA

    return round(weighted_total / weight_total, 1)


def get_team_passing_yards_foundation(
    team: str,
    roster_season: int = 2026,
    baseline_season: int = 2025,
) -> pd.DataFrame:
    """Return Passing Yards foundation rows for one current NFL team."""

    qbs = build_passing_yards_foundation(
        roster_season=roster_season,
        baseline_season=baseline_season,
    )

    return qbs[
        qbs["team"] == str(team).upper()
    ].reset_index(drop=True)
