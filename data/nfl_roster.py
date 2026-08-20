"""NFL roster and player identity helpers for Sach Sports Dashboard."""

from io import BytesIO

import pandas as pd
import requests
import streamlit as st


NFL_ROSTER_URL = (
    "https://github.com/nflverse/nflverse-data/releases/download/"
    "rosters/roster_{season}.parquet"
)


@st.cache_data(ttl=21600, show_spinner=False)
def load_nfl_roster(season: int = 2026) -> pd.DataFrame:
    """Load the current NFL roster and normalize stable player identity fields."""

    url = NFL_ROSTER_URL.format(season=season)

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

    required = [
        "player_id",
        "player_name",
        "team",
        "position",
    ]

    missing = [
        column
        for column in required
        if column not in roster.columns
    ]

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

    roster["team"] = (
        roster["team"]
        .astype(str)
        .str.upper()
        .str.strip()
    )

    roster["position"] = (
        roster["position"]
        .astype(str)
        .str.upper()
        .str.strip()
    )

    roster = roster.drop_duplicates(
        subset=["player_id"],
        keep="last",
    )

    return (
        roster
        .sort_values(["team", "position", "player_name"])
        .reset_index(drop=True)
    )


def get_team_roster(
    team: str,
    season: int = 2026,
) -> pd.DataFrame:
    """Return the roster for one NFL team."""

    roster = load_nfl_roster(season)

    return roster[
        roster["team"] == str(team).upper()
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


def get_team_skill_players(
    team: str,
    season: int = 2026,
) -> pd.DataFrame:
    """Return QB/RB/WR/TE players for one NFL team."""

    players = get_skill_players(season)

    return players[
        players["team"] == str(team).upper()
    ].reset_index(drop=True)
