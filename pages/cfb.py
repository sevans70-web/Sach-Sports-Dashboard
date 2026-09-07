from __future__ import annotations

from datetime import datetime
from html import escape
from zoneinfo import ZoneInfo

import pandas as pd
import requests
import streamlit as st

from data.cfb_intelligence import build_cfb_rankings
from data.cfb_odds import get_cfb_odds_feed_status
from components.cfb_prediction_performance import render_cfb_prediction_performance

CFB_SEASON = 2026
TORONTO_TIMEZONE = ZoneInfo("America/Toronto")
ESPN_SCOREBOARD = "https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard"

PROP_CATALOG = [
    ("Passing Yards", "🏈"),
    ("Passing Attempts", "🔁"),
    ("Completions", "✅"),
    ("Rushing Yards", "🏃"),
    ("Rushing Attempts", "💨"),
    ("Receiving Yards", "🙌"),
    ("Receptions", "🧤"),
    ("Anytime TD", "🔥"),
    ("First TD", "1️⃣"),
]


def _render_html(html: str) -> None:
    clean = " ".join(line.strip() for line in html.splitlines() if line.strip())
    st.markdown(clean, unsafe_allow_html=True)


@st.cache_data(ttl=300, show_spinner=False)
def _load_scoreboard() -> pd.DataFrame:
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

        rows.append(
            {
                "game_id": event.get("id"),
                "kickoff": pd.to_datetime(event.get("date"), errors="coerce", utc=True),
                "away_team": (away.get("team") or {}).get("displayName", "Away"),
                "home_team": (home.get("team") or {}).get("displayName", "Home"),
                "away_score": away.get("score"),
                "home_score": home.get("score"),
                "status": status.get("shortDetail") or status.get("description") or "Scheduled",
                "completed": bool(status.get("completed")),
                "venue": venue.get("fullName") or "Venue TBD",
                "week": (event.get("week") or {}).get("number"),
            }
        )
    frame = pd.DataFrame(rows)
    if not frame.empty:
        frame = frame.sort_values(["kickoff", "game_id"], kind="stable").reset_index(drop=True)
    return frame


def _inject_css() -> None:
    st.markdown(
        """
        <style>
        .block-container{max-width:1180px;padding-top:0!important;padding-bottom:2.5rem!important;position:relative!important}

        .cfb-hero{margin:0 0 10px;padding:14px;border-radius:15px;background:linear-gradient(105deg,rgba(255,204,51,.28) 0%,rgba(4,5,4,.98) 44%,rgba(25,217,120,.28) 100%);border:2px solid rgba(255,204,51,.88);box-shadow:inset 0 0 24px rgba(25,217,120,.08),0 0 0 1px rgba(25,217,120,.18);overflow:hidden}
        .cfb-hero-title{margin:0!important;color:#fff!important;font-size:1.55rem!important;font-weight:950!important;line-height:1.08!important;white-space:normal!important;overflow-wrap:anywhere}
        .cfb-hero-subtitle{margin:9px 0 0!important;color:#f0f0f0!important;font-size:.95rem!important;line-height:1.45!important;max-width:900px}

        div[class*="st-key-cfb_games_entry"]{margin-bottom:-.20rem!important}
        div[class*="st-key-cfb_games_entry"] button{width:100%!important;min-height:76px!important;padding:12px 10px!important;margin:4px 0 7px!important;text-align:left!important;justify-content:flex-start!important;border:1.5px solid rgba(214,179,92,.68)!important;border-left:5px solid #19d978!important;border-radius:13px!important;background:linear-gradient(112deg,rgba(246,200,76,.12) 0%,#0d0f10 36%,#0b0d0e 68%,rgba(25,217,120,.10) 100%)!important;color:#fff!important;font-weight:900!important;line-height:1.28!important}
        div[class*="st-key-cfb_games_entry"] button:after{content:'›';margin-left:auto;font-size:1.4rem;color:#cfd3d6}

        .cfb-snapshot-heading{margin:13px 0 9px;color:#fff;font-size:1.08rem;font-weight:950;white-space:nowrap}
        .cfb-snapshot-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
        .cfb-snapshot-card{min-height:98px;padding:12px 10px;border:2px solid #3a3d42;border-radius:16px;background:#111315;display:flex;flex-direction:column;justify-content:center;min-width:0}
        .cfb-snapshot-card span{color:#fff;font-size:.70rem;font-weight:900;letter-spacing:.08em}
        .cfb-snapshot-card strong{color:#fff;font-size:1.45rem;line-height:1.1;margin:5px 0}
        .cfb-snapshot-card small{color:#fff;font-size:.66rem;font-weight:650;line-height:1.15;white-space:nowrap}
        .cfb-snapshot-emerald{border-color:rgba(25,217,120,.92)}.cfb-snapshot-emerald strong{color:#19d978}
        .cfb-snapshot-gold{border-color:#d8b35f}.cfb-snapshot-gold strong{color:#d8b35f}

        .cfb-performance{margin:18px 0 6px;padding:13px;border:1px solid #34373c;border-radius:14px;background:#0d0f10}
        .cfb-performance strong{display:block;font-size:1.08rem;color:#fff}
        .cfb-performance span{display:block;margin-top:5px;color:#aeb3ba;font-size:.78rem;line-height:1.35}

        .cfb-rankings-heading{margin:24px 0 8px}.cfb-rankings-heading strong{display:block;color:#fff;font-size:1.28rem;font-weight:950}.cfb-rankings-heading span{display:block;color:#c4c7cc;font-size:.80rem;line-height:1.35;margin-top:4px}
        div[data-testid="stTabs"] [data-baseweb="tab-list"]{overflow-x:auto!important;overflow-y:hidden!important;flex-wrap:nowrap!important;scrollbar-width:none!important;gap:0!important;padding-bottom:2px!important}
        div[data-testid="stTabs"] [data-baseweb="tab-list"]::-webkit-scrollbar{display:none!important}
        div[data-testid="stTabs"] button[role="tab"]{flex:0 0 auto!important;white-space:nowrap!important;background:#0d0f10!important;color:#fff!important;border:1px solid #34373c!important;padding:.45rem .78rem!important;min-height:40px!important}
        div[data-testid="stTabs"] button[role="tab"][aria-selected="true"]{color:#d8b35f!important;border-color:#8c64aa!important;background:#1b1221!important}
        div[data-testid="stTabs"] [data-baseweb="tab-highlight"]{background:#d8b35f!important}

        .cfb-rank-card{display:grid;grid-template-columns:40px minmax(0,1fr) 78px;gap:10px;align-items:start;width:100%;min-height:108px;padding:12px 10px;border-left:4px solid #d8b35f;background:#0d0f10;color:#fff;box-sizing:border-box}
        .cfb-rank-number strong{display:block;color:#fff;font-size:.92rem;font-weight:950}
        .cfb-rank-name{display:block;color:#fff;font-size:.96rem;font-weight:950}
        .cfb-rank-meta{color:#e4e6e8;font-size:.75rem;margin-top:4px}
        .cfb-rank-proj{color:#d8b35f;font-size:.77rem;font-weight:850;margin-top:4px}
        .cfb-rank-market{color:#9fa4aa;font-size:.68rem;margin-top:3px}
        .cfb-rank-score{text-align:right;padding-top:3px}.cfb-rank-score small{display:block;color:#9fa4aa;font-size:.51rem;font-weight:900}.cfb-rank-score strong{display:block;color:#b98bd6;font-size:1.03rem;font-weight:950;margin-top:3px}
        .cfb-intel-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:7px;margin:8px 0}
        .cfb-intel-metric{background:#111315;border:1px solid #2c3034;border-radius:10px;padding:8px 7px}.cfb-intel-metric span{display:block;color:#9fa4aa;font-size:.56rem;font-weight:900}.cfb-intel-metric strong{display:block;color:#fff;font-size:.78rem;margin-top:3px}
        .cfb-why{margin:8px 0 4px;padding:10px;border-left:3px solid #8c64aa;background:#131016;color:#d6d9dd;font-size:.74rem;line-height:1.4}.cfb-why b{display:block;color:#d8b35f;margin-bottom:4px}

        @media(max-width:700px){
            .block-container{padding-left:.78rem!important;padding-right:.78rem!important}
            .cfb-hero-title{font-size:1.28rem!important}.cfb-hero-subtitle{font-size:.82rem!important}
            .cfb-snapshot-card{min-height:90px;padding:10px 8px}.cfb-snapshot-card strong{font-size:1.18rem}
            .cfb-rank-card{grid-template-columns:35px minmax(0,1fr) 64px;gap:7px;padding:10px 8px}
            .cfb-intel-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
        }
        </style>
        """,
        unsafe_allow_html=True,
    )


def _when(value) -> str:
    stamp = pd.to_datetime(value, errors="coerce", utc=True)
    if pd.isna(stamp):
        return "Kickoff TBD"
    return stamp.tz_convert(TORONTO_TIMEZONE).strftime("%a %b %d · %I:%M %p ET")


def _snapshot(games: pd.DataFrame) -> tuple[int, int, int]:
    if games.empty:
        return 0, 0, 0
    now = pd.Timestamp.now(tz="UTC")
    upcoming = int((games["kickoff"].notna() & (games["kickoff"] >= now) & ~games["completed"]).sum())
    final = int(games["completed"].sum())
    live = int((~games["completed"] & games["status"].astype(str).str.contains("Q|Halftime|OT", case=False, regex=True)).sum())
    return upcoming, live, final


def _render_rank_card(row: pd.Series, prop: str) -> None:
    rank = int(row.get("rank") or 0)
    name = str(row.get("player_name") or "Player")
    matchup = str(row.get("matchup") or "Matchup pending")
    line = row.get("consensus_line")
    model = row.get("model_probability")
    market = row.get("sportsbook_implied_probability")
    gi = row.get("gi_score")
    mode = str(row.get("ranking_mode") or "Market Foundation")

    projection = "Projection pending"
    if model is not None and not pd.isna(model):
        projection = f"Model probability {float(model):.1f}%"

    market_text = mode
    if line is not None and not pd.isna(line):
        market_text = f"Market line {float(line):.1f}"

    gi_text = "—" if gi is None or pd.isna(gi) else f"{float(gi):.1f}"

    _render_html(
        f"""
        <div class="cfb-rank-card">
          <div class="cfb-rank-number"><strong>#{rank}</strong></div>
          <div>
            <strong class="cfb-rank-name">{escape(name)}</strong>
            <div class="cfb-rank-meta">{escape(matchup)}</div>
            <div class="cfb-rank-proj">{escape(projection)}</div>
            <div class="cfb-rank-market">{escape(market_text)}</div>
          </div>
          <div class="cfb-rank-score"><small>GI SCORE</small><strong>{gi_text}</strong></div>
        </div>
        """
    )

    detail_key = f"cfb_intel_{prop}_{rank}_{name}".replace(" ", "_").replace("+", "plus")
    if st.button(
        "ⓘ Hide Intelligence" if st.session_state.get(detail_key) else "ⓘ View Intelligence",
        key=f"{detail_key}_button",
        use_container_width=True,
    ):
        st.session_state[detail_key] = not st.session_state.get(detail_key, False)
        st.rerun()

    if st.session_state.get(detail_key):
        per_game = row.get("per_game")
        stats_year = row.get("stats_season")
        verified = bool(row.get("stats_verified", False))
        metrics = [
            ("MODEL", f"{float(model):.1f}%" if model is not None and not pd.isna(model) else "—"),
            ("MARKET", f"{float(market):.1f}%" if market is not None and not pd.isna(market) else "—"),
            ("PER GAME", f"{float(per_game):.1f}" if per_game is not None and not pd.isna(per_game) else "—"),
            ("DATA", f"{int(stats_year)}" if verified and stats_year else "Market"),
        ]
        metric_html = "".join(
            f'<div class="cfb-intel-metric"><span>{escape(label)}</span><strong>{escape(value)}</strong></div>'
            for label, value in metrics
        )
        _render_html(f'<div class="cfb-intel-grid">{metric_html}</div>')
        why = str(row.get("why_engine") or "Current ranking uses the verified CFB data that is available.")
        _render_html(f'<div class="cfb-why"><b>Why This Player Ranks Here</b>{escape(why)}</div>')


def _render_rankings() -> None:
    _render_html(
        """
        <div class="cfb-rankings-heading">
          <strong>🏆 Player Rankings</strong>
          <span>Market-specific intelligence · Top players first · swipe the markets for more</span>
        </div>
        """
    )

    labels = [f"{icon} {prop}" for prop, icon in PROP_CATALOG]
    tabs = st.tabs(labels)

    for tab, (prop, _) in zip(tabs, PROP_CATALOG):
        with tab:
            rankings = build_cfb_rankings(prop)
            if rankings is None or rankings.empty:
                feed = get_cfb_odds_feed_status()
                st.info(feed.get("message") or f"No {prop} markets are available right now.")
                continue

            state_key = "cfb_full_" + prop.lower().replace(" ", "_").replace("+", "plus")
            show_full = bool(st.session_state.get(state_key, False))
            rows = rankings if show_full else rankings.head(5)

            for _, row in rows.iterrows():
                with st.container(border=True):
                    _render_rank_card(row, prop)

            if len(rankings) > 5:
                label = "Show Top 5 Only" if show_full else f"View Full Rankings · {prop}"
                if st.button(label, key=f"{state_key}_toggle", use_container_width=True):
                    st.session_state[state_key] = not show_full
                    st.rerun()


def show() -> None:
    _inject_css()

    # Shared menu / refresh / timestamp are rendered by app.py.

    _render_html(
        """
        <div class="cfb-hero">
          <h1 class="cfb-hero-title">CFB Intelligence Center</h1>
          <p class="cfb-hero-subtitle">College football game intelligence, player-prop rankings and matchup context — built in the same workflow as NFL, with CFB-specific market depth.</p>
        </div>
        """
    )

    if st.button(
        "🏈 THIS WEEK'S CFB GAMES\nOpen the college football slate, then tap a matchup for game intelligence.",
        key="cfb_games_entry",
        use_container_width=True,
    ):
        st.switch_page("pages/cfb_games.py")

    try:
        games = _load_scoreboard()
    except Exception:
        games = pd.DataFrame()

    upcoming, live, final = _snapshot(games)
    game_count = int(len(games))
    week_values = pd.to_numeric(games.get("week"), errors="coerce").dropna() if not games.empty and "week" in games.columns else pd.Series(dtype=float)
    week_label = f"Week {int(week_values.mode().iloc[0])}" if not week_values.empty else "Current week"
    lineup_count = "—"
    alert_count = 0

    _render_html(
        f"""
        <div class="cfb-snapshot-heading">This Week's CFB Snapshot</div>
        <div class="cfb-snapshot-grid">
          <div class="cfb-snapshot-card cfb-snapshot-emerald"><span>GAMES</span><strong>{game_count}</strong><small>{escape(week_label)}</small></div>
          <div class="cfb-snapshot-card"><span>LINEUPS</span><strong>{lineup_count}</strong><small>Pending</small></div>
          <div class="cfb-snapshot-card cfb-snapshot-gold"><span>ALERTS</span><strong>{alert_count}</strong><small>No active alerts</small></div>
        </div>
        """
    )

    render_cfb_prediction_performance()

    _render_rankings()


show()
