"""NFL roster and player identity helpers for Sach Sports Dashboard."""

from io import BytesIO

import pandas as pd
import requests
import streamlit as st


NFL_ROSTER_URL = (
    "https://github.com/nflverse/nflverse-data/releases/download/"
    "rosters/roster_2026.parquet"
)


@st.cache_data(ttl=21600, show_spinner=False)
def load_nfl_roster(season: int = 2026) -> pd.DataFrame:
    """Load the current NFL roster and normalize stable player identity fields."""

    url = NFL_ROSTER_URL.replace("2026", str(season))
    response = requests.get(url, timeout=30)
    response.raise_for_status()

    roster = pd.read_parquet(BytesIO(response.content))

    rename_map = {
        "gsis_id": "player_id",
        "full_name": "player_name",
        "team": "team",
        "position": "position",
        "depth_chart_position": "depth_chart_position",
        "status": "status",
        "headshot_url": "headshot_url",
    }

    available = {
        source: target
        for source, target in rename_map.items()
        if source in roster.columns
    }

    roster = roster.rename(columns=available)

    required = ["player_id", "player_name", "team", "position"]
    missing = [column for column in required if column not in roster.columns]

    if missing:
        raise ValueError(
            "NFL roster source is missing required fields: "
            + ", ".join(missing)
        )

    optional = [
        "depth_chart_position",
        "status",
        "headshot_url",
    ]

    for column in optional:
        if column not in roster.columns:
            roster[column] = None

    roster = roster[
        required + optional
    ].copy()

    roster = roster.dropna(
        subset=["player_id", "player_name", "team"]
    )

    roster = roster.drop_duplicates(
        subset=["player_id"],
        keep="last",
    )

    return roster.sort_values(
        ["team", "position", "player_name"]
    ).reset_index(drop=True)


def get_team_roster(
    team: str,
    season: int = 2026,
) -> pd.DataFrame:
    """Return the roster for one NFL team."""

    roster = load_nfl_roster(season)

    return roster[
        roster["team"] == team
    ].reset_index(drop=True)


def get_skill_players(
    season: int = 2026,
) -> pd.DataFrame:
    """Return players relevant to the six NFL V1 player-prop engines."""

    roster = load_nfl_roster(season)

    prop_positions = ["QB", "RB", "WR", "TE"]

    return roster[
        roster["position"].isin(prop_positions)
    ].reset_index(drop=True)
