"""MLB player recent-form profile data for dedicated player pages."""

from __future__ import annotations

from datetime import datetime
from typing import Any
from zoneinfo import ZoneInfo

import requests
import streamlit as st


TORONTO_TIMEZONE = ZoneInfo("America/Toronto")
REQUEST_TIMEOUT_SECONDS = 15
MLB_STATS_URL = "https://statsapi.mlb.com/api/v1/people/{player_id}/stats"


def _num(value: Any) -> float:
    try:
        return float(value or 0)
    except (TypeError, ValueError):
        return 0.0


def _int(value: Any) -> int:
    return int(round(_num(value)))


@st.cache_data(ttl=900, show_spinner=False)
def get_player_game_log(
    player_id: int,
    season: int | None = None,
) -> list[dict[str, Any]]:
    """Return the player's MLB hitting game log for one season."""
    if season is None:
        season = datetime.now(TORONTO_TIMEZONE).year

    url = MLB_STATS_URL.format(player_id=int(player_id))
    params = {
        "stats": "gameLog",
        "group": "hitting",
        "season": int(season),
    }

    try:
        response = requests.get(url, params=params, timeout=REQUEST_TIMEOUT_SECONDS)
        response.raise_for_status()
        payload = response.json()
    except (requests.RequestException, ValueError):
        return []

    splits = []
    for block in payload.get("stats", []):
        for split in block.get("splits", []) or []:
            stat = split.get("stat", {}) or {}
            opponent = (split.get("opponent", {}) or {}).get("name") or ""
            date = str(split.get("date") or "")
            splits.append(
                {
                    "date": date,
                    "opponent": opponent,
                    "is_home": bool(split.get("isHome")),
                    "at_bats": _int(stat.get("atBats")),
                    "plate_appearances": _int(
                        stat.get("plateAppearances")
                        or (
                            _num(stat.get("atBats"))
                            + _num(stat.get("baseOnBalls"))
                            + _num(stat.get("hitByPitch"))
                            + _num(stat.get("sacFlies"))
                            + _num(stat.get("sacBunts"))
                        )
                    ),
                    "hits": _int(stat.get("hits")),
                    "doubles": _int(stat.get("doubles")),
                    "triples": _int(stat.get("triples")),
                    "home_runs": _int(stat.get("homeRuns")),
                    "total_bases": _int(stat.get("totalBases")),
                    "runs": _int(stat.get("runs")),
                    "rbi": _int(stat.get("rbi")),
                    "walks": _int(stat.get("baseOnBalls")),
                    "strikeouts": _int(stat.get("strikeOuts")),
                    "stolen_bases": _int(stat.get("stolenBases")),
                }
            )

    splits.sort(key=lambda row: row.get("date") or "")
    return splits


def summarize_game_log(
    games: list[dict[str, Any]],
    window: str,
) -> dict[str, Any]:
    """Aggregate L5, L10, L20, or Season into a compact hitting summary."""
    normalized = str(window or "L5").upper()
    limits = {"L5": 5, "L10": 10, "L20": 20}
    selected = games[-limits[normalized]:] if normalized in limits else list(games)

    totals = {
        "games": len(selected),
        "plate_appearances": 0,
        "at_bats": 0,
        "hits": 0,
        "doubles": 0,
        "triples": 0,
        "home_runs": 0,
        "total_bases": 0,
        "runs": 0,
        "rbi": 0,
        "walks": 0,
        "strikeouts": 0,
        "stolen_bases": 0,
    }

    for game in selected:
        for key in totals:
            if key == "games":
                continue
            totals[key] += _int(game.get(key))

    ab = totals["at_bats"]
    pa = totals["plate_appearances"]
    hits = totals["hits"]
    bb = totals["walks"]
    tb = totals["total_bases"]

    avg = hits / ab if ab else 0.0
    slg = tb / ab if ab else 0.0
    # A compact OBP estimate using the fields available in the game log.
    obp_den = ab + bb
    obp = (hits + bb) / obp_den if obp_den else 0.0

    totals["avg"] = avg
    totals["obp"] = obp
    totals["slg"] = slg
    totals["ops"] = obp + slg
    totals["window"] = normalized
    totals["recent_games"] = selected[-5:]
    totals["all_selected_games"] = selected
    return totals
