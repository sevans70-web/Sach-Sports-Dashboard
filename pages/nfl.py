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

import streamlit as st

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

    with nfl_tabs[1]:
        st.subheader("Game Intelligence")

    with nfl_tabs[2]:
        st.subheader("Results")

    with nfl_tabs[3]:
        st.subheader("Games")

        try:
            schedule = load_nfl_schedule(NFL_SEASON)

            if schedule.empty:
                st.info(f"No {NFL_SEASON} regular-season games are available yet.")
            else:
                available_weeks = sorted(schedule["week"].dropna().astype(int).unique())

                selected_week = st.selectbox(
                    "Select Week",
                    available_weeks,
                    key="nfl_week_selector",
                )

                week_games = schedule[
                    schedule["week"].astype(int) == selected_week
                ]

                st.caption(
                    f"{NFL_SEASON} Regular Season • Week {selected_week}"
                )

                for _, game in week_games.iterrows():
                    kickoff = (
                        game["kickoff_et"].strftime("%a, %b %d • %I:%M %p ET")
                        if game["kickoff_et"] is not None
                        and not game["kickoff_et"].__class__.__name__ == "NaTType"
                        else "Kickoff TBD"
                    )

                    if game["status"] == "Final":
                        matchup = (
                            f'{game["away_team"]} {int(game["away_score"])} '
                            f'@ {game["home_team"]} {int(game["home_score"])}'
                        )
                    else:
                        matchup = f'{game["away_team"]} @ {game["home_team"]}'

                    st.markdown(f"**{matchup}**")
                    st.caption(f"{kickoff} • {game['status']}")
                    st.divider()

        except Exception:
            st.warning(
                "NFL schedule data is temporarily unavailable. "
                "Please refresh the page shortly."
            )

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
