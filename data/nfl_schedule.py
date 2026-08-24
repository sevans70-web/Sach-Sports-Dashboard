"""NFL schedule data helpers for Sach Sports Dashboard."""

from datetime import datetime
from html import unescape
import re
from io import StringIO

import pandas as pd
import requests
import streamlit as st


NFLVERSE_SCHEDULE_URL = (
    "https://raw.githubusercontent.com/nflverse/nfldata/master/data/games.csv"
)

NFL_PRESEASON_URLS = {
    0: "https://www.nfl.com/schedules/{season}/by-week/hall-of-fame",
    1: "https://www.nfl.com/schedules/{season}/by-week/preseason-week-1",
    2: "https://www.nfl.com/schedules/{season}/by-week/preseason-week-2",
    3: "https://www.nfl.com/schedules/{season}/by-week/preseason-week-3",
}

TEAM_ABBREVIATIONS = {
    "49ers": "SF",
    "Bears": "CHI",
    "Bengals": "CIN",
    "Bills": "BUF",
    "Broncos": "DEN",
    "Browns": "CLE",
    "Buccaneers": "TB",
    "Cardinals": "ARI",
    "Chargers": "LAC",
    "Chiefs": "KC",
    "Colts": "IND",
    "Commanders": "WAS",
    "Cowboys": "DAL",
    "Dolphins": "MIA",
    "Eagles": "PHI",
    "Falcons": "ATL",
    "Giants": "NYG",
    "Jaguars": "JAX",
    "Jets": "NYJ",
    "Lions": "DET",
    "Packers": "GB",
    "Panthers": "CAR",
    "Patriots": "NE",
    "Raiders": "LV",
    "Rams": "LAR",
    "Ravens": "BAL",
    "Saints": "NO",
    "Seahawks": "SEA",
    "Steelers": "PIT",
    "Texans": "HOU",
    "Titans": "TEN",
    "Vikings": "MIN",
}

MONTHS = (
    "January|February|March|April|May|June|"
    "July|August|September|October|November|December"
)

GAME_TEXT_RE = re.compile(
    rf"(?P<away>[A-Za-z0-9 ]+?)\s+at\s+"
    rf"(?P<home>[A-Za-z0-9 ]+?),\s+"
    rf"(?P<weekday>Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),\s+"
    rf"(?P<month>{MONTHS})\s+"
    rf"(?P<day>\d{{1,2}})(?:st|nd|rd|th),\s+"
    rf"(?P<time>\d{{1,2}}:\d{{2}}\s+[AP]M)",
    re.IGNORECASE,
)

# NFL.com changes completed-game text from "Away at Home" to a score line
# such as "Raiders 22, Texans 20, FINAL, Thursday, August 20th".
# Without this second pattern, completed preseason weeks disappear from the
# dashboard as soon as NFL.com marks every game in that week final.
FINAL_GAME_TEXT_RE = re.compile(
    rf"(?P<away>[A-Za-z0-9 ]+?)\s+(?P<away_score>\d+)\s*,\s*"
    rf"(?P<home>[A-Za-z0-9 ]+?)\s+(?P<home_score>\d+)\s*,\s*"
    rf"FINAL(?:\s*,\s*|\s+)"
    rf"(?P<weekday>Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),\s+"
    rf"(?P<month>{MONTHS})\s+"
    rf"(?P<day>\d{{1,2}})(?:st|nd|rd|th)",
    re.IGNORECASE,
)


def _strip_tags(value: str) -> str:
    value = re.sub(r"<[^>]+>", " ", value)
    value = unescape(value)
    return " ".join(value.split())


def _team_abbreviation(team_name: str) -> str:
    cleaned = " ".join(team_name.split()).title()
    return TEAM_ABBREVIATIONS.get(cleaned, cleaned.upper())


def _parse_official_nfl_page(
    html_text: str,
    season: int,
    week: int,
) -> list[dict]:
    """Parse scheduled and completed games from one official NFL page."""

    rows = []
    seen = set()

    # NFL.com renders useful game text inside links. Completed games and
    # scheduled games use different text formats, so support both.
    anchor_blocks = re.findall(
        r"<a\b[^>]*>(.*?)</a>",
        html_text,
        flags=re.IGNORECASE | re.DOTALL,
    )

    for block in anchor_blocks:
        text = _strip_tags(block)
        scheduled_match = GAME_TEXT_RE.search(text)
        final_match = FINAL_GAME_TEXT_RE.search(text)

        if scheduled_match:
            match = scheduled_match
            status = "Scheduled"
            away_score = pd.NA
            home_score = pd.NA
            time_text = match.group("time").upper()
        elif final_match:
            match = final_match
            status = "Final"
            away_score = int(match.group("away_score"))
            home_score = int(match.group("home_score"))
            # NFL.com's final score label does not include kickoff time.
            # Midnight preserves the correct game date/week without inventing
            # a kickoff time. Historical score display does not depend on it.
            time_text = "12:00 AM"
        else:
            continue

        away_name = " ".join(match.group("away").split())
        home_name = " ".join(match.group("home").split())

        if (
            away_name.title() not in TEAM_ABBREVIATIONS
            or home_name.title() not in TEAM_ABBREVIATIONS
        ):
            continue

        day = match.group("day")
        month = match.group("month").title()

        kickoff = pd.to_datetime(
            f"{month} {day} {season} {time_text}",
            format="%B %d %Y %I:%M %p",
            errors="coerce",
        )

        if pd.isna(kickoff):
            continue

        away_team = _team_abbreviation(away_name)
        home_team = _team_abbreviation(home_name)
        game_id = (
            f"{season}_PRE_{week}_"
            f"{away_team}_{home_team}_"
            f"{kickoff.strftime('%Y%m%d%H%M')}"
        )

        if game_id in seen:
            continue

        seen.add(game_id)

        rows.append(
            {
                "game_id": game_id,
                "season": season,
                "week": week,
                "game_type": "PRE",
                "gameday": kickoff.normalize(),
                "weekday": match.group("weekday").title(),
                "gametime": (
                    kickoff.strftime("%H:%M")
                    if status == "Scheduled"
                    else None
                ),
                "kickoff_et": kickoff,
                "away_team": away_team,
                "home_team": home_team,
                "away_score": away_score,
                "home_score": home_score,
                "status": status,
                "roof": None,
                "stadium": None,
            }
        )

    return rows


@st.cache_data(ttl=900, show_spinner=False)
def load_nfl_preseason_schedule(season: int = 2026) -> pd.DataFrame:
    """Load preseason dates and matchups from official NFL schedule pages."""

    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 Chrome/126 Safari/537.36"
        )
    }

    rows = []

    for week, url_template in NFL_PRESEASON_URLS.items():
        url = url_template.format(season=season)

        response = requests.get(
            url,
            headers=headers,
            timeout=20,
        )
        response.raise_for_status()

        rows.extend(
            _parse_official_nfl_page(
                response.text,
                season=season,
                week=week,
            )
        )

    schedule = pd.DataFrame(rows)

    if schedule.empty:
        return schedule

    return (
        schedule
        .sort_values(["week", "kickoff_et", "game_id"])
        .reset_index(drop=True)
    )


@st.cache_data(ttl=300, show_spinner=False)
def load_nfl_regular_schedule(season: int = 2026) -> pd.DataFrame:
    """Load regular-season schedule from nflverse."""

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
    """Return official preseason or nflverse regular-season schedule data."""

    if game_type == "PRE":
        return load_nfl_preseason_schedule(season)

    return load_nfl_regular_schedule(season)
