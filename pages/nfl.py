from __future__ import annotations

from datetime import datetime
from html import escape
from pathlib import Path
from zoneinfo import ZoneInfo
import json

import pandas as pd
import streamlit as st

from data.nfl_odds import get_nfl_odds_feed_status
from data.nfl_roster import load_nfl_roster
from data.nfl_schedule import load_nfl_schedule
from engines.nfl_passing_market_join import attach_live_passing_yards_lines
from engines.nfl_passing_probability import attach_passing_yards_probabilities
from engines.nfl_passing_projection import build_passing_yards_projection
from engines.nfl_passing_ranking import rank_passing_yards_top25
from engines.nfl_rushing_yards import build_rushing_yards_top25
from engines.nfl_receiving_yards import build_receiving_yards_top25
from engines.nfl_receptions import build_receptions_top25
from engines.nfl_touchdowns import build_anytime_td_top25, build_first_td_top25
from engines.nfl_additional_props import (
    build_passing_tds_top25,
    build_passing_rushing_yards_top25,
    build_rushing_receiving_yards_top25,
    build_sacks_top25,
    build_tackles_top25,
)

NFL_SEASON = 2026
NFL_BASELINE_SEASON = 2025
TORONTO_TIMEZONE = ZoneInfo("America/Toronto")
NFL_MOVEMENT_FILE = Path("/tmp/sach_nfl_rank_movement.json")

PROP_CATALOG = {
    "Passing Yards": {"builder": "passing", "projection": "passing_yards_projection_matchup", "unit": "yards"},
    "Passing TDs": {"builder": build_passing_tds_top25, "projection": "passing_tds_projection", "unit": "TDs"},
    "Passing + Rushing Yards": {"builder": build_passing_rushing_yards_top25, "projection": "passing_rushing_projection", "unit": "yards"},
    "Rushing Yards": {"builder": build_rushing_yards_top25, "projection": "rushing_projection", "unit": "yards"},
    "Rushing + Receiving Yards": {"builder": build_rushing_receiving_yards_top25, "projection": "rushing_receiving_projection", "unit": "yards"},
    "Receiving Yards": {"builder": build_receiving_yards_top25, "projection": "receiving_projection", "unit": "yards"},
    "Receptions": {"builder": build_receptions_top25, "projection": "receptions_projection", "unit": "receptions"},
    "Anytime TD": {"builder": build_anytime_td_top25, "projection": "model_probability", "unit": "%"},
    "First TD": {"builder": build_first_td_top25, "projection": "model_probability", "unit": "%"},
    "Sacks": {"builder": build_sacks_top25, "projection": "sacks_projection", "unit": "sacks"},
    "Tackles + Assists": {"builder": build_tackles_top25, "projection": "tackles_projection", "unit": "tackles"},
}


def _render_html(html: str) -> None:
    clean = " ".join(line.strip() for line in html.splitlines() if line.strip())
    st.markdown(clean, unsafe_allow_html=True)


def _inject_nfl_css() -> None:
    st.markdown(
        """
        <style>
        /* =========================================================
           NFL visual contract: MLB sibling, football content.
           ========================================================= */
        .block-container{max-width:1180px;padding-top:.45rem!important;padding-bottom:2.5rem!important}
        .nfl-page-refresh-time{width:100%;text-align:right;color:#c2c5ca;font-size:.82rem;font-weight:700;line-height:1.25;margin:0 0 10px 0;white-space:nowrap}

        div[class*="st-key-nfl_page_refresh"]{display:flex!important;justify-content:flex-end!important;align-items:center!important;width:100%!important;margin:2px 0 4px!important}
        div[class*="st-key-nfl_page_refresh"]>div{width:auto!important}
        div[class*="st-key-nfl_page_refresh"] button{width:auto!important;min-width:108px!important;height:40px!important;min-height:40px!important;padding:0 13px!important;margin:0!important;background:#090a0b!important;color:#d6b35c!important;border:1.5px solid #d6b35c!important;border-radius:9px!important;box-shadow:0 0 0 1px rgba(214,179,92,.10)!important;font-size:.74rem!important;font-weight:900!important;letter-spacing:.025em!important;line-height:1!important;white-space:nowrap!important}
        div[class*="st-key-nfl_page_refresh"] button:hover{background:#111312!important;color:#f6c84c!important;border-color:#f6c84c!important;box-shadow:0 0 0 2px rgba(214,179,92,.14)!important}

        .nfl-hero{margin:.35rem 0 .55rem!important;padding:22px 30px!important;border-radius:20px!important;background:linear-gradient(105deg,rgba(255,204,51,.28) 0%,rgba(4,5,4,.98) 44%,rgba(25,217,120,.28) 100%)!important;border:2px solid rgba(255,204,51,.88)!important;box-shadow:inset 0 0 24px rgba(25,217,120,.08),0 0 0 1px rgba(25,217,120,.18)!important}
        .nfl-hero-title{margin:0!important;color:#fff!important;font-size:2.05rem!important;font-weight:950!important;line-height:1.08!important}
        .nfl-hero-subtitle{margin:16px 0 0!important;color:#f0f0f0!important;font-size:1.03rem!important;line-height:1.5!important;max-width:900px}

        div[class*="st-key-nfl_games_entry"] button{width:100%!important;min-height:82px!important;padding:12px 15px!important;margin:4px 0 10px!important;text-align:left!important;justify-content:flex-start!important;border:1.5px solid rgba(214,179,92,.68)!important;border-left:5px solid #19d978!important;border-radius:13px!important;background:linear-gradient(112deg,rgba(246,200,76,.12) 0%,#0d0f10 36%,#0b0d0e 68%,rgba(25,217,120,.10) 100%)!important;color:#fff!important;font-weight:900!important;white-space:pre-line!important;line-height:1.28!important}
        div[class*="st-key-nfl_games_entry"] button:hover{border-color:#f6c84c!important;border-left-color:#19d978!important;box-shadow:inset 0 0 0 1px rgba(25,217,120,.15)!important}
        div[class*="st-key-nfl_games_entry"] button p{margin:0!important;font-size:.84rem!important;line-height:1.32!important}

        .nfl-snapshot-heading{display:flex;justify-content:space-between;align-items:flex-end;gap:12px;margin:18px 0 9px}
        .nfl-snapshot-heading strong{color:#fff;font-size:1.08rem}
        .nfl-snapshot-heading span{color:#19d978;font-size:.70rem;font-weight:750;text-align:right}
        .nfl-snapshot-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
        .nfl-snapshot-card{min-height:98px;padding:12px 10px;border:2px solid #3a3d42;border-radius:16px;background:#111315;display:flex;flex-direction:column;justify-content:center}
        .nfl-snapshot-card span{color:#fff;font-size:.70rem;font-weight:900;letter-spacing:.08em}
        .nfl-snapshot-card strong{color:#fff;font-size:1.45rem;line-height:1.1;margin:5px 0}
        .nfl-snapshot-card small{color:#fff;font-size:.68rem;font-weight:650;line-height:1.15}
        .nfl-snapshot-emerald{border-color:rgba(25,217,120,.92);box-shadow:inset 0 0 24px rgba(25,217,120,.09),0 0 0 1px rgba(25,217,120,.10)}
        .nfl-snapshot-emerald strong{color:#19d978}
        .nfl-snapshot-gold{border-color:rgba(255,204,51,.92);box-shadow:inset 0 0 24px rgba(255,204,51,.08),0 0 0 1px rgba(255,204,51,.10)}
        .nfl-snapshot-gold strong{color:#ffcc33}

        .nfl-section-heading{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin:22px 0 10px}
        .nfl-section-title{color:#fff;font-size:1.28rem;font-weight:950;line-height:1.1}
        .nfl-section-subtitle{color:#c4c7cc;font-size:.82rem;line-height:1.35;margin-top:4px}
        .nfl-section-count{color:#000;background:#ffcc33;border:2px solid #ffe06a;border-radius:999px;padding:5px 9px;font-size:.68rem;font-weight:950;white-space:nowrap}

        .nfl-market-tabs [data-baseweb="tab-list"]{gap:0!important}
        .nfl-market-tabs button[role="tab"]{background:#111315!important;color:#fff!important;border:1px solid #3a3d42!important;padding:.45rem .8rem!important}

        .nfl-rank-card{display:grid;grid-template-columns:38px 64px minmax(0,1fr) 58px;gap:9px;align-items:start;width:100%;min-height:154px;margin:0 0 8px;padding:11px 9px;border:1.5px solid #34383d;border-left:4px solid #19d978;border-radius:15px;background:#0d0f10;color:#fff;box-sizing:border-box}
        .nfl-rank-number{text-align:center;padding-top:2px}.nfl-rank-number strong{display:block;color:#fff;font-size:.92rem;font-weight:950}.nfl-rank-movement{display:block;margin-top:7px;color:#19d978;font-size:.58rem;font-weight:900;white-space:nowrap}
        .nfl-rank-avatar{width:64px;height:64px;border-radius:50%;overflow:hidden;border:2px solid #bca147;background:#30343a;display:grid;place-items:center;font-weight:900;color:#fff}
        .nfl-rank-avatar img{width:100%;height:100%;object-fit:cover;display:block}
        .nfl-rank-copy{min-width:0}.nfl-rank-name{display:block;color:#fff;font-size:.94rem;font-weight:950;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.nfl-rank-meta{color:#e4e6e8;font-size:.75rem;margin-top:4px}.nfl-rank-proj{color:#f6c84c;font-size:.76rem;font-weight:850;margin-top:4px}.nfl-rank-why{color:#c4c7cc;font-size:.72rem;line-height:1.35;margin-top:5px}.nfl-rank-score{text-align:right;padding-top:1px}.nfl-rank-score small{display:block;color:#b8bbc1;font-size:.54rem;font-weight:900;letter-spacing:.06em}.nfl-rank-score strong{display:block;color:#ffcc33;font-size:1.05rem;font-weight:950;margin-top:3px}

        div[data-testid="stExpander"]{background:#080909!important;border:1.5px solid #3a3d42!important;border-radius:12px!important;overflow:hidden!important}
        div[data-testid="stExpander"] details,div[data-testid="stExpander"] summary{background:#080909!important;color:#fff!important}
        div[data-testid="stAlert"],div[data-testid="stAlert"]>div,div[role="alert"]{background:#090b0a!important;color:#fff!important;border-radius:14px!important}

        @media(max-width:700px){
            .block-container{padding-top:0!important;padding-left:.85rem!important;padding-right:.85rem!important}
            .nfl-page-refresh-time{font-size:.84rem;margin-bottom:10px}
            .nfl-hero{padding:16px 15px!important;border-radius:15px!important;margin-top:.35rem!important;margin-bottom:.45rem!important}
            .nfl-hero-title{font-size:1.82rem!important}.nfl-hero-subtitle{font-size:.92rem!important;margin-top:10px!important}
            div[class*="st-key-nfl_games_entry"] button{min-height:78px!important;padding:11px 13px!important}div[class*="st-key-nfl_games_entry"] button p{font-size:.80rem!important}
            .nfl-snapshot-grid{gap:6px}.nfl-snapshot-card{min-height:88px;padding:10px 7px}.nfl-snapshot-card span{font-size:.70rem}.nfl-snapshot-card strong{font-size:1.42rem}.nfl-snapshot-card small{font-size:.70rem}
            .nfl-section-title{font-size:1.03rem}.nfl-section-subtitle{font-size:.82rem}.nfl-rank-card{grid-template-columns:34px 52px minmax(0,1fr) 50px;gap:7px;min-height:150px;padding:9px 7px}.nfl-rank-avatar{width:52px;height:52px}.nfl-rank-name{font-size:.90rem}.nfl-rank-meta,.nfl-rank-proj{font-size:.72rem}.nfl-rank-why{font-size:.70rem}.nfl-rank-score strong{font-size:.95rem}
        }
        </style>
        """,
        unsafe_allow_html=True,
    )


def _active_schedule_context():
    now = datetime.now(TORONTO_TIMEZONE).replace(tzinfo=None)
    try:
        regular = load_nfl_schedule(NFL_SEASON, "REG").copy()
    except Exception:
        regular = pd.DataFrame()

    if not regular.empty:
        regular["kickoff_et"] = pd.to_datetime(regular["kickoff_et"], errors="coerce")
        first_regular = regular["kickoff_et"].dropna().min()
        if pd.notna(first_regular) and now >= first_regular - pd.Timedelta(days=7):
            weeks = sorted(pd.to_numeric(regular["week"], errors="coerce").dropna().astype(int).unique())
            for week in weeks:
                slate = regular[pd.to_numeric(regular["week"], errors="coerce") == week]
                latest = slate["kickoff_et"].dropna().max()
                if pd.notna(latest) and now <= latest + pd.Timedelta(hours=5):
                    return "REG", regular, int(week)
            return "REG", regular, int(weeks[-1]) if weeks else None

    try:
        preseason = load_nfl_schedule(NFL_SEASON, "PRE").copy()
    except Exception:
        preseason = pd.DataFrame()
    if preseason.empty:
        return "PRE", preseason, None
    preseason["kickoff_et"] = pd.to_datetime(preseason["kickoff_et"], errors="coerce")
    future = preseason[preseason["kickoff_et"] >= now]
    week = int(future.sort_values("kickoff_et").iloc[0]["week"]) if not future.empty else int(preseason["week"].max())
    return "PRE", preseason, week


def _week_games(schedule: pd.DataFrame, week: int | None) -> pd.DataFrame:
    if schedule is None or schedule.empty or week is None:
        return pd.DataFrame()
    week_series = pd.to_numeric(schedule["week"], errors="coerce")
    games = schedule[week_series == int(week)].copy()
    return games.sort_values("kickoff_et", na_position="last").reset_index(drop=True)


def _matchup_map(schedule: pd.DataFrame, week: int | None) -> dict[str, str]:
    result: dict[str, str] = {}
    for _, game in _week_games(schedule, week).iterrows():
        away = str(game.get("away_team", "")).upper()
        home = str(game.get("home_team", "")).upper()
        if away and home:
            result[away] = f"{away} @ {home}"
            result[home] = f"{away} @ {home}"
    return result


@st.cache_data(ttl=21600, show_spinner=False)
def _headshot_map() -> dict[str, str]:
    try:
        roster = load_nfl_roster(NFL_SEASON)
        if roster.empty:
            return {}
        return dict(zip(roster["player_id"].astype(str), roster["headshot_url"].fillna("")))
    except Exception:
        return {}


def _build_passing_top25(schedule: pd.DataFrame, week: int | None) -> pd.DataFrame:
    candidates = []
    for _, game in _week_games(schedule, week).iterrows():
        away = str(game.get("away_team", "")).upper()
        home = str(game.get("home_team", "")).upper()
        if not away or not home:
            continue
        try:
            away_qbs = build_passing_yards_projection(home, NFL_SEASON, NFL_BASELINE_SEASON)
            home_qbs = build_passing_yards_projection(away, NFL_SEASON, NFL_BASELINE_SEASON)
            qbs = pd.concat(
                [
                    away_qbs[away_qbs["team"] == away],
                    home_qbs[home_qbs["team"] == home],
                ],
                ignore_index=True,
            )
            if qbs.empty:
                continue
            qbs["attempts"] = pd.to_numeric(qbs.get("attempts"), errors="coerce")
            qbs = qbs[(qbs["games_played"].fillna(0) >= 3) | (qbs["attempts"].fillna(0) >= 50)].copy()
            qbs = attach_live_passing_yards_lines(qbs)
            qbs = attach_passing_yards_probabilities(qbs)
            qbs["game"] = f"{away} @ {home}"
            candidates.append(qbs)
        except Exception:
            continue
    if not candidates:
        return pd.DataFrame()
    return rank_passing_yards_top25(pd.concat(candidates, ignore_index=True), limit=25)


def _build_prop(prop: str, schedule: pd.DataFrame, week: int | None) -> pd.DataFrame:
    config = PROP_CATALOG[prop]
    try:
        if config["builder"] == "passing":
            df = _build_passing_top25(schedule, week)
        else:
            df = config["builder"](NFL_SEASON, NFL_BASELINE_SEASON)
    except TypeError:
        df = config["builder"]()
    except Exception:
        return pd.DataFrame()

    if df is None or df.empty:
        return pd.DataFrame()

    df = df.copy()
    if "player_name" not in df.columns and "player" in df.columns:
        df["player_name"] = df["player"]
    if "team" not in df.columns:
        for candidate in ["recent_team", "team_abbreviation", "team_name"]:
            if candidate in df.columns:
                df["team"] = df[candidate]
                break
    if "team" not in df.columns:
        df["team"] = ""

    matchups = _matchup_map(schedule, week)
    df["game"] = df["team"].astype(str).str.upper().map(matchups).fillna(df.get("game", ""))
    shots = _headshot_map()
    if "headshot_url" not in df.columns:
        df["headshot_url"] = ""
    if "player_id" in df.columns:
        df["headshot_url"] = df.apply(lambda r: r.get("headshot_url") or shots.get(str(r.get("player_id")), ""), axis=1)

    df = _apply_movement(df, prop)
    return df.head(25).reset_index(drop=True)


def _load_movement_state() -> dict:
    try:
        return json.loads(NFL_MOVEMENT_FILE.read_text()) if NFL_MOVEMENT_FILE.exists() else {}
    except Exception:
        return {}


def _apply_movement(df: pd.DataFrame, prop: str) -> pd.DataFrame:
    if df.empty:
        return df
    state = _load_movement_state()
    previous = state.get(prop, {})
    current = {}
    labels = []
    for _, row in df.iterrows():
        key = str(row.get("player_id") or f"{row.get('player_name')}|{row.get('team')}")
        rank = int(row.get("rank", len(current) + 1))
        current[key] = rank
        old = previous.get(key)
        labels.append("NEW" if old is None else f"↑ {int(old)-rank}" if int(old) > rank else f"↓ {rank-int(old)}" if int(old) < rank else "—")
    result = df.copy()
    result["rank_movement"] = labels
    state[prop] = current
    try:
        NFL_MOVEMENT_FILE.write_text(json.dumps(state))
    except Exception:
        pass
    return result


def _format_projection(row: pd.Series, prop: str) -> str:
    config = PROP_CATALOG[prop]
    value = row.get(config["projection"])
    if value is None or pd.isna(value):
        return "Projection pending"
    unit = config["unit"]
    if unit == "%":
        numeric = float(value)
        if numeric <= 1:
            numeric *= 100
        return f"Model probability {numeric:.1f}%"
    if unit == "TDs" or unit == "sacks":
        return f"Projection {float(value):.2f} {unit}"
    return f"Projection {float(value):.1f} {unit}"


def _why(row: pd.Series, prop: str) -> str:
    line = row.get("consensus_line")
    side = str(row.get("model_side") or "").strip()
    mode = str(row.get("ranking_mode") or "Foundation")
    parts = []
    if pd.notna(line):
        parts.append(f"Live line {float(line):.1f}")
    if side and side not in {"FOUNDATION", "nan", "None"}:
        parts.append(f"Model side {side}")
    if mode:
        parts.append(mode)
    if not parts:
        parts.append("Recent form and prior-season production")
    return " · ".join(parts)


def _ranking_score(row: pd.Series, prop: str) -> float:
    probability = row.get("model_probability")
    if probability is not None and not pd.isna(probability):
        value = float(probability)
        return value * 100 if value <= 1 else value
    projection_col = PROP_CATALOG[prop]["projection"]
    projection = row.get(projection_col)
    if projection is None or pd.isna(projection):
        return 0.0
    return min(99.9, max(0.0, float(projection)))


def _render_rank_card(row: pd.Series, prop: str) -> None:
    name = str(row.get("player_name") or "Player")
    team = str(row.get("team") or "")
    game = str(row.get("game") or "Matchup pending")
    photo = str(row.get("headshot_url") or "").strip()
    avatar = f'<img src="{escape(photo)}" alt="{escape(name)} headshot">' if photo else escape("".join(part[0] for part in name.split()[:2]).upper() or "NFL")
    rank = int(row.get("rank") or 0)
    movement = str(row.get("rank_movement") or "—")
    projection = _format_projection(row, prop)
    why = _why(row, prop)
    score = _ranking_score(row, prop)
    _render_html(
        f"""
        <div class="nfl-rank-card">
          <div class="nfl-rank-number"><strong>#{rank}</strong><small class="nfl-rank-movement">{escape(movement)}</small></div>
          <div class="nfl-rank-avatar">{avatar}</div>
          <div class="nfl-rank-copy">
            <strong class="nfl-rank-name">{escape(name)}</strong>
            <div class="nfl-rank-meta"><b>{escape(team)}</b> · {escape(game)}</div>
            <div class="nfl-rank-proj">{escape(projection)}</div>
            <div class="nfl-rank-why">{escape(why)}</div>
          </div>
          <div class="nfl-rank-score"><small>GI SCORE</small><strong>{score:.1f}</strong></div>
        </div>
        """
    )


def _render_rankings(schedule: pd.DataFrame, week: int | None) -> None:
    _render_html(
        """
        <div class="nfl-section-heading">
          <div><div class="nfl-section-title">🏆 Player Rankings</div><div class="nfl-section-subtitle">Start with the strongest five. Open the full Top 25 only when you need more depth.</div></div>
          <div class="nfl-section-count">25 ranked</div>
        </div>
        """
    )
    prop = st.selectbox("Select NFL market", list(PROP_CATALOG.keys()), key="nfl_market_selector")
    rankings = _build_prop(prop, schedule, week)
    if rankings.empty:
        st.info(f"{prop} rankings are temporarily unavailable while the data feed fills in.")
        return

    for _, row in rankings.head(5).iterrows():
        _render_rank_card(row, prop)

    if len(rankings) > 5:
        with st.expander(f"View Full Top 25 · {prop}"):
            for _, row in rankings.iloc[5:].iterrows():
                _render_rank_card(row, prop)


def _render_matchup_intelligence(games: pd.DataFrame) -> None:
    _render_html(
        """
        <div class="nfl-section-heading">
          <div><div class="nfl-section-title">🔥 Matchup Intelligence</div><div class="nfl-section-subtitle">Weekly matchup context replaces MLB's daily yesterday/power-watch rhythm.</div></div>
        </div>
        """
    )
    if games.empty:
        st.info("Weekly matchup intelligence will populate when the slate is available.")
        return
    labels = [f"{str(g.get('away_team','')).upper()} @ {str(g.get('home_team','')).upper()}" for _, g in games.iterrows()]
    selected = st.selectbox("Select matchup", labels, key="nfl_matchup_intelligence")
    game = games.iloc[labels.index(selected)]
    kickoff = pd.to_datetime(game.get("kickoff_et"), errors="coerce")
    kickoff_text = kickoff.strftime("%a %b %d · %I:%M %p ET") if pd.notna(kickoff) else "Kickoff TBD"
    st.markdown(f"**{selected}**")
    st.caption(f"{kickoff_text} · {game.get('status','Scheduled')}")
    st.caption("Player-level Last 5, Last 10, opponent history, defensive matchup, role, injuries and weather will feed the Why Engine as those live data layers are connected.")


def _render_player_search(schedule: pd.DataFrame, week: int | None) -> None:
    _render_html(
        """
        <div class="nfl-section-heading">
          <div><div class="nfl-section-title">🔎 Player Search</div><div class="nfl-section-subtitle">Search a player without needing to remember the team. Their tracked markets appear together.</div></div>
        </div>
        """
    )
    query = st.text_input("Search NFL player", placeholder="Type a player name…", key="nfl_player_search")
    if len(query.strip()) < 2:
        return
    q = query.strip().lower()
    matches = []
    for prop in PROP_CATALOG:
        df = _build_prop(prop, schedule, week)
        if df.empty:
            continue
        mask = df["player_name"].astype(str).str.lower().str.contains(q, na=False)
        for _, row in df[mask].head(4).iterrows():
            matches.append((prop, row))
    if not matches:
        st.info("No tracked player matched that search yet.")
        return
    names = []
    seen = set()
    for _, row in matches:
        name = str(row.get("player_name") or "")
        if name and name not in seen:
            seen.add(name); names.append(name)
    chosen = st.selectbox("Player", names, key="nfl_player_search_result")
    chosen_rows = [(prop, row) for prop, row in matches if str(row.get("player_name")) == chosen]
    st.markdown(f"### {chosen}")
    if chosen_rows:
        st.caption(f"{chosen_rows[0][1].get('team','')} · {chosen_rows[0][1].get('game','')}")
    cols = st.columns(2)
    for i, (prop, row) in enumerate(chosen_rows):
        with cols[i % 2]:
            st.markdown(f"**{prop}**")
            st.caption(_format_projection(row, prop))


def show() -> None:
    _inject_nfl_css()
    phase, schedule, week = _active_schedule_context()
    games = _week_games(schedule, week)
    now = datetime.now(TORONTO_TIMEZONE)

    if st.button("⟳  REFRESH", key="nfl_page_refresh", help="Refresh NFL data"):
        try:
            load_nfl_schedule.clear()
        except Exception:
            pass
        try:
            _headshot_map.clear()
        except Exception:
            pass
        st.rerun()

    st.markdown(
        f'<div class="nfl-page-refresh-time">Updated {now.strftime("%A · %I:%M %p ET")}</div>',
        unsafe_allow_html=True,
    )

    _render_html(
        """
        <section class="nfl-hero">
          <h1 class="nfl-hero-title">NFL Intelligence Center</h1>
          <p class="nfl-hero-subtitle">Start with the strongest players in each market, review the reason behind every ranking, and open the full Top 25 only when you need more depth.</p>
        </section>
        """
    )

    week_label = f"Week {week}" if week is not None else "NFL Week"
    if st.button(
        f"🏈 {week_label.upper()} NFL GAMES  ›  Open this week's slate & Game Intelligence",
        key="nfl_games_entry",
        use_container_width=True,
    ):
        st.session_state["nfl_active_phase"] = phase
        st.session_state["nfl_active_week"] = week
        st.session_state.pop("nfl_selected_game", None)
        st.switch_page("pages/nfl_games.py")

    feed = get_nfl_odds_feed_status()
    mode = str(feed.get("mode") or feed.get("status") or "Foundation") if isinstance(feed, dict) else "Foundation"
    alert_count = 0
    _render_html(
        f"""
        <div class="nfl-snapshot-heading"><strong>This Week's NFL Snapshot</strong><span>Weekly slate · markets can open days before kickoff</span></div>
        <div class="nfl-snapshot-grid">
          <div class="nfl-snapshot-card nfl-snapshot-emerald"><span>GAMES</span><strong>{len(games)}</strong><small>{escape(week_label)} · {escape(phase)}</small></div>
          <div class="nfl-snapshot-card"><span>PROP MARKETS</span><strong>{len(PROP_CATALOG)}</strong><small>{escape(mode)}</small></div>
          <div class="nfl-snapshot-card nfl-snapshot-gold"><span>ALERTS</span><strong>{alert_count}</strong><small>Weather / injury layer</small></div>
        </div>
        """
    )

    _render_matchup_intelligence(games)
    _render_rankings(schedule, week)
    _render_player_search(schedule, week)

    st.divider()
    st.caption("Sach Sports Dashboard · NFL Intelligence")


show()
