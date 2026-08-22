"""NFL Passing Yards matchup foundation for Sach Sports Dashboard."""

import pandas as pd
import streamlit as st

from data.nfl_stats import load_nfl_weekly_player_stats


@st.cache_data(ttl=21600, show_spinner=False)
def build_passing_defense_baseline(
    season: int = 2025,
) -> pd.DataFrame:
    """
    Build opponent passing-defense baselines from historical QB game production.

    This is a matchup input for the Passing Yards engine, not a final projection.
    """

    weekly = load_nfl_weekly_player_stats(season).copy()

    required = {
        "week",
        "opponent_team",
        "passing_yards",
        "attempts",
        "completions",
        "passing_tds",
        "interceptions",
    }

    missing = required.difference(weekly.columns)

    if missing:
        raise ValueError(
            "NFL weekly stats are missing required matchup fields: "
            + ", ".join(sorted(missing))
        )

    qb_rows = weekly[
        weekly["position"] == "QB"
    ].copy()

    qb_rows["week"] = pd.to_numeric(
        qb_rows["week"],
        errors="coerce",
    )

    numeric_columns = [
        "passing_yards",
        "attempts",
        "completions",
        "passing_tds",
        "interceptions",
    ]

    for column in numeric_columns:
        qb_rows[column] = pd.to_numeric(
            qb_rows[column],
            errors="coerce",
        ).fillna(0)

    # Sum every QB's production in a game so split-QB games remain accurate.
    defense_games = (
        qb_rows
        .groupby(
            ["opponent_team", "week"],
            dropna=False,
        )[numeric_columns]
        .sum()
        .reset_index()
    )

    defense = (
        defense_games
        .groupby("opponent_team", dropna=False)
        .agg(
            games=("week", "nunique"),
            passing_yards_allowed=("passing_yards", "sum"),
            pass_attempts_faced=("attempts", "sum"),
            completions_allowed=("completions", "sum"),
            passing_tds_allowed=("passing_tds", "sum"),
            interceptions_made=("interceptions", "sum"),
        )
        .reset_index()
    )

    defense["passing_yards_allowed_per_game"] = (
        defense["passing_yards_allowed"]
        / defense["games"].replace(0, pd.NA)
    )

    defense["yards_allowed_per_attempt"] = (
        defense["passing_yards_allowed"]
        / defense["pass_attempts_faced"].replace(0, pd.NA)
    )

    defense["completion_rate_allowed"] = (
        defense["completions_allowed"]
        / defense["pass_attempts_faced"].replace(0, pd.NA)
    )

    defense["passing_tds_allowed_per_game"] = (
        defense["passing_tds_allowed"]
        / defense["games"].replace(0, pd.NA)
    )

    defense["interceptions_per_game"] = (
        defense["interceptions_made"]
        / defense["games"].replace(0, pd.NA)
    )

    league_avg = defense[
        "passing_yards_allowed_per_game"
    ].mean()

    defense["passing_matchup_index"] = (
        defense["passing_yards_allowed_per_game"]
        / league_avg
        * 100
    ).round(1)

    defense["passing_matchup_label"] = defense[
        "passing_matchup_index"
    ].apply(_label_matchup)

    return defense.sort_values(
        "passing_matchup_index",
        ascending=False,
    ).reset_index(drop=True)


def _label_matchup(index_value) -> str:
    """Translate passing-defense index into a simple matchup label."""

    if pd.isna(index_value):
        return "Unknown"

    if index_value >= 110:
        return "Very Favorable"

    if index_value >= 103:
        return "Favorable"

    if index_value <= 90:
        return "Very Difficult"

    if index_value <= 97:
        return "Difficult"

    return "Neutral"


def get_passing_matchup(
    opponent_team: str,
    season: int = 2025,
) -> dict:
    """Return one opponent's Passing Yards matchup baseline."""

    defense = build_passing_defense_baseline(season)

    row = defense[
        defense["opponent_team"]
        == str(opponent_team).upper()
    ]

    if row.empty:
        return {
            "opponent_team": str(opponent_team).upper(),
            "passing_matchup_label": "Unknown",
            "passing_matchup_index": None,
        }

    return row.iloc[0].to_dict()
