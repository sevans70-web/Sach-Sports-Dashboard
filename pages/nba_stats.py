"""NBA player statistics helpers for Sach Sports Dashboard.

Stage 2 uses the previous completed regular season as a real-data baseline.
No placeholder or invented player rows are produced if the upstream source is unavailable.
"""

from __future__ import annotations

from typing import Any

import pandas as pd
import requests
import streamlit as st

NBA_PLAYER_STATS_URL = "https://stats.nba.com/stats/leaguedashplayerstats"
NBA_BASELINE_SEASON = "2025-26"

NBA_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    "Origin": "https://www.nba.com",
    "Referer": "https://www.nba.com/",
    "Connection": "keep-alive",
}

BASE_COLUMNS = [
    "player_id",
    "player_name",
    "team",
    "age",
    "games_played",
    "minutes_per_game",
    "points_per_game",
    "rebounds_per_game",
    "assists_per_game",
    "threes_per_game",
    "steals_per_game",
    "blocks_per_game",
]


def _empty_stats() -> pd.DataFrame:
    return pd.DataFrame(columns=BASE_COLUMNS)


def _nba_params(season: str) -> dict[str, Any]:
    return {
        "College": "",
        "Conference": "",
        "Country": "",
        "DateFrom": "",
        "DateTo": "",
        "Division": "",
        "DraftPick": "",
        "DraftYear": "",
        "GameScope": "",
        "GameSegment": "",
        "Height": "",
        "LastNGames": 0,
        "LeagueID": "00",
        "Location": "",
        "MeasureType": "Base",
        "Month": 0,
        "OpponentTeamID": 0,
        "Outcome": "",
        "PORound": 0,
        "PaceAdjust": "N",
        "PerMode": "PerGame",
        "Period": 0,
        "PlayerExperience": "",
        "PlayerPosition": "",
        "PlusMinus": "N",
        "Rank": "N",
        "Season": season,
        "SeasonSegment": "",
        "SeasonType": "Regular Season",
        "ShotClockRange": "",
        "StarterBench": "",
        "TeamID": 0,
        "VsConference": "",
        "VsDivision": "",
        "Weight": "",
    }


def _normalize_result(payload: dict[str, Any]) -> pd.DataFrame:
    result_sets = payload.get("resultSets") or []
    if not result_sets:
        return _empty_stats()

    result = result_sets[0]
    headers = result.get("headers") or []
    rows = result.get("rowSet") or []
    if not headers or not rows:
        return _empty_stats()

    raw = pd.DataFrame(rows, columns=headers)
    rename = {
        "PLAYER_ID": "player_id",
        "PLAYER_NAME": "player_name",
        "TEAM_ABBREVIATION": "team",
        "AGE": "age",
        "GP": "games_played",
        "MIN": "minutes_per_game",
        "PTS": "points_per_game",
        "REB": "rebounds_per_game",
        "AST": "assists_per_game",
        "FG3M": "threes_per_game",
        "STL": "steals_per_game",
        "BLK": "blocks_per_game",
    }
    raw = raw.rename(columns=rename)

    for column in BASE_COLUMNS:
        if column not in raw.columns:
            raw[column] = pd.NA

    out = raw[BASE_COLUMNS].copy()
    numeric = [
        "player_id",
        "age",
        "games_played",
        "minutes_per_game",
        "points_per_game",
        "rebounds_per_game",
        "assists_per_game",
        "threes_per_game",
        "steals_per_game",
        "blocks_per_game",
    ]
    for column in numeric:
        out[column] = pd.to_numeric(out[column], errors="coerce")

    out["player_name"] = out["player_name"].astype("string")
    out["team"] = out["team"].astype("string")
    out = out.dropna(subset=["player_id", "player_name"]).copy()
    out["player_id"] = out["player_id"].astype(int)
    return out.reset_index(drop=True)


@st.cache_data(ttl=21600, show_spinner=False)
def load_nba_player_baseline(season: str = NBA_BASELINE_SEASON) -> pd.DataFrame:
    """Load real NBA regular-season per-game player statistics.

    Raises the upstream exception when data cannot be reached so the UI can clearly
    report that live baseline data is unavailable rather than substituting fake rows.
    """
    response = requests.get(
        NBA_PLAYER_STATS_URL,
        params=_nba_params(season),
        headers=NBA_HEADERS,
        timeout=25,
    )
    response.raise_for_status()
    return _normalize_result(response.json())


def nba_headshot_url(player_id: int | str) -> str:
    """Return the NBA CDN headshot URL for a real NBA player id."""
    return f"https://cdn.nba.com/headshots/nba/latest/260x190/{int(player_id)}.png"
