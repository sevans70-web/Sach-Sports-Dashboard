"""
Sach Sports Dashboard - NFL
---------------------------
File location: pages/nfl.py

NFL follows the MLB page structure so users have a consistent
experience when moving between sports.

NFL V1 launch props:
- Passing Yards
- Rushing Yards
- Receiving Yards
- Receptions
- Anytime TD
- First TD

Important:
- No placeholder player data.
- No fake rankings or projections.
- NFL data will be displayed only when real source data is available.
"""

import pandas as pd
import streamlit as st

from data.nfl_roster import (
    get_team_skill_players,
    load_nfl_roster,
)
from data.nfl_schedule import load_nfl_schedule


NFL_SEASON = 2026


def show():
    """Render the Sach Sports Dashboard NFL page."""

    st.title("🏈 NFL")

    st.caption(
        "Player Prop Intelligence • Matchup Analysis • "
        "Predictions • Performance Tracking"
    )

    nfl_tabs = st.tabs(
        [
            "🏈 Overview",
            "🧠 Game Intelligence",
            "📈 Results",
            "🎮 Games",
            "🎯 Player Props",
        ]
    )

    with nfl_tabs[0]:
        st.subheader("NFL Overview")

        try:
            roster = load_nfl_roster(NFL_SEASON)

            st.caption(
                f"{NFL_SEASON} roster data connected • "
                f"{roster['player_id'].nunique()} unique players"
            )

            teams = sorted(
                roster["team"]
                .dropna()
                .astype(str)
                .unique()
            )

            selected_team = st.selectbox(
                "Roster Check",
                teams,
                key="nfl_roster_team_selector",
            )

            team_players = get_team_skill_players(
                selected_team,
                NFL_SEASON,
            )

            st.caption(
                f"{selected_team} • "
                f"{len(team_players)} QB/RB/WR/TE players"
            )

            display_columns = [
                "player_name",
                "position",
                "status",
                "depth_chart_position",
                "player_id",
            ]

            st.dataframe(
                team_players[display_columns],
                use_container_width=True,
                hide_index=True,
            )

        except Exception as exc:
            st.warning(
                "NFL roster data is temporarily unavailable."
            )
            st.caption(f"Roster source detail: {exc}")

    with nfl_tabs[1]:
        st.subheader("Game Intelligence")

    with nfl_tabs[2]:
        st.subheader("Results")

    with nfl_tabs[3]:
        st.subheader("Games")

        season_type_label = st.selectbox(
            "Season Type",
            ["Preseason", "Regular Season"],
            key="nfl_season_type_selector",
        )

        game_type = (
            "PRE"
            if season_type_label == "Preseason"
            else "REG"
        )

        try:
            schedule = load_nfl_schedule(
                season=NFL_SEASON,
                game_type=game_type,
            )

            if schedule.empty:
                st.info(
                    f"No {NFL_SEASON} "
                    f"{season_type_label.lower()} games "
                    "are available yet."
                )
            else:
                available_weeks = sorted(
                    schedule["week"]
                    .dropna()
                    .astype(int)
                    .unique()
                )

                selected_week = st.selectbox(
                    "Select Week",
                    available_weeks,
                    key=f"nfl_week_selector_{game_type}",
                )

                week_games = schedule[
                    schedule["week"].astype(int)
                    == selected_week
                ]

                st.caption(
                    f"{NFL_SEASON} "
                    f"{season_type_label} "
                    f"• Week {selected_week}"
                )

                for _, game in week_games.iterrows():
                    kickoff = (
                        game["kickoff_et"].strftime(
                            "%a, %b %d • %I:%M %p ET"
                        )
                        if pd.notna(game["kickoff_et"])
                        else "Kickoff TBD"
                    )

                    if game["status"] == "Final":
                        matchup = (
                            f'{game["away_team"]} '
                            f'{int(game["away_score"])} '
                            f'@ {game["home_team"]} '
                            f'{int(game["home_score"])}'
                        )
                    else:
                        matchup = (
                            f'{game["away_team"]} '
                            f'@ {game["home_team"]}'
                        )

                    st.markdown(f"**{matchup}**")
                    st.caption(
                        f"{kickoff} • {game['status']}"
                    )

                    if game.get("stadium"):
                        st.caption(game["stadium"])

                    st.divider()

        except Exception as exc:
            st.warning(
                "NFL schedule data is temporarily unavailable."
            )
            st.caption(f"Schedule source detail: {exc}")

    with nfl_tabs[4]:
        st.subheader("Player Props")

        prop = st.selectbox(
            "Select Prop",
            [
                "Passing Yards",
                "Rushing Yards",
                "Receiving Yards",
                "Receptions",
                "Anytime TD",
                "First TD",
            ],
            key="nfl_prop_selector",
        )

        st.caption(f"Selected: {prop}")


show()
