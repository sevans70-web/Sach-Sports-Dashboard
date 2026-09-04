"""NFL player statistics helpers."""
from io import BytesIO
import pandas as pd
import requests
import streamlit as st

PLAYER_STATS_URL = "https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_{season}.parquet"

@st.cache_data(ttl=21600, show_spinner=False)
def load_nfl_weekly_player_stats(season=2025):
    r=requests.get(PLAYER_STATS_URL.format(season=season),timeout=30)
    r.raise_for_status()
    df=pd.read_parquet(BytesIO(r.content))
    if "passing_interceptions" in df.columns and "interceptions" not in df.columns:
        df["interceptions"]=df["passing_interceptions"]
    if "team" in df.columns and "recent_team" not in df.columns:
        df["recent_team"]=df["team"]
    # nflverse defensive-stat field names have changed across releases; normalize
    # the common aliases without inventing values when a field is unavailable.
    alias_map = {
        "def_sacks": "sacks",
        "tackles_with_assists": "tackles_assists",
        "tackles_with_assist": "tackles_assists",
        "tackle_with_assist": "tackles_assists",
        "def_tackles_solo": "tackles_solo",
    }
    for source, target in alias_map.items():
        if source in df.columns and target not in df.columns:
            df[target] = df[source]
    if "tackles_total" not in df.columns and ("tackles_solo" in df.columns or "tackles_assists" in df.columns):
        solo = pd.to_numeric(df["tackles_solo"], errors="coerce").fillna(0) if "tackles_solo" in df.columns else pd.Series(0, index=df.index, dtype=float)
        assists = pd.to_numeric(df["tackles_assists"], errors="coerce").fillna(0) if "tackles_assists" in df.columns else pd.Series(0, index=df.index, dtype=float)
        df["tackles_total"] = solo + assists
    cols=["player_id","player_display_name","position","recent_team","opponent_team","season","week","season_type","completions","attempts","passing_yards","passing_tds","interceptions","carries","rushing_yards","rushing_tds","targets","receptions","receiving_yards","receiving_tds","sacks","tackles_solo","tackles_assists","tackles_total"]
    df=df[[c for c in cols if c in df.columns]].copy()
    if "season_type" in df.columns:
        df=df[df["season_type"].astype(str).str.upper()=="REG"].copy()
    nums=["week","completions","attempts","passing_yards","passing_tds","interceptions","carries","rushing_yards","rushing_tds","targets","receptions","receiving_yards","receiving_tds","sacks","tackles_solo","tackles_assists","tackles_total"]
    for c in nums:
        if c in df.columns:
            df[c]=pd.to_numeric(df[c],errors="coerce").fillna(0)
    return df.reset_index(drop=True)

@st.cache_data(ttl=21600, show_spinner=False)
def load_nfl_season_baseline(season=2025):
    weekly=load_nfl_weekly_player_stats(season).copy()
    if weekly.empty:
        return weekly

    ids=[c for c in ["player_id","player_display_name","position"] if c in weekly.columns]
    stats=[c for c in ["completions","attempts","passing_yards","passing_tds","interceptions","carries","rushing_yards","rushing_tds","targets","receptions","receiving_yards","receiving_tds","sacks","tackles_solo","tackles_assists","tackles_total"] if c in weekly.columns]

    latest_team=(weekly.sort_values(["player_id","week"])
                 .groupby("player_id",as_index=False).tail(1)[["player_id","recent_team"]])

    base=weekly.groupby(ids,dropna=False,as_index=False)[stats].sum()
    games=weekly.groupby(ids,dropna=False)["week"].nunique().reset_index(name="games_played")
    base=base.merge(games,on=ids,how="left",validate="one_to_one")
    base=base.merge(latest_team,on="player_id",how="left")
    base=base.drop_duplicates(subset=["player_id"],keep="last")

    base["passing_yards_per_game"]=base["passing_yards"]/base["games_played"].replace(0,pd.NA)
    base["rushing_yards_per_game"]=base["rushing_yards"]/base["games_played"].replace(0,pd.NA)
    base["receiving_yards_per_game"]=base["receiving_yards"]/base["games_played"].replace(0,pd.NA)
    base["receptions_per_game"]=base["receptions"]/base["games_played"].replace(0,pd.NA)
    base["targets_per_game"]=base["targets"]/base["games_played"].replace(0,pd.NA)
    return base.reset_index(drop=True)
