"""NFL schedule data helpers for Sach Sports Dashboard."""

from io import StringIO

import pandas as pd
import requests
import streamlit as st


NFLVERSE_SCHEDULE_URL = (
    "https://raw.githubusercontent.com/nflverse/nfldata/master/data/games.csv"
)

ESPN_SCOREBOARD_URL = (
    "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard"
)


def _status_from_espn(status_type: dict) -> str:
    """Normalize ESPN event status."""
    if not status_type:
        return "Scheduled"

    if status_type.get("completed"):
        return "Final"

    state = str(status_type.get("state", "")).lower()

    if state == "in":
        return "Live"

    return "Scheduled"


@st.cache_data(ttl=300, show_spinner=False)
def load_nfl_preseason_schedule(season: int = 2026) -> pd.DataFrame:
    """Load the NFL preseason schedule from ESPN."""

    response = requests.get(
        ESPN_SCOREBOARD_URL,
        params={
            "dates": str(season),
            "seasontype": 1,
            "limit": 1000,
        },
        timeout=20,
    )
    response.raise_for_status()

    payload = response.json()
    rows = []

    for event in payload.get("events", []):
        competitions = event.get("competitions") or []
        if not competitions:
            continue

        competition = competitions[0]
        competitors = competition.get("competitors") or []

        home = next(
            (
                item
                for item in competitors
                if item.get("homeAway") == "home"
            ),
            {},
        )
        away = next(
            (
                item
                for item in competitors
                if item.get("homeAway") == "away"
            ),
            {},
        )

        home_team = home.get("team", {})
        away_team = away.get("team", {})

        kickoff = pd.to_datetime(
            event.get("date"),
            utc=True,
            errors="coerce",
        )

        if pd.notna(kickoff):
            kickoff = kickoff.tz_convert("America/New_York")

        week_number = (
            (event.get("week") or {}).get("number")
            or (payload.get("week") or {}).get("number")
        )

        venue = competition.get("venue") or {}

        rows.append(
            {
                "game_id": str(event.get("id", "")),
                "season": season,
                "week": week_number,
                "game_type": "PRE",
                "gameday": (
                    kickoff.tz_localize(None).normalize()
                    if pd.notna(kickoff)
                    else pd.NaT
                ),
                "weekday": (
                    kickoff.strftime("%A")
                    if pd.notna(kickoff)
                    else None
                ),
                "gametime": (
                    kickoff.strftime("%H:%M")
                    if pd.notna(kickoff)
                    else None
                ),
                "kickoff_et": (
                    kickoff.tz_localize(None)
                    if pd.notna(kickoff)
                    else pd.NaT
                ),
                "away_team": (
                    away_team.get("abbreviation")
                    or away_team.get("shortDisplayName")
                ),
                "home_team": (
                    home_team.get("abbreviation")
                    or home_team.get("shortDisplayName")
                ),
                "away_score": pd.to_numeric(
                    away.get("score"),
                    errors="coerce",
                ),
                "home_score": pd.to_numeric(
                    home.get("score"),
                    errors="coerce",
                ),
                "status": _status_from_espn(
                    (event.get("status") or {}).get("type") or {}
                ),
                "roof": None,
                "stadium": venue.get("fullName"),
            }
        )

    schedule = pd.DataFrame(rows)

    if schedule.empty:
        return schedule

    schedule["week"] = pd.to_numeric(
        schedule["week"],
        errors="coerce",
    )

    return (
        schedule
        .sort_values(["week", "kickoff_et", "game_id"])
        .reset_index(drop=True)
    )


@st.cache_data(ttl=300, show_spinner=False)
def load_nfl_regular_schedule(season: int = 2026) -> pd.DataFrame:
    """Load and normalize the NFL regular-season schedule from nflverse."""

    response = requests.get(
        NFLVERSE_SCHEDULE_URL,
        timeout=20,
    )
    response.raise_for_status()

    schedule = pd.read_csv(
        StringIO(response.text),
        low_memory=False,
    )

    schedule = schedule[
        (schedule["season"] == season)
        & (schedule["game_type"] == "REG")
    ].copy()

    schedule["gameday"] = pd.to_datetime(
        schedule["gameday"],
        errors="coerce",
    )

    schedule["kickoff_et"] = pd.to_datetime(
        schedule["gameday"].dt.strftime("%Y-%m-%d")
        + " "
        + schedule["gametime"].fillna("00:00"),
        errors="coerce",
    )

    schedule["status"] = schedule.apply(
        lambda row: (
            "Final"
            if pd.notna(row.get("home_score"))
            and pd.notna(row.get("away_score"))
            else "Scheduled"
        ),
        axis=1,
    )

    columns = [
        "game_id",
        "season",
        "week",
        "game_type",
        "gameday",
        "weekday",
        "gametime",
        "kickoff_et",
        "away_team",
        "home_team",
        "away_score",
        "home_score",
        "status",
        "roof",
        "stadium",
    ]

    return (
        schedule[columns]
        .sort_values(["week", "kickoff_et", "game_id"])
        .reset_index(drop=True)
    )


def load_nfl_schedule(
    season: int = 2026,
    game_type: str = "REG",
) -> pd.DataFrame:
    """Return preseason or regular-season NFL schedule data."""

    if game_type == "PRE":
        return load_nfl_preseason_schedule(season)

    return load_nfl_regular_schedule(season)
