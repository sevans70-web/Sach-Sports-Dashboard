"""
Live MLB schedule display component.

File location:
    components/mlb_schedule.py

This component reads schedule data from data/mlb_live.py and displays it
safely using Streamlit's native containers.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any
from zoneinfo import ZoneInfo

import streamlit as st

from data.mlb_live import get_today_mlb_schedule


TORONTO_TIMEZONE = ZoneInfo("America/Toronto")


@st.cache_data(ttl=300, show_spinner=False)
def load_today_schedule() -> dict[str, Any]:
    """Load today's MLB schedule and cache it for five minutes."""
    return get_today_mlb_schedule()


def _score_text(score: Any) -> str:
    """Return a readable score value."""
    return "—" if score is None else str(score)


def _status_icon(status_group: str) -> str:
    """Return an icon for preview, live, or completed games."""
    normalized = status_group.strip().lower()

    if normalized == "live":
        return "🔴"
    if normalized == "final":
        return "✅"
    return "🕒"


def _render_game(game: dict[str, Any]) -> None:
    """Render one schedule game using a bordered Streamlit container."""
    status_group = str(game.get("status_group", "Preview"))
    status = str(game.get("status", "Status unavailable"))
    status_icon = _status_icon(status_group)

    away_team = str(game.get("away_team", "Away team"))
    home_team = str(game.get("home_team", "Home team"))

    away_record = str(game.get("away_record", "")).strip()
    home_record = str(game.get("home_record", "")).strip()

    away_label = (
        f"{away_team} ({away_record})"
        if away_record
        else away_team
    )
    home_label = (
        f"{home_team} ({home_record})"
        if home_record
        else home_team
    )

    with st.container(border=True):
        top_left, top_right = st.columns([1.35, 1])

        with top_left:
            st.markdown(f"#### {away_team} at {home_team}")
            st.caption(
                f"{game.get('start_time', 'Time unavailable')} · "
                f"{game.get('venue', 'Venue unavailable')}"
            )

        with top_right:
            st.markdown(f"**{status_icon} {status}**")

        team_1, score_1, team_2, score_2 = st.columns(
            [2.2, 0.65, 2.2, 0.65]
        )

        with team_1:
            st.write(away_label)

        with score_1:
            st.markdown(
                f"### {_score_text(game.get('away_score'))}"
            )

        with team_2:
            st.write(home_label)

        with score_2:
            st.markdown(
                f"### {_score_text(game.get('home_score'))}"
            )

        pitcher_1, pitcher_2 = st.columns(2)

        with pitcher_1:
            st.caption(
                "Away probable pitcher: "
                f"{game.get('away_probable_pitcher', 'Not announced')}"
            )

        with pitcher_2:
            st.caption(
                "Home probable pitcher: "
                f"{game.get('home_probable_pitcher', 'Not announced')}"
            )


def render_live_mlb_schedule() -> dict[str, Any]:
    """
    Display today's live MLB schedule.

    Returns the schedule dictionary so pages/mlb.py can also use the
    game count and live-game count in its snapshot metrics.
    """
    schedule = load_today_schedule()

    st.subheader("Today's MLB Games")

    refresh_column, updated_column = st.columns([0.75, 2.25])

    with refresh_column:
        if st.button(
            "Refresh games",
            key="refresh_live_mlb_schedule",
            use_container_width=True,
        ):
            st.cache_data.clear()
            st.rerun()

    with updated_column:
        fetched_at = schedule.get("fetched_at")

        if fetched_at:
            try:
                fetched_datetime = datetime.fromisoformat(
                    str(fetched_at)
                ).astimezone(TORONTO_TIMEZONE)

                st.caption(
                    "Schedule updated "
                    f"{fetched_datetime.strftime('%I:%M %p ET')}"
                )
            except ValueError:
                st.caption("Schedule refresh time unavailable")

    if not schedule.get("success"):
        st.error(
            schedule.get("error")
            or "The MLB schedule could not be loaded."
        )
        st.info(
            "The rest of the MLB page remains available. "
            "Try refreshing the schedule again shortly."
        )
        return schedule

    games = schedule.get("games", [])

    if not games:
        st.info(
            "No MLB games are scheduled for today's Toronto date."
        )
        return schedule

    for game in games:
        _render_game(game)

    return schedule


def schedule_summary(schedule: dict[str, Any]) -> dict[str, int]:
    """Calculate snapshot totals from the schedule response."""
    games = schedule.get("games", [])

    live_games = sum(
        1
        for game in games
        if str(game.get("status_group", "")).lower() == "live"
    )

    final_games = sum(
        1
        for game in games
        if str(game.get("status_group", "")).lower() == "final"
    )

    upcoming_games = sum(
        1
        for game in games
        if str(game.get("status_group", "")).lower() == "preview"
    )

    return {
        "games": len(games),
        "live": live_games,
        "final": final_games,
        "upcoming": upcoming_games,
    }
