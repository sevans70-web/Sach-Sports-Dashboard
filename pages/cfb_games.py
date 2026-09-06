from __future__ import annotations

from html import escape
from zoneinfo import ZoneInfo

import pandas as pd
import requests
import streamlit as st

TORONTO_TIMEZONE = ZoneInfo("America/Toronto")
ESPN_SCOREBOARD = "https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard"


def _render_html(html: str) -> None:
    clean = " ".join(line.strip() for line in html.splitlines() if line.strip())
    st.markdown(clean, unsafe_allow_html=True)


@st.cache_data(ttl=300, show_spinner=False)
def _load_games() -> pd.DataFrame:
    response = requests.get(
        ESPN_SCOREBOARD,
        params={"limit": 150, "groups": 80},
        timeout=20,
    )
    response.raise_for_status()
    rows = []

    for event in response.json().get("events", []):
        competitions = event.get("competitions") or []
        if not competitions:
            continue
        competition = competitions[0]
        competitors = competition.get("competitors") or []
        home = next((c for c in competitors if c.get("homeAway") == "home"), {})
        away = next((c for c in competitors if c.get("homeAway") == "away"), {})
        status = (event.get("status") or {}).get("type") or {}
        venue = competition.get("venue") or {}
        notes = competition.get("notes") or []

        rows.append(
            {
                "game_id": event.get("id"),
                "kickoff": pd.to_datetime(event.get("date"), errors="coerce", utc=True),
                "away_team": (away.get("team") or {}).get("displayName", "Away"),
                "home_team": (home.get("team") or {}).get("displayName", "Home"),
                "away_logo": (away.get("team") or {}).get("logo") or "",
                "home_logo": (home.get("team") or {}).get("logo") or "",
                "away_score": away.get("score"),
                "home_score": home.get("score"),
                "status": status.get("shortDetail") or status.get("description") or "Scheduled",
                "completed": bool(status.get("completed")),
                "venue": venue.get("fullName") or "Venue TBD",
                "headline": notes[0].get("headline") if notes and isinstance(notes[0], dict) else "",
            }
        )

    frame = pd.DataFrame(rows)
    if not frame.empty:
        frame = frame.sort_values(["kickoff", "game_id"], kind="stable").reset_index(drop=True)
    return frame


def _css() -> None:
    st.markdown(
        """
        <style>
        .block-container{max-width:1100px;padding-top:.25rem!important}
        .cfb-games-hero{padding:14px;border:1px solid #8c64aa;border-radius:15px;background:linear-gradient(110deg,rgba(216,179,95,.12),#0b0c0d 44%,rgba(91,54,119,.30));margin:5px 0 14px}
        .cfb-games-hero h1{margin:0;color:#fff;font-size:1.45rem}.cfb-games-hero p{margin:6px 0 0;color:#c7c9ce;font-size:.82rem}
        .cfb-day-heading{margin:18px 0 8px;color:#d8b35f;font-size:.82rem;font-weight:950;letter-spacing:.08em;text-transform:uppercase}
        .cfb-game-card{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;padding:12px;border:1px solid #34373c;border-left:4px solid #8c64aa;border-radius:13px;background:#0d0f10;margin-bottom:8px}
        .cfb-game-title{color:#fff;font-size:.94rem;font-weight:950;line-height:1.35}.cfb-game-meta{color:#aeb3ba;font-size:.74rem;margin-top:5px}.cfb-game-status{color:#d8b35f;font-size:.72rem;font-weight:900;white-space:nowrap}
        .cfb-intel{margin:0 0 14px;padding:12px;border:1px solid #43364e;border-radius:12px;background:#131016}
        .cfb-intel strong{display:block;color:#fff;font-size:1rem}.cfb-intel span{display:block;color:#c7c9ce;font-size:.76rem;margin-top:5px;line-height:1.4}
        @media(max-width:700px){.cfb-game-card{grid-template-columns:1fr}.cfb-game-status{white-space:normal}}
        </style>
        """,
        unsafe_allow_html=True,
    )


def _when(value) -> str:
    stamp = pd.to_datetime(value, errors="coerce", utc=True)
    if pd.isna(stamp):
        return "Kickoff TBD"
    return stamp.tz_convert(TORONTO_TIMEZONE).strftime("%a %b %d · %I:%M %p ET")


def show() -> None:
    _css()

    if st.button("← CFB Intelligence Center", key="back_to_cfb"):
        st.switch_page("pages/cfb.py")

    try:
        games = _load_games()
    except Exception:
        st.error("The CFB schedule feed is temporarily unavailable.")
        return

    _render_html(
        """
        <div class="cfb-games-hero">
          <h1>College Football Games</h1>
          <p>Open a matchup for the game rundown and current game context. The slate is intentionally broader than NFL because college football has many more teams.</p>
        </div>
        """
    )

    if games.empty:
        st.info("No college football games are available in the current feed.")
        return

    query_selected = st.query_params.get("cfb_game")
    if query_selected:
        st.session_state["cfb_selected_game"] = str(query_selected)
    selected_id = st.session_state.get("cfb_selected_game")

    games["day_key"] = games["kickoff"].dt.tz_convert(TORONTO_TIMEZONE).dt.normalize()

    for day_index, day_key in enumerate(games["day_key"].drop_duplicates().tolist()):
        day_games = games[games["day_key"].eq(day_key)]
        day = pd.to_datetime(day_key, errors="coerce")
        day_label = day.strftime("%A · %B %d") if pd.notna(day) else "Kickoff TBD"
        _render_html(f'<div class="cfb-day-heading">{escape(day_label)}</div>')

        for game_index, (_, game) in enumerate(day_games.iterrows()):
            game_id = str(game.get("game_id") or f"{day_index}-{game_index}")
            away = str(game.get("away_team") or "Away")
            home = str(game.get("home_team") or "Home")
            status = str(game.get("status") or "Scheduled")
            when = _when(game.get("kickoff"))

            _render_html(
                f"""
                <div class="cfb-game-card">
                  <div>
                    <div class="cfb-game-title">{escape(away)} @ {escape(home)}</div>
                    <div class="cfb-game-meta">{escape(when)} · {escape(str(game.get("venue") or "Venue TBD"))}</div>
                  </div>
                  <div class="cfb-game-status">{escape(status)}</div>
                </div>
                """
            )

            if st.button(
                "Hide Game Intelligence" if str(selected_id) == game_id else "View Game Intelligence",
                key=f"cfb_game_select_{day_index}_{game_index}_{game_id}",
                use_container_width=True,
            ):
                if str(selected_id) == game_id:
                    st.session_state["cfb_selected_game"] = None
                else:
                    st.session_state["cfb_selected_game"] = game_id
                st.rerun()

            if str(st.session_state.get("cfb_selected_game")) == game_id:
                headline = str(game.get("headline") or "").strip()
                result_text = ""
                if game.get("completed") and game.get("away_score") is not None and game.get("home_score") is not None:
                    result_text = f"Final: {away} {game.get('away_score')} — {home} {game.get('home_score')}."
                context = headline or result_text or "Matchup intelligence will deepen as current-season team and player data accumulates."
                _render_html(
                    f"""
                    <div class="cfb-intel">
                      <strong>🔥 Game Intelligence</strong>
                      <span>{escape(context)}</span>
                    </div>
                    """
                )


show()
