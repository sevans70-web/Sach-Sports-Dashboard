import streamlit as st


def render_player_card(player_data: dict) -> None:
    """Render detailed information for one ranked MLB player."""

    player_name = str(
        player_data.get("player_name", "Unknown Player")
    )
    team = str(player_data.get("team_abbreviation", ""))
    opponent = str(
        player_data.get("opponent_abbreviation", "")
    )
    confidence = str(
        player_data.get("confidence", "Low")
    )

    gi_score = float(
        player_data.get("gi_score", 0.0) or 0.0
    )

    batting_order = player_data.get("batting_order")
    lineup_confirmed = bool(
        player_data.get("lineup_confirmed")
    )

    pitcher = str(
        player_data.get(
            "opposing_probable_pitcher",
            "Not announced",
        )
    )

    why = player_data.get("why", []) or []
    risk_flags = player_data.get("risk_flags", []) or []

    st.markdown(f"### {player_name}")

    st.caption(
        f"{team} vs {opponent} • "
        f"GI Score {gi_score:.1f} • "
        f"{confidence} Confidence"
    )

    if lineup_confirmed and batting_order:
        st.write(
            f"**Lineup:** Confirmed — batting #{batting_order}"
        )
    else:
        st.write("**Lineup:** Not yet confirmed")

    st.write(f"**Opposing Pitcher:** {pitcher}")

    if why:
        st.markdown("**Why this player ranks here**")
        for reason in why:
            st.write(f"• {reason}")

    if risk_flags:
        st.markdown("**Things to watch**")
        for flag in risk_flags:
            st.write(f"• {flag}")

