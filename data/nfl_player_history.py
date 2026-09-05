"""NFL player game-log history for Sach player intelligence charts."""
from __future__ import annotations

import re
import unicodedata

import pandas as pd
import streamlit as st

from data.nfl_schedule import load_nfl_schedule
from data.nfl_stats import load_nfl_weekly_player_stats

NFL_SEASON = 2026
BASELINE_SEASON = 2025

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


def _numeric(df: pd.DataFrame, column: str) -> pd.Series:
    if column not in df.columns:
        return pd.Series(0.0, index=df.index, dtype=float)
    return pd.to_numeric(df[column], errors="coerce").fillna(0.0)


def _market_value(df: pd.DataFrame, market: str) -> pd.Series:
    if market == "Pass + Rush Yds":
        return _numeric(df, "passing_yards") + _numeric(df, "rushing_yards")
    if market == "Rush + Rec Yds":
        return _numeric(df, "rushing_yards") + _numeric(df, "receiving_yards")
    if market == "Anytime TD":
        return (_numeric(df, "rushing_tds") + _numeric(df, "receiving_tds")).clip(upper=1)
    if market == "First TD":
        # Weekly box scores identify touchdown scorers, but not who scored first.
        # Do not display anytime-TD results as if they were first-TD results.
        return pd.Series(pd.NA, index=df.index, dtype="Float64")
    col = MARKET_COLUMNS.get(market)
    return _numeric(df, col) if col else pd.Series(0.0, index=df.index, dtype=float)


def _name_key(value: object) -> str:
    text = unicodedata.normalize("NFKD", str(value or ""))
    text = "".join(char for char in text if not unicodedata.combining(char)).lower()
    text = re.sub(r"[^a-z0-9 ]", " ", text)
    text = re.sub(r"\b(jr|sr|ii|iii|iv)\b", " ", text)
    return " ".join(text.split())


def _season_player_rows(player_id: str, player_name: str, season: int, market: str) -> pd.DataFrame:
    try:
        weekly = load_nfl_weekly_player_stats(season).copy()
    except Exception:
        return pd.DataFrame()
    if weekly.empty or "player_id" not in weekly.columns:
        return pd.DataFrame()
    player = weekly[weekly["player_id"].astype(str).eq(str(player_id))].copy()
    if player.empty and player_name and "player_display_name" in weekly.columns:
        wanted_name = _name_key(player_name)
        player = weekly[
            weekly["player_display_name"].map(_name_key).eq(wanted_name)
        ].copy()
    if player.empty:
        return pd.DataFrame()

    player["value"] = _market_value(player, market)
    player["season"] = season

    try:
        schedule = load_nfl_schedule(season, "REG").copy()
        schedule["week"] = pd.to_numeric(schedule["week"], errors="coerce")
        schedule["kickoff_et"] = pd.to_datetime(schedule.get("kickoff_et"), errors="coerce")
        game_map = {}
        for _, game in schedule.iterrows():
            if pd.isna(game.get("week")):
                continue
            wk = int(game["week"])
            away = str(game.get("away_team") or "").upper()
            home = str(game.get("home_team") or "").upper()
            kickoff = game.get("kickoff_et")
            if away:
                game_map[(wk, away)] = (kickoff, home)
            if home:
                game_map[(wk, home)] = (kickoff, away)

        mapped = []
        for _, row in player.iterrows():
            if pd.isna(row.get("week")):
                mapped.append((pd.NaT, str(row.get("opponent_team") or "").upper()))
                continue
            key = (int(row["week"]), str(row.get("recent_team") or "").upper())
            mapped.append(game_map.get(key, (pd.NaT, str(row.get("opponent_team") or "").upper())))
        player["game_date"] = [x[0] for x in mapped]
        player["schedule_opponent"] = [x[1] for x in mapped]
    except Exception:
        player["game_date"] = pd.NaT
        player["schedule_opponent"] = ""

    opp = player.get("opponent_team", pd.Series("", index=player.index)).astype(str).str.upper()
    sched_opp = player.get("schedule_opponent", pd.Series("", index=player.index)).astype(str).str.upper()
    player["opponent"] = opp.where(opp.str.len() > 0, sched_opp)
    player["game_date"] = pd.to_datetime(player["game_date"], errors="coerce")
    return player


@st.cache_data(ttl=21600, show_spinner=False)
def player_last_games(
    player_id: str,
    market: str,
    limit: int = 10,
    player_name: str = "",
) -> pd.DataFrame:
    """Return up to 10 real NFL regular-season games, current season first."""
    frames = []
    for season in (NFL_SEASON, BASELINE_SEASON):
        frame = _season_player_rows(player_id, player_name, season, market)
        if not frame.empty:
            frames.append(frame)
    if not frames:
        return pd.DataFrame()

    player = pd.concat(frames, ignore_index=True, sort=False)
    player["week"] = pd.to_numeric(player["week"], errors="coerce")
    player["game_date"] = pd.to_datetime(player["game_date"], errors="coerce")
    player = player.dropna(subset=["value"])
    player = player.sort_values(["season", "week"], kind="stable").tail(limit).copy()

    def date_label(row):
        dt = row.get("game_date")
        if pd.notna(dt):
            return f"{dt.strftime('%b')} {dt.day}"
        wk = row.get("week")
        return f"Wk {int(wk)}" if pd.notna(wk) else "Game"

    player["date_label"] = player.apply(date_label, axis=1)
    player["opponent"] = player["opponent"].fillna("").astype(str).str.upper()
    player["chart_label"] = player.apply(lambda r: f"{r['opponent'] or 'OPP'}\n{r['date_label']}", axis=1)
    keep = ["season", "week", "game_date", "date_label", "chart_label", "opponent", "value"]
    return player[[c for c in keep if c in player.columns]].reset_index(drop=True)
