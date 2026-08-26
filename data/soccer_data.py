"""Live soccer schedule and player-stat foundation for Sach Sports Dashboard.

ESPN provides fixtures/results, completed-match player stats, and player headshots.
No placeholder players or fake photos are created.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pandas as pd
import requests
import streamlit as st

ESPN_BASE = "https://site.api.espn.com/apis/site/v2/sports/soccer"

SOCCER_LEAGUES = {
    "Premier League": "eng.1",
    "MLS": "usa.1",
    "Champions League": "uefa.champions",
    "La Liga": "esp.1",
    "Serie A": "ita.1",
    "Bundesliga": "ger.1",
    "Ligue 1": "fra.1",
}


def _date_token(day: datetime) -> str:
    return day.strftime("%Y%m%d")


@st.cache_data(ttl=300, show_spinner=False)
def load_soccer_scoreboard(
    league_slug: str,
    days_back: int = 2,
    days_forward: int = 7,
) -> pd.DataFrame:
    now = datetime.now(timezone.utc)
    start = now - timedelta(days=days_back)
    end = now + timedelta(days=days_forward)

    response = requests.get(
        f"{ESPN_BASE}/{league_slug}/scoreboard",
        params={
            "dates": f"{_date_token(start)}-{_date_token(end)}",
            "limit": 200,
        },
        timeout=25,
    )
    response.raise_for_status()

    rows = []
    for event in response.json().get("events", []):
        competitions = event.get("competitions") or []
        if not competitions:
            continue

        competition = competitions[0]
        competitors = competition.get("competitors") or []
        home = next(
            (c for c in competitors if c.get("homeAway") == "home"),
            {},
        )
        away = next(
            (c for c in competitors if c.get("homeAway") == "away"),
            {},
        )
        status = (event.get("status") or {}).get("type") or {}

        rows.append({
            "game_id": str(event.get("id") or ""),
            "kickoff": pd.to_datetime(
                event.get("date"),
                errors="coerce",
                utc=True,
            ),
            "away_team": (away.get("team") or {}).get(
                "displayName",
                "Away",
            ),
            "home_team": (home.get("team") or {}).get(
                "displayName",
                "Home",
            ),
            "away_team_id": str(
                (away.get("team") or {}).get("id") or ""
            ),
            "home_team_id": str(
                (home.get("team") or {}).get("id") or ""
            ),
            "away_score": away.get("score"),
            "home_score": home.get("score"),
            "status": (
                status.get("shortDetail")
                or status.get("description")
                or "Scheduled"
            ),
            "completed": bool(status.get("completed")),
        })

    return pd.DataFrame(rows)


@st.cache_data(ttl=1800, show_spinner=False)
def load_match_summary(league_slug: str, game_id: str) -> dict:
    response = requests.get(
        f"{ESPN_BASE}/{league_slug}/summary",
        params={"event": game_id},
        timeout=25,
    )
    response.raise_for_status()
    return response.json()


def _number(value):
    if value is None or value == "":
        return 0.0

    text = str(value).strip().replace("%", "")
    if ":" in text:
        text = text.split(":", 1)[0]

    try:
        return float(text)
    except Exception:
        return 0.0


def _canonical_stat(label: str) -> str | None:
    key = (
        str(label or "")
        .strip()
        .lower()
        .replace(" ", "")
        .replace("_", "")
    )
    aliases = {
        "min": "minutes",
        "minutes": "minutes",
        "sh": "shots",
        "shots": "shots",
        "totalshots": "shots",
        "sog": "shots_on_target",
        "st": "shots_on_target",
        "shotsontarget": "shots_on_target",
        "g": "goals",
        "gl": "goals",
        "goals": "goals",
        "a": "assists",
        "ast": "assists",
        "assists": "assists",
        "sv": "saves",
        "saves": "saves",
    }
    return aliases.get(key)


def _athlete_name(athlete: dict) -> str:
    return str(
        athlete.get("displayName")
        or athlete.get("shortName")
        or athlete.get("fullName")
        or "Unknown"
    )


def _athlete_headshot(athlete: dict) -> str:
    headshot = athlete.get("headshot") or {}
    if isinstance(headshot, dict):
        return str(headshot.get("href") or "")
    return ""


def _parse_player_groups(
    summary: dict,
    game_id: str,
) -> list[dict]:
    rows: list[dict] = []

    for team_block in (
        summary.get("boxscore", {}).get("players", []) or []
    ):
        team = team_block.get("team") or {}
        team_name = (
            team.get("displayName")
            or team.get("shortDisplayName")
            or ""
        )
        team_id = str(team.get("id") or "")

        for group in team_block.get("statistics", []) or []:
            labels = group.get("labels") or group.get("names") or []

            for athlete_row in group.get("athletes", []) or []:
                athlete = athlete_row.get("athlete") or {}
                values = athlete_row.get("stats") or []

                parsed = {
                    "minutes": 0.0,
                    "shots": 0.0,
                    "shots_on_target": 0.0,
                    "goals": 0.0,
                    "assists": 0.0,
                    "saves": 0.0,
                }
                found = False

                for label, value in zip(labels, values):
                    canonical = _canonical_stat(label)
                    if canonical:
                        parsed[canonical] = _number(value)
                        found = True

                if not found:
                    continue

                rows.append({
                    "game_id": game_id,
                    "player_id": str(athlete.get("id") or ""),
                    "player_name": _athlete_name(athlete),
                    "photo_url": _athlete_headshot(athlete),
                    "team_id": team_id,
                    "team": team_name,
                    "position": str(
                        (athlete.get("position") or {}).get(
                            "abbreviation"
                        )
                        or ""
                    ),
                    "starter": bool(athlete_row.get("starter")),
                    **parsed,
                })

    return rows


@st.cache_data(ttl=1800, show_spinner=False)
def load_recent_player_stats(
    league_slug: str,
    completed_game_ids: tuple[str, ...],
) -> pd.DataFrame:
    rows: list[dict] = []

    # Recent sample only; protects both page speed and upstream APIs.
    for game_id in completed_game_ids[-20:]:
        try:
            rows.extend(
                _parse_player_groups(
                    load_match_summary(league_slug, game_id),
                    game_id,
                )
            )
        except Exception:
            continue

    return pd.DataFrame(rows)


def recent_stats_for_scoreboard(
    league_slug: str,
    scoreboard: pd.DataFrame,
) -> pd.DataFrame:
    if scoreboard.empty or "completed" not in scoreboard:
        return pd.DataFrame()

    completed = scoreboard[
        scoreboard["completed"]
    ].sort_values("kickoff")

    ids = tuple(
        completed["game_id"]
        .dropna()
        .astype(str)
        .tolist()
    )
    return load_recent_player_stats(league_slug, ids)
