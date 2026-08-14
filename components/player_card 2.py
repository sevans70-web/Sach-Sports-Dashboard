import streamlit as st

from data.mlb_statcast import (
    get_statcast_batter,
    load_statcast_batter_metrics,
)


def _number(value: object, digits: int = 3) -> str:
    """Format a decimal statistic or return an unavailable marker."""
    try:
        return f"{float(value):.{digits}f}"
    except (TypeError, ValueError):
        return "—"


def _percent(value: object, digits: int = 1) -> str:
    """Format a percentage statistic or return an unavailable marker."""
    try:
        return f"{float(value):.{digits}f}%"
    except (TypeError, ValueError):
        return "—"


def render_player_card(player_data: dict) -> None:
    """Render detailed information for one ranked MLB player."""

    player_name = str(
        player_data.get("player_name", "Unknown Player")
    )
    team = str(player_data.get("team_abbreviation", ""))
    opponent = str(
        player_data.get("opponent_abbreviation", "")
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

    season = player_data.get("season_stats", {}) or {}
    recent = player_data.get("recent_stats", {}) or {}

    player_id = int(player_data.get("player_id") or 0)
    statcast = None
    if player_id:
        snapshot = load_statcast_batter_metrics(minimum_pa=10)
        statcast = get_statcast_batter(player_id, snapshot)

    st.markdown(f"### {player_name}")

    st.caption(f"{team} vs {opponent}")

    projection_1, projection_2, projection_3 = st.columns(3)
    with projection_1:
        st.metric("GI Score", f"{gi_score:.1f}")
    with projection_2:
        st.metric(
            "HR Probability",
            f"{float(player_data.get('home_run_probability', 0) or 0):.0f}%",
        )
    with projection_3:
        st.metric(
            "Projected Hits",
            f"{float(player_data.get('projected_hits', 0) or 0):.1f}",
        )

    if lineup_confirmed and batting_order:
        st.write(
            f"**Lineup:** Confirmed — batting #{batting_order}"
        )
    else:
        st.write("**Lineup:** Not yet confirmed")

    st.write(f"**Opposing Pitcher:** {pitcher}")

    st.markdown("**Performance evidence**")
    season_col, recent_col = st.columns(2)
    with season_col:
        st.write(
            f"Season: {season.get('home_runs', 0)} HR • "
            f"{_number(season.get('avg'))} AVG • "
            f"{_number(season.get('slg'))} SLG"
        )
        st.caption(
            f"{season.get('plate_appearances', 0)} plate appearances"
        )
    with recent_col:
        st.write(
            f"Recent: {recent.get('home_runs', 0)} HR • "
            f"{_number(recent.get('avg'))} AVG • "
            f"{_number(recent.get('slg'))} SLG"
        )
        st.caption(
            f"{recent.get('plate_appearances', 0)} recent plate appearances"
        )

    if statcast:
        st.markdown("**Statcast contact quality**")
        stat_1, stat_2, stat_3 = st.columns(3)
        with stat_1:
            st.metric(
                "Avg Exit Velocity",
                f"{_number(statcast.get('average_exit_velocity'), 1)} mph",
            )
        with stat_2:
            st.metric("Barrel Rate", _percent(statcast.get("barrel_rate")))
        with stat_3:
            st.metric("Hard-Hit Rate", _percent(statcast.get("hard_hit_rate")))

        stat_4, stat_5, stat_6 = st.columns(3)
        with stat_4:
            st.metric("xBA", _number(statcast.get("xba")))
        with stat_5:
            st.metric("xSLG", _number(statcast.get("xslg")))
        with stat_6:
            st.metric("xwOBA", _number(statcast.get("xwoba")))

        warning = str(statcast.get("sample_warning") or "")
        if warning:
            st.warning(warning)
        else:
            st.caption(
                "Statcast sample reliability: "
                f"{str(statcast.get('sample_level', 'unknown')).title()}"
            )
    else:
        st.caption("Statcast contact-quality data is currently unavailable.")

    if why:
        st.markdown("**Why this player ranks here**")
        for reason in why:
            st.write(f"• {reason}")

    if risk_flags:
        st.markdown("**Things to watch**")
        for flag in risk_flags:
            st.write(f"• {flag}")
