"""WNBA workspace for Sach Sports Dashboard."""

from __future__ import annotations

from datetime import datetime, timedelta
from html import escape
import json
from pathlib import Path
from zoneinfo import ZoneInfo

import pandas as pd
import streamlit as st

from data.wnba_schedule import current_wnba_window, load_wnba_scoreboard
from data.wnba_stats import WNBA_BASELINE_SEASON, wnba_headshot_url
from engines.wnba_rankings import build_wnba_baseline_top25
from components.wnba_prediction_performance import render_wnba_prediction_performance

WNBA_SEASON = "2026"
TORONTO_TZ = ZoneInfo("America/Toronto")
WNBA_MOVEMENT_FILE = Path("/tmp/sach_wnba_rank_movement.json")

WNBA_PROPS = [
    "Points",
    "Rebounds",
    "Assists",
    "3-Pointers Made",
    "Points + Rebounds + Assists (PRA)",
    "Points + Rebounds",
    "Points + Assists",
    "Rebounds + Assists",
    "Steals",
    "Blocks",
]


def _inject_wnba_mobile_css() -> None:
    st.markdown(
        """
        <style>
        :root {
            --wnba-panel: #0d0f10;
            --wnba-panel-2: #111315;
            --wnba-border: #34383d;
            --wnba-accent: #19d978;
            --wnba-gold: #d6b35c;
            --wnba-soft: #a7abb2;
        }

        .wnba-hero {
            border: 2px solid rgba(214,179,92,.88);
            border-radius: 15px;
            padding: 10px 12px;
            background: linear-gradient(105deg, rgba(214,179,92,.24) 0%, rgba(4,5,4,.98) 44%, rgba(25,217,120,.25) 100%);
            margin: 0 0 6px;
            box-shadow: inset 0 0 24px rgba(25,217,120,.08), 0 0 0 1px rgba(25,217,120,.16);
        }
        .wnba-kicker {
            color: var(--wnba-accent);
            font-size: .76rem;
            font-weight: 800;
            letter-spacing: .08em;
            text-transform: uppercase;
            margin-bottom: .2rem;
        }
        .wnba-hero-title {
            font-size: 1.55rem;
            font-weight: 950;
            color: #fff;
            margin-bottom: .2rem;
        }
        .wnba-soft { color: var(--wnba-soft); font-size: .9rem; }
        .wnba-section-label {
            font-size: 1.03rem;
            font-weight: 800;
            margin: 1rem 0 .45rem 0;
        }
        .wnba-game {
            border: 1.5px solid var(--wnba-border);
            border-left: 4px solid var(--wnba-accent);
            border-radius: 14px;
            padding: .75rem .85rem;
            margin: .55rem 0;
            background: linear-gradient(135deg, #101112, #0d0f10);
        }
        .wnba-prop-shell {
            border: 1px solid var(--wnba-border);
            border-radius: 16px;
            padding: .9rem;
            background: linear-gradient(135deg, #101112, #0d0f10);
            margin-top: .7rem;
        }
        .wnba-prop-name {
            color: var(--wnba-accent);
            font-weight: 850;
            font-size: 1.03rem;
        }
        .wnba-status-chip {
            display: inline-block;
            padding: .2rem .5rem;
            border: 1px solid var(--wnba-border);
            border-radius: 999px;
            color: var(--wnba-soft);
            font-size: .74rem;
            margin-top: .35rem;
        }

        .wnba-player-card {
            display: grid;
            grid-template-columns: 92px minmax(0, 1fr);
            gap: .85rem;
            align-items: center;
            border: 1.5px solid #34383d;
            border-radius: 16px;
            padding: .78rem;
            margin: .58rem 0;
            background: linear-gradient(135deg, #101112, #0d0f10);
        }
        .wnba-player-photo {
            width: 92px;
            height: 92px;
            object-fit: contain;
            object-position: center bottom;
            border-radius: 12px;
            background: rgba(255,255,255,.96);
        }
        .wnba-player-rank {
            font-size: 1.12rem;
            font-weight: 850;
            line-height: 1.2;
            margin-bottom: .18rem;
        }
        .wnba-player-meta {
            color: var(--wnba-soft);
            font-size: .78rem;
            margin-bottom: .55rem;
        }
        .wnba-stat-grid {
            display: grid;
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: .4rem;
        }
        .wnba-stat-box {
            border: 1px solid #34383d;
            border-radius: 10px;
            padding: .42rem .5rem;
            background: #111315;
        }
        .wnba-stat-label {
            color: var(--wnba-soft);
            font-size: .66rem;
            line-height: 1.1;
            margin-bottom: .16rem;
        }
        .wnba-stat-value {
            font-size: 1rem;
            font-weight: 800;
            line-height: 1.1;
        }
        .wnba-baseline-note {
            color: var(--wnba-soft);
            font-size: .68rem;
            margin-top: .45rem;
        }

        /* Match MLB/NFL navigation accents: emerald + gold, never the default red. */
        [data-testid="stTabs"] [data-baseweb="tab-highlight"],
        [data-baseweb="tab-highlight"] { background:#d6b35c !important; background-color:#d6b35c !important; }
        [data-testid="stTabs"] button[role="tab"][aria-selected="true"],
        button[data-baseweb="tab"][aria-selected="true"] { color:#fff !important; border-bottom-color:#d6b35c !important; box-shadow:inset 0 -3px 0 #d6b35c !important; }
        .wnba-updated-time{color:#a7abb2;font-size:.68rem;font-weight:750;text-align:right;margin:2px 0 6px;}

        @media (max-width: 700px) {
            [data-testid="stAppViewBlockContainer"], [data-testid="stAppViewContainer"] .block-container, .main .block-container, .block-container { padding-top:0 !important; margin-top:0 !important; }
            .block-container { padding-left: .85rem !important; padding-right: .85rem !important; }
            .wnba-hero { padding:10px 12px !important; border-radius:15px !important; margin-top:0 !important; margin-bottom:6px !important; }
            .wnba-hero-title { font-size:1.38rem !important; line-height:1.08 !important; }
            .wnba-soft { font-size:.82rem; line-height:1.42; }
            .wnba-game, .wnba-prop-shell { border-radius: 13px; padding: .72rem; }
            .stTabs [data-baseweb="tab-list"] {
                gap: .12rem;
                overflow-x: auto;
                scrollbar-width: none;
            }
            .stTabs [data-baseweb="tab"] {
                padding-left: .5rem;
                padding-right: .5rem;
                white-space: nowrap;
            }
            div[data-testid="stMetric"] { padding: .3rem .35rem; }
            div[data-testid="stMetricLabel"] { font-size: .72rem; }
            div[data-testid="stMetricValue"] { font-size: 1rem; }

            .wnba-player-card {
                grid-template-columns: 74px minmax(0, 1fr);
                gap: .65rem;
                padding: .64rem;
                border-radius: 14px;
            }
            .wnba-player-photo {
                width: 74px;
                height: 74px;
                border-radius: 10px;
            }
            .wnba-player-rank { font-size: 1rem; }
            .wnba-player-meta { font-size: .71rem; margin-bottom: .42rem; }
            .wnba-stat-grid { gap: .3rem; }
            .wnba-stat-box { padding: .34rem .38rem; border-radius: 8px; }
            .wnba-stat-label { font-size: .6rem; }
            .wnba-stat-value { font-size: .9rem; }
            .wnba-baseline-note { font-size: .62rem; }
        }
        </style>
        """,
        unsafe_allow_html=True,
    )


def _hero() -> None:
    st.markdown(
        """
        <div class="wnba-hero">
            <div class="wnba-kicker">WNBA</div>
            <div class="wnba-hero-title">WNBA Intelligence Center</div>
            <div class="wnba-soft">Daily slate intelligence, player-prop rankings and prediction performance in one place.</div>
        </div>
        """,
        unsafe_allow_html=True,
    )


def _format_tipoff(value) -> str:
    ts = pd.to_datetime(value, errors="coerce")
    if pd.isna(ts):
        return "Time TBD"
    if ts.tzinfo is None:
        ts = ts.tz_localize(TORONTO_TZ)
    else:
        ts = ts.tz_convert(TORONTO_TZ)
    return ts.strftime("%a %b %d • %I:%M %p ET")


def _score_text(game: pd.Series) -> str:
    away_score = game.get("away_score")
    home_score = game.get("home_score")
    if pd.notna(away_score) and pd.notna(home_score):
        return f"{game.get('away_abbr', '')} {int(away_score)} — {game.get('home_abbr', '')} {int(home_score)}"
    return ""


def _render_game_card(game: pd.Series, show_score: bool = True) -> None:
    score = _score_text(game) if show_score else ""
    score_line = f"<br><strong>{score}</strong>" if score else ""
    st.markdown(
        f"""
        <div class="wnba-game">
            <strong>{escape(str(game.get('away_team', 'Away')))} @ {escape(str(game.get('home_team', 'Home')))}</strong>
            {score_line}
            <br><span class="wnba-soft">{_format_tipoff(game.get('tipoff_et'))} • {escape(str(game.get('status', 'Scheduled')))}</span>
        </div>
        """,
        unsafe_allow_html=True,
    )


def _load_current_games() -> pd.DataFrame:
    try:
        return current_wnba_window(days_back=1, days_forward=14)
    except Exception:
        return pd.DataFrame()


def _render_intelligence() -> None:
    games = _load_current_games()
    upcoming = pd.DataFrame()
    live = pd.DataFrame()

    if not games.empty:
        live = games[games["state"].eq("in")].copy()
        upcoming = games[games["state"].eq("pre")].copy()

    c1, c2, c3 = st.columns(3)
    c1.metric("Season", WNBA_SEASON)
    c2.metric("Live Games", len(live))
    c3.metric("Upcoming", len(upcoming))

    st.markdown('<div class="wnba-section-label">🔥 Slate Intelligence</div>', unsafe_allow_html=True)
    if live.empty and upcoming.empty:
        st.info(
            "There is no active WNBA slate in the current window. The Intelligence Center will populate from real schedule and game data as the current 2026 slate changes."
        )
    else:
        slate = pd.concat([live, upcoming], ignore_index=True).head(8)
        for _, game in slate.iterrows():
            _render_game_card(game, show_score=True)

    st.markdown('<div class="wnba-section-label">🎯 Prop Intelligence</div>', unsafe_allow_html=True)
    st.markdown(
        """
        <div class="wnba-prop-shell">
            <div class="wnba-prop-name">10 WNBA prop markets are enabled in the interface</div>
            <div class="wnba-soft">Points • Rebounds • Assists • 3PM • PRA • P+R • P+A • R+A • Steals • Blocks</div>
            <div class="wnba-status-chip">No fabricated rankings</div>
        </div>
        """,
        unsafe_allow_html=True,
    )
    st.caption(
        "Baseline rankings use real 2026 WNBA regular-season statistics. Current-slate availability, matchup, market and prediction layers are added separately so baseline performance is never mislabeled as a prediction."
    )


def _render_games_schedule() -> None:
    st.subheader("Games / Schedule")
    st.caption("WNBA schedule and game status from the live scoreboard source.")

    today = datetime.now(TORONTO_TZ).date()
    start = st.date_input("From", value=today, key="wnba_schedule_from")
    end = st.date_input("To", value=today + timedelta(days=14), key="wnba_schedule_to")

    if end < start:
        st.warning("The end date must be on or after the start date.")
        return

    try:
        games = load_wnba_scoreboard(start.isoformat(), end.isoformat())
    except Exception as exc:
        st.warning("WNBA schedule data is temporarily unavailable.")
        st.caption(str(exc))
        return

    if games.empty:
        st.info("No WNBA games are scheduled in this date range.")
        return

    st.caption(f"{len(games)} game{'s' if len(games) != 1 else ''} found")
    for _, game in games.iterrows():
        _render_game_card(game, show_score=True)


def _load_movement_state() -> dict:
    try:
        if WNBA_MOVEMENT_FILE.exists():
            return json.loads(WNBA_MOVEMENT_FILE.read_text(encoding="utf-8"))
    except Exception:
        pass
    return {}


def _apply_rank_movement(df: pd.DataFrame, category: str) -> pd.DataFrame:
    """Compare the current Top 25 with the prior rendered ranking for this prop."""
    if df is None or df.empty:
        return df

    state = _load_movement_state()
    previous = state.get(category, {})
    current = {}
    movement = []

    for _, row in df.iterrows():
        player_id = row.get("player_id")
        if pd.notna(player_id):
            key = str(int(player_id))
        else:
            key = f"{row.get('player_name')}|{row.get('team')}"

        rank = int(row.get("rank", 0))
        current[key] = rank
        old_rank = previous.get(key)

        if old_rank is None:
            movement.append("NEW")
        elif int(old_rank) > rank:
            movement.append(f"↑ {int(old_rank) - rank}")
        elif int(old_rank) < rank:
            movement.append(f"↓ {rank - int(old_rank)}")
        else:
            movement.append("—")

    out = df.copy()
    out["rank_movement"] = movement
    state[category] = current

    try:
        WNBA_MOVEMENT_FILE.write_text(json.dumps(state), encoding="utf-8")
    except Exception:
        pass

    return out


def _format_number(value, digits: int = 1) -> str:
    numeric = pd.to_numeric(value, errors="coerce")
    if pd.isna(numeric):
        return "—"
    return f"{float(numeric):.{digits}f}"


def _render_baseline_player(row: pd.Series) -> None:
    rank = int(row.get("rank", 0))
    player = escape(str(row.get("player_name", "Unknown Player")))
    team = escape(str(row.get("team", "—")))
    player_id = row.get("player_id")
    metric_label = escape(str(row.get("metric_label", "Per Game")))
    movement = escape(str(row.get("rank_movement", "—")))

    image_html = ""
    if pd.notna(player_id):
        image_html = (
            f'<img class="wnba-player-photo" src="{wnba_headshot_url(int(player_id))}" '
            f'alt="{player} headshot">'
        )
    else:
        image_html = '<div class="wnba-player-photo"></div>'

    games = pd.to_numeric(row.get("games_played"), errors="coerce")
    games_text = f"{int(games)}" if pd.notna(games) else "—"

    st.markdown(
        f"""
        <div class="wnba-player-card">
            <div>{image_html}</div>
            <div>
                <div class="wnba-player-rank">#{rank} {player}</div>
                <div class="wnba-player-meta">{team} • {movement} • {WNBA_BASELINE_SEASON} regular-season baseline</div>
                <div class="wnba-stat-grid">
                    <div class="wnba-stat-box">
                        <div class="wnba-stat-label">{metric_label}</div>
                        <div class="wnba-stat-value">{_format_number(row.get('ranking_value'))}</div>
                    </div>
                    <div class="wnba-stat-box">
                        <div class="wnba-stat-label">Games</div>
                        <div class="wnba-stat-value">{games_text}</div>
                    </div>
                    <div class="wnba-stat-box">
                        <div class="wnba-stat-label">MIN/G</div>
                        <div class="wnba-stat-value">{_format_number(row.get('minutes_per_game'))}</div>
                    </div>
                </div>
                <div class="wnba-baseline-note">Current-season statistical baseline • not a prop-line prediction</div>
            </div>
        </div>
        """,
        unsafe_allow_html=True,
    )


def _render_player_props() -> None:
    st.subheader("Player Props")
    prop = st.selectbox("Select Prop", WNBA_PROPS, key="wnba_prop_selector")

    st.markdown(f"### Top 25 {prop}")
    st.caption(
        f"Real {WNBA_BASELINE_SEASON} regular-season statistical baseline • minimum 10 games • "
        "prediction/GI layer comes after current-slate market inputs are connected"
    )

    try:
        top25 = build_wnba_baseline_top25(prop, WNBA_BASELINE_SEASON, minimum_games=10)
    except Exception as exc:
        st.warning("WNBA player baseline data is temporarily unavailable.")
        st.caption(str(exc))
        return

    top25 = _apply_rank_movement(top25, prop)

    if top25.empty:
        st.info("No qualified real-player baseline rows are available for this prop right now.")
        return

    for _, row in top25.iterrows():
        _render_baseline_player(row)


def _render_results_performance() -> None:
    render_wnba_prediction_performance()

def show() -> None:
    _inject_wnba_mobile_css()

    # Shared menu is rendered by app.py. Hero sits directly beneath it, matching NFL spacing.
    _hero()
    now = datetime.now(TORONTO_TZ)
    st.markdown(
        f'<div class="wnba-updated-time">Updated {now.strftime("%A · %I:%M %p ET")}</div>',
        unsafe_allow_html=True,
    )

    tabs = st.tabs(
        [
            "🧠 Intelligence",
            "📅 Games / Schedule",
            "🎯 Player Props",
            "📈 Prediction Performance",
        ]
    )

    with tabs[0]:
        _render_intelligence()
    with tabs[1]:
        _render_games_schedule()
    with tabs[2]:
        _render_player_props()
    with tabs[3]:
        _render_results_performance()


show()
