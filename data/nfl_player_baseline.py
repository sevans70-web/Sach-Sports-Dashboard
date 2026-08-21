"""NFL player baseline helpers for Sach Sports Dashboard."""

import pandas as pd
import streamlit as st

from data.nfl_roster import load_nfl_roster
from data.nfl_stats import load_nfl_season_baseline


@st.cache_data(ttl=21600, show_spinner=False)
def build_nfl_player_baseline(
    roster_season: int = 2026,
    baseline_season: int = 2025,
) -> pd.DataFrame:
    """Join the current roster to prior-season stats by stable player ID."""

    roster = load_nfl_roster(roster_season).copy()
    history = load_nfl_season_baseline(baseline_season).copy()

    history = history.rename(
        columns={
            "player_display_name": "baseline_player_name",
            "position": "baseline_position",
            "recent_team": "baseline_team",
        }
    )

    merged = roster.merge(
        history,
        on="player_id",
        how="left",
        validate="one_to_one",
    )

    merged["has_previous_season_stats"] = merged["games_played"].notna()
    merged["baseline_type"] = merged["has_previous_season_stats"].map(
        {
            True: "Returning NFL player",
            False: "No prior NFL baseline",
        }
    )

    return merged.reset_index(drop=True)


def get_team_player_baseline(
    team: str,
    roster_season: int = 2026,
    baseline_season: int = 2025,
) -> pd.DataFrame:
    """Return linked roster/baseline rows for one team."""

    players = build_nfl_player_baseline(
        roster_season=roster_season,
        baseline_season=baseline_season,
    )

    return players[
        players["team"] == str(team).upper()
    ].reset_index(drop=True)


def get_prop_eligible_player_baseline(
    roster_season: int = 2026,
    baseline_season: int = 2025,
) -> pd.DataFrame:
    """Return QB/RB/WR/TE players used by NFL V1 prop engines."""

    players = build_nfl_player_baseline(
        roster_season=roster_season,
        baseline_season=baseline_season,
    )

    return players[
        players["position"].isin(["QB", "RB", "WR", "TE"])
    ].reset_index(drop=True)
