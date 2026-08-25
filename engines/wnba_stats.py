"""WNBA player statistics helpers for Sach Sports Dashboard.

WNBA uses the active 2026 regular season as its real-data baseline.
The baseline source is ESPN's league-wide player statistics endpoint from ESPN, matching the NBA data architecture and avoiding fabricated player rows.

No placeholder or invented player rows are produced if the upstream source is
unavailable.
"""

from __future__ import annotations

from typing import Any

import pandas as pd
import requests
import streamlit as st
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

ESPN_WNBA_STATS_URL = (
    "https://site.web.api.espn.com/apis/common/v3/sports/"
    "basketball/wnba/statistics/byathlete"
)
WNBA_BASELINE_SEASON = "2026"

ESPN_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
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

# ESPN exposes both season totals and per-game averages in the same payload.
# Average aliases are intentionally ordered and checked first. If ESPN changes a
# label or omits an average, the total is divided by games played as a safe fallback.
AVG_ALIASES = {
    "minutes_per_game": ("avgminutes", "minutespergame", "minpergame"),
    "points_per_game": ("avgpoints", "pointspergame", "ptspergame"),
    "rebounds_per_game": ("avgrebounds", "reboundspergame", "rebpergame"),
    "assists_per_game": ("avgassists", "assistspergame", "astpergame"),
    "threes_per_game": (
        "avgthreepointfieldgoalsmade",
        "threepointfieldgoalsmadepergame",
        "threepointersmadepergame",
        "fg3mpergame",
    ),
    "steals_per_game": ("avgsteals", "stealspergame", "stlpergame"),
    "blocks_per_game": ("avgblocks", "blockspergame", "blkpergame"),
}

TOTAL_ALIASES = {
    "minutes_per_game": ("minutes", "min"),
    "points_per_game": ("points", "pts"),
    "rebounds_per_game": ("rebounds", "rebs", "reb"),
    "assists_per_game": ("assists", "ast"),
    "threes_per_game": (
        "threepointfieldgoalsmade",
        "threepointersmade",
        "fg3m",
        "3pm",
    ),
    "steals_per_game": ("steals", "stl"),
    "blocks_per_game": ("blocks", "blk"),
}

GAME_ALIASES = ("gamesplayed", "games", "gp")


def _empty_stats() -> pd.DataFrame:
    return pd.DataFrame(columns=BASE_COLUMNS)


def _espn_season_year(season: str) -> int:
    text = str(season).strip().replace("–", "-")
    if "-" not in text:
        return int(text)

    start_text, end_text = text.split("-", 1)
    start_year = int(start_text)
    end_text = end_text.strip()

    if len(end_text) == 2:
        century = (start_year // 100) * 100
        end_year = century + int(end_text)
        if end_year < start_year:
            end_year += 100
        return end_year

    return int(end_text)


def _normalize_label(value: Any) -> str:
    return "".join(ch for ch in str(value or "").lower() if ch.isalnum())


def _to_number(value: Any) -> float | None:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)

    text = str(value).strip().replace(",", "")
    if not text or text in {"-", "--", "—", "N/A", "NA"}:
        return None

    try:
        return float(text)
    except (TypeError, ValueError):
        return None


def _session() -> requests.Session:
    session = requests.Session()
    retry = Retry(
        total=2,
        connect=2,
        read=2,
        backoff_factor=0.35,
        status_forcelist=(429, 500, 502, 503, 504),
        allowed_methods=frozenset(["GET"]),
        raise_on_status=False,
    )
    adapter = HTTPAdapter(max_retries=retry)
    session.mount("https://", adapter)
    session.mount("http://", adapter)
    session.headers.update(ESPN_HEADERS)
    return session


def _espn_params(season: str, page: int, limit: int = 500) -> dict[str, Any]:
    return {
        "region": "us",
        "lang": "en",
        "contentorigin": "espn",
        "isqualified": "false",
        "page": page,
        "limit": limit,
        "sort": "offensive.avgPoints:desc",
        "season": _espn_season_year(season),
        "seasontype": 2,
    }


def _category_labels(payload: dict[str, Any]) -> list[list[str]]:
    result: list[list[str]] = []
    for category in payload.get("categories") or []:
        if not isinstance(category, dict):
            result.append([])
            continue
        labels = category.get("labels") or category.get("names") or []
        result.append([str(label) for label in labels])
    return result


def _flatten_player_stats(
    player_entry: dict[str, Any],
    payload_category_labels: list[list[str]],
) -> dict[str, float]:
    flattened: dict[str, float] = {}

    for index, category in enumerate(player_entry.get("categories") or []):
        if not isinstance(category, dict):
            continue

        labels = category.get("labels") or category.get("names")
        if not labels and index < len(payload_category_labels):
            labels = payload_category_labels[index]
        labels = labels or []

        totals = category.get("totals") or category.get("values") or []
        if isinstance(totals, dict):
            for label, value in totals.items():
                number = _to_number(value)
                if number is not None:
                    flattened[_normalize_label(label)] = number
            continue

        for label, value in zip(labels, totals):
            number = _to_number(value)
            if number is not None:
                flattened[_normalize_label(label)] = number

    return flattened


def _first_stat(stats: dict[str, float], aliases: tuple[str, ...]) -> float | None:
    for alias in aliases:
        if alias in stats:
            return stats[alias]
    return None


def _games_played(stats: dict[str, float]) -> float | None:
    return _first_stat(stats, GAME_ALIASES)


def _per_game_stat(
    stats: dict[str, float],
    field: str,
    games_played: float | None,
) -> float | None:
    average = _first_stat(stats, AVG_ALIASES[field])
    if average is not None:
        return average

    total = _first_stat(stats, TOTAL_ALIASES[field])
    if total is None or games_played is None or games_played <= 0:
        return None

    return total / games_played


def _player_row(
    player_entry: dict[str, Any],
    payload_category_labels: list[list[str]],
) -> dict[str, Any] | None:
    athlete = player_entry.get("athlete") or {}
    if not isinstance(athlete, dict):
        return None

    player_id = athlete.get("id") or athlete.get("uid")
    player_name = athlete.get("displayName") or athlete.get("fullName")
    if not player_id or not player_name:
        return None

    try:
        normalized_player_id = int(str(player_id).split(":")[-1].split("~")[-1])
    except (TypeError, ValueError):
        return None

    team_data = athlete.get("team") or {}
    team = (
        athlete.get("teamShortName")
        or athlete.get("teamAbbreviation")
        or (team_data.get("abbreviation") if isinstance(team_data, dict) else None)
        or "—"
    )

    stats = _flatten_player_stats(player_entry, payload_category_labels)
    games_played = _games_played(stats)

    return {
        "player_id": normalized_player_id,
        "player_name": str(player_name),
        "team": str(team),
        "age": _to_number(athlete.get("age")),
        "games_played": games_played,
        "minutes_per_game": _per_game_stat(stats, "minutes_per_game", games_played),
        "points_per_game": _per_game_stat(stats, "points_per_game", games_played),
        "rebounds_per_game": _per_game_stat(stats, "rebounds_per_game", games_played),
        "assists_per_game": _per_game_stat(stats, "assists_per_game", games_played),
        "threes_per_game": _per_game_stat(stats, "threes_per_game", games_played),
        "steals_per_game": _per_game_stat(stats, "steals_per_game", games_played),
        "blocks_per_game": _per_game_stat(stats, "blocks_per_game", games_played),
    }


def _normalize_espn_payloads(payloads: list[dict[str, Any]]) -> pd.DataFrame:
    rows: list[dict[str, Any]] = []

    for payload in payloads:
        labels = _category_labels(payload)
        for player_entry in payload.get("athletes") or []:
            if not isinstance(player_entry, dict):
                continue
            row = _player_row(player_entry, labels)
            if row:
                rows.append(row)

    if not rows:
        return _empty_stats()

    out = pd.DataFrame(rows)

    for column in BASE_COLUMNS:
        if column not in out.columns:
            out[column] = pd.NA

    out = out[BASE_COLUMNS].copy()
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

    return out.drop_duplicates(subset=["player_id"], keep="first").reset_index(drop=True)


@st.cache_data(ttl=21600, show_spinner=False)
def load_wnba_player_baseline(season: str = WNBA_BASELINE_SEASON) -> pd.DataFrame:
    """Load real current-season WNBA player statistics from ESPN."""
    session = _session()
    payloads: list[dict[str, Any]] = []
    page = 1
    max_pages = 8

    while page <= max_pages:
        response = session.get(
            ESPN_WNBA_STATS_URL,
            params=_espn_params(season, page=page),
            timeout=(5, 12),
        )
        response.raise_for_status()
        payload = response.json()
        payloads.append(payload)

        pagination = payload.get("pagination") or {}
        pages = int(pagination.get("pages") or 1)
        if page >= pages:
            break
        page += 1

    stats = _normalize_espn_payloads(payloads)
    if stats.empty:
        raise RuntimeError(
            f"ESPN returned no WNBA player statistics for the {season} regular season."
        )

    required = [
        "games_played",
        "points_per_game",
        "rebounds_per_game",
        "assists_per_game",
    ]
    if all(stats[column].isna().all() for column in required):
        raise RuntimeError(
            "ESPN WNBA statistics were received, but the expected player-stat fields "
            "could not be parsed."
        )

    return stats


def wnba_headshot_url(player_id: int | str) -> str:
    """Return the ESPN CDN headshot URL for a real WNBA player id."""
    return f"https://a.espncdn.com/i/headshots/wnba/players/full/{int(player_id)}.png"
