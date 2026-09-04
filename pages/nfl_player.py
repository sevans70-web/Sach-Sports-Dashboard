"""NFL player intelligence card."""
from __future__ import annotations

from datetime import datetime
from html import escape
from zoneinfo import ZoneInfo

import pandas as pd
import streamlit as st

from data.nfl_player_baseline import build_nfl_player_baseline
from data.nfl_schedule import load_nfl_schedule
from engines.nfl_passing_projection import build_passing_yards_projection
from engines.nfl_passing_market_join import attach_live_passing_yards_lines
from engines.nfl_passing_probability import attach_passing_yards_probabilities
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
BASELINE_SEASON = 2025
TZ = ZoneInfo("America/Toronto")

PROP_CATALOG = {
    "Passing Yards": ("passing", "passing_yards_projection_matchup", "yards"),
    "Passing TDs": (build_passing_tds_top25, "passing_tds_projection", "TDs"),
    "Pass + Rush Yds": (build_passing_rushing_yards_top25, "passing_rushing_projection", "yards"),
    "Rushing Yards": (build_rushing_yards_top25, "rushing_projection", "yards"),
    "Rush + Rec Yds": (build_rushing_receiving_yards_top25, "rushing_receiving_projection", "yards"),
    "Receiving Yards": (build_receiving_yards_top25, "receiving_projection", "yards"),
    "Receptions": (build_receptions_top25, "receptions_projection", "receptions"),
    "Anytime TD": (build_anytime_td_top25, "model_probability", "%"),
    "First TD": (build_first_td_top25, "model_probability", "%"),
    "Sacks": (build_sacks_top25, "sacks_projection", "sacks"),
    "Tackles + Assists": (build_tackles_top25, "tackles_projection", "tackles"),
}


def _html(value: str) -> None:
    st.markdown(" ".join(line.strip() for line in value.splitlines() if line.strip()), unsafe_allow_html=True)


def _active_schedule() -> tuple[pd.DataFrame, int | None]:
    now = datetime.now(TZ).replace(tzinfo=None)
    try:
        reg = load_nfl_schedule(NFL_SEASON, "REG").copy()
        reg["kickoff_et"] = pd.to_datetime(reg["kickoff_et"], errors="coerce")
    except Exception:
        return pd.DataFrame(), None
    weeks = sorted(pd.to_numeric(reg.get("week"), errors="coerce").dropna().astype(int).unique())
    for week in weeks:
        slate = reg[pd.to_numeric(reg["week"], errors="coerce").eq(week)]
        latest = slate["kickoff_et"].dropna().max()
        first = slate["kickoff_et"].dropna().min()
        if pd.notna(first) and now >= first - pd.Timedelta(days=7) and pd.notna(latest) and now <= latest + pd.Timedelta(hours=5):
            return reg, int(week)
    return reg, (weeks[0] if weeks else None)


def _matchups(schedule: pd.DataFrame, week: int | None) -> dict[str, str]:
    if schedule.empty or week is None:
        return {}
    slate = schedule[pd.to_numeric(schedule["week"], errors="coerce").eq(int(week))]
    out = {}
    for _, game in slate.iterrows():
        away, home = str(game.get("away_team") or "").upper(), str(game.get("home_team") or "").upper()
        out[away] = f"{away} @ {home}"; out[home] = f"{away} @ {home}"
    return out


def _passing_rankings(schedule: pd.DataFrame, week: int | None) -> pd.DataFrame:
    if schedule.empty or week is None:
        return pd.DataFrame()
    slate = schedule[pd.to_numeric(schedule["week"], errors="coerce").eq(int(week))]
    frames = []
    for _, game in slate.iterrows():
        away, home = str(game.get("away_team") or "").upper(), str(game.get("home_team") or "").upper()
        try:
            a = build_passing_yards_projection(home, NFL_SEASON, BASELINE_SEASON)
            h = build_passing_yards_projection(away, NFL_SEASON, BASELINE_SEASON)
            qbs = pd.concat([a[a["team"].eq(away)], h[h["team"].eq(home)]], ignore_index=True)
            if qbs.empty:
                continue
            qbs = attach_live_passing_yards_lines(qbs)
            qbs = attach_passing_yards_probabilities(qbs)
            qbs["game"] = f"{away} @ {home}"
            frames.append(qbs)
        except Exception:
            continue
    return pd.DataFrame() if not frames else rank_passing_yards_top25(pd.concat(frames, ignore_index=True), limit=25)


def _build_market(prop: str, schedule: pd.DataFrame, week: int | None) -> pd.DataFrame:
    builder, _, _ = PROP_CATALOG[prop]
    try:
        df = _passing_rankings(schedule, week) if builder == "passing" else builder(NFL_SEASON, BASELINE_SEASON)
    except Exception:
        return pd.DataFrame()
    if df is None or df.empty:
        return pd.DataFrame()
    df = df.copy()
    if "player_name" not in df.columns and "player" in df.columns:
        df["player_name"] = df["player"]
    if "team" not in df.columns:
        for col in ["recent_team", "team_abbreviation", "team_name"]:
            if col in df.columns:
                df["team"] = df[col]; break
    if "team" not in df.columns:
        df["team"] = ""
    game_map = _matchups(schedule, week)
    if "game" not in df.columns:
        df["game"] = df["team"].astype(str).str.upper().map(game_map).fillna("")
    return df.head(25)


def _projection(row: pd.Series, prop: str) -> str:
    _, col, unit = PROP_CATALOG[prop]
    value = row.get(col)
    if value is None or pd.isna(value):
        return "Projection pending"
    value = float(value)
    if unit == "%":
        if value <= 1: value *= 100
        return f"Model probability {value:.1f}%"
    if unit in {"TDs", "sacks"}:
        return f"Projection {value:.2f} {unit}"
    return f"Projection {value:.1f} {unit}"


def _score(row: pd.Series, prop: str) -> float:
    for key in ["gi_score", "score", "model_probability"]:
        value = row.get(key)
        if value is not None and not pd.isna(value):
            value = float(value)
            if key == "model_probability" and value <= 1: value *= 100
            return min(99.9, max(0.0, value))
    _, col, _ = PROP_CATALOG[prop]
    value = row.get(col)
    return 0.0 if value is None or pd.isna(value) else min(99.9, max(0.0, float(value)))


def _why(row: pd.Series) -> str:
    parts = []
    label = str(row.get("passing_matchup_label") or "").strip()
    if label and label.lower() not in {"unknown", "nan", "none"}:
        parts.append(f"{label} opponent matchup")
    l5_keys = [k for k in row.index if str(k).startswith("last_5_")]
    if l5_keys:
        value = row.get(l5_keys[0])
        if value is not None and not pd.isna(value): parts.append(f"Last 5 signal {float(value):.1f}")
    line = row.get("consensus_line")
    if line is not None and not pd.isna(line): parts.append(f"live line {float(line):.1f}")
    if not parts: parts.append("prior-season production, recent form and this week's available matchup context")
    return "; ".join(parts[:3]) + "."


st.markdown(
    """
    <style>
    .block-container{max-width:950px;padding-top:.2rem!important}.nfl-player-head{display:grid;grid-template-columns:76px minmax(0,1fr);gap:12px;align-items:center;padding:12px;background:linear-gradient(118deg,#101112,#111315 68%,rgba(25,217,120,.07));border:1.5px solid #30343a;border-radius:14px;margin:5px 0 9px}.nfl-player-photo,.nfl-player-fallback{width:72px;height:72px;border-radius:50%;overflow:hidden;background:#080909;border:2px solid rgba(214,179,92,.86)}.nfl-player-photo img{width:100%;height:100%;object-fit:cover;object-position:center 24%}.nfl-player-fallback{display:flex;align-items:center;justify-content:center;color:#f6c84c;font-weight:900}.nfl-player-copy h2{margin:0;color:#fff;font-size:1.35rem}.nfl-player-copy p{margin:3px 0;color:#a7abb2;font-size:.78rem}.nfl-player-copy strong{color:#f6c84c;font-size:.76rem}.nfl-market-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;margin:9px 0}.nfl-market-card{background:#0d0f10;border:1px solid #30343a;border-left:3px solid #19d978;border-radius:10px;padding:9px}.nfl-market-card b{display:block;color:#fff;font-size:.78rem}.nfl-market-card span{display:block;color:#f6c84c;font-size:.72rem;font-weight:850;margin-top:3px}.nfl-market-card small{display:block;color:#9da2aa;font-size:.65rem;margin-top:3px}.nfl-intel{padding:10px;border:1px solid rgba(214,179,92,.52);border-radius:10px;background:#101112;color:#d9dbde;font-size:.75rem;line-height:1.45;margin-top:8px}.nfl-intel b{color:#f6c84c}div[class*="st-key-back_nfl_player"] button{background:#080909!important;color:#fff!important;border:1px solid #34373c!important;border-radius:9px!important}@media(max-width:700px){.block-container{padding-left:.85rem!important;padding-right:.85rem!important}.nfl-player-head{grid-template-columns:64px minmax(0,1fr);gap:10px;padding:10px}.nfl-player-photo,.nfl-player-fallback{width:60px;height:60px}.nfl-player-copy h2{font-size:1.12rem}}
    </style>
    """,
    unsafe_allow_html=True,
)

if st.button("← Back", key="back_nfl_player"):
    st.switch_page("pages/nfl.py")

player = st.session_state.get("nfl_selected_player")
if not isinstance(player, dict) or not player.get("player_id"):
    st.warning("Choose an NFL player from Player Search, a ranking, or a weekly game first.")
    st.page_link("pages/nfl.py", label="Return to NFL", icon="🏈")
    st.stop()

player_id = str(player.get("player_id")); name = str(player.get("player_name") or "NFL Player")
team = str(player.get("team") or ""); pos = str(player.get("position") or ""); photo = str(player.get("headshot_url") or ""); matchup = str(player.get("game") or "")
img = f'<div class="nfl-player-photo"><img src="{escape(photo)}" alt="{escape(name)}"></div>' if photo else '<div class="nfl-player-fallback">NFL</div>'
_html(f'<div class="nfl-player-head">{img}<div class="nfl-player-copy"><h2>{escape(name)}</h2><p>{escape(team)} · {escape(pos)}</p><strong>{escape(matchup or "Weekly matchup context")}</strong></div></div>')

schedule, week = _active_schedule()
market_rows = []
for prop in PROP_CATALOG:
    df = _build_market(prop, schedule, week)
    if df.empty or "player_id" not in df.columns: continue
    match = df[df["player_id"].astype(str).eq(player_id)]
    if not match.empty: market_rows.append((prop, match.iloc[0]))

if market_rows:
    cards = [f'<div class="nfl-market-card"><b>{escape(prop)}</b><span>#{int(row.get("rank") or 0)} · GI {_score(row, prop):.1f}</span><small>{escape(_projection(row, prop))}</small></div>' for prop, row in market_rows]
    _html('<div class="nfl-market-grid">' + ''.join(cards) + '</div>')
    names = [prop for prop, _ in market_rows]
    selected = st.segmented_control("Tracked market", names, default=names[0], key="nfl_player_market") or names[0]
    row = next(row for prop, row in market_rows if prop == selected)
    _html(f'<div class="nfl-intel"><b>Why Engine · {escape(selected)}</b><br>{escape(_why(row))}</div>')
else:
    st.info("This player is not currently inside a Top 25 tracked market. Their roster profile is still available here, and market cards will appear when they qualify.")

try:
    baseline = build_nfl_player_baseline(NFL_SEASON, BASELINE_SEASON)
    base = baseline[baseline["player_id"].astype(str).eq(player_id)]
except Exception:
    base = pd.DataFrame()
if not base.empty:
    row = base.iloc[0]
    st.markdown("### Player context")
    cols = st.columns(4)
    for col, (label, value) in zip(cols, [("Games", row.get("games_played")), ("Pass yds", row.get("passing_yards")), ("Rush yds", row.get("rushing_yards")), ("Rec yds", row.get("receiving_yards"))]):
        with col:
            display = "—" if value is None or pd.isna(value) else f"{float(value):.0f}"
            st.metric(label, display)
