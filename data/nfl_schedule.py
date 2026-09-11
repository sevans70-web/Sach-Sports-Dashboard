"""NFL schedule data helpers for Sach Sports Dashboard."""

from datetime import datetime, timedelta
from html import unescape
import re
from io import StringIO

import pandas as pd
import requests
import streamlit as st
from zoneinfo import ZoneInfo


NFLVERSE_SCHEDULE_URL = (
    "https://raw.githubusercontent.com/nflverse/nfldata/master/data/games.csv"
)
ESPN_NFL_SCOREBOARD_URL = (
    "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard"
)
EASTERN_TIMEZONE = ZoneInfo("America/New_York")
ESPN_TEAM_ALIASES = {"LAR": "LA"}

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


@st.cache_data(ttl=3600, show_spinner=False)
def _load_nfl_regular_schedule_base(season: int = 2026) -> pd.DataFrame:
    """Load the slower-changing regular-season schedule from nflverse."""

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


def _espn_team(value: object) -> str:
    team = str(value or "").upper().strip()
    return ESPN_TEAM_ALIASES.get(team, team)


def _score_value(value: object):
    try:
        number = float(value)
        return int(number) if number.is_integer() else number
    except (TypeError, ValueError):
        return pd.NA


def _live_detail(status_type: dict) -> str:
    detail = str(
        status_type.get("shortDetail")
        or status_type.get("detail")
        or "In progress"
    ).strip()
    detail = re.sub(r"\s*-\s*(\d+)(?:st|nd|rd|th)\s*$", r" · Q\1", detail)
    return f"LIVE · {detail}" if detail else "LIVE"


@st.cache_data(ttl=30, show_spinner=False)
def _load_espn_scoreboard_window(anchor_date: str) -> list[dict]:
    """Load the current NFL game window with scores and game states."""
    anchor = datetime.strptime(anchor_date, "%Y-%m-%d").date()
    start = anchor - timedelta(days=2)
    end = anchor + timedelta(days=4)
    response = requests.get(
        ESPN_NFL_SCOREBOARD_URL,
        params={"dates": f"{start:%Y%m%d}-{end:%Y%m%d}", "limit": 100},
        timeout=12,
    )
    response.raise_for_status()

    rows = []
    for event in response.json().get("events", []):
        competitions = event.get("competitions") or []
        if not competitions:
            continue
        competition = competitions[0]
        by_side = {
            str(item.get("homeAway")): item
            for item in competition.get("competitors") or []
        }
        away_item, home_item = by_side.get("away"), by_side.get("home")
        if not away_item or not home_item:
            continue

        status_type = (event.get("status") or {}).get("type") or {}
        state = str(status_type.get("state") or "pre").lower()
        status_group = "live" if state == "in" else "final" if state == "post" else "scheduled"
        if status_group == "live":
            status_detail = _live_detail(status_type)
        elif status_group == "final":
            status_detail = str(status_type.get("shortDetail") or "Final")
        else:
            status_detail = "Scheduled"

        rows.append(
            {
                "espn_event_id": str(event.get("id") or ""),
                "away_team": _espn_team((away_item.get("team") or {}).get("abbreviation")),
                "home_team": _espn_team((home_item.get("team") or {}).get("abbreviation")),
                "away_score": _score_value(away_item.get("score")),
                "home_score": _score_value(home_item.get("score")),
                "status_group": status_group,
                "status_detail": status_detail,
            }
        )
    return rows


def _overlay_live_states(schedule: pd.DataFrame) -> pd.DataFrame:
    result = schedule.copy()
    result["status_group"] = result["status"].map(
        {"Final": "final", "Scheduled": "scheduled"}
    ).fillna("scheduled")
    result["status_detail"] = result["status"]
    result["espn_event_id"] = ""

    now = datetime.now(EASTERN_TIMEZONE).replace(tzinfo=None)
    try:
        live_rows = _load_espn_scoreboard_window(now.strftime("%Y-%m-%d"))
    except Exception:
        live_rows = []

    live_map = {
        (row["away_team"], row["home_team"]): row
        for row in live_rows
        if row.get("away_team") and row.get("home_team")
    }
    for index, game in result.iterrows():
        key = (_espn_team(game.get("away_team")), _espn_team(game.get("home_team")))
        live = live_map.get(key)
        if live:
            for column in [
                "espn_event_id", "away_score", "home_score",
                "status_group", "status_detail",
            ]:
                result.at[index, column] = live.get(column)
            result.at[index, "status"] = (
                "Live" if live["status_group"] == "live"
                else "Final" if live["status_group"] == "final"
                else "Scheduled"
            )
            continue

        kickoff = pd.to_datetime(game.get("kickoff_et"), errors="coerce")
        if (
            result.at[index, "status_group"] == "scheduled"
            and pd.notna(kickoff)
            and kickoff <= now <= kickoff + pd.Timedelta(hours=5)
        ):
            result.at[index, "status"] = "Live"
            result.at[index, "status_group"] = "live"
            result.at[index, "status_detail"] = "LIVE · Updating"

    result["game_live"] = result["status_group"].eq("live")
    result["game_final"] = result["status_group"].eq("final")
    return result


@st.cache_data(ttl=30, show_spinner=False)
def load_nfl_regular_schedule(season: int = 2026) -> pd.DataFrame:
    """Return the regular schedule with current live/final game states."""
    return _overlay_live_states(_load_nfl_regular_schedule_base(season))


def load_nfl_schedule(
    season: int = 2026,
    game_type: str = "REG",
) -> pd.DataFrame:
    """Return official preseason or nflverse regular-season schedule data."""

    if game_type == "PRE":
        return load_nfl_preseason_schedule(season)

    return load_nfl_regular_schedule(season)


def clear_nfl_schedule_cache() -> None:
    """Clear both the static schedule and fast live-score caches."""
    _load_nfl_regular_schedule_base.clear()
    _load_espn_scoreboard_window.clear()
    load_nfl_regular_schedule.clear()
    load_nfl_preseason_schedule.clear()
