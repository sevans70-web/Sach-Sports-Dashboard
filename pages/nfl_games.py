from __future__ import annotations

from datetime import datetime
from html import escape
from zoneinfo import ZoneInfo

import pandas as pd
import streamlit as st

from data.nfl_schedule import load_nfl_schedule

NFL_SEASON = 2026
TORONTO_TIMEZONE = ZoneInfo("America/Toronto")


def _render_html(html: str) -> None:
    clean = " ".join(line.strip() for line in html.splitlines() if line.strip())
    st.markdown(clean, unsafe_allow_html=True)


def _css() -> None:
    st.markdown(
        """
        <style>
        .block-container{max-width:1180px;padding-top:.55rem!important;padding-bottom:2.5rem!important}
        .nfl-games-hero{margin:.3rem 0 .65rem;padding:18px 20px;border-radius:18px;background:linear-gradient(105deg,rgba(255,204,51,.24) 0%,rgba(4,5,4,.98) 44%,rgba(25,217,120,.24) 100%);border:2px solid rgba(255,204,51,.88);box-shadow:inset 0 0 24px rgba(25,217,120,.08),0 0 0 1px rgba(25,217,120,.18)}
        .nfl-games-hero h1{margin:0;color:#fff;font-size:1.85rem;font-weight:950}.nfl-games-hero p{margin:8px 0 0;color:#e7e7e7;font-size:.90rem}
        div[class*="st-key-nfl_game_btn_"] button{width:100%!important;min-height:74px!important;margin:3px 0 7px!important;padding:10px 12px!important;justify-content:flex-start!important;text-align:left!important;background:linear-gradient(112deg,rgba(246,200,76,.08),#0d0f10 40%,rgba(25,217,120,.07))!important;color:#fff!important;border:1.5px solid #3b3e43!important;border-left:4px solid #19d978!important;border-radius:13px!important;font-weight:850!important;white-space:pre-line!important}
        div[class*="st-key-nfl_game_btn_"] button:hover{border-color:#f6c84c!important;border-left-color:#19d978!important}
        .nfl-game-detail{border:1.5px solid rgba(214,179,92,.70);border-radius:16px;padding:14px;background:#0d0f10;margin:12px 0}.nfl-game-detail h3{margin:0;color:#fff;font-size:1.15rem}.nfl-game-detail p{color:#c4c7cc;font-size:.82rem;margin:5px 0 0}
        @media(max-width:700px){.block-container{padding-left:.85rem!important;padding-right:.85rem!important}.nfl-games-hero{padding:15px}.nfl-games-hero h1{font-size:1.55rem}div[class*="st-key-nfl_game_btn_"] button{min-height:70px!important;font-size:.80rem!important}}
        </style>
        """,
        unsafe_allow_html=True,
    )


def _load_phase(phase: str) -> pd.DataFrame:
    try:
        return load_nfl_schedule(NFL_SEASON, phase).copy()
    except Exception:
        return pd.DataFrame()


def show() -> None:
    _css()
    if st.button("← Back to NFL Intelligence", key="nfl_games_back"):
        st.switch_page("pages/nfl.py")

    phase = str(st.session_state.get("nfl_active_phase") or "REG")
    schedule = _load_phase(phase)
    if schedule.empty and phase == "REG":
        phase = "PRE"
        schedule = _load_phase(phase)

    if schedule.empty:
        st.info("NFL schedule is temporarily unavailable.")
        return

    schedule["kickoff_et"] = pd.to_datetime(schedule["kickoff_et"], errors="coerce")
    weeks = sorted(pd.to_numeric(schedule["week"], errors="coerce").dropna().astype(int).unique())
    active_week = st.session_state.get("nfl_active_week")
    default_index = weeks.index(int(active_week)) if active_week in weeks else 0

    _render_html(
        """
        <section class="nfl-games-hero"><h1>Weekly NFL Games</h1><p>Open the full week early, then drill into any matchup for game intelligence and player-prop context.</p></section>
        """
    )

    week = st.selectbox("NFL Week", weeks, index=default_index, key="nfl_games_week_selector")
    games = schedule[pd.to_numeric(schedule["week"], errors="coerce") == int(week)].copy().sort_values("kickoff_et", na_position="last")

    st.markdown(f"### Week {week} · {len(games)} games")
    selected_key = st.session_state.get("nfl_selected_game")

    for idx, (_, game) in enumerate(games.iterrows()):
        away = str(game.get("away_team") or "")
        home = str(game.get("home_team") or "")
        kickoff = pd.to_datetime(game.get("kickoff_et"), errors="coerce")
        when = kickoff.strftime("%A · %b %d · %I:%M %p ET") if pd.notna(kickoff) else "Kickoff TBD"
        status = str(game.get("status") or "Scheduled")
        label = f"🏈 {away} @ {home}\n{when} · {status}"
        key = f"{week}|{away}|{home}|{idx}"
        if st.button(label, key=f"nfl_game_btn_{idx}_{week}", use_container_width=True):
            st.session_state["nfl_selected_game"] = key
            selected_key = key

        if selected_key == key:
            score_text = ""
            away_score = game.get("away_score")
            home_score = game.get("home_score")
            if pd.notna(away_score) and pd.notna(home_score):
                score_text = f" · {away} {int(away_score)} — {home} {int(home_score)}"
            _render_html(
                f"""
                <div class="nfl-game-detail">
                  <h3>{escape(away)} @ {escape(home)}</h3>
                  <p>{escape(when)} · {escape(status)}{escape(score_text)}</p>
                  <p><b style="color:#f6c84c">Game Intelligence:</b> this matchup is the entry point for player cards, all tracked props, Last 5 / Last 10 form, opponent history, defense-vs-position, weather and injury context.</p>
                </div>
                """
            )
            st.caption("Player-card drill-down will use this selected matchup as context; the weekly schedule itself is now correctly separated from the NFL Intelligence Center.")


show()
