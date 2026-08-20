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
