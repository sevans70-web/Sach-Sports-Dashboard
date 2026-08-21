"""Temporary NFL baseline verification helper."""

import streamlit as st

from data.nfl_player_baseline import get_team_player_baseline


def render_nfl_baseline_check(
    team: str,
    roster_season: int = 2026,
    baseline_season: int = 2025,
) -> None:
    """Show current roster players with their prior-season baseline."""

    players = get_team_player_baseline(
        team=team,
        roster_season=roster_season,
        baseline_season=baseline_season,
    )

    prop_players = players[
        players["position"].isin(["QB", "RB", "WR", "TE"])
    ].copy()

    columns = [
        "player_name",
        "position",
        "baseline_type",
        "baseline_team",
        "games_played",
        "passing_yards_per_game",
        "rushing_yards_per_game",
        "receiving_yards_per_game",
        "receptions_per_game",
    ]

    visible = [c for c in columns if c in prop_players.columns]

    st.caption(
        f"{team} • {baseline_season} baseline linked to "
        f"{roster_season} roster"
    )
    st.dataframe(
        prop_players[visible],
        use_container_width=True,
        hide_index=True,
    )
