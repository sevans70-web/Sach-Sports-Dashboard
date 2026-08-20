"""NFL schedule data helpers for Sach Sports Dashboard."""

from io import StringIO

import pandas as pd
import requests
import streamlit as st


NFL_SCHEDULE_URL = (
    "https://raw.githubusercontent.com/nflverse/nfldata/master/data/games.csv"
)


@st.cache_data(ttl=300, show_spinner=False)
def load_nfl_schedule(
    season: int = 2026,
    game_type: str = "REG",
) -> pd.DataFrame:
    """Load and normalize NFL preseason or regular-season games from nflverse."""

    response = requests.get(NFL_SCHEDULE_URL, timeout=20)
    response.raise_for_status()

    schedule = pd.read_csv(StringIO(response.text), low_memory=False)

    schedule = schedule[
        (schedule["season"] == season)
        & (schedule["game_type"] == game_type)
    ].copy()

    schedule["gameday"] = pd.to_datetime(
        schedule["gameday"], errors="coerce"
    )

    schedule["kickoff_et"] = pd.to_datetime(
        schedule["gameday"].dt.strftime("%Y-%m-%d")
        + " "
        + schedule["gametime"].fillna("00:00"),
        errors="coerce",
    )

    schedule["status"] = schedule.apply(
        lambda row: (
            "Final"
            if pd.notna(row.get("home_score"))
            and pd.notna(row.get("away_score"))
            else "Scheduled"
        ),
        axis=1,
    )

    columns = [
        "game_id",
        "season",
        "week",
        "game_type",
        "gameday",
        "weekday",
        "gametime",
        "kickoff_et",
        "away_team",
        "home_team",
        "away_score",
        "home_score",
        "status",
        "roof",
        "stadium",
    ]

    return (
        schedule[columns]
        .sort_values(["week", "kickoff_et", "game_id"])
        .reset_index(drop=True)
    )
