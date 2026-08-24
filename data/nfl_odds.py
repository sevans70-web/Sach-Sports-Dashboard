"""SportsGameOdds integration for NFL player props.

NFL-wide feed architecture:
- checks account usage before requesting event objects
- detects exhausted monthly object quota and stops doomed retries
- uses one shared upcoming-NFL events request for every prop
- limits the request to the near-term NFL window instead of all events
- respects Retry-After for per-minute 429s
- caches the shared response for all six NFL props
- uses the last successful snapshot when available
"""

import json
import os
import re
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pandas as pd
import requests
import streamlit as st


EVENTS_URL = "https://api.sportsgameodds.com/v2/events"
USAGE_URL = "https://api.sportsgameodds.com/v2/account/usage"

EVENT_CACHE_TTL_SECONDS = 600
USAGE_CACHE_TTL_SECONDS = 60
FALLBACK_RATE_LIMIT_SECONDS = 65
STALE_CACHE_FILE = Path("/tmp/sach_nfl_sgo_events.json")


@st.cache_resource
def _runtime_state():
    return {
        "next_retry_at": 0.0,
        "last_error": None,
    }


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


def _number(value):
    if value in (None, "", "n/a", "unlimited"):
        return None

    try:
        return float(value)
    except Exception:
        return None


def _extract_limit_bucket(rate_limits, bucket_name):
    bucket = (
        rate_limits.get(bucket_name)
        or rate_limits.get(bucket_name.replace("-", "_"))
        or {}
    )

    max_requests = _number(
        bucket.get("maxRequestsPerInterval")
        or bucket.get("max-requests")
        or bucket.get("max_requests")
    )
    current_requests = _number(
        bucket.get("currentIntervalRequests")
        or bucket.get("current-requests")
        or bucket.get("current_requests")
    )
    max_entities = _number(
        bucket.get("maxEntitiesPerInterval")
        or bucket.get("max-entities")
        or bucket.get("max_entities")
    )
    current_entities = _number(
        bucket.get("currentIntervalEntities")
        or bucket.get("current-entities")
        or bucket.get("current_entities")
    )

    return {
        "max_requests": max_requests,
        "current_requests": current_requests,
        "max_entities": max_entities,
        "current_entities": current_entities,
    }


@st.cache_data(
    ttl=USAGE_CACHE_TTL_SECONDS,
    show_spinner=False,
)
def load_sports_game_odds_usage():
    """Read the account usage endpoint before consuming more event objects."""

    api_key = _key()

    if not api_key:
        return {
            "status": "not_configured",
            "tier": None,
            "rate_limits": {},
            "message": "SportsGameOdds API key is not configured.",
        }

    try:
        response = requests.get(
            USAGE_URL,
            headers={"x-api-key": api_key},
            timeout=15,
        )
        response.raise_for_status()

        payload = response.json()
        data = payload.get("data") or {}
        rate_limits = data.get("rateLimits") or {}

        buckets = {
            name: _extract_limit_bucket(rate_limits, name)
            for name in [
                "per-minute",
                "per-hour",
                "per-day",
                "per-month",
            ]
        }

        monthly = buckets["per-month"]
        monthly_exhausted = (
            monthly["max_entities"] is not None
            and monthly["current_entities"] is not None
            and monthly["current_entities"]
            >= monthly["max_entities"]
        )

        minute = buckets["per-minute"]
        minute_requests_exhausted = (
            minute["max_requests"] is not None
            and minute["current_requests"] is not None
            and minute["current_requests"]
            >= minute["max_requests"]
        )

        if monthly_exhausted:
            return {
                "status": "quota_exhausted",
                "tier": data.get("tier"),
                "rate_limits": buckets,
                "message": (
                    "SportsGameOdds monthly object allowance is exhausted. "
                    "Live NFL sportsbook markets will resume when the provider "
                    "resets the allowance or the API plan is upgraded."
                ),
            }

        if minute_requests_exhausted:
            return {
                "status": "minute_limited",
                "tier": data.get("tier"),
                "rate_limits": buckets,
                "message": (
                    "SportsGameOdds per-minute request limit is temporarily full. "
                    "The dashboard will retry after the interval resets."
                ),
            }

        return {
            "status": "available",
            "tier": data.get("tier"),
            "rate_limits": buckets,
            "message": "SportsGameOdds account allowance is available.",
        }

    except Exception as exc:
        return {
            "status": "usage_unknown",
            "tier": None,
            "rate_limits": {},
            "message": (
                "SportsGameOdds usage could not be checked. "
                f"{exc}"
            ),
        }


def _stale_or_empty(status, message):
    stale = _load_stale_payload()

    if stale:
        return {
            "status": "stale",
            "data": stale.get("data", []),
            "message": (
                f"{message} Using the last successful sportsbook snapshot."
            ),
        }

    return {
        "status": status,
        "data": [],
        "message": message,
    }


@st.cache_data(
    ttl=EVENT_CACHE_TTL_SECONDS,
    show_spinner=False,
)
def load_shared_nfl_events():
    """Fetch one tightly scoped NFL events payload for every prop."""

    api_key = _key()

    if not api_key:
        return {
            "status": "not_configured",
            "data": [],
            "message": "SportsGameOdds API key is not configured.",
        }

    usage = load_sports_game_odds_usage()

    if usage.get("status") == "quota_exhausted":
        return _stale_or_empty(
            "quota_exhausted",
            usage.get("message"),
        )

    if usage.get("status") == "minute_limited":
        return _stale_or_empty(
            "rate_limited",
            usage.get("message"),
        )

    state = _runtime_state()
    now_epoch = time.time()

    if now_epoch < float(state.get("next_retry_at", 0.0)):
        seconds = max(
            1,
            int(state["next_retry_at"] - now_epoch),
        )
        return _stale_or_empty(
            "rate_limited",
            (
                "SportsGameOdds is temporarily rate-limited. "
                f"Next retry in about {seconds} seconds."
            ),
        )

    # Only request the near-term slate. The dashboard does not need every
    # NFL event in the provider database in order to build today's prop boards.
    now = datetime.now(timezone.utc)
    starts_after = now - timedelta(hours=6)
    starts_before = now + timedelta(days=10)

    params = {
        "leagueID": "NFL",
        "oddsAvailable": "true",
        "finalized": "false",
        "startsAfter": starts_after.isoformat().replace("+00:00", "Z"),
        "startsBefore": starts_before.isoformat().replace("+00:00", "Z"),
        "limit": 32,
    }

    try:
        response = requests.get(
            EVENTS_URL,
            headers={"x-api-key": api_key},
            params=params,
            timeout=30,
        )

        if response.status_code == 429:
            retry_after = response.headers.get("Retry-After")

            try:
                retry_seconds = max(
                    int(float(retry_after)),
                    1,
                )
            except Exception:
                retry_seconds = FALLBACK_RATE_LIMIT_SECONDS

            state["next_retry_at"] = now_epoch + retry_seconds
            state["last_error"] = "429 Too Many Requests"

            # Clear usage cache so the next allowed check can tell us whether
            # this was a per-minute or monthly-object restriction.
            try:
                load_sports_game_odds_usage.clear()
            except Exception:
                pass

            return _stale_or_empty(
                "rate_limited",
                (
                    "SportsGameOdds returned 429 Too Many Requests. "
                    f"The dashboard will retry in about {retry_seconds} seconds."
                ),
            )

        response.raise_for_status()

        payload = response.json()

        if not payload.get("success", True):
            raise RuntimeError(
                payload.get("error")
                or "SportsGameOdds request failed"
            )

        state["next_retry_at"] = 0.0
        state["last_error"] = None
        _save_stale_payload(payload)

        return {
            "status": "live",
            "data": payload.get("data", []),
            "message": (
                "Live sportsbook market connected. "
                f"{len(payload.get('data', []))} upcoming NFL events loaded."
            ),
        }

    except requests.RequestException as exc:
        return _stale_or_empty(
            "error",
            (
                "SportsGameOdds is temporarily unavailable. "
                f"{exc}"
            ),
        )


def get_nfl_odds_feed_status():
    result = load_shared_nfl_events()
    return {
        "status": result.get("status"),
        "message": result.get("message"),
    }


@st.cache_data(
    ttl=EVENT_CACHE_TTL_SECONDS,
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

            if str(odd.get("sideID", "")).lower() != "over":
                continue

            entity = str(odd.get("statEntityID", ""))

            if entity.lower() in {"", "all", "home", "away"}:
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
                min(books, key=lambda item: item[1])
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
                        best[1] if best else pd.NA
                    ),
                    "best_over_book": (
                        best[0] if best else None
                    ),
                    "best_over_odds": (
                        best[2] if best else None
                    ),
                    "books_available": len(books),
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
    if odds_value is None:
        return pd.NA

    try:
        value = float(
            str(odds_value)
            .replace("+", "")
            .strip()
        )
    except Exception:
        return pd.NA

    if value == 0:
        return pd.NA

    if value > 0:
        probability = 100.0 / (value + 100.0)
    else:
        probability = (
            abs(value)
            / (abs(value) + 100.0)
        )

    return round(probability * 100.0, 1)


@st.cache_data(
    ttl=EVENT_CACHE_TTL_SECONDS,
    show_spinner=False,
)
def load_nfl_yes_no_player_market(
    stat_id: str,
    market_label: str,
) -> pd.DataFrame:
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
            if str(odd.get("statID", "")).lower() != stat_id.lower():
                continue

            entity = str(odd.get("statEntityID", ""))
            if entity.lower() in {"", "all", "home", "away"}:
                continue

            side = str(odd.get("sideID", "")).lower()
            bet_type = str(odd.get("betTypeID", "")).lower()

            if stat_id.lower() == "touchdowns":
                if bet_type != "yn" or side != "yes":
                    continue

            if stat_id.lower() == "firsttouchdown":
                if side in {"no", "under"}:
                    continue

            market_name = str(
                odd.get("marketName", "")
            ).strip()
            player_name = market_name

            for pattern in [
                rf"\s+{re.escape(market_label)}.*$",
                r"\s+Any Touchdowns Yes/No$",
                r"\s+Anytime Touchdown.*$",
                r"\s+First Touchdown.*$",
            ]:
                player_name = re.sub(
                    pattern,
                    "",
                    player_name,
                    flags=re.I,
                )

            consensus_odds = odd.get("bookOdds")
            fair_odds = odd.get("fairOdds")

            book_rows = []

            for bookmaker, book in (
                odd.get("byBookmaker") or {}
            ).items():
                if not book.get("available"):
                    continue

                price = book.get("odds")
                if price in (None, ""):
                    continue

                book_rows.append(
                    (bookmaker, price)
                )

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
                        _american_to_implied_probability(
                            consensus_odds
                        )
                    ),
                    "fair_implied_probability": (
                        _american_to_implied_probability(
                            fair_odds
                        )
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
