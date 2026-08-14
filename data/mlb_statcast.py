"""Safe Baseball Savant/Statcast data access for MLB player intelligence.

This module is intentionally isolated from the ranking engine. A Statcast outage,
empty response, or schema change returns an empty result instead of preventing the
dashboard from loading. Rankings can opt into these metrics only after validation.
"""

from __future__ import annotations

import csv
import io
import threading
import time
from datetime import datetime, timezone
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen


STATCAST_CUSTOM_LEADERBOARD_URL = (
    "https://baseballsavant.mlb.com/leaderboard/custom"
)
STATCAST_CACHE_SECONDS = 60 * 60
STATCAST_TIMEOUT_SECONDS = 30

STATCAST_SELECTIONS = (
    "pa",
    "xba",
    "xslg",
    "xwoba",
    "xiso",
    "exit_velocity_avg",
    "launch_angle_avg",
    "barrel",
    "barrel_batted_rate",
    "hard_hit_percent",
)

REQUIRED_COLUMNS = {
    "last_name, first_name",
    "player_id",
    "year",
    *STATCAST_SELECTIONS,
}

_CACHE_LOCK = threading.Lock()
_CACHE: dict[tuple[int, int], dict[str, Any]] = {}


def _safe_float(value: Any) -> float | None:
    """Convert a CSV value to float without allowing bad data to crash a load."""
    if value is None:
        return None
    cleaned = str(value).strip().replace("%", "")
    if not cleaned or cleaned.lower() in {"null", "none", "nan", "-"}:
        return None
    try:
        return float(cleaned)
    except (TypeError, ValueError):
        return None


def _safe_int(value: Any) -> int | None:
    """Convert numeric text to int while rejecting missing or malformed values."""
    parsed = _safe_float(value)
    if parsed is None:
        return None
    return int(parsed)


def _sample_reliability(plate_appearances: int) -> dict[str, Any]:
    """Describe how much confidence the dashboard should place in the sample."""
    if plate_appearances >= 200:
        return {
            "level": "strong",
            "weight": 1.0,
            "warning": "",
        }
    if plate_appearances >= 100:
        return {
            "level": "moderate",
            "weight": 0.85,
            "warning": "Moderate Statcast sample",
        }
    if plate_appearances >= 50:
        return {
            "level": "limited",
            "weight": 0.65,
            "warning": "Limited Statcast sample",
        }
    return {
        "level": "small",
        "weight": 0.35,
        "warning": "Small Statcast sample — use cautiously",
    }


def _leaderboard_url(year: int, minimum_pa: int) -> str:
    """Build the official Baseball Savant custom-leaderboard CSV URL."""
    parameters = {
        "year": year,
        "type": "batter",
        "filter": "",
        "sort": "4",
        "sortDir": "desc",
        "min": minimum_pa,
        "selections": ",".join(STATCAST_SELECTIONS),
        "csv": "true",
    }
    return f"{STATCAST_CUSTOM_LEADERBOARD_URL}?{urlencode(parameters)}"


def _download_csv(url: str) -> str:
    """Download a Statcast CSV using a normal browser-style request header."""
    request = Request(
        url,
        headers={
            "Accept": "text/csv,*/*;q=0.8",
            "User-Agent": (
                "SachSportsDashboard/1.0 "
                "(Statcast development and model validation)"
            ),
        },
    )
    with urlopen(request, timeout=STATCAST_TIMEOUT_SECONDS) as response:
        content_type = response.headers.get("Content-Type", "").lower()
        payload = response.read()

    if not payload:
        raise ValueError("Baseball Savant returned an empty response")
    if "csv" not in content_type and not payload.lstrip().startswith(
        (b'"', b"\xef\xbb\xbf\"")
    ):
        raise ValueError("Baseball Savant did not return CSV data")
    return payload.decode("utf-8-sig")


def _parse_batter_rows(csv_text: str) -> dict[int, dict[str, Any]]:
    """Validate and normalize official Statcast batter leaderboard rows."""
    reader = csv.DictReader(io.StringIO(csv_text))
    columns = set(reader.fieldnames or [])
    missing_columns = REQUIRED_COLUMNS - columns
    if missing_columns:
        missing = ", ".join(sorted(missing_columns))
        raise ValueError(f"Statcast response is missing columns: {missing}")

    players: dict[int, dict[str, Any]] = {}
    for row in reader:
        player_id = _safe_int(row.get("player_id"))
        plate_appearances = _safe_int(row.get("pa")) or 0
        if player_id is None:
            continue

        reliability = _sample_reliability(plate_appearances)
        players[player_id] = {
            "player_id": player_id,
            "player_name": str(row.get("last_name, first_name") or "").strip(),
            "season": _safe_int(row.get("year")),
            "plate_appearances": plate_appearances,
            "xba": _safe_float(row.get("xba")),
            "xslg": _safe_float(row.get("xslg")),
            "xwoba": _safe_float(row.get("xwoba")),
            "xiso": _safe_float(row.get("xiso")),
            "average_exit_velocity": _safe_float(
                row.get("exit_velocity_avg")
            ),
            "average_launch_angle": _safe_float(
                row.get("launch_angle_avg")
            ),
            "barrels": _safe_int(row.get("barrel")) or 0,
            "barrel_rate": _safe_float(row.get("barrel_batted_rate")),
            "hard_hit_rate": _safe_float(row.get("hard_hit_percent")),
            "sample_level": reliability["level"],
            "sample_weight": reliability["weight"],
            "sample_warning": reliability["warning"],
            "source": "Baseball Savant Statcast",
        }
    return players


def load_statcast_batter_metrics(
    year: int | None = None,
    minimum_pa: int = 10,
    force_refresh: bool = False,
) -> dict[str, Any]:
    """Return a validated Statcast snapshot without raising dashboard errors.

    The result always has the same shape. Callers must check ``available`` before
    using ``players``. Failed refreshes retain a previously successful cache entry.
    """
    season = int(year or datetime.now(timezone.utc).year)
    minimum_pa = max(1, int(minimum_pa))
    cache_key = (season, minimum_pa)
    now = time.time()

    with _CACHE_LOCK:
        cached = _CACHE.get(cache_key)
        if (
            cached
            and not force_refresh
            and now - cached["cached_at"] < STATCAST_CACHE_SECONDS
        ):
            return dict(cached["result"])

    source_url = _leaderboard_url(season, minimum_pa)
    try:
        csv_text = _download_csv(source_url)
        players = _parse_batter_rows(csv_text)
        if not players:
            raise ValueError("No valid Statcast batter rows were returned")

        result = {
            "available": True,
            "season": season,
            "minimum_pa": minimum_pa,
            "player_count": len(players),
            "players": players,
            "retrieved_at": datetime.now(timezone.utc).isoformat(),
            "source": "Baseball Savant Statcast",
            "source_url": source_url,
            "error": "",
        }
        with _CACHE_LOCK:
            _CACHE[cache_key] = {
                "cached_at": now,
                "result": result,
            }
        return dict(result)

    except (HTTPError, URLError, TimeoutError, OSError, ValueError) as exc:
        with _CACHE_LOCK:
            cached = _CACHE.get(cache_key)
        if cached and cached["result"].get("available"):
            fallback = dict(cached["result"])
            fallback["error"] = f"Statcast refresh failed; using cache: {exc}"
            return fallback

        return {
            "available": False,
            "season": season,
            "minimum_pa": minimum_pa,
            "player_count": 0,
            "players": {},
            "retrieved_at": "",
            "source": "Baseball Savant Statcast",
            "source_url": source_url,
            "error": str(exc),
        }


def get_statcast_batter(
    player_id: int,
    snapshot: dict[str, Any] | None = None,
) -> dict[str, Any] | None:
    """Look up one batter by the official MLB player ID."""
    data = snapshot or load_statcast_batter_metrics()
    if not data.get("available"):
        return None
    return data.get("players", {}).get(int(player_id))

