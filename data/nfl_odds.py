"""SportsGameOdds integration for NFL player props.

This version is deliberately defensive around API rate limits:
- one shared NFL events request
- 30-minute Streamlit cache
- in-process cooldown after HTTP 429
- stale last-successful payload fallback
- no repeated 429 exception loop on every Streamlit rerun
"""

import json
import os
import re
import time
from pathlib import Path

import pandas as pd
import requests
import streamlit as st


URL = "https://api.sportsgameodds.com/v2/events"

CACHE_TTL_SECONDS = 1800
RATE_LIMIT_COOLDOWN_SECONDS = 1800
STALE_CACHE_FILE = Path("/tmp/sach_nfl_sgo_events.json")
RATE_LIMIT_STATE_FILE = Path("/tmp/sach_nfl_sgo_rate_limit.json")


def _load_rate_limit_state():
    """Persist provider cooldown across Streamlit reruns/process recreation."""
    try:
        if RATE_LIMIT_STATE_FILE.exists():
            payload = json.loads(RATE_LIMIT_STATE_FILE.read_text(encoding="utf-8"))
            return {
                "next_retry_at": float(payload.get("next_retry_at", 0.0) or 0.0),
                "last_error": payload.get("last_error"),
            }
    except Exception:
        pass
    return {"next_retry_at": 0.0, "last_error": None}


def _save_rate_limit_state(state):
    try:
        RATE_LIMIT_STATE_FILE.write_text(json.dumps(state), encoding="utf-8")
    except Exception:
        pass


@st.cache_resource
def _runtime_state():
    return _load_rate_limit_state()


def _key():
    try:
        value = st.secrets.get("SPORTSGAMEODDS_API_KEY")
        if value:
            return str(value).strip()
    except Exception:
        pass

    value = os.getenv("SPORTSGAMEODDS_API_KEY")
    return str(value).strip() if value else None


def sports_game_odds_configured():
    return bool(_key())


def _clean_player_name(name, prop_label):
    text = str(name or "").strip()

    for pattern in [
        rf"\s+{re.escape(prop_label)} Over/Under$",
        rf"\s+{re.escape(prop_label)}$",
    ]:
        text = re.sub(pattern, "", text, flags=re.I)

    return text.strip()


def _load_stale_payload():
    try:
        if STALE_CACHE_FILE.exists():
            return json.loads(
                STALE_CACHE_FILE.read_text(
                    encoding="utf-8",
                )
            )
    except Exception:
        pass

    return None


def _save_stale_payload(payload):
    try:
        STALE_CACHE_FILE.write_text(
            json.dumps(payload),
            encoding="utf-8",
        )
    except Exception:
        pass


@st.cache_data(
    ttl=CACHE_TTL_SECONDS,
    show_spinner=False,
)
def load_shared_nfl_events():
    """
    Fetch one shared NFL events payload.

    The function catches 429s instead of raising them. That is important:
    Streamlit does not cache exceptions, so an uncaught 429 causes every
    widget rerun to call the provider again and extend the problem.
    """

    api_key = _key()

    if not api_key:
        return {
            "status": "not_configured",
            "data": [],
            "message": "SportsGameOdds API key is not configured.",
        }

    state = _runtime_state()
    now = time.time()

    if now < float(state.get("next_retry_at", 0.0)):
        stale = _load_stale_payload()

        if stale:
            return {
                "status": "stale",
                "data": stale.get("data", []),
                "message": (
                    "SportsGameOdds is cooling down after a rate limit. "
                    "Using the last successful market snapshot."
                ),
            }

        return {
            "status": "rate_limited",
            "data": [],
            "message": (
                "SportsGameOdds rate limit is cooling down. "
                "The dashboard will retry automatically later."
            ),
        }

    try:
        response = requests.get(
            URL,
            headers={"x-api-key": api_key},
            params={
                "leagueID": "NFL",
                "oddsAvailable": "true",
                "limit": 100,
            },
            timeout=30,
        )

        if response.status_code == 429:
            retry_after = response.headers.get(
                "Retry-After"
            )

            try:
                retry_seconds = int(retry_after)
            except Exception:
                retry_seconds = RATE_LIMIT_COOLDOWN_SECONDS

            state["next_retry_at"] = (
                now + max(
                    retry_seconds,
                    RATE_LIMIT_COOLDOWN_SECONDS,
                )
            )
            state["last_error"] = "429 Too Many Requests"
            _save_rate_limit_state(state)

            stale = _load_stale_payload()

            if stale:
                return {
                    "status": "stale",
                    "data": stale.get("data", []),
                    "message": (
                        "SportsGameOdds returned 429. "
                        "Using the last successful market snapshot "
                        "instead of repeatedly calling the API."
                    ),
                }

            return {
                "status": "rate_limited",
                "data": [],
                "message": (
                    "SportsGameOdds returned 429 Too Many Requests. "
                    "Requests are paused for 30 minutes so Streamlit "
                    "does not keep extending the rate-limit loop."
                ),
            }

        response.raise_for_status()

        payload = response.json()

        if not payload.get("success", True):
            raise RuntimeError(
                payload.get("error")
                or "SportsGameOdds request failed"
            )

        state["next_retry_at"] = 0.0
        state["last_error"] = None
        _save_rate_limit_state(state)

        _save_stale_payload(payload)

        return {
            "status": "live",
            "data": payload.get("data", []),
            "message": "Live sportsbook market connected.",
        }

    except requests.RequestException as exc:
        stale = _load_stale_payload()

        if stale:
            return {
                "status": "stale",
                "data": stale.get("data", []),
                "message": (
                    "SportsGameOdds is temporarily unavailable. "
                    "Using the last successful market snapshot."
                ),
            }

        return {
            "status": "error",
            "data": [],
            "message": str(exc),
        }


def get_nfl_odds_feed_status():
    result = load_shared_nfl_events()
    return {
        "status": result.get("status"),
        "message": result.get("message"),
    }


@st.cache_data(
    ttl=CACHE_TTL_SECONDS,
    show_spinner=False,
)
def load_nfl_prop_markets(
    stat_id: str,
    prop_label: str,
) -> pd.DataFrame:
    """Parse one NFL player-prop market from the shared events payload."""

    shared = load_shared_nfl_events()
    events = shared.get("data", [])

    rows = []

    for event in events:
        teams = event.get("teams") or {}
        away = (
            (teams.get("away") or {}).get("names")
            or {}
        )
        home = (
            (teams.get("home") or {}).get("names")
            or {}
        )

        matchup = (
            f"{away.get('long', '')} @ "
            f"{home.get('long', '')}"
        ).strip()

        for odd in (event.get("odds") or {}).values():
            if (
                str(odd.get("statID", "")).lower()
                != stat_id.lower()
            ):
                continue

            if (
                str(odd.get("sideID", "")).lower()
                != "over"
            ):
                continue

            entity = str(
                odd.get("statEntityID", "")
            )

            if entity.lower() in {
                "",
                "all",
                "home",
                "away",
            }:
                continue

            books = []

            for bookmaker, book in (
                odd.get("byBookmaker") or {}
            ).items():
                if not book.get("available"):
                    continue

                line = pd.to_numeric(
                    book.get("overUnder"),
                    errors="coerce",
                )

                if pd.isna(line):
                    continue

                books.append(
                    (
                        bookmaker,
                        float(line),
                        book.get("odds"),
                    )
                )

            best = (
                min(
                    books,
                    key=lambda item: item[1],
                )
                if books
                else None
            )

            rows.append(
                {
                    "event_id": event.get("eventID"),
                    "matchup": matchup,
                    "player_name": _clean_player_name(
                        odd.get("marketName"),
                        prop_label,
                    ),
                    "market_player_id": (
                        odd.get("playerID")
                        or odd.get("statEntityID")
                    ),
                    "consensus_line": pd.to_numeric(
                        odd.get("bookOverUnder"),
                        errors="coerce",
                    ),
                    "best_over_line": (
                        best[1]
                        if best
                        else pd.NA
                    ),
                    "best_over_book": (
                        best[0]
                        if best
                        else None
                    ),
                    "best_over_odds": (
                        best[2]
                        if best
                        else None
                    ),
                    "books_available": len(books),
                    "feed_status": shared.get(
                        "status"
                    ),
                }
            )

    if not rows:
        return pd.DataFrame()

    return (
        pd.DataFrame(rows)
        .sort_values(
            ["matchup", "player_name"]
        )
        .reset_index(drop=True)
    )


def load_nfl_passing_yards_markets():
    return load_nfl_prop_markets(
        "passing_yards",
        "Passing Yards",
    )


def load_nfl_rushing_yards_markets():
    return load_nfl_prop_markets(
        "rushing_yards",
        "Rushing Yards",
    )


def load_nfl_receiving_yards_markets():
    return load_nfl_prop_markets(
        "receiving_yards",
        "Receiving Yards",
    )


def load_nfl_receptions_markets():
    return load_nfl_prop_markets(
        "receptions",
        "Receptions",
    )


def _american_to_implied_probability(odds_value):
    """Convert American odds text to implied probability percentage."""
    if odds_value is None:
        return pd.NA

    try:
        value = float(str(odds_value).replace("+", "").strip())
    except Exception:
        return pd.NA

    if value == 0:
        return pd.NA

    if value > 0:
        probability = 100.0 / (value + 100.0)
    else:
        probability = abs(value) / (abs(value) + 100.0)

    return round(probability * 100.0, 1)


@st.cache_data(
    ttl=CACHE_TTL_SECONDS,
    show_spinner=False,
)
def load_nfl_yes_no_player_market(
    stat_id: str,
    market_label: str,
) -> pd.DataFrame:
    """
    Parse a player Yes/No scorer market from the shared NFL odds payload.

    Example supported market:
    touchdowns-PLAYER-game-yn-yes
    """

    shared = load_shared_nfl_events()
    events = shared.get("data", [])
    rows = []

    for event in events:
        teams = event.get("teams") or {}
        away = ((teams.get("away") or {}).get("names") or {})
        home = ((teams.get("home") or {}).get("names") or {})
        matchup = (
            f"{away.get('long', '')} @ {home.get('long', '')}"
        ).strip()

        for odd in (event.get("odds") or {}).values():
            if str(odd.get("statID", "")).lower() != stat_id.lower():
                continue

            entity = str(odd.get("statEntityID", ""))
            if entity.lower() in {"", "all", "home", "away"}:
                continue

            side = str(odd.get("sideID", "")).lower()
            bet_type = str(odd.get("betTypeID", "")).lower()

            # Anytime TD is a yes/no player market.
            if stat_id.lower() == "touchdowns":
                if bet_type != "yn" or side != "yes":
                    continue

            # First TD can be represented as a player outcome market. We
            # accept the player row regardless of provider side naming.
            if stat_id.lower() == "firsttouchdown":
                if side in {"no", "under"}:
                    continue

            market_name = str(odd.get("marketName", "")).strip()
            player_name = market_name

            cleanup_patterns = [
                rf"\s+{re.escape(market_label)}.*$",
                r"\s+Any Touchdowns Yes/No$",
                r"\s+Anytime Touchdown.*$",
                r"\s+First Touchdown.*$",
            ]
            for pattern in cleanup_patterns:
                player_name = re.sub(
                    pattern,
                    "",
                    player_name,
                    flags=re.I,
                )

            consensus_odds = odd.get("bookOdds")
            fair_odds = odd.get("fairOdds")

            book_rows = []
            for bookmaker, book in (odd.get("byBookmaker") or {}).items():
                if not book.get("available"):
                    continue
                price = book.get("odds")
                if price in (None, ""):
                    continue
                book_rows.append((bookmaker, price))

            rows.append(
                {
                    "event_id": event.get("eventID"),
                    "matchup": matchup,
                    "player_name": player_name.strip(),
                    "market_player_id": (
                        odd.get("playerID")
                        or odd.get("statEntityID")
                    ),
                    "consensus_odds": consensus_odds,
                    "fair_odds": fair_odds,
                    "sportsbook_implied_probability": (
                        _american_to_implied_probability(consensus_odds)
                    ),
                    "fair_implied_probability": (
                        _american_to_implied_probability(fair_odds)
                    ),
                    "books_available": len(book_rows),
                    "feed_status": shared.get("status"),
                }
            )

    if not rows:
        return pd.DataFrame()

    return (
        pd.DataFrame(rows)
        .sort_values(["matchup", "player_name"])
        .reset_index(drop=True)
    )


def load_nfl_anytime_td_markets():
    return load_nfl_yes_no_player_market(
        "touchdowns",
        "Anytime TD",
    )


def load_nfl_first_td_markets():
    return load_nfl_yes_no_player_market(
        "firstTouchdown",
        "First TD",
    )
