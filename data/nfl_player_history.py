"""NFL player game-log history for trend charts."""
from __future__ import annotations

import pandas as pd
import streamlit as st

from data.nfl_schedule import load_nfl_schedule
from data.nfl_stats import load_nfl_weekly_player_stats

MARKET_COLUMNS = {
    "Passing Yards": "passing_yards",
    "Passing TDs": "passing_tds",
    "Pass + Rush Yds": None,
    "Rushing Yards": "rushing_yards",
    "Rush + Rec Yds": None,
    "Receiving Yards": "receiving_yards",
    "Receptions": "receptions",
    "Anytime TD": None,
    "First TD": None,
    "Sacks": "sacks",
    "Tackles + Assists": "tackles_total",
}


def _market_value(df: pd.DataFrame, market: str) -> pd.Series:
    if market == "Pass + Rush Yds":
        return pd.to_numeric(df.get("passing_yards", 0), errors="coerce").fillna(0) + pd.to_numeric(df.get("rushing_yards", 0), errors="coerce").fillna(0)
    if market == "Rush + Rec Yds":
        return pd.to_numeric(df.get("rushing_yards", 0), errors="coerce").fillna(0) + pd.to_numeric(df.get("receiving_yards", 0), errors="coerce").fillna(0)
    if market in {"Anytime TD", "First TD"}:
        return (
            pd.to_numeric(df.get("passing_tds", 0), errors="coerce").fillna(0)
            + pd.to_numeric(df.get("rushing_tds", 0), errors="coerce").fillna(0)
            + pd.to_numeric(df.get("receiving_tds", 0), errors="coerce").fillna(0)
        ).clip(upper=1)
    col = MARKET_COLUMNS.get(market)
    if col and col in df.columns:
        return pd.to_numeric(df[col], errors="coerce").fillna(0)
    return pd.Series(0.0, index=df.index)


@st.cache_data(ttl=21600, show_spinner=False)
def player_last_games(player_id: str, market: str, baseline_season: int = 2025, limit: int = 10) -> pd.DataFrame:
    weekly = load_nfl_weekly_player_stats(baseline_season).copy()
    if weekly.empty or "player_id" not in weekly.columns:
        return pd.DataFrame()
    player = weekly[weekly["player_id"].astype(str).eq(str(player_id))].copy()
    if player.empty:
        return pd.DataFrame()
    player["value"] = _market_value(player, market)

    try:
        schedule = load_nfl_schedule(baseline_season, "REG").copy()
        schedule["week"] = pd.to_numeric(schedule["week"], errors="coerce")
        date_map = {}
        for _, g in schedule.iterrows():
            wk = int(g["week"]) if pd.notna(g["week"]) else None
            if wk is None: continue
            day = pd.to_datetime(g.get("gameday"), errors="coerce")
            date_map[(wk, str(g.get("away_team") or "").upper())] = day
            date_map[(wk, str(g.get("home_team") or "").upper())] = day
        player["game_date"] = player.apply(lambda r: date_map.get((int(r["week"]), str(r.get("recent_team") or "").upper())), axis=1)
    except Exception:
        player["game_date"] = pd.NaT

    player = player.sort_values(["week"]).tail(limit).copy()
    player["opponent"] = player.get("opponent_team", "").astype(str).str.upper()
    player["date_label"] = pd.to_datetime(player["game_date"], errors="coerce").dt.strftime("%b %-d")
    player["date_label"] = player["date_label"].fillna(player["week"].map(lambda x: f"Wk {int(x)}"))
    player["chart_label"] = player["date_label"] + " · " + player["opponent"]
    return player[[c for c in ["week","game_date","date_label","chart_label","opponent","value"] if c in player.columns]].reset_index(drop=True)
