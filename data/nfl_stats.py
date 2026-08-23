"""NFL player statistics helpers for Sach Sports Dashboard."""

from io import BytesIO

import pandas as pd
import requests
import streamlit as st


PLAYER_STATS_URL = (
    "https://github.com/nflverse/nflverse-data/releases/download/"
    "stats_player/stats_player_week_{season}.parquet"
)


@st.cache_data(ttl=21600, show_spinner=False)
def load_nfl_weekly_player_stats(season: int = 2025) -> pd.DataFrame:
    """Load weekly NFL player stats for one season from nflverse."""

    response = requests.get(
        PLAYER_STATS_URL.format(season=season),
        timeout=30,
    )
    response.raise_for_status()

    stats = pd.read_parquet(BytesIO(response.content))

    # nflverse renamed the old `interceptions` passing field to
    # `passing_interceptions`. Normalize it here so the rest of Sach can
    # continue using the existing engine field name safely.
    if (
        "passing_interceptions" in stats.columns
        and "interceptions" not in stats.columns
    ):
        stats["interceptions"] = stats["passing_interceptions"]

    # nflverse weekly data may now use `team` instead of `recent_team`.
    if "team" in stats.columns and "recent_team" not in stats.columns:
        stats["recent_team"] = stats["team"]

    required = [
        "player_id",
        "player_display_name",
        "position",
        "recent_team",
        "opponent_team",
        "season",
        "week",
        "season_type",
        "completions",
        "attempts",
        "passing_yards",
        "passing_tds",
        "interceptions",
        "carries",
        "rushing_yards",
        "rushing_tds",
        "targets",
        "receptions",
        "receiving_yards",
        "receiving_tds",
    ]

    available = [
        column
        for column in required
        if column in stats.columns
    ]

    stats = stats[available].copy()

    if "season_type" in stats.columns:
        stats = stats[
            stats["season_type"].astype(str).str.upper() == "REG"
        ].copy()

    if "season" in stats.columns:
        stats = stats[
            pd.to_numeric(
                stats["season"],
                errors="coerce",
            )
            == season
        ].copy()

    numeric_columns = [
        "week",
        "completions",
        "attempts",
        "passing_yards",
        "passing_tds",
        "interceptions",
        "carries",
        "rushing_yards",
        "rushing_tds",
        "targets",
        "receptions",
        "receiving_yards",
        "receiving_tds",
    ]

    for column in numeric_columns:
        if column in stats.columns:
            stats[column] = pd.to_numeric(
                stats[column],
                errors="coerce",
            ).fillna(0)

    return stats.reset_index(drop=True)


@st.cache_data(ttl=21600, show_spinner=False)
def load_nfl_season_baseline(season: int = 2025) -> pd.DataFrame:
    """Aggregate weekly regular-season player stats into one season baseline."""

    weekly = load_nfl_weekly_player_stats(season)

    if weekly.empty:
        return weekly

    identity_columns = [
        column
        for column in [
            "player_id",
            "player_display_name",
            "position",
            "recent_team",
        ]
        if column in weekly.columns
    ]

    stat_columns = [
        column
        for column in [
            "completions",
            "attempts",
            "passing_yards",
            "passing_tds",
            "interceptions",
            "carries",
            "rushing_yards",
            "rushing_tds",
            "targets",
            "receptions",
            "receiving_yards",
            "receiving_tds",
        ]
        if column in weekly.columns
    ]

    baseline = (
        weekly
        .groupby(identity_columns, dropna=False)[stat_columns]
        .sum()
        .reset_index()
    )

    games = (
        weekly
        .groupby(identity_columns, dropna=False)["week"]
        .nunique()
        .reset_index(name="games_played")
    )

    baseline = baseline.merge(
        games,
        on=identity_columns,
        how="left",
    )

    baseline["passing_yards_per_game"] = (
        baseline["passing_yards"]
        / baseline["games_played"].replace(0, pd.NA)
    )

    baseline["rushing_yards_per_game"] = (
        baseline["rushing_yards"]
        / baseline["games_played"].replace(0, pd.NA)
    )

    baseline["receiving_yards_per_game"] = (
        baseline["receiving_yards"]
        / baseline["games_played"].replace(0, pd.NA)
    )

    baseline["receptions_per_game"] = (
        baseline["receptions"]
        / baseline["games_played"].replace(0, pd.NA)
    )

    baseline["targets_per_game"] = (
        baseline["targets"]
        / baseline["games_played"].replace(0, pd.NA)
    )

    return baseline.reset_index(drop=True)
