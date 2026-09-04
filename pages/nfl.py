from __future__ import annotations

from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo
import json

import pandas as pd
import streamlit as st

from data.nfl_odds import get_nfl_odds_feed_status
from data.nfl_roster import load_nfl_roster
from data.nfl_schedule import load_nfl_schedule
from data.nfl_stats import load_nfl_weekly_player_stats
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


def _inject_css():
    st.markdown(
        """
        <style>
        :root {
            --nfl-blue:#14243d;
            --nfl-blue2:#1b3153;
            --nfl-border:#355274;
            --nfl-soft:#b7c4d8;
            --nfl-gold:#f5c451;
        }
        .nfl-hero{border:1px solid var(--nfl-border);border-radius:20px;padding:18px 18px 15px;
            background:linear-gradient(135deg,#111d31 0%,#1b3153 100%);margin:0 0 12px;}
        .nfl-hero h2{margin:0 0 4px;font-size:1.45rem}.nfl-soft{color:var(--nfl-soft);font-size:.9rem}
        .nfl-section{font-size:1.15rem;font-weight:850;margin:20px 0 7px}
        .nfl-card{border:1px solid #314b6b;border-radius:16px;padding:12px 13px;margin:8px 0;
            background:linear-gradient(160deg,#111b2b,#172741)}
        .nfl-rank{color:var(--nfl-gold);font-weight:900}.nfl-player{font-size:1.03rem;font-weight:850}
        .nfl-meta{color:#b8c3d4;font-size:.82rem;margin-top:2px}.nfl-why{color:#dbe5f4;font-size:.86rem;margin-top:7px}
        div[data-testid="stMetric"]{background:rgba(15,24,38,.42);border:1px solid #2e4867;border-radius:12px;padding:8px 9px}
        .stRadio [role="radiogroup"]{gap:.4rem;flex-wrap:wrap}.stRadio [role="radio"]{border:1px solid #355274;border-radius:999px;padding:.25rem .65rem;background:#14243d}
        @media(max-width:700px){.nfl-hero{padding:14px;border-radius:16px}.nfl-hero h2{font-size:1.25rem}
            div[data-testid="stMetricValue"]{font-size:1.05rem}.stButton button{min-height:38px}}
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
            # Keep the current NFL week active through its final game. If that week
            # is finished, roll forward to the next scheduled week.
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
    games = schedule[pd.to_numeric(schedule["week"], errors="coerce") == int(week)].copy()
    return games.sort_values("kickoff_et", na_position="last").reset_index(drop=True)


def _matchup_map(schedule, week):
    result = {}
    for _, game in _week_games(schedule, week).iterrows():
        away, home = str(game.get("away_team", "")).upper(), str(game.get("home_team", "")).upper()
        if away and home:
            result[away] = f"{away} @ {home}"
            result[home] = f"{away} @ {home}"
    return result


@st.cache_data(ttl=21600, show_spinner=False)
def _headshot_map():
    roster = load_nfl_roster(NFL_SEASON)
    return dict(zip(roster["player_id"].astype(str), roster["headshot_url"]))


def _load_movement_state():
    try:
        return json.loads(NFL_MOVEMENT_FILE.read_text()) if NFL_MOVEMENT_FILE.exists() else {}
    except Exception:
        return {}


def _apply_rank_movement(df, category):
    if df is None or df.empty:
        return df
    state = _load_movement_state(); previous = state.get(category, {}); current = {}; labels = []
    for _, row in df.iterrows():
        key = str(row.get("player_id") or f"{row.get('player_name')}|{row.get('team')}")
        rank = int(row.get("rank", 0)); current[key] = rank; old = previous.get(key)
        labels.append("NEW" if old is None else f"↑ {int(old)-rank}" if int(old) > rank else f"↓ {rank-int(old)}" if int(old) < rank else "—")
    result = df.copy(); result["rank_movement"] = labels; state[category] = current
    try: NFL_MOVEMENT_FILE.write_text(json.dumps(state))
    except Exception: pass
    return result


def _enrich(df, category, schedule, week):
    if df is None or df.empty:
        return pd.DataFrame()
    result = df.copy(); matchups = _matchup_map(schedule, week); shots = _headshot_map()
    result["game"] = result.get("team", pd.Series("", index=result.index)).astype(str).str.upper().map(matchups).fillna("")
    if "headshot_url" not in result:
        result["headshot_url"] = result.get("player_id", pd.Series("", index=result.index)).astype(str).map(shots)
    else:
        fallback = result.get("player_id", pd.Series("", index=result.index)).astype(str).map(shots)
        result["headshot_url"] = result["headshot_url"].where(result["headshot_url"].notna(), fallback)
    return _apply_rank_movement(result, category)


def _passing_top25(schedule, week):
    candidates = []
    for _, game in _week_games(schedule, week).iterrows():
        away, home = str(game["away_team"]).upper(), str(game["home_team"]).upper()
        try:
            away_qbs = build_passing_yards_projection(home, NFL_SEASON, NFL_BASELINE_SEASON)
            home_qbs = build_passing_yards_projection(away, NFL_SEASON, NFL_BASELINE_SEASON)
            qbs = pd.concat([away_qbs[away_qbs["team"] == away], home_qbs[home_qbs["team"] == home]], ignore_index=True)
            if qbs.empty: continue
            qbs["attempts"] = pd.to_numeric(qbs.get("attempts"), errors="coerce")
            qbs = qbs[(qbs["games_played"].fillna(0) >= 3) | (qbs["attempts"].fillna(0) >= 50)].copy()
            qbs = attach_live_passing_yards_lines(qbs)
            qbs = attach_passing_yards_probabilities(qbs)
            qbs["game"] = f"{away} @ {home}"
            candidates.append(qbs)
        except Exception:
            continue
    if not candidates: return pd.DataFrame()
    return rank_passing_yards_top25(pd.concat(candidates, ignore_index=True), limit=25)


@st.cache_data(ttl=1800, show_spinner=False)
def _build_category_cached(category: str, week: int | None):
    # Schedule itself is not cached in the key; passing is built separately because
    # it needs opponent-specific matchup projections.
    config = PROP_CATALOG[category]
    if config["builder"] == "passing":
        return pd.DataFrame()
    try:
        return config["builder"](NFL_SEASON, NFL_BASELINE_SEASON)
    except TypeError:
        return config["builder"]()
    except Exception:
        return pd.DataFrame()


def _category_rankings(category, schedule, week):
    df = _passing_top25(schedule, week) if category == "Passing Yards" else _build_category_cached(category, week)
    return _enrich(df, category, schedule, week)


def _fmt(value, digits=1):
    if value is None or pd.isna(value): return "—"
    return f"{float(value):.{digits}f}"


def _why(row, category, projection_col):
    if category in {"Anytime TD", "First TD"}:
        p = row.get("model_probability")
        return (f"Model scoring probability {_fmt(p)}%. " if p is not None and not pd.isna(p) else "Scoring history and recent TD form. ") + "Role and matchup context drive the ranking."
    projection = row.get(projection_col)
    bits = [f"Model projection {_fmt(projection)} {PROP_CATALOG[category]['unit']}."] if projection is not None and not pd.isna(projection) else []
    if pd.notna(row.get("consensus_line")):
        bits.append(f"Live line {_fmt(row.get('consensus_line'))}.")
    if category in {"Sacks", "Tackles + Assists"}:
        bits.append("Built from prior defensive production and recent-game form.")
    else:
        bits.append("Built from season baseline plus recent form; live market data is added when available.")
    return " ".join(bits)


def _render_week_bubbles(games, phase, week):
    st.markdown('<div class="nfl-section">📅 Weekly Slate</div>', unsafe_allow_html=True)
    if games.empty:
        st.info("No games are available for the active NFL week."); return None
    labels = []
    for _, game in games.iterrows():
        kickoff = pd.to_datetime(game.get("kickoff_et"), errors="coerce")
        day = kickoff.strftime("%a") if pd.notna(kickoff) else "TBD"
        labels.append(f"{day} · {str(game.get('away_team','')).upper()} @ {str(game.get('home_team','')).upper()}")
    selected = st.radio("Week games", labels, horizontal=True, label_visibility="collapsed", key=f"nfl_week_bubbles_{phase}_{week}")
    return games.iloc[labels.index(selected)]


def _render_matchup(game):
    if game is None: return
    away, home = str(game.get("away_team", "")).upper(), str(game.get("home_team", "")).upper()
    kickoff = pd.to_datetime(game.get("kickoff_et"), errors="coerce")
    kickoff_text = kickoff.strftime("%a %b %d • %I:%M %p") if pd.notna(kickoff) else "Time TBD"
    st.markdown('<div class="nfl-section">🔥 Game Intelligence</div>', unsafe_allow_html=True)
    st.markdown(f"### {away} @ {home}")
    st.caption(f"{kickoff_text} • {game.get('status', 'Scheduled')}")
    try:
        rows = []
        for team, opponent in ((away, home), (home, away)):
            qbs = build_passing_yards_projection(opponent, NFL_SEASON, NFL_BASELINE_SEASON)
            qbs = qbs[qbs["team"] == team].copy()
            rows.append(qbs)
        qbs = pd.concat(rows, ignore_index=True) if rows else pd.DataFrame()
        qbs = qbs.sort_values("attempts", ascending=False).drop_duplicates("team").head(2)
        for _, row in qbs.iterrows():
            st.markdown(f"**{row.get('player_name','Quarterback')} · {row.get('team','')}**")
            c1,c2,c3 = st.columns(3)
            c1.metric("Season Y/G", _fmt(row.get("passing_yards_per_game")))
            c2.metric("Projection", _fmt(row.get("passing_yards_projection_matchup")))
            c3.metric("Last 3", _fmt(row.get("last_3_passing_yards_per_game")))
    except Exception:
        st.caption("Quarterback matchup detail will populate as current slate data becomes available.")


def _render_rank_card(row, category, projection_col):
    rank = int(row.get("rank", 0)); name = str(row.get("player_name") or row.get("player_display_name") or "Unknown")
    team = str(row.get("team") or row.get("recent_team") or ""); game = str(row.get("game") or ""); movement = str(row.get("rank_movement") or "—")
    photo = row.get("headshot_url")
    c1,c2 = st.columns([1,4])
    with c1:
        if photo is not None and not pd.isna(photo) and str(photo).strip(): st.image(photo, width=72)
    with c2:
        st.markdown(f"<span class='nfl-rank'>#{rank}</span> <span class='nfl-player'>{name}</span>", unsafe_allow_html=True)
        st.markdown(f"<div class='nfl-meta'>{team} • {movement}" + (f" • {game}" if game else "") + "</div>", unsafe_allow_html=True)
    if category in {"Anytime TD", "First TD"}:
        c3,c4 = st.columns(2); c3.metric("Model Probability", f"{_fmt(row.get('model_probability'))}%"); c4.metric("Mode", str(row.get("ranking_mode") or "Foundation"))
    else:
        c3,c4 = st.columns(2); c3.metric("Projection", f"{_fmt(row.get(projection_col))} {PROP_CATALOG[category]['unit']}")
        c4.metric("Live Line", _fmt(row.get("consensus_line")) if pd.notna(row.get("consensus_line")) else "Foundation")
    st.markdown(f"<div class='nfl-why'><b>Why Engine</b> • {_why(row, category, projection_col)}</div>", unsafe_allow_html=True)
    if st.button("View player card", key=f"nfl_player_{category}_{row.get('player_id')}_{rank}", use_container_width=True):
        st.session_state["nfl_selected_player_id"] = str(row.get("player_id"))
    st.divider()


def _find_player_in_rankings(player_id: str, rankings_by_category: dict[str, pd.DataFrame]):
    rows = []
    for category, df in rankings_by_category.items():
        if df is None or df.empty or "player_id" not in df.columns: continue
        match = df[df["player_id"].astype(str) == str(player_id)]
        if not match.empty:
            row = match.iloc[0]
            rows.append((category, row))
    return rows


def _render_player_card(player_id, schedule, week, rankings_by_category):
    try:
        roster = load_nfl_roster(NFL_SEASON)
        player_rows = roster[roster["player_id"].astype(str) == str(player_id)]
        if player_rows.empty: return
        player = player_rows.iloc[0]
    except Exception:
        return
    st.markdown('<div class="nfl-section">👤 Player Intelligence Card</div>', unsafe_allow_html=True)
    c1,c2 = st.columns([1,4])
    with c1:
        if pd.notna(player.get("headshot_url")): st.image(player.get("headshot_url"), width=92)
    with c2:
        st.markdown(f"## {player.get('player_name','Player')}")
        st.caption(f"{player.get('team','')} • {player.get('position','')} • {_matchup_map(schedule, week).get(str(player.get('team','')).upper(), 'No active matchup')}")

    prop_rows = _find_player_in_rankings(str(player_id), rankings_by_category)
    if prop_rows:
        st.markdown("#### Tracked Props")
        for category, row in prop_rows:
            projection_col = PROP_CATALOG[category]["projection"]
            if category in {"Anytime TD", "First TD"}:
                value = f"{_fmt(row.get('model_probability'))}%"
            else:
                value = f"{_fmt(row.get(projection_col))} {PROP_CATALOG[category]['unit']}"
            st.markdown(f"**{category}** — {value} • Rank #{int(row.get('rank',0))}")
            st.caption(_why(row, category, projection_col))
    else:
        st.caption("This player is not currently inside a tracked Top 25 ranking.")

    try:
        weekly = load_nfl_weekly_player_stats(NFL_BASELINE_SEASON)
        hist = weekly[weekly["player_id"].astype(str) == str(player_id)].sort_values("week")
        if not hist.empty:
            st.markdown("#### Recent Form")
            last5 = hist.tail(5)
            metrics = []
            pos = str(player.get("position", ""))
            if pos == "QB": metrics = [("Pass Yds", "passing_yards"), ("Pass TD", "passing_tds"), ("Rush Yds", "rushing_yards")]
            elif pos in {"RB","WR","TE"}: metrics = [("Rush Yds", "rushing_yards"), ("Rec Yds", "receiving_yards"), ("Receptions", "receptions")]
            else: metrics = [("Sacks", "sacks"), ("Tackles", "tackles_total")]
            cols = st.columns(len(metrics))
            for col,(label,field) in zip(cols,metrics):
                value = pd.to_numeric(last5.get(field), errors="coerce").mean() if field in last5.columns else pd.NA
                col.metric(f"Last 5 {label}", _fmt(value))
    except Exception:
        pass


def _render_player_search(schedule, week, rankings_by_category):
    st.markdown('<div class="nfl-section">🔎 Player Search</div>', unsafe_allow_html=True)
    try:
        roster = load_nfl_roster(NFL_SEASON)
    except Exception:
        st.caption("Player search is temporarily unavailable."); return
    query = st.text_input("Search NFL player", placeholder="Type a player name…", key="nfl_player_search")
    if not query.strip(): return
    matches = roster[roster["player_name"].str.contains(query.strip(), case=False, na=False)].head(12)
    if matches.empty:
        st.info("No current NFL player matched that search."); return
    options = {f"{r.player_name} · {r.team} · {r.position}": str(r.player_id) for r in matches.itertuples()}
    selected = st.selectbox("Matches", list(options.keys()), key="nfl_player_search_match")
    if st.button("Open player card", key="nfl_open_search_player", use_container_width=True):
        st.session_state["nfl_selected_player_id"] = options[selected]


def show():
    _inject_css()
    st.markdown("""
    <div class="nfl-hero"><h2>🏈 NFL Intelligence Center</h2>
    <div class="nfl-soft">Weekly slate • game intelligence • Top 25 prop rankings • player intelligence</div></div>
    """, unsafe_allow_html=True)

    phase, schedule, week = _active_schedule_context(); games = _week_games(schedule, week)
    feed = get_nfl_odds_feed_status(); phase_label = "Regular Season" if phase == "REG" else "Preseason"
    c1,c2,c3 = st.columns(3)
    c1.metric("Active Week", f"{phase_label} {week}" if week else phase_label)
    c2.metric("Games", len(games))
    c3.metric("Prop Mode", "Live" if feed.get("status") == "live" else "Foundation")
    st.caption(feed.get("message") or "Sportsbook market status unavailable.")

    selected_game = _render_week_bubbles(games, phase, week)
    _render_matchup(selected_game)

    st.markdown('<div class="nfl-section">🎯 Player Prop Rankings</div>', unsafe_allow_html=True)
    category = st.selectbox("Select Top 25 category", list(PROP_CATALOG.keys()), key="nfl_prop_category")
    rankings = _category_rankings(category, schedule, week)
    projection_col = PROP_CATALOG[category]["projection"]
    rankings_by_category = {category: rankings}

    if rankings.empty:
        if category in {"Sacks", "Tackles + Assists"}:
            st.info(f"{category} will populate when the nflverse defensive fields are available in the current stats feed. No placeholder rankings are shown.")
        else:
            st.info(f"No qualified {category} rankings are available for the active week yet.")
    else:
        st.caption("Top 5 shown first • expand the full Top 25 when you want the deeper board.")
        for _, row in rankings.head(5).iterrows(): _render_rank_card(row, category, projection_col)
        with st.expander(f"View full Top 25 — {category}"):
            for _, row in rankings.iloc[5:25].iterrows(): _render_rank_card(row, category, projection_col)

    _render_player_search(schedule, week, rankings_by_category)
    selected_player = st.session_state.get("nfl_selected_player_id")
    if selected_player:
        # Build remaining categories lazily only when a player card is actually open.
        with st.spinner("Building player intelligence…"):
            for cat in PROP_CATALOG:
                if cat not in rankings_by_category:
                    rankings_by_category[cat] = _category_rankings(cat, schedule, week)
        _render_player_card(selected_player, schedule, week, rankings_by_category)

    st.markdown('<div class="nfl-section">📈 Prediction Performance</div>', unsafe_allow_html=True)
    st.caption("NFL prediction grading will live here once pregame snapshots are persisted. The old duplicate Games / Results page has been removed.")


show()
