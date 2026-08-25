"""WNBA schedule and scoreboard data helpers for Sach Sports Dashboard."""

from __future__ import annotations

from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

import pandas as pd
import requests
import streamlit as st

ESPN_WNBA_SCOREBOARD = "https://site.api.espn.com/apis/site/v2/sports/basketball/wnba/scoreboard"
TORONTO_TZ = ZoneInfo("America/Toronto")


def _date_key(value: date | datetime | pd.Timestamp) -> str:
    if isinstance(value, pd.Timestamp):
        value = value.to_pydatetime()
    if isinstance(value, datetime):
        value = value.date()
    return value.strftime("%Y%m%d")


@st.cache_data(ttl=300, show_spinner=False)
def load_wnba_scoreboard(start_date: str, end_date: str) -> pd.DataFrame:
    """Load WNBA games for an inclusive YYYY-MM-DD date range from ESPN."""
    start = datetime.strptime(start_date, "%Y-%m-%d").date()
    end = datetime.strptime(end_date, "%Y-%m-%d").date()
    date_range = f"{_date_key(start)}-{_date_key(end)}" if start != end else _date_key(start)

    response = requests.get(
        ESPN_WNBA_SCOREBOARD,
        params={"dates": date_range, "limit": 200},
        timeout=20,
    )
    response.raise_for_status()

    rows: list[dict] = []
    for event in response.json().get("events", []):
        competitions = event.get("competitions") or []
        if not competitions:
            continue
        competition = competitions[0]
        competitors = competition.get("competitors") or []
        home = next((c for c in competitors if c.get("homeAway") == "home"), {})
        away = next((c for c in competitors if c.get("homeAway") == "away"), {})
        status = (event.get("status") or {}).get("type") or {}

        event_time = pd.to_datetime(event.get("date"), errors="coerce", utc=True)
        if pd.notna(event_time):
            event_time = event_time.tz_convert(TORONTO_TZ)

        rows.append(
            {
                "game_id": event.get("id"),
                "tipoff_et": event_time,
                "away_team": (away.get("team") or {}).get("displayName", "Away"),
                "away_abbr": (away.get("team") or {}).get("abbreviation", ""),
                "away_logo": (away.get("team") or {}).get("logo"),
                "away_score": pd.to_numeric(away.get("score"), errors="coerce"),
                "home_team": (home.get("team") or {}).get("displayName", "Home"),
                "home_abbr": (home.get("team") or {}).get("abbreviation", ""),
                "home_logo": (home.get("team") or {}).get("logo"),
                "home_score": pd.to_numeric(home.get("score"), errors="coerce"),
                "status": status.get("shortDetail") or status.get("description") or "Scheduled",
                "state": status.get("state") or "pre",
                "completed": bool(status.get("completed")),
                "season_type": (event.get("season") or {}).get("type"),
            }
        )

    if not rows:
        return pd.DataFrame(
            columns=[
                "game_id", "tipoff_et", "away_team", "away_abbr", "away_logo",
                "away_score", "home_team", "home_abbr", "home_logo", "home_score",
                "status", "state", "completed", "season_type",
            ]
        )

    return pd.DataFrame(rows).sort_values("tipoff_et", na_position="last").reset_index(drop=True)


def current_wnba_window(days_back: int = 1, days_forward: int = 14) -> pd.DataFrame:
    """Return a practical current/upcoming WNBA window in Toronto local time."""
    today = datetime.now(TORONTO_TZ).date()
    return load_wnba_scoreboard(
        (today - timedelta(days=days_back)).isoformat(),
        (today + timedelta(days=days_forward)).isoformat(),
    )
