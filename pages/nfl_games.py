"""Weekly NFL slate and game-intelligence drill-down."""
from __future__ import annotations

from html import escape
from urllib.parse import quote

import pandas as pd
import streamlit as st

from data.nfl_roster import load_nfl_roster
from data.nfl_schedule import load_nfl_schedule
from data.nfl_team_logos import nfl_team_logo_url
from engines.nfl_game_intelligence import build_matchup_intelligence

NFL_SEASON = 2026
BASELINE_SEASON = 2025


def _render_html(html: str) -> None:
    st.markdown(" ".join(line.strip() for line in html.splitlines() if line.strip()), unsafe_allow_html=True)


def _time_label(value) -> str:
    kickoff = pd.to_datetime(value, errors="coerce")
    if pd.isna(kickoff):
        return "Kickoff TBD"
    return kickoff.strftime("%I:%M %p ET").lstrip("0")


def _css() -> None:
    st.markdown(
        """
        <style>
        .block-container{max-width:1100px;padding-top:.15rem!important}
        .nfl-games-hero{padding:15px 17px;border:2px solid rgba(255,204,51,.84);border-radius:16px;background:linear-gradient(110deg,rgba(246,200,76,.20),#090b0b 48%,rgba(25,217,120,.18));margin:5px 0 12px}
        .nfl-games-hero h1{color:#fff;margin:0;font-size:1.55rem}
        .nfl-games-hero p{color:#c9ccd0;margin:10px 0 0;font-size:.84rem;line-height:1.45}
        .nfl-day-heading{color:#f6c84c;font-size:.84rem;font-weight:900;margin:16px 0 7px;text-transform:uppercase;letter-spacing:.06em}
        .nfl-game-row{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:8px;width:100%;min-height:68px;padding:10px 14px;margin:0 0 8px;box-sizing:border-box;text-decoration:none!important;background:linear-gradient(110deg,#101112,#0c0e0e 72%,rgba(25,217,120,.07));border:1.5px solid #34373c;border-left:4px solid #19d978;border-radius:12px;color:#fff!important}
        .nfl-game-row:hover{border-color:#19d978}
        .nfl-game-team{display:flex;align-items:center;gap:8px;min-width:0}
        .nfl-game-team.home{justify-content:flex-end}
        .nfl-game-team img{width:34px;height:34px;object-fit:contain}
        .nfl-game-team strong{font-size:.90rem;color:#fff}
        .nfl-game-middle{text-align:center;min-width:92px}
        .nfl-game-middle b{display:block;color:#fff;font-size:.78rem}
        .nfl-game-middle span{display:block;color:#d9dcdf;font-size:.72rem;margin-top:3px;white-space:nowrap}
        .nfl-intel-shell{margin:9px 0 14px;padding:13px;border:1.5px solid rgba(214,179,92,.66);border-radius:15px;background:linear-gradient(118deg,#0b0c0d,#101214 72%,rgba(25,217,120,.05));box-shadow:0 8px 24px rgba(0,0,0,.20)}
        .nfl-matchup-head{display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);gap:8px;align-items:center;padding-bottom:10px;border-bottom:1px solid #292d31}
        .nfl-team{display:flex;align-items:center;gap:8px;min-width:0}
        .nfl-team.home{justify-content:flex-end}
        .nfl-team img{width:42px;height:42px;object-fit:contain}
        .nfl-team strong{font-size:1.05rem;color:#fff}
        .nfl-at{color:#888f96;font-size:.72rem;font-weight:900}
        .nfl-rundown{margin:10px 0 0;color:#d8dadd;font-size:.78rem;line-height:1.48}
        .nfl-rundown b{color:#f6c84c}
        .nfl-game-metrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;margin:10px 0}
        .nfl-game-metric{background:#111315;border:1px solid #30343a;border-bottom:2px solid #19d978;border-radius:9px;padding:8px;min-width:0}
        .nfl-game-metric span{display:block;color:#92979e;font-size:.57rem}
        .nfl-game-metric strong{display:block;color:#fff;font-size:.80rem;margin-top:3px;white-space:normal}
        .nfl-scout{margin:9px 0 2px;padding:9px 10px;border:1px solid #2d3136;border-radius:10px;background:#0d0f10}
        .nfl-scout-title{color:#f6c84c;font-size:.72rem;font-weight:950;margin-bottom:6px}
        .nfl-signal{color:#c9cdd1;font-size:.70rem;line-height:1.42;margin:3px 0}
        div[class*="st-key-game_player_"] button{background:#101112!important;color:#fff!important;border:1px solid #30343a!important;border-radius:9px!important;min-height:42px!important;font-weight:800!important;text-align:left!important;justify-content:flex-start!important}
        div[class*="st-key-back_to_nfl"] button{background:#080909!important;color:#fff!important;border:1px solid #34373c!important;border-radius:9px!important}
        @media(max-width:700px){
          .block-container{padding-left:.85rem!important;padding-right:.85rem!important}
          .nfl-games-hero{padding:13px 14px}.nfl-games-hero h1{font-size:1.28rem}
          .nfl-game-metrics{gap:4px}.nfl-team img{width:34px;height:34px}.nfl-team strong{font-size:.92rem}
          .nfl-game-row{padding:9px 10px}.nfl-game-team img{width:30px;height:30px}.nfl-game-middle{min-width:86px}
        }
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
    pool = pd.concat([offense, defense.head(10)], ignore_index=True).drop_duplicates("player_id")
    cols = st.columns(2)
    for i, (_, row) in enumerate(pool.iterrows()):
        with cols[i % 2]:
            label = f"{row.get('player_name','Player')} · {row.get('position','')}"
            if st.button(label, key=f"game_player_{key_prefix}_{i}_{row.get('player_id')}", use_container_width=True):
                _open_player(row, matchup)


def _render_game_intelligence(game: pd.Series, game_id: str) -> None:
    away = str(game.get("away_team") or "").upper()
    home = str(game.get("home_team") or "").upper()
    when = _time_label(game.get("kickoff_et"))
    stadium = str(game.get("stadium") or "Venue TBD")
    roof = str(game.get("roof") or "Environment TBD").replace("outdoors", "Outdoor").replace("dome", "Dome")
    intel = build_matchup_intelligence(away, home, BASELINE_SEASON)
    away_logo = nfl_team_logo_url(away)
    home_logo = nfl_team_logo_url(home)
    signals = "".join(f'<div class="nfl-signal">• {escape(s)}</div>' for s in intel.get("signals", [])[:4])

    _render_html(
        f"""
        <div class="nfl-intel-shell">
          <div class="nfl-matchup-head">
            <div class="nfl-team"><img src="{escape(away_logo)}"><strong>{escape(away)}</strong></div>
            <div class="nfl-at">AT</div>
            <div class="nfl-team home"><strong>{escape(home)}</strong><img src="{escape(home_logo)}"></div>
          </div>
          <div class="nfl-rundown"><b>Game Rundown</b><br>{escape(intel.get('rundown','Matchup context is loading.'))}</div>
          <div class="nfl-game-metrics">
            <div class="nfl-game-metric"><span>KICKOFF</span><strong>{escape(when)}</strong></div>
            <div class="nfl-game-metric"><span>VENUE</span><strong>{escape(stadium)}</strong></div>
            <div class="nfl-game-metric"><span>ENVIRONMENT</span><strong>{escape(roof)}</strong></div>
          </div>
          <div class="nfl-scout"><div class="nfl-scout-title">SCOUT DESK · MATCHUP SIGNALS</div>{signals or '<div class="nfl-signal">More matchup signals will populate as Week 1 data arrives.</div>'}</div>
        </div>
        """
    )

    away_tab, home_tab = st.tabs([away, home])
    with away_tab:
        _player_buttons(away, f"{away} @ {home}", f"{game_id}_away")
    with home_tab:
        _player_buttons(home, f"{away} @ {home}", f"{game_id}_home")


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

    games = schedule[pd.to_numeric(schedule["week"], errors="coerce").eq(int(week))].copy()
    games = games.sort_values(["kickoff_et", "game_id"], kind="stable")
    _render_html(
        f'<div class="nfl-games-hero"><h1>Week {int(week)} NFL Games</h1><p>Open a matchup for the game rundown, environment and matchup signals, then move directly into either team roster.</p></div>'
    )

    query_selected = st.query_params.get("nfl_game")
    if query_selected:
        st.session_state["nfl_selected_game"] = str(query_selected)
    selected_id = st.session_state.get("nfl_selected_game")

    games["day_key"] = games["kickoff_et"].dt.normalize()
    for day_key in games["day_key"].drop_duplicates().tolist():
        day_games = games[games["day_key"].eq(day_key)].sort_values("kickoff_et", kind="stable")
        day = pd.to_datetime(day_key, errors="coerce")
        day_label = f"{day.strftime('%A')} · {day.strftime('%B')} {day.day}" if pd.notna(day) else "Kickoff TBD"
        _render_html(f'<div class="nfl-day-heading">{escape(day_label)}</div>')

        for _, game in day_games.iterrows():
            away = str(game.get("away_team") or "").upper()
            home = str(game.get("home_team") or "").upper()
            when = _time_label(game.get("kickoff_et"))
            game_id = str(game.get("game_id") or f"{week}-{away}-{home}")
            away_logo = nfl_team_logo_url(away)
            home_logo = nfl_team_logo_url(home)
            href = f"?nfl_game={quote(game_id, safe='')}"
            _render_html(
                f"""
                <a class="nfl-game-row" href="{href}">
                  <div class="nfl-game-team"><img src="{escape(away_logo)}" alt="{escape(away)}"><strong>{escape(away)}</strong></div>
                  <div class="nfl-game-middle"><b>@</b><span>{escape(when)}</span></div>
                  <div class="nfl-game-team home"><img src="{escape(home_logo)}" alt="{escape(home)}"><strong>{escape(home)}</strong></div>
                </a>
                """
            )
            if str(selected_id) == game_id:
                _render_game_intelligence(game, game_id)

show()
