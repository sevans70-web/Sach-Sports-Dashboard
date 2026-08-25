"""NBA workspace for Sach Sports Dashboard."""

from __future__ import annotations

from datetime import datetime, timedelta
from html import escape
import json
from pathlib import Path
from zoneinfo import ZoneInfo

import pandas as pd
import streamlit as st

from data.nba_schedule import current_nba_window, load_nba_scoreboard
from data.nba_stats import NBA_BASELINE_SEASON, nba_headshot_url
from engines.nba_rankings import build_nba_baseline_top25

NBA_SEASON = "2026–27"
TORONTO_TZ = ZoneInfo("America/Toronto")
NBA_MOVEMENT_FILE = Path("/tmp/sach_nba_rank_movement.json")

NBA_PROPS = [
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


def _inject_nba_mobile_css() -> None:
    st.markdown(
        """
        <style>
        :root {
            --nba-panel: #111a2d;
            --nba-panel-2: #1b2450;
            --nba-border: #315a72;
            --nba-accent: #20d9d2;
            --nba-accent-2: #8a7dff;
            --nba-soft: #b9c7d8;
        }

        .nba-hero {
            border: 1px solid var(--nba-border);
            border-radius: 18px;
            padding: 1rem 1.05rem;
            background: linear-gradient(135deg, var(--nba-panel) 0%, var(--nba-panel-2) 100%);
            margin-bottom: 0.9rem;
            box-shadow: 0 10px 30px rgba(0, 0, 0, .12);
        }
        .nba-kicker {
            color: var(--nba-accent);
            font-size: .76rem;
            font-weight: 800;
            letter-spacing: .08em;
            text-transform: uppercase;
            margin-bottom: .2rem;
        }
        .nba-hero-title {
            font-size: 1.32rem;
            font-weight: 850;
            color: #fff;
            margin-bottom: .2rem;
        }
        .nba-soft { color: var(--nba-soft); font-size: .9rem; }
        .nba-section-label {
            font-size: 1.03rem;
            font-weight: 800;
            margin: 1rem 0 .45rem 0;
        }
        .nba-game {
            border: 1px solid var(--nba-border);
            border-left: 3px solid var(--nba-accent);
            border-radius: 14px;
            padding: .75rem .85rem;
            margin: .55rem 0;
            background: linear-gradient(135deg, rgba(17,26,45,.82), rgba(27,36,80,.62));
        }
        .nba-prop-shell {
            border: 1px solid var(--nba-border);
            border-radius: 16px;
            padding: .9rem;
            background: linear-gradient(135deg, rgba(17,26,45,.88), rgba(27,36,80,.70));
            margin-top: .7rem;
        }
        .nba-prop-name {
            color: var(--nba-accent);
            font-weight: 850;
            font-size: 1.03rem;
        }
        .nba-status-chip {
            display: inline-block;
            padding: .2rem .5rem;
            border: 1px solid var(--nba-border);
            border-radius: 999px;
            color: var(--nba-soft);
            font-size: .74rem;
            margin-top: .35rem;
        }

        .nba-player-card {
            display: grid;
            grid-template-columns: 92px minmax(0, 1fr);
            gap: .85rem;
            align-items: center;
            border: 1px solid rgba(49, 90, 114, .75);
            border-radius: 16px;
            padding: .78rem;
            margin: .58rem 0;
            background: linear-gradient(135deg, rgba(17,26,45,.88), rgba(27,36,80,.58));
        }
        .nba-player-photo {
            width: 92px;
            height: 92px;
            object-fit: contain;
            object-position: center bottom;
            border-radius: 12px;
            background: rgba(255,255,255,.96);
        }
        .nba-player-rank {
            font-size: 1.12rem;
            font-weight: 850;
            line-height: 1.2;
            margin-bottom: .18rem;
        }
        .nba-player-meta {
            color: var(--nba-soft);
            font-size: .78rem;
            margin-bottom: .55rem;
        }
        .nba-stat-grid {
            display: grid;
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: .4rem;
        }
        .nba-stat-box {
            border: 1px solid rgba(49, 90, 114, .55);
            border-radius: 10px;
            padding: .42rem .5rem;
            background: rgba(8, 14, 27, .30);
        }
        .nba-stat-label {
            color: var(--nba-soft);
            font-size: .66rem;
            line-height: 1.1;
            margin-bottom: .16rem;
        }
        .nba-stat-value {
            font-size: 1rem;
            font-weight: 800;
            line-height: 1.1;
        }
        .nba-baseline-note {
            color: var(--nba-soft);
            font-size: .68rem;
            margin-top: .45rem;
        }

        @media (max-width: 700px) {
            .block-container { padding-left: .82rem; padding-right: .82rem; }
            .nba-hero { padding: .82rem; border-radius: 15px; }
            .nba-hero-title { font-size: 1.14rem; }
            .nba-game, .nba-prop-shell { border-radius: 13px; padding: .72rem; }
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

            .nba-player-card {
                grid-template-columns: 74px minmax(0, 1fr);
                gap: .65rem;
                padding: .64rem;
                border-radius: 14px;
            }
            .nba-player-photo {
                width: 74px;
                height: 74px;
                border-radius: 10px;
            }
            .nba-player-rank { font-size: 1rem; }
            .nba-player-meta { font-size: .71rem; margin-bottom: .42rem; }
            .nba-stat-grid { gap: .3rem; }
            .nba-stat-box { padding: .34rem .38rem; border-radius: 8px; }
            .nba-stat-label { font-size: .6rem; }
            .nba-stat-value { font-size: .9rem; }
            .nba-baseline-note { font-size: .62rem; }
        }
        </style>
        """,
        unsafe_allow_html=True,
    )


def _hero() -> None:
    st.markdown(
        """
        <div class="nba-hero">
            <div class="nba-kicker">NBA</div>
            <div class="nba-hero-title">🏀 NBA Intelligence Center</div>
            <div class="nba-soft">Slate intelligence • matchup context • player props • model performance</div>
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
        <div class="nba-game">
            <strong>{escape(str(game.get('away_team', 'Away')))} @ {escape(str(game.get('home_team', 'Home')))}</strong>
            {score_line}
            <br><span class="nba-soft">{_format_tipoff(game.get('tipoff_et'))} • {escape(str(game.get('status', 'Scheduled')))}</span>
        </div>
        """,
        unsafe_allow_html=True,
    )


def _load_current_games() -> pd.DataFrame:
    try:
        return current_nba_window(days_back=1, days_forward=14)
    except Exception:
        return pd.DataFrame()


def _render_intelligence() -> None:
    _hero()
    games = _load_current_games()
    upcoming = pd.DataFrame()
    live = pd.DataFrame()

    if not games.empty:
        live = games[games["state"].eq("in")].copy()
        upcoming = games[games["state"].eq("pre")].copy()

    c1, c2, c3 = st.columns(3)
    c1.metric("Season", NBA_SEASON)
    c2.metric("Live Games", len(live))
    c3.metric("Upcoming", len(upcoming))

    st.markdown('<div class="nba-section-label">🔥 Slate Intelligence</div>', unsafe_allow_html=True)
    if live.empty and upcoming.empty:
        st.info(
            "There is no active NBA slate in the current window. The Intelligence Center will populate from real schedule and game data as the 2026–27 slate becomes active."
        )
    else:
        slate = pd.concat([live, upcoming], ignore_index=True).head(8)
        for _, game in slate.iterrows():
            _render_game_card(game, show_score=True)

    st.markdown('<div class="nba-section-label">🎯 Prop Intelligence</div>', unsafe_allow_html=True)
    st.markdown(
        """
        <div class="nba-prop-shell">
            <div class="nba-prop-name">10 NBA prop markets are enabled in the interface</div>
            <div class="nba-soft">Points • Rebounds • Assists • 3PM • PRA • P+R • P+A • R+A • Steals • Blocks</div>
            <div class="nba-status-chip">No fabricated rankings</div>
        </div>
        """,
        unsafe_allow_html=True,
    )
    st.caption(
        "Stage 2 baseline rankings use real 2025–26 regular-season statistics. Current-slate availability, matchup, market and prediction layers are added separately so baseline performance is never mislabeled as a prediction."
    )


def _render_games_schedule() -> None:
    st.subheader("Games / Schedule")
    st.caption("NBA schedule and game status from the live scoreboard source.")

    today = datetime.now(TORONTO_TZ).date()
    start = st.date_input("From", value=today, key="nba_schedule_from")
    end = st.date_input("To", value=today + timedelta(days=14), key="nba_schedule_to")

    if end < start:
        st.warning("The end date must be on or after the start date.")
        return

    try:
        games = load_nba_scoreboard(start.isoformat(), end.isoformat())
    except Exception as exc:
        st.warning("NBA schedule data is temporarily unavailable.")
        st.caption(str(exc))
        return

    if games.empty:
        st.info("No NBA games are scheduled in this date range.")
        return

    st.caption(f"{len(games)} game{'s' if len(games) != 1 else ''} found")
    for _, game in games.iterrows():
        _render_game_card(game, show_score=True)


def _load_movement_state() -> dict:
    try:
        if NBA_MOVEMENT_FILE.exists():
            return json.loads(NBA_MOVEMENT_FILE.read_text(encoding="utf-8"))
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
        NBA_MOVEMENT_FILE.write_text(json.dumps(state), encoding="utf-8")
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
            f'<img class="nba-player-photo" src="{nba_headshot_url(int(player_id))}" '
            f'alt="{player} headshot">'
        )
    else:
        image_html = '<div class="nba-player-photo"></div>'

    games = pd.to_numeric(row.get("games_played"), errors="coerce")
    games_text = f"{int(games)}" if pd.notna(games) else "—"

    st.markdown(
        f"""
        <div class="nba-player-card">
            <div>{image_html}</div>
            <div>
                <div class="nba-player-rank">#{rank} {player}</div>
                <div class="nba-player-meta">{team} • {movement} • {NBA_BASELINE_SEASON} regular-season baseline</div>
                <div class="nba-stat-grid">
                    <div class="nba-stat-box">
                        <div class="nba-stat-label">{metric_label}</div>
                        <div class="nba-stat-value">{_format_number(row.get('ranking_value'))}</div>
                    </div>
                    <div class="nba-stat-box">
                        <div class="nba-stat-label">Games</div>
                        <div class="nba-stat-value">{games_text}</div>
                    </div>
                    <div class="nba-stat-box">
                        <div class="nba-stat-label">MIN/G</div>
                        <div class="nba-stat-value">{_format_number(row.get('minutes_per_game'))}</div>
                    </div>
                </div>
                <div class="nba-baseline-note">Baseline ranking only • not yet a 2026–27 slate prediction</div>
            </div>
        </div>
        """,
        unsafe_allow_html=True,
    )


def _render_player_props() -> None:
    st.subheader("Player Props")
    prop = st.selectbox("Select Prop", NBA_PROPS, key="nba_prop_selector")

    st.markdown(f"### Top 25 {prop}")
    st.caption(
        f"Real {NBA_BASELINE_SEASON} regular-season statistical baseline • minimum 20 games • "
        "prediction/GI layer comes after current-slate inputs are connected"
    )

    try:
        top25 = build_nba_baseline_top25(prop, NBA_BASELINE_SEASON, minimum_games=20)
    except Exception as exc:
        st.warning("NBA player baseline data is temporarily unavailable.")
        st.caption(str(exc))
        return

    top25 = _apply_rank_movement(top25, prop)

    if top25.empty:
        st.info("No qualified real-player baseline rows are available for this prop right now.")
        return

    for _, row in top25.iterrows():
        _render_baseline_player(row)


def _render_results_performance() -> None:
    st.subheader("Results / Performance")
    st.caption(
        "Completed games now; prediction grading and model performance will live here as NBA predictions are recorded."
    )

    today = datetime.now(TORONTO_TZ).date()
    try:
        games = load_nba_scoreboard(
            (today - timedelta(days=14)).isoformat(),
            today.isoformat(),
        )
    except Exception as exc:
        st.warning("NBA results data is temporarily unavailable.")
        st.caption(str(exc))
        return

    completed = (
        games[games["completed"].fillna(False)].copy()
        if not games.empty
        else pd.DataFrame()
    )

    if completed.empty:
        st.info("No completed NBA games are available in the last 14 days.")
    else:
        for _, game in completed.sort_values("tipoff_et", ascending=False).iterrows():
            _render_game_card(game, show_score=True)

    st.markdown("### 📈 Model Performance")
    st.caption(
        "Prop-level hit rate, category performance, calibration and prediction history will populate here once NBA predictions begin being saved and graded."
    )


def show() -> None:
    _inject_nba_mobile_css()
    st.title("🏀 NBA")

    tabs = st.tabs(
        [
            "🧠 Intelligence",
            "📅 Games / Schedule",
            "🎯 Player Props",
            "📈 Results / Performance",
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
