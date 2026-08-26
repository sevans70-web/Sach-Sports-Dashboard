"""Live NHL schedule and prior-season player baseline data.

Sources are NHL-operated public JSON endpoints. No placeholder players or games are
created when upstream data is unavailable.
"""
from __future__ import annotations

from datetime import date, timedelta
from typing import Any

import pandas as pd
import requests
import streamlit as st
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

NHL_BASELINE_SEASON_ID = 20252026
NHL_BASELINE_SEASON = "2025–26"
NHL_CURRENT_SEASON = "2026–27"
NHL_STATS_BASE = "https://api.nhle.com/stats/rest/en"
NHL_WEB_BASE = "https://api-web.nhle.com/v1"


def _session() -> requests.Session:
    session = requests.Session()
    retry = Retry(total=2, connect=2, read=2, backoff_factor=.35,
                  status_forcelist=(429, 500, 502, 503, 504),
                  allowed_methods=frozenset(["GET"]), raise_on_status=False)
    session.mount("https://", HTTPAdapter(max_retries=retry))
    session.headers.update({"User-Agent": "Sach-Sports-Dashboard/1.0", "Accept": "application/json"})
    return session


def nhl_headshot_url(player_id: int, team: str) -> str:
    return f"https://assets.nhle.com/mugs/nhl/{NHL_BASELINE_SEASON_ID}/{str(team).upper()}/{int(player_id)}.png"


def _stats(endpoint: str, sort_field: str) -> pd.DataFrame:
    params = {
        "isAggregate": "false",
        "isGame": "false",
        "start": 0,
        "limit": 1000,
        "sort": f'[{ {"property": sort_field, "direction": "DESC"} }]'.replace("'", '"'),
        "cayenneExp": f"seasonId={NHL_BASELINE_SEASON_ID} and gameTypeId=2",
    }
    response = _session().get(f"{NHL_STATS_BASE}/{endpoint}", params=params, timeout=20)
    response.raise_for_status()
    return pd.DataFrame(response.json().get("data") or [])


@st.cache_data(ttl=21600, show_spinner=False)
def load_skater_baseline() -> pd.DataFrame:
    raw = _stats("skater/summary", "points")
    if raw.empty:
        return pd.DataFrame()
    rename = {
        "playerId": "player_id", "skaterFullName": "player_name", "teamAbbrevs": "team",
        "gamesPlayed": "games_played", "goals": "goals", "assists": "assists",
        "points": "points", "shots": "shots", "timeOnIcePerGame": "toi_per_game",
        "shootingPct": "shooting_pct", "powerPlayPoints": "power_play_points",
    }
    out = raw.rename(columns=rename).copy()
    for col in ["games_played", "goals", "assists", "points", "shots", "toi_per_game", "shooting_pct", "power_play_points"]:
        if col not in out.columns:
            out[col] = pd.NA
        out[col] = pd.to_numeric(out[col], errors="coerce")
    gp = out["games_played"].replace(0, pd.NA)
    out["goals_per_game"] = out["goals"] / gp
    out["assists_per_game"] = out["assists"] / gp
    out["points_per_game"] = out["points"] / gp
    out["shots_per_game"] = out["shots"] / gp
    return out


@st.cache_data(ttl=21600, show_spinner=False)
def load_goalie_baseline() -> pd.DataFrame:
    raw = _stats("goalie/summary", "wins")
    if raw.empty:
        return pd.DataFrame()
    rename = {
        "playerId": "player_id", "goalieFullName": "player_name", "teamAbbrevs": "team",
        "gamesPlayed": "games_played", "gamesStarted": "games_started", "wins": "wins",
        "losses": "losses", "saves": "saves", "shotsAgainst": "shots_against",
        "savePct": "save_pct", "goalsAgainstAverage": "gaa", "shutouts": "shutouts",
    }
    out = raw.rename(columns=rename).copy()
    for col in ["games_played", "games_started", "wins", "losses", "saves", "shots_against", "save_pct", "gaa", "shutouts"]:
        if col not in out.columns:
            out[col] = pd.NA
        out[col] = pd.to_numeric(out[col], errors="coerce")
    starts = out["games_started"].where(out["games_started"] > 0, out["games_played"]).replace(0, pd.NA)
    out["saves_per_start"] = out["saves"] / starts
    out["shots_against_per_start"] = out["shots_against"] / starts
    return out


def _name(value: Any) -> str:
    if isinstance(value, dict):
        return str(value.get("default") or value.get("fr") or "")
    return str(value or "")


@st.cache_data(ttl=900, show_spinner=False)
def load_nhl_scoreboard(start_date: str, end_date: str) -> pd.DataFrame:
    start = date.fromisoformat(start_date)
    end = date.fromisoformat(end_date)
    rows: list[dict[str, Any]] = []
    current = start
    while current <= end:
        response = _session().get(f"{NHL_WEB_BASE}/score/{current.isoformat()}", timeout=15)
        response.raise_for_status()
        for game in response.json().get("games") or []:
            away = game.get("awayTeam") or {}
            home = game.get("homeTeam") or {}
            rows.append({
                "game_id": game.get("id"), "game_date": game.get("gameDate") or current.isoformat(),
                "start_time_utc": game.get("startTimeUTC"), "state": str(game.get("gameState") or "").upper(),
                "away_team": _name(away.get("name")) or away.get("abbrev") or "Away",
                "away_abbr": away.get("abbrev") or "", "away_score": away.get("score"),
                "home_team": _name(home.get("name")) or home.get("abbrev") or "Home",
                "home_abbr": home.get("abbrev") or "", "home_score": home.get("score"),
                "period": (game.get("periodDescriptor") or {}).get("number"),
                "clock": (game.get("clock") or {}).get("timeRemaining"),
            })
        current += timedelta(days=1)
    if not rows:
        return pd.DataFrame()
    return pd.DataFrame(rows).drop_duplicates(subset=["game_id"]).reset_index(drop=True)
