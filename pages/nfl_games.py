"""Weekly NFL slate and game-intelligence drill-down."""
from __future__ import annotations

from datetime import datetime
from html import escape
from zoneinfo import ZoneInfo

import pandas as pd
import streamlit as st

from data.nfl_roster import load_nfl_roster
from data.nfl_schedule import load_nfl_schedule

NFL_SEASON = 2026
TZ = ZoneInfo("America/Toronto")


def _render_html(html: str) -> None:
    st.markdown(" ".join(line.strip() for line in html.splitlines() if line.strip()), unsafe_allow_html=True)


def _css() -> None:
    st.markdown(
        """
        <style>
        .block-container{max-width:1100px;padding-top:.15rem!important}
        .nfl-games-hero{padding:16px 18px;border:2px solid rgba(255,204,51,.84);border-radius:16px;background:linear-gradient(110deg,rgba(246,200,76,.20),#090b0b 48%,rgba(25,217,120,.18));margin:5px 0 12px}.nfl-games-hero h1{color:#fff;margin:0;font-size:1.65rem}.nfl-games-hero p{color:#c9ccd0;margin:6px 0 0;font-size:.86rem;line-height:1.4}
        .nfl-day-heading{color:#f6c84c;font-size:.84rem;font-weight:900;margin:16px 0 6px;text-transform:uppercase;letter-spacing:.06em}
        div[class*="st-key-weekly_game_"] button{width:100%!important;min-height:66px!important;text-align:left!important;justify-content:flex-start!important;background:linear-gradient(110deg,#101112,#0c0e0e 72%,rgba(25,217,120,.07))!important;color:#fff!important;border:1.5px solid #34373c!important;border-left:4px solid #19d978!important;border-radius:12px!important;font-weight:850!important;white-space:pre-line!important;line-height:1.3!important;margin-bottom:5px!important}
        div[class*="st-key-weekly_game_"] button:hover{border-color:#d6b35c!important;border-left-color:#19d978!important}
        .nfl-game-intel{margin:10px 0 12px;padding:13px;border:1.5px solid rgba(214,179,92,.60);border-radius:13px;background:#0d0f10}.nfl-game-intel h2{margin:0;color:#fff;font-size:1.2rem}.nfl-game-intel p{margin:5px 0 0;color:#b8bdc3;font-size:.76rem;line-height:1.4}.nfl-game-intel b{color:#f6c84c}
        .nfl-game-metrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;margin:8px 0 12px}.nfl-game-metric{background:#111315;border:1px solid #30343a;border-bottom:2px solid #19d978;border-radius:9px;padding:8px}.nfl-game-metric span{display:block;color:#92979e;font-size:.57rem}.nfl-game-metric strong{display:block;color:#fff;font-size:.82rem;margin-top:3px}
        div[class*="st-key-game_player_"] button{background:#101112!important;color:#fff!important;border:1px solid #30343a!important;border-radius:9px!important;min-height:42px!important;font-weight:800!important;text-align:left!important;justify-content:flex-start!important}
        div[class*="st-key-back_to_nfl"] button{background:#080909!important;color:#fff!important;border:1px solid #34373c!important;border-radius:9px!important}
        @media(max-width:700px){.block-container{padding-left:.85rem!important;padding-right:.85rem!important}.nfl-games-hero{padding:13px 14px}.nfl-games-hero h1{font-size:1.35rem}.nfl-game-metrics{grid-template-columns:repeat(3,minmax(0,1fr));gap:4px}}
        </style>
        """,
        unsafe_allow_html=True,
    )


def _load_phase(phase: str) -> pd.DataFrame:
    try:
        df = load_nfl_schedule(NFL_SEASON, phase).copy()
        if not df.empty:
            df["kickoff_et"] = pd.to_datetime(df["kickoff_et"], errors="coerce")
        return df
    except Exception:
        return pd.DataFrame()


def _open_player(row: pd.Series, matchup: str) -> None:
    player = row.to_dict()
    player["game"] = matchup
    st.session_state["nfl_selected_player"] = player
    st.switch_page("pages/nfl_player.py")


def _player_buttons(team: str, matchup: str, key_prefix: str) -> None:
    try:
        roster = load_nfl_roster(NFL_SEASON)
    except Exception:
        st.info("Player roster is temporarily unavailable.")
        return
    players = roster[roster["team"].astype(str).str.upper().eq(team.upper())].copy()
    if players.empty:
        return
    offense = players[players["position"].isin(["QB", "RB", "WR", "TE"])].copy()
    defense = players[players["position"].isin(["DE", "DT", "DL", "NT", "LB", "OLB", "ILB", "CB", "DB", "S", "FS", "SS"])].copy()
    st.markdown(f"**{team} players**")
    pool = pd.concat([offense, defense.head(10)], ignore_index=True).drop_duplicates("player_id")
    cols = st.columns(2)
    for i, (_, row) in enumerate(pool.iterrows()):
        with cols[i % 2]:
            label = f"{row.get('player_name','Player')} · {row.get('position','')}"
            if st.button(label, key=f"game_player_{key_prefix}_{i}_{row.get('player_id')}", use_container_width=True):
                _open_player(row, matchup)


def show() -> None:
    _css()
    if st.button("← NFL Intelligence Center", key="back_to_nfl"):
        st.switch_page("pages/nfl.py")

    phase = str(st.session_state.get("nfl_active_phase") or "REG")
    week = st.session_state.get("nfl_active_week")
    schedule = _load_phase(phase)

    if schedule.empty:
        st.error("The NFL schedule feed is temporarily unavailable. Return to NFL and refresh the page.")
        return

    weeks = sorted(pd.to_numeric(schedule["week"], errors="coerce").dropna().astype(int).unique())
    if week is None or int(week) not in weeks:
        week = weeks[0] if weeks else None
    if week is None:
        st.error("No NFL week is available yet.")
        return

    games = schedule[pd.to_numeric(schedule["week"], errors="coerce").eq(int(week))].copy().sort_values("kickoff_et")
    _render_html(
        f"""
        <div class="nfl-games-hero"><h1>🏈 Week {int(week)} NFL Games</h1><p>Open any matchup for Game Intelligence, then open a player card for every tracked prop and player-level signal.</p></div>
        """
    )

    selected_id = st.session_state.get("nfl_selected_game")
    for day, day_games in games.groupby(games["kickoff_et"].dt.strftime("%A · %B %d"), dropna=False):
        _render_html(f'<div class="nfl-day-heading">{escape(str(day or "Kickoff TBD"))}</div>')
        for idx, game in day_games.iterrows():
            away, home = str(game.get("away_team") or "").upper(), str(game.get("home_team") or "").upper()
            kickoff = pd.to_datetime(game.get("kickoff_et"), errors="coerce")
            when = kickoff.strftime("%I:%M %p ET") if pd.notna(kickoff) else "Kickoff TBD"
            status = str(game.get("status") or "Scheduled")
            game_id = str(game.get("game_id") or f"{week}-{away}-{home}")
            score = ""
            if pd.notna(game.get("away_score")) and pd.notna(game.get("home_score")):
                score = f"\n{away} {int(game.get('away_score'))} · {home} {int(game.get('home_score'))}"
            if st.button(f"🏈 {away} @ {home}\n{when} · {status}{score}", key=f"weekly_game_{game_id}_{idx}", use_container_width=True):
                st.session_state["nfl_selected_game"] = game_id
                selected_id = game_id
                st.rerun()

            if selected_id == game_id:
                stadium = str(game.get("stadium") or "Venue TBD")
                roof = str(game.get("roof") or "Environment TBD")
                _render_html(
                    f"""
                    <div class="nfl-game-intel">
                      <h2>{escape(away)} @ {escape(home)}</h2>
                      <p><b>Game Intelligence</b> is the matchup hub. Player form, opponent context, role, market signals, injuries and weather feed the individual player cards instead of duplicating another schedule on the main page.</p>
                    </div>
                    <div class="nfl-game-metrics">
                      <div class="nfl-game-metric"><span>KICKOFF</span><strong>{escape(when)}</strong></div>
                      <div class="nfl-game-metric"><span>VENUE</span><strong>{escape(stadium)}</strong></div>
                      <div class="nfl-game-metric"><span>ENVIRONMENT</span><strong>{escape(roof)}</strong></div>
                    </div>
                    """
                )
                away_tab, home_tab = st.tabs([away, home])
                with away_tab:
                    _player_buttons(away, f"{away} @ {home}", f"{game_id}_away")
                with home_tab:
                    _player_buttons(home, f"{away} @ {home}", f"{game_id}_home")


show()
