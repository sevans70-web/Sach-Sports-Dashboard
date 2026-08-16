"""Compact live MLB schedule display component."""

from __future__ import annotations

from datetime import datetime
from typing import Any
from zoneinfo import ZoneInfo

import streamlit as st

from data.mlb_live import get_today_mlb_schedule
from data.mlb_lineups import get_mlb_lineups


TORONTO_TIMEZONE = ZoneInfo("America/Toronto")


@st.cache_data(ttl=300, show_spinner=False)
def load_today_schedule() -> dict[str, Any]:
    """Load today's MLB schedule and cache it for five minutes."""
    return get_today_mlb_schedule()


@st.cache_data(ttl=300, show_spinner=False)
def load_today_lineups() -> dict[str, Any]:
    """Load today's confirmed MLB lineups and cache them for five minutes."""
    return get_mlb_lineups()


def _score_text(score: Any) -> str:
    return "—" if score is None else str(score)


def _status_icon(status_group: str) -> str:
    normalized = str(status_group or "").strip().lower()
    if normalized == "live":
        return "🔴"
    if normalized == "final":
        return "✅"
    return "🕒"


def _game_lineup_status(game_pk: Any, lineup_data: dict[str, Any]) -> tuple[str, bool]:
    for game in lineup_data.get("games", []):
        if game.get("game_pk") != game_pk:
            continue
        away = bool(game.get("away_lineup_confirmed"))
        home = bool(game.get("home_lineup_confirmed"))
        if away and home:
            return "✅ Both lineups", True
        if away or home:
            return "🟡 1 lineup", False
        return "⏳ Lineups pending", False
    return "⏳ Lineups pending", False


def _game_card(game: dict[str, Any], lineup_data: dict[str, Any]) -> bool:
    """Render one compact game card and return True when opened."""
    game_pk = game.get("game_pk")
    away = str(game.get("away_team") or "Away")
    home = str(game.get("home_team") or "Home")
    status_group = str(game.get("status_group") or "Preview")
    status = str(game.get("status") or "Status unavailable")
    lineup_text, _ = _game_lineup_status(game_pk, lineup_data)

    score_line = ""
    if str(status_group).lower() in {"live", "final"}:
        score_line = (
            f"{away} {_score_text(game.get('away_score'))} · "
            f"{home} {_score_text(game.get('home_score'))}"
        )

    with st.container(border=True):
        st.markdown(f"**{away} @ {home}**")
        st.caption(
            f"{_status_icon(status_group)} {status} · "
            f"{game.get('start_time', 'Time unavailable')}"
        )
        if score_line:
            st.markdown(f"### {score_line}")
        else:
            st.caption(str(game.get("venue") or "Venue unavailable"))

        st.caption(
            f"{game.get('away_probable_pitcher', 'Not announced')} vs. "
            f"{game.get('home_probable_pitcher', 'Not announced')}"
        )
        st.caption(lineup_text)

        return st.button(
            "Open game",
            key=f"open_game_{game_pk}",
            use_container_width=True,
        )


def _selected_game_lineups(
    game_pk: Any,
    lineup_data: dict[str, Any],
) -> dict[str, Any] | None:
    for game in lineup_data.get("games", []):
        if game.get("game_pk") == game_pk:
            return game
    return None


def _render_roster_column(
    title: str,
    lineup: list[dict[str, Any]],
    player_lookup: dict[int, dict[str, Any]],
) -> None:
    st.markdown(f"#### {title}")
    if not lineup:
        st.info("Official batting order has not been posted yet.")
        return

    for player in lineup:
        player_id = int(player.get("player_id") or 0)
        order = player.get("batting_order") or "—"
        name = str(player.get("player_name") or "Player")
        position = str(player.get("position_abbreviation") or "")
        ranked = player_lookup.get(player_id)

        label = f"{order}. {name}"
        if position:
            label += f" · {position}"

        if st.button(
            label,
            key=f"game_roster_player_{player_id}_{title}",
            use_container_width=True,
        ):
            st.session_state["selected_game_player_id"] = player_id

        if ranked:
            st.caption(
                f"Ranked #{ranked.get('rank', '—')} · "
                f"GI {ranked.get('score', 0)} · {ranked.get('category', '')}"
            )


def render_live_mlb_schedule(
    player_lookup: dict[int, dict[str, Any]] | None = None,
    player_renderer: Any | None = None,
) -> dict[str, Any]:
    """Display today's schedule as a compact three-column game grid."""
    schedule = load_today_schedule()
    lineup_data = load_today_lineups()
    player_lookup = player_lookup or {}

    st.subheader("Today's MLB Games")
    refresh_col, updated_col = st.columns([0.8, 2.2])
    with refresh_col:
        if st.button("Refresh", key="refresh_live_mlb_schedule", use_container_width=True):
            st.cache_data.clear()
            st.rerun()
    with updated_col:
        fetched_at = schedule.get("fetched_at")
        if fetched_at:
            try:
                fetched_datetime = datetime.fromisoformat(str(fetched_at)).astimezone(TORONTO_TIMEZONE)
                st.caption(f"Updated {fetched_datetime.strftime('%I:%M %p ET')}")
            except ValueError:
                pass

    if not schedule.get("success"):
        st.error(schedule.get("error") or "The MLB schedule could not be loaded.")
        return schedule

    games = schedule.get("games", [])
    if not games:
        st.info("No MLB games are scheduled for today's Toronto date.")
        return schedule

    for start in range(0, len(games), 3):
        columns = st.columns(3)
        for offset, game in enumerate(games[start:start + 3]):
            with columns[offset]:
                if _game_card(game, lineup_data):
                    st.session_state["selected_game_pk"] = game.get("game_pk")
                    st.session_state.pop("selected_game_player_id", None)

    selected_game_pk = st.session_state.get("selected_game_pk")
    if selected_game_pk:
        selected_schedule_game = next(
            (game for game in games if game.get("game_pk") == selected_game_pk),
            None,
        )
        lineup_game = _selected_game_lineups(selected_game_pk, lineup_data)

        if selected_schedule_game:
            st.divider()
            st.markdown(
                f"### {selected_schedule_game.get('away_team')} @ "
                f"{selected_schedule_game.get('home_team')}"
            )
            st.caption(
                f"{selected_schedule_game.get('status')} · "
                f"{selected_schedule_game.get('venue')} · "
                "Select a player below to open available Player Intelligence."
            )

        if lineup_game:
            away_col, home_col = st.columns(2)
            with away_col:
                _render_roster_column(
                    str(lineup_game.get("away_team") or "Away lineup"),
                    lineup_game.get("away_lineup", []),
                    player_lookup,
                )
            with home_col:
                _render_roster_column(
                    str(lineup_game.get("home_team") or "Home lineup"),
                    lineup_game.get("home_lineup", []),
                    player_lookup,
                )

            selected_player_id = int(st.session_state.get("selected_game_player_id") or 0)
            ranked_player = player_lookup.get(selected_player_id)
            if selected_player_id and ranked_player and player_renderer:
                st.divider()
                player_renderer(ranked_player)
            elif selected_player_id and not ranked_player:
                st.info(
                    "This player is in the official lineup but is not currently in one of "
                    "today's displayed Top 25 ranking lists."
                )

    schedule["lineup_data"] = lineup_data
    return schedule


def schedule_summary(schedule: dict[str, Any]) -> dict[str, int]:
    games = schedule.get("games", [])
    lineup_data = schedule.get("lineup_data", {}) or {}

    live_games = sum(1 for game in games if str(game.get("status_group", "")).lower() == "live")
    final_games = sum(1 for game in games if str(game.get("status_group", "")).lower() == "final")
    upcoming_games = sum(1 for game in games if str(game.get("status_group", "")).lower() == "preview")

    confirmed_teams = 0
    for game in lineup_data.get("games", []):
        confirmed_teams += int(bool(game.get("away_lineup_confirmed")))
        confirmed_teams += int(bool(game.get("home_lineup_confirmed")))

    return {
        "games": len(games),
        "live": live_games,
        "final": final_games,
        "upcoming": upcoming_games,
        "confirmed_teams": confirmed_teams,
        "total_teams": len(games) * 2,
    }
