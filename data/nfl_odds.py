"""NFL sportsbook provider layer.

Primary provider: SportsGameOdds
Automatic backup: The Odds API

All NFL prop engines continue calling the same public functions in this file.
The provider layer normalizes both services into the same dataframe shape.

Supported props:
- Passing Yards
- Rushing Yards
- Receiving Yards
- Receptions
- Anytime TD
- First TD
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


# ---------------------------------------------------------------------------
# Provider configuration
# ---------------------------------------------------------------------------

SGO_EVENTS_URL = "https://api.sportsgameodds.com/v2/events"
SGO_USAGE_URL = "https://api.sportsgameodds.com/v2/account/usage"

ODDS_API_BASE = "https://api.the-odds-api.com/v4"
ODDS_API_SPORT = "americanfootball_nfl"
ODDS_API_REGION = "us"

# One event-odds request can return all six markets for that game.
ODDS_API_MARKETS = (
    "player_pass_yds,"
    "player_pass_attempts,"
    "player_pass_completions,"
    "player_rush_yds,"
    "player_rush_attempts,"
    "player_reception_yds,"
    "player_receptions,"
    "player_anytime_td,"
    "player_1st_td"
)

SGO_CACHE_TTL_SECONDS = 600
ODDS_API_CACHE_TTL_SECONDS = 21600  # 6 hours: protect the 500-credit free plan.
USAGE_CACHE_TTL_SECONDS = 300
FALLBACK_RATE_LIMIT_SECONDS = 65

SGO_STALE_CACHE_FILE = Path("/tmp/sach_nfl_sgo_events.json")
ODDS_API_STALE_CACHE_FILE = Path("/tmp/sach_nfl_the_odds_api_events.json")


# ---------------------------------------------------------------------------
# Secrets / state
# ---------------------------------------------------------------------------

def _secret(name):
    try:
        value = st.secrets.get(name)
        if value:
            return str(value).strip()
    except Exception:
        pass

    value = os.getenv(name)
    return str(value).strip() if value else None


def _sgo_key():
    return _secret("SPORTSGAMEODDS_API_KEY")


def _odds_api_key():
    return _secret("THE_ODDS_API_KEY")


def sports_game_odds_configured():
    """
    Backward-compatible name used throughout the existing NFL code.

    It now means "at least one sportsbook provider is configured."
    """
    return bool(_sgo_key() or _odds_api_key())


@st.cache_resource
def _runtime_state():
    return {
        "sgo_next_retry_at": 0.0,
        "odds_api_next_retry_at": 0.0,
    }


# ---------------------------------------------------------------------------
# Generic helpers
# ---------------------------------------------------------------------------

def _clean_player_name(name, prop_label):
    text = str(name or "").strip()

    for pattern in [
        rf"\s+{re.escape(prop_label)} Over/Under$",
        rf"\s+{re.escape(prop_label)}$",
    ]:
        text = re.sub(pattern, "", text, flags=re.I)

    return text.strip()


def _number(value):
    if value in (None, "", "n/a", "unlimited"):
        return None

    try:
        return float(value)
    except Exception:
        return None


def _american_to_implied_probability(odds_value):
    if odds_value is None or pd.isna(odds_value):
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


def _read_json(path):
    try:
        if path.exists():
            return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        pass

    return None


def _write_json(path, payload):
    try:
        path.write_text(
            json.dumps(payload),
            encoding="utf-8",
        )
    except Exception:
        pass


# ---------------------------------------------------------------------------
# SportsGameOdds usage + shared feed
# ---------------------------------------------------------------------------

def _extract_limit_bucket(rate_limits, bucket_name):
    bucket = (
        rate_limits.get(bucket_name)
        or rate_limits.get(bucket_name.replace("-", "_"))
        or {}
    )

    return {
        "max_requests": _number(
            bucket.get("maxRequestsPerInterval")
            or bucket.get("max-requests")
            or bucket.get("max_requests")
        ),
        "current_requests": _number(
            bucket.get("currentIntervalRequests")
            or bucket.get("current-requests")
            or bucket.get("current_requests")
        ),
        "max_entities": _number(
            bucket.get("maxEntitiesPerInterval")
            or bucket.get("max-entities")
            or bucket.get("max_entities")
        ),
        "current_entities": _number(
            bucket.get("currentIntervalEntities")
            or bucket.get("current-entities")
            or bucket.get("current_entities")
        ),
    }


@st.cache_data(
    ttl=USAGE_CACHE_TTL_SECONDS,
    show_spinner=False,
)
def load_sports_game_odds_usage():
    api_key = _sgo_key()

    if not api_key:
        return {
            "status": "not_configured",
            "message": "SportsGameOdds is not configured.",
        }

    try:
        response = requests.get(
            SGO_USAGE_URL,
            headers={"x-api-key": api_key},
            timeout=15,
        )
        response.raise_for_status()

        payload = response.json()
        data = payload.get("data") or {}
        rate_limits = data.get("rateLimits") or {}

        monthly = _extract_limit_bucket(
            rate_limits,
            "per-month",
        )
        minute = _extract_limit_bucket(
            rate_limits,
            "per-minute",
        )

        monthly_exhausted = (
            monthly["max_entities"] is not None
            and monthly["current_entities"] is not None
            and monthly["current_entities"] >= monthly["max_entities"]
        )

        minute_exhausted = (
            minute["max_requests"] is not None
            and minute["current_requests"] is not None
            and minute["current_requests"] >= minute["max_requests"]
        )

        if monthly_exhausted:
            return {
                "status": "quota_exhausted",
                "message": "SportsGameOdds monthly allowance is exhausted.",
            }

        if minute_exhausted:
            return {
                "status": "rate_limited",
                "message": "SportsGameOdds is temporarily rate-limited.",
            }

        return {
            "status": "available",
            "message": "SportsGameOdds is available.",
        }

    except Exception as exc:
        return {
            "status": "usage_unknown",
            "message": f"SportsGameOdds usage check failed: {exc}",
        }


@st.cache_data(
    ttl=SGO_CACHE_TTL_SECONDS,
    show_spinner=False,
)
def _load_sgo_events():
    api_key = _sgo_key()

    if not api_key:
        return {
            "status": "not_configured",
            "provider": "SportsGameOdds",
            "data": [],
            "message": "SportsGameOdds is not configured.",
        }

    usage = load_sports_game_odds_usage()

    if usage.get("status") in {
        "quota_exhausted",
        "rate_limited",
    }:
        return {
            "status": usage["status"],
            "provider": "SportsGameOdds",
            "data": [],
            "message": usage.get("message"),
        }

    state = _runtime_state()
    now_epoch = time.time()

    if now_epoch < state.get("sgo_next_retry_at", 0.0):
        return {
            "status": "rate_limited",
            "provider": "SportsGameOdds",
            "data": [],
            "message": "SportsGameOdds is cooling down after a rate limit.",
        }

    now = datetime.now(timezone.utc)

    try:
        response = requests.get(
            SGO_EVENTS_URL,
            headers={"x-api-key": api_key},
            params={
                "leagueID": "NFL",
                "oddsAvailable": "true",
                "finalized": "false",
                "startsAfter": (
                    now - timedelta(hours=6)
                ).isoformat().replace("+00:00", "Z"),
                "startsBefore": (
                    now + timedelta(days=10)
                ).isoformat().replace("+00:00", "Z"),
                "limit": 32,
            },
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

            state["sgo_next_retry_at"] = (
                now_epoch + retry_seconds
            )

            return {
                "status": "rate_limited",
                "provider": "SportsGameOdds",
                "data": [],
                "message": "SportsGameOdds returned 429.",
            }

        response.raise_for_status()

        payload = response.json()

        if not payload.get("success", True):
            raise RuntimeError(
                payload.get("error")
                or "SportsGameOdds request failed"
            )

        _write_json(
            SGO_STALE_CACHE_FILE,
            payload,
        )

        return {
            "status": "live",
            "provider": "SportsGameOdds",
            "data": payload.get("data", []),
            "message": "Live sportsbook market connected via SportsGameOdds.",
        }

    except Exception as exc:
        return {
            "status": "error",
            "provider": "SportsGameOdds",
            "data": [],
            "message": f"SportsGameOdds error: {exc}",
        }


# ---------------------------------------------------------------------------
# The Odds API backup feed
# ---------------------------------------------------------------------------

@st.cache_data(
    ttl=ODDS_API_CACHE_TTL_SECONDS,
    show_spinner=False,
)
def _load_the_odds_api_events():
    """
    Load all six NFL prop markets from The Odds API.

    The /events endpoint is free. Player props are then queried one event at a
    time, with all six markets in the same request. Results are cached for six
    hours to protect the 500-credit Starter plan.
    """

    api_key = _odds_api_key()

    if not api_key:
        return {
            "status": "not_configured",
            "provider": "The Odds API",
            "data": [],
            "message": "The Odds API is not configured.",
            "credits_remaining": None,
        }

    state = _runtime_state()
    now_epoch = time.time()

    if now_epoch < state.get("odds_api_next_retry_at", 0.0):
        stale = _read_json(
            ODDS_API_STALE_CACHE_FILE
        )

        if stale:
            return {
                "status": "stale",
                "provider": "The Odds API",
                "data": stale.get("data", []),
                "message": (
                    "Using the last successful The Odds API snapshot."
                ),
                "credits_remaining": stale.get(
                    "credits_remaining"
                ),
            }

        return {
            "status": "rate_limited",
            "provider": "The Odds API",
            "data": [],
            "message": "The Odds API is temporarily rate-limited.",
            "credits_remaining": None,
        }

    try:
        events_response = requests.get(
            (
                f"{ODDS_API_BASE}/sports/"
                f"{ODDS_API_SPORT}/events"
            ),
            params={
                "apiKey": api_key,
                "dateFormat": "iso",
            },
            timeout=30,
        )
        events_response.raise_for_status()

        events = events_response.json()

        now = datetime.now(timezone.utc)
        cutoff = now + timedelta(days=10)

        upcoming = []

        for event in events:
            try:
                commence = datetime.fromisoformat(
                    str(event.get("commence_time"))
                    .replace("Z", "+00:00")
                )
            except Exception:
                continue

            if (
                commence >= now - timedelta(hours=6)
                and commence <= cutoff
            ):
                upcoming.append(event)

        collected = []
        credits_remaining = None

        for event in upcoming:
            event_id = event.get("id")

            if not event_id:
                continue

            response = requests.get(
                (
                    f"{ODDS_API_BASE}/sports/"
                    f"{ODDS_API_SPORT}/events/"
                    f"{event_id}/odds"
                ),
                params={
                    "apiKey": api_key,
                    "regions": ODDS_API_REGION,
                    "markets": ODDS_API_MARKETS,
                    "oddsFormat": "american",
                    "dateFormat": "iso",
                },
                timeout=30,
            )

            remaining_header = response.headers.get(
                "x-requests-remaining"
            )

            if remaining_header is not None:
                try:
                    credits_remaining = int(
                        float(remaining_header)
                    )
                except Exception:
                    pass

            if response.status_code in {401, 403}:
                return {
                    "status": "auth_error",
                    "provider": "The Odds API",
                    "data": [],
                    "message": (
                        "The Odds API rejected the API key. "
                        "Check THE_ODDS_API_KEY in Streamlit Secrets."
                    ),
                    "credits_remaining": credits_remaining,
                }

            if response.status_code == 429:
                state["odds_api_next_retry_at"] = (
                    time.time() + FALLBACK_RATE_LIMIT_SECONDS
                )
                break

            if response.status_code == 422:
                # No supported prop markets for this event yet.
                continue

            response.raise_for_status()

            event_odds = response.json()

            if event_odds.get("bookmakers"):
                collected.append(event_odds)

            # Protect the free plan from running itself to zero in one refresh.
            if (
                credits_remaining is not None
                and credits_remaining < 12
            ):
                break

        payload = {
            "data": collected,
            "credits_remaining": credits_remaining,
        }

        if collected:
            _write_json(
                ODDS_API_STALE_CACHE_FILE,
                payload,
            )

            return {
                "status": "live",
                "provider": "The Odds API",
                "data": collected,
                "message": (
                    "Live sportsbook market connected via The Odds API."
                ),
                "credits_remaining": credits_remaining,
            }

        stale = _read_json(
            ODDS_API_STALE_CACHE_FILE
        )

        if stale:
            return {
                "status": "stale",
                "provider": "The Odds API",
                "data": stale.get("data", []),
                "message": (
                    "No fresh NFL prop markets were returned; "
                    "using the last The Odds API snapshot."
                ),
                "credits_remaining": (
                    credits_remaining
                    if credits_remaining is not None
                    else stale.get("credits_remaining")
                ),
            }

        return {
            "status": "no_markets",
            "provider": "The Odds API",
            "data": [],
            "message": (
                "The Odds API is connected, but no NFL player-prop "
                "markets are posted for the upcoming slate yet."
            ),
            "credits_remaining": credits_remaining,
        }

    except Exception as exc:
        stale = _read_json(
            ODDS_API_STALE_CACHE_FILE
        )

        if stale:
            return {
                "status": "stale",
                "provider": "The Odds API",
                "data": stale.get("data", []),
                "message": (
                    "The Odds API is temporarily unavailable; "
                    "using the last successful snapshot."
                ),
                "credits_remaining": stale.get(
                    "credits_remaining"
                ),
            }

        return {
            "status": "error",
            "provider": "The Odds API",
            "data": [],
            "message": f"The Odds API error: {exc}",
            "credits_remaining": None,
        }


# ---------------------------------------------------------------------------
# Provider selection
# ---------------------------------------------------------------------------

@st.cache_data(
    ttl=SGO_CACHE_TTL_SECONDS,
    show_spinner=False,
)
def load_shared_nfl_events():
    """
    Return one normalized provider envelope.

    SportsGameOdds remains primary. If its monthly quota is exhausted,
    rate-limited, unavailable, or returns no usable events, automatically
    switch to The Odds API.
    """

    sgo = _load_sgo_events()

    if (
        sgo.get("status") == "live"
        and sgo.get("data")
    ):
        return sgo

    backup = _load_the_odds_api_events()

    if backup.get("status") in {
        "live",
        "stale",
        "no_markets",
    }:
        if backup.get("status") in {"live", "stale"}:
            remaining = backup.get(
                "credits_remaining"
            )

            suffix = (
                f" Starter credits remaining: {remaining}."
                if remaining is not None
                else ""
            )

            backup["message"] = (
                "SportsGameOdds is unavailable, so "
                f"{backup.get('message')}{suffix}"
            )

        return backup

    # If both fail, prefer the more actionable backup error.
    return backup


def get_nfl_odds_feed_status():
    result = load_shared_nfl_events()

    return {
        "status": result.get("status"),
        "provider": result.get("provider"),
        "message": result.get("message"),
        "credits_remaining": result.get(
            "credits_remaining"
        ),
    }


# ---------------------------------------------------------------------------
# SportsGameOdds parser
# ---------------------------------------------------------------------------

def _parse_sgo_over_under(
    events,
    stat_id,
    prop_label,
):
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
                        best[1] if best else pd.NA
                    ),
                    "best_over_book": (
                        best[0] if best else None
                    ),
                    "best_over_odds": (
                        best[2] if best else None
                    ),
                    "books_available": len(books),
                    "feed_status": "live",
                    "provider": "SportsGameOdds",
                }
            )

    return pd.DataFrame(rows)


def _parse_sgo_yes_no(
    events,
    stat_id,
    market_label,
):
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

            side = str(
                odd.get("sideID", "")
            ).lower()
            bet_type = str(
                odd.get("betTypeID", "")
            ).lower()

            if stat_id.lower() == "touchdowns":
                if bet_type != "yn" or side != "yes":
                    continue

            if stat_id.lower() == "firsttouchdown":
                if side in {"no", "under"}:
                    continue

            player_name = str(
                odd.get("marketName", "")
            ).strip()

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

            consensus_odds = odd.get(
                "bookOdds"
            )
            fair_odds = odd.get(
                "fairOdds"
            )

            books = [
                bookmaker
                for bookmaker, book
                in (odd.get("byBookmaker") or {}).items()
                if book.get("available")
            ]

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
                    "books_available": len(books),
                    "feed_status": "live",
                    "provider": "SportsGameOdds",
                }
            )

    return pd.DataFrame(rows)


# ---------------------------------------------------------------------------
# The Odds API parser
# ---------------------------------------------------------------------------

ODDS_API_MARKET_MAP = {
    "passing_yards": "player_pass_yds",
    "passing_attempts": "player_pass_attempts",
    "completions": "player_pass_completions",
    "rushing_yards": "player_rush_yds",
    "rushing_attempts": "player_rush_attempts",
    "receiving_yards": "player_reception_yds",
    "receptions": "player_receptions",
}


def _iter_odds_api_markets(events, market_key):
    for event in events:
        matchup = (
            f"{event.get('away_team', '')} @ "
            f"{event.get('home_team', '')}"
        ).strip()

        for bookmaker in event.get(
            "bookmakers",
            [],
        ):
            book_key = (
                bookmaker.get("key")
                or bookmaker.get("title")
                or "unknown"
            )

            for market in bookmaker.get(
                "markets",
                [],
            ):
                if market.get("key") != market_key:
                    continue

                for outcome in market.get(
                    "outcomes",
                    [],
                ):
                    yield (
                        event,
                        matchup,
                        book_key,
                        outcome,
                    )


def _parse_odds_api_over_under(
    events,
    market_key,
):
    raw = []

    for (
        event,
        matchup,
        book_key,
        outcome,
    ) in _iter_odds_api_markets(
        events,
        market_key,
    ):
        if str(
            outcome.get("name", "")
        ).lower() != "over":
            continue

        player = str(
            outcome.get("description", "")
        ).strip()

        line = pd.to_numeric(
            outcome.get("point"),
            errors="coerce",
        )

        if not player or pd.isna(line):
            continue

        raw.append(
            {
                "event_id": event.get("id"),
                "matchup": matchup,
                "player_name": player,
                "market_player_id": player,
                "line": float(line),
                "book": book_key,
                "odds": outcome.get("price"),
            }
        )

    if not raw:
        return pd.DataFrame()

    raw_df = pd.DataFrame(raw)
    rows = []

    for (
        event_id,
        player_name,
    ), group in raw_df.groupby(
        ["event_id", "player_name"],
        dropna=False,
    ):
        lines = pd.to_numeric(
            group["line"],
            errors="coerce",
        ).dropna()

        if lines.empty:
            continue

        best_row = group.loc[
            group["line"].astype(float).idxmin()
        ]

        rows.append(
            {
                "event_id": event_id,
                "matchup": group.iloc[0]["matchup"],
                "player_name": player_name,
                "market_player_id": player_name,
                "consensus_line": round(
                    float(lines.median()),
                    1,
                ),
                "best_over_line": float(
                    best_row["line"]
                ),
                "best_over_book": best_row["book"],
                "best_over_odds": best_row["odds"],
                "books_available": int(
                    group["book"].nunique()
                ),
                "feed_status": "live",
                "provider": "The Odds API",
            }
        )

    return pd.DataFrame(rows)


def _parse_odds_api_yes_no(
    events,
    market_key,
):
    raw = []

    for (
        event,
        matchup,
        book_key,
        outcome,
    ) in _iter_odds_api_markets(
        events,
        market_key,
    ):
        if str(
            outcome.get("name", "")
        ).lower() != "yes":
            continue

        player = str(
            outcome.get("description", "")
        ).strip()

        if not player:
            continue

        price = outcome.get("price")
        implied = (
            _american_to_implied_probability(
                price
            )
        )

        raw.append(
            {
                "event_id": event.get("id"),
                "matchup": matchup,
                "player_name": player,
                "market_player_id": player,
                "book": book_key,
                "price": price,
                "implied": implied,
            }
        )

    if not raw:
        return pd.DataFrame()

    raw_df = pd.DataFrame(raw)
    rows = []

    for (
        event_id,
        player_name,
    ), group in raw_df.groupby(
        ["event_id", "player_name"],
        dropna=False,
    ):
        implied = pd.to_numeric(
            group["implied"],
            errors="coerce",
        ).dropna()

        prices = pd.to_numeric(
            group["price"],
            errors="coerce",
        ).dropna()

        consensus_odds = (
            int(round(float(prices.median())))
            if not prices.empty
            else None
        )

        sportsbook_probability = (
            round(float(implied.median()), 1)
            if not implied.empty
            else pd.NA
        )

        rows.append(
            {
                "event_id": event_id,
                "matchup": group.iloc[0]["matchup"],
                "player_name": player_name,
                "market_player_id": player_name,
                "consensus_odds": consensus_odds,
                "fair_odds": consensus_odds,
                "sportsbook_implied_probability": sportsbook_probability,
                "fair_implied_probability": sportsbook_probability,
                "books_available": int(
                    group["book"].nunique()
                ),
                "feed_status": "live",
                "provider": "The Odds API",
            }
        )

    return pd.DataFrame(rows)


# ---------------------------------------------------------------------------
# Existing public API used by NFL engines
# ---------------------------------------------------------------------------

@st.cache_data(
    ttl=600,
    show_spinner=False,
)
def load_nfl_prop_markets(
    stat_id: str,
    prop_label: str,
) -> pd.DataFrame:
    shared = load_shared_nfl_events()
    events = shared.get("data", [])
    provider = shared.get("provider")

    if not events:
        return pd.DataFrame()

    if provider == "The Odds API":
        market_key = ODDS_API_MARKET_MAP.get(
            stat_id
        )

        if not market_key:
            return pd.DataFrame()

        result = _parse_odds_api_over_under(
            events,
            market_key,
        )
    else:
        result = _parse_sgo_over_under(
            events,
            stat_id,
            prop_label,
        )

    if result.empty:
        return result

    return (
        result.sort_values(
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


@st.cache_data(
    ttl=600,
    show_spinner=False,
)
def load_nfl_yes_no_player_market(
    stat_id: str,
    market_label: str,
) -> pd.DataFrame:
    shared = load_shared_nfl_events()
    events = shared.get("data", [])
    provider = shared.get("provider")

    if not events:
        return pd.DataFrame()

    if provider == "The Odds API":
        market_key = (
            "player_anytime_td"
            if stat_id.lower() == "touchdowns"
            else "player_1st_td"
        )

        result = _parse_odds_api_yes_no(
            events,
            market_key,
        )
    else:
        result = _parse_sgo_yes_no(
            events,
            stat_id,
            market_label,
        )

    if result.empty:
        return result

    return (
        result.sort_values(
            ["matchup", "player_name"]
        )
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
