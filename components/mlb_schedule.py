"""Mobile-first MLB schedule and roster drill-down."""

from __future__ import annotations

from datetime import datetime
from typing import Any
from zoneinfo import ZoneInfo

import streamlit as st

from data.mlb_live import get_today_mlb_schedule
from data.mlb_lineups import get_mlb_lineups

TORONTO_TIMEZONE = ZoneInfo("America/Toronto")

TEAM_ABBR = {
    "Arizona Diamondbacks":"ARI","Atlanta Braves":"ATL","Baltimore Orioles":"BAL",
    "Boston Red Sox":"BOS","Chicago Cubs":"CHC","Chicago White Sox":"CWS",
    "Cincinnati Reds":"CIN","Cleveland Guardians":"CLE","Colorado Rockies":"COL",
    "Detroit Tigers":"DET","Houston Astros":"HOU","Kansas City Royals":"KC",
    "Los Angeles Angels":"LAA","Los Angeles Dodgers":"LAD","Miami Marlins":"MIA",
    "Milwaukee Brewers":"MIL","Minnesota Twins":"MIN","New York Mets":"NYM",
    "New York Yankees":"NYY","Oakland Athletics":"ATH","Philadelphia Phillies":"PHI",
    "Pittsburgh Pirates":"PIT","San Diego Padres":"SD","San Francisco Giants":"SF",
    "Seattle Mariners":"SEA","St. Louis Cardinals":"STL","Tampa Bay Rays":"TB",
    "Texas Rangers":"TEX","Toronto Blue Jays":"TOR","Washington Nationals":"WSH",
}

st.markdown("""
<style>
div[class*="st-key-mlb_game_grid"] [data-testid="stHorizontalBlock"]{
    gap:8px!important; flex-wrap:nowrap!important;
}
div[class*="st-key-mlb_game_grid"] [data-testid="column"]{
    width:50%!important; flex:1 1 50%!important; min-width:0!important;
}
div[class*="st-key-mlb_game_grid"] [data-testid="stVerticalBlockBorderWrapper"]{
    background:linear-gradient(115deg,rgba(255,204,51,.08),#0c0d0e 38%,rgba(25,217,120,.05))!important;
    border:2px solid #34373c!important;
    border-radius:13px!important;
    padding:4px!important;
}
div[class*="st-key-open_game_"] button,
div[class*="st-key-roster_player_"] button{
    background:#080909!important; color:#fff!important;
    border:2px solid rgba(25,217,120,.60)!important;
    border-radius:9px!important; font-weight:800!important;
}
div[class*="st-key-open_game_"] button:hover,
div[class*="st-key-roster_player_"] button:hover{
    border-color:#ffcc33!important;
}
.mlb-game-matchup{
    display:flex; align-items:center; gap:6px; font-weight:850;
    font-size:.94rem; white-space:nowrap;
}
.mlb-game-meta{color:#a7abb2;font-size:.76rem;line-height:1.28;margin-top:3px}
.mlb-game-venue{color:#f6c84c;font-size:.72rem;margin-top:3px}
.mlb-roster-head{
    padding:10px 12px; border-radius:12px; margin:8px 0 10px;
    background:linear-gradient(105deg,rgba(255,204,51,.20),#080909 48%,rgba(25,217,120,.20));
    border:2px solid rgba(255,204,51,.70);
}
@media(max-width:700px){
    div[class*="st-key-mlb_game_grid"] [data-testid="stHorizontalBlock"]{
        display:flex!important; flex-direction:row!important; gap:7px!important;
    }
    div[class*="st-key-mlb_game_grid"] [data-testid="column"]{
        width:calc(50% - 4px)!important; flex:0 0 calc(50% - 4px)!important;
    }
    div[class*="st-key-mlb_game_grid"] [data-testid="stVerticalBlock"]{gap:.35rem!important}
    div[class*="st-key-mlb_game_grid"] p{font-size:.82rem!important;line-height:1.2!important}
}
</style>
""", unsafe_allow_html=True)

@st.cache_data(ttl=300, show_spinner=False)
def load_today_schedule() -> dict[str, Any]:
    return get_today_mlb_schedule()

@st.cache_data(ttl=300, show_spinner=False)
def load_today_lineups() -> dict[str, Any]:
    return get_mlb_lineups()

def _abbr(name: str) -> str:
    return TEAM_ABBR.get(str(name), str(name)[:3].upper())

def _score_text(score: Any) -> str:
    return "—" if score is None else str(score)

def _status_icon(status_group: str) -> str:
    normalized = str(status_group or "").strip().lower()
    if normalized == "live": return "🔴"
    if normalized == "final": return "✅"
    return "🕒"

def _game_card(game: dict[str, Any], lineup_data: dict[str, Any]) -> bool:
    game_pk = game.get("game_pk")
    away = str(game.get("away_team") or "Away")
    home = str(game.get("home_team") or "Home")
    status_group = str(game.get("status_group") or "Preview")
    status = str(game.get("status") or "Status unavailable")
    away_short, home_short = _abbr(away), _abbr(home)

    if status_group.lower() in {"live","final"}:
        matchup = f"{away_short} {_score_text(game.get('away_score'))} @ {home_short} {_score_text(game.get('home_score'))}"
    else:
        matchup = f"{away_short} @ {home_short}"

    venue = str(game.get("venue") or "Venue TBA")
    pitchers = f"{game.get('away_probable_pitcher','TBA')} vs. {game.get('home_probable_pitcher','TBA')}"

    with st.container(border=True):
        st.markdown(f"<div class='mlb-game-matchup'>⚾ {matchup}</div>", unsafe_allow_html=True)
        st.markdown(
            f"<div class='mlb-game-meta'>{_status_icon(status_group)} {status} · {game.get('start_time','Time TBA')}</div>"
            f"<div class='mlb-game-meta'>{pitchers}</div>"
            f"<div class='mlb-game-venue'>📍 {venue}</div>",
            unsafe_allow_html=True,
        )
        return st.button("Open game", key=f"open_game_{game_pk}", use_container_width=True)

def _selected_game_lineups(game_pk: Any, lineup_data: dict[str, Any]) -> dict[str, Any] | None:
    for game in lineup_data.get("games", []):
        if game.get("game_pk") == game_pk:
            return game
    return None

def _render_roster_column(title: str, lineup: list[dict[str, Any]], player_lookup: dict[int, dict[str, Any]]) -> None:
    st.markdown(f"#### {title}")
    if not lineup:
        st.caption("Official batting order has not been posted yet.")
        return
    for player in lineup:
        player_id = int(player.get("player_id") or 0)
        order = player.get("batting_order") or "—"
        name = str(player.get("player_name") or "Player")
        position = str(player.get("position_abbreviation") or "")
        label = f"{order}. {name}" + (f" · {position}" if position else "")
        if st.button(label, key=f"roster_player_{player_id}_{title}", use_container_width=True):
            st.session_state["selected_game_player_id"] = player_id

def render_live_mlb_schedule(player_lookup: dict[int, dict[str, Any]] | None=None, player_renderer: Any | None=None) -> dict[str, Any]:
    schedule = load_today_schedule()
    lineup_data = load_today_lineups()
    player_lookup = player_lookup or {}

    st.subheader("Today's MLB Games")
    refresh_col, updated_col = st.columns([1, 2])
    with refresh_col:
        if st.button("Refresh", key="refresh_live_mlb_schedule", use_container_width=True):
            load_today_schedule.clear()
            load_today_lineups.clear()
            st.rerun()
    with updated_col:
        fetched_at = schedule.get("fetched_at")
        if fetched_at:
            try:
                dt = datetime.fromisoformat(str(fetched_at)).astimezone(TORONTO_TIMEZONE)
                st.caption(f"Updated {dt.strftime('%I:%M %p ET')}")
            except ValueError:
                pass

    if not schedule.get("success"):
        st.error("The MLB schedule could not be loaded.")
        return schedule

    games = schedule.get("games", [])
    if not games:
        st.caption("No MLB games are scheduled for today's Toronto date.")
        return schedule

    with st.container(key="mlb_game_grid"):
        for start in range(0, len(games), 2):
            cols = st.columns(2, gap="small")
            for offset, game in enumerate(games[start:start+2]):
                with cols[offset]:
                    if _game_card(game, lineup_data):
                        st.session_state["selected_game_pk"] = game.get("game_pk")
                        st.session_state.pop("selected_game_player_id", None)

    selected_game_pk = st.session_state.get("selected_game_pk")
    if selected_game_pk:
        game = next((g for g in games if g.get("game_pk") == selected_game_pk), None)
        lineup_game = _selected_game_lineups(selected_game_pk, lineup_data)
        if game:
            st.markdown(
                f"<div class='mlb-roster-head'><strong>⚾ {_abbr(game.get('away_team'))} @ {_abbr(game.get('home_team'))}</strong>"
                f"<br><small>{game.get('status')} · 📍 {game.get('venue') or 'Venue TBA'}</small></div>",
                unsafe_allow_html=True,
            )
        if lineup_game:
            away_col, home_col = st.columns(2, gap="small")
            with away_col:
                _render_roster_column(str(lineup_game.get("away_team") or "Away"), lineup_game.get("away_lineup", []), player_lookup)
            with home_col:
                _render_roster_column(str(lineup_game.get("home_team") or "Home"), lineup_game.get("home_lineup", []), player_lookup)
            selected_id = int(st.session_state.get("selected_game_player_id") or 0)
            ranked = player_lookup.get(selected_id)
            if selected_id and ranked and player_renderer:
                player_renderer(ranked)
            elif selected_id and not ranked:
                st.caption("This lineup player is not currently in today's displayed Top 25 lists.")
        else:
            st.caption("Official lineups are not available for this game yet.")

    schedule["lineup_data"] = lineup_data
    return schedule

def schedule_summary(schedule: dict[str, Any]) -> dict[str, int]:
    games = schedule.get("games", [])
    lineup_data = schedule.get("lineup_data", {}) or {}
    live = sum(str(g.get("status_group","")).lower()=="live" for g in games)
    final = sum(str(g.get("status_group","")).lower()=="final" for g in games)
    upcoming = sum(str(g.get("status_group","")).lower()=="preview" for g in games)
    confirmed = 0
    for game in lineup_data.get("games", []):
        confirmed += int(bool(game.get("away_lineup_confirmed")))
        confirmed += int(bool(game.get("home_lineup_confirmed")))
    return {"games":len(games),"live":live,"final":final,"upcoming":upcoming,
            "confirmed_teams":confirmed,"total_teams":len(games)*2}
