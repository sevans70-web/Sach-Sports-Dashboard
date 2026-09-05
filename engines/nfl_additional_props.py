"""Additional NFL prop foundations for the Sach Sports Dashboard.

These rankings intentionally use real nflverse player data only. Sportsbook
market joins can be added per market once the provider keys are verified.
"""
from __future__ import annotations

import pandas as pd
import streamlit as st

from data.nfl_player_baseline import build_nfl_player_baseline
from data.nfl_roster import load_nfl_roster
from data.nfl_stats import load_nfl_weekly_player_stats

ROSTER_SEASON = 2026
BASELINE_SEASON = 2025


def _weighted_projection(season_avg, last5, last3, digits=1):
    weighted = 0.0
    weight_total = 0.0
    for value, weight in ((season_avg, 0.55), (last5, 0.25), (last3, 0.20)):
        if value is not None and not pd.isna(value):
            weighted += float(value) * weight
            weight_total += weight
    if not weight_total:
        return pd.NA
    return round(weighted / weight_total, digits)


def _recent_means(weekly: pd.DataFrame, columns: list[str]) -> pd.DataFrame:
    if weekly is None or weekly.empty:
        return pd.DataFrame(columns=["player_id"])

    rows = []
    for player_id, group in weekly.groupby("player_id"):
        group = group.sort_values("week")
        row = {"player_id": player_id}
        for column in columns:
            values = pd.to_numeric(group.get(column), errors="coerce")
            row[f"last_5_{column}"] = values.tail(5).mean() if not values.empty else pd.NA
            row[f"last_3_{column}"] = values.tail(3).mean() if not values.empty else pd.NA
        rows.append(row)
    return pd.DataFrame(rows)


def _rank(df: pd.DataFrame, projection_col: str, category: str, limit: int = 25) -> pd.DataFrame:
    if df is None or df.empty or projection_col not in df.columns:
        return pd.DataFrame()
    result = df.copy()
    result[projection_col] = pd.to_numeric(result[projection_col], errors="coerce")
    result = result[result[projection_col].notna()].copy()
    if result.empty:
        return result
    result = result.sort_values(projection_col, ascending=False).head(limit).reset_index(drop=True)
    result["rank"] = range(1, len(result) + 1)
    result["ranking_mode"] = "Foundation"
    result["category"] = category
    return result


@st.cache_data(ttl=21600, show_spinner=False)
def build_passing_tds_top25(roster_season: int = ROSTER_SEASON, baseline_season: int = BASELINE_SEASON) -> pd.DataFrame:
    base = build_nfl_player_baseline(roster_season, baseline_season).copy()
    base = base[base["position"].eq("QB")].copy()
    weekly = load_nfl_weekly_player_stats(baseline_season).copy()
    recent = _recent_means(weekly, ["passing_tds"])
    base = base.merge(recent, on="player_id", how="left")
    games = pd.to_numeric(base.get("games_played"), errors="coerce").replace(0, pd.NA)
    base["passing_tds_per_game"] = pd.to_numeric(base.get("passing_tds"), errors="coerce") / games
    base["passing_tds_projection"] = base.apply(
        lambda r: _weighted_projection(r.get("passing_tds_per_game"), r.get("last_5_passing_tds"), r.get("last_3_passing_tds"), 2), axis=1
    )
    return _rank(base, "passing_tds_projection", "Passing TDs")


@st.cache_data(ttl=21600, show_spinner=False)
def build_interceptions_top25(roster_season: int = ROSTER_SEASON, baseline_season: int = BASELINE_SEASON) -> pd.DataFrame:
    base = build_nfl_player_baseline(roster_season, baseline_season).copy()
    base = base[base["position"].eq("QB")].copy()
    weekly = load_nfl_weekly_player_stats(baseline_season).copy()
    recent = _recent_means(weekly, ["interceptions"])
    base = base.merge(recent, on="player_id", how="left")
    games = pd.to_numeric(base.get("games_played"), errors="coerce").replace(0, pd.NA)
    base["interceptions_per_game"] = pd.to_numeric(base.get("interceptions"), errors="coerce") / games
    base["interceptions_projection"] = base.apply(
        lambda r: _weighted_projection(r.get("interceptions_per_game"), r.get("last_5_interceptions"), r.get("last_3_interceptions"), 2), axis=1
    )
    return _rank(base, "interceptions_projection", "Interceptions")


@st.cache_data(ttl=21600, show_spinner=False)
def build_passing_rushing_yards_top25(roster_season: int = ROSTER_SEASON, baseline_season: int = BASELINE_SEASON) -> pd.DataFrame:
    base = build_nfl_player_baseline(roster_season, baseline_season).copy()
    base = base[base["position"].eq("QB")].copy()
    weekly = load_nfl_weekly_player_stats(baseline_season).copy()
    weekly["passing_rushing_yards"] = pd.to_numeric(weekly.get("passing_yards"), errors="coerce").fillna(0) + pd.to_numeric(weekly.get("rushing_yards"), errors="coerce").fillna(0)
    recent = _recent_means(weekly, ["passing_rushing_yards"])
    base = base.merge(recent, on="player_id", how="left")
    games = pd.to_numeric(base.get("games_played"), errors="coerce").replace(0, pd.NA)
    season_avg = (pd.to_numeric(base.get("passing_yards"), errors="coerce").fillna(0) + pd.to_numeric(base.get("rushing_yards"), errors="coerce").fillna(0)) / games
    base["passing_rushing_yards_per_game"] = season_avg
    base["passing_rushing_projection"] = base.apply(
        lambda r: _weighted_projection(r.get("passing_rushing_yards_per_game"), r.get("last_5_passing_rushing_yards"), r.get("last_3_passing_rushing_yards")), axis=1
    )
    return _rank(base, "passing_rushing_projection", "Passing + Rushing Yards")


@st.cache_data(ttl=21600, show_spinner=False)
def build_rushing_receiving_yards_top25(roster_season: int = ROSTER_SEASON, baseline_season: int = BASELINE_SEASON) -> pd.DataFrame:
    base = build_nfl_player_baseline(roster_season, baseline_season).copy()
    base = base[base["position"].isin(["RB", "WR", "TE"])].copy()
    weekly = load_nfl_weekly_player_stats(baseline_season).copy()
    weekly["rushing_receiving_yards"] = pd.to_numeric(weekly.get("rushing_yards"), errors="coerce").fillna(0) + pd.to_numeric(weekly.get("receiving_yards"), errors="coerce").fillna(0)
    recent = _recent_means(weekly, ["rushing_receiving_yards"])
    base = base.merge(recent, on="player_id", how="left")
    games = pd.to_numeric(base.get("games_played"), errors="coerce").replace(0, pd.NA)
    season_avg = (pd.to_numeric(base.get("rushing_yards"), errors="coerce").fillna(0) + pd.to_numeric(base.get("receiving_yards"), errors="coerce").fillna(0)) / games
    base["rushing_receiving_yards_per_game"] = season_avg
    base["rushing_receiving_projection"] = base.apply(
        lambda r: _weighted_projection(r.get("rushing_receiving_yards_per_game"), r.get("last_5_rushing_receiving_yards"), r.get("last_3_rushing_receiving_yards")), axis=1
    )
    return _rank(base, "rushing_receiving_projection", "Rushing + Receiving Yards")


def _defensive_foundation(roster_season: int, baseline_season: int) -> tuple[pd.DataFrame, pd.DataFrame]:
    roster = load_nfl_roster(roster_season).copy()
    weekly = load_nfl_weekly_player_stats(baseline_season).copy()
    defense_positions = ["DE", "DT", "DL", "NT", "LB", "OLB", "ILB", "CB", "DB", "S", "FS", "SS"]
    roster = roster[roster["position"].isin(defense_positions)].copy()
    if weekly.empty:
        return roster.iloc[0:0], weekly
    latest_team = weekly.sort_values(["player_id", "week"]).groupby("player_id", as_index=False).tail(1)[["player_id", "recent_team"]]
    stat_cols = [c for c in ["sacks", "tackles_solo", "tackles_assists", "tackles_total"] if c in weekly.columns]
    if not stat_cols:
        return roster.iloc[0:0], weekly
    totals = weekly.groupby("player_id", as_index=False)[stat_cols].sum()
    games = weekly.groupby("player_id")["week"].nunique().reset_index(name="games_played")
    totals = totals.merge(games, on="player_id", how="left").merge(latest_team, on="player_id", how="left")
    merged = roster.merge(totals, on="player_id", how="inner")
    return merged, weekly


@st.cache_data(ttl=21600, show_spinner=False)
def build_sacks_top25(roster_season: int = ROSTER_SEASON, baseline_season: int = BASELINE_SEASON) -> pd.DataFrame:
    base, weekly = _defensive_foundation(roster_season, baseline_season)
    if base.empty or "sacks" not in weekly.columns:
        return pd.DataFrame()
    recent = _recent_means(weekly, ["sacks"])
    base = base.merge(recent, on="player_id", how="left")
    games = pd.to_numeric(base.get("games_played"), errors="coerce").replace(0, pd.NA)
    base["sacks_per_game"] = pd.to_numeric(base.get("sacks"), errors="coerce") / games
    base["sacks_projection"] = base.apply(lambda r: _weighted_projection(r.get("sacks_per_game"), r.get("last_5_sacks"), r.get("last_3_sacks"), 2), axis=1)
    return _rank(base, "sacks_projection", "Sacks")


@st.cache_data(ttl=21600, show_spinner=False)
def build_tackles_assists_top25(roster_season: int = ROSTER_SEASON, baseline_season: int = BASELINE_SEASON) -> pd.DataFrame:
    base, weekly = _defensive_foundation(roster_season, baseline_season)
    if base.empty:
        return pd.DataFrame()
    if "tackles_total" not in weekly.columns:
        if "tackles_solo" in weekly.columns or "tackles_assists" in weekly.columns:
            weekly["tackles_total"] = pd.to_numeric(weekly.get("tackles_solo"), errors="coerce").fillna(0) + pd.to_numeric(weekly.get("tackles_assists"), errors="coerce").fillna(0)
        else:
            return pd.DataFrame()
    if "tackles_total" not in base.columns:
        solo = pd.to_numeric(base.get("tackles_solo"), errors="coerce").fillna(0)
        assists = pd.to_numeric(base.get("tackles_assists"), errors="coerce").fillna(0)
        base["tackles_total"] = solo + assists
    recent = _recent_means(weekly, ["tackles_total"])
    base = base.merge(recent, on="player_id", how="left")
    games = pd.to_numeric(base.get("games_played"), errors="coerce").replace(0, pd.NA)
    base["tackles_per_game"] = pd.to_numeric(base.get("tackles_total"), errors="coerce") / games
    base["tackles_projection"] = base.apply(lambda r: _weighted_projection(r.get("tackles_per_game"), r.get("last_5_tackles_total"), r.get("last_3_tackles_total")), axis=1)
    return _rank(base, "tackles_projection", "Tackles + Assists")


@st.cache_data(ttl=21600, show_spinner=False)
def build_tackles_top25(roster_season: int = ROSTER_SEASON, baseline_season: int = BASELINE_SEASON) -> pd.DataFrame:
    base, weekly = _defensive_foundation(roster_season, baseline_season)
    if base.empty or "tackles_solo" not in weekly.columns:
        return pd.DataFrame()
    recent = _recent_means(weekly, ["tackles_solo"])
    base = base.merge(recent, on="player_id", how="left")
    games = pd.to_numeric(base.get("games_played"), errors="coerce").replace(0, pd.NA)
    base["solo_tackles_per_game"] = pd.to_numeric(base.get("tackles_solo"), errors="coerce") / games
    base["solo_tackles_projection"] = base.apply(
        lambda r: _weighted_projection(r.get("solo_tackles_per_game"), r.get("last_5_tackles_solo"), r.get("last_3_tackles_solo")), axis=1
    )
    return _rank(base, "solo_tackles_projection", "Tackles")
