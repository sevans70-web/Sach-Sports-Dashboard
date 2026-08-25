"""College Football sportsbook market helpers.

Uses the existing SportsGameOdds API key already configured for the dashboard,
but queries the NCAAF league instead of NFL.
"""

import os
import re
from datetime import datetime, timedelta, timezone

import pandas as pd
import requests
import streamlit as st

SGO_EVENTS_URL = "https://api.sportsgameodds.com/v2/events"
CFB_LEAGUE_ID = "NCAAF"

PROP_MAP = {
    "Passing Yards": ("passing_yards", "over"),
    "Rushing Yards": ("rushing_yards", "over"),
    "Receiving Yards": ("receiving_yards", "over"),
    "Receptions": ("receptions", "over"),
    "Anytime TD": ("touchdowns", None),
    "First TD": ("firstTouchdown", None),
}


def _secret(name):
    try:
        value = st.secrets.get(name)
        if value:
            return str(value).strip()
    except Exception:
        pass
    value = os.getenv(name)
    return str(value).strip() if value else None


def _american_to_probability(value):
    try:
        number = float(str(value).replace("+", "").strip())
    except Exception:
        return pd.NA
    if number == 0:
        return pd.NA
    if number > 0:
        p = 100 / (number + 100)
    else:
        p = abs(number) / (abs(number) + 100)
    return round(p * 100, 1)


def _clean_player_name(odd, prop_label):
    candidates = [
        odd.get("statEntityName"),
        odd.get("playerName"),
        odd.get("participantName"),
        odd.get("marketName"),
        odd.get("name"),
    ]
    text = next((str(x).strip() for x in candidates if x), "")
    if not text:
        entity = str(odd.get("statEntityID") or "")
        text = entity.replace("_NCAAF", "").replace("_", " ").title()

    patterns = [
        rf"\s+{re.escape(prop_label)}\s+Over/Under$",
        rf"\s+{re.escape(prop_label)}$",
        r"\s+Over/Under$",
        r"\s+Over$",
        r"\s+Under$",
    ]
    for pattern in patterns:
        text = re.sub(pattern, "", text, flags=re.I)
    return text.strip()


def _event_matchup(event):
    teams = event.get("teams") or {}
    away = (
        event.get("awayTeamName")
        or event.get("awayTeam")
        or (teams.get("away") or {}).get("name")
        or (teams.get("away") or {}).get("displayName")
    )
    home = (
        event.get("homeTeamName")
        or event.get("homeTeam")
        or (teams.get("home") or {}).get("name")
        or (teams.get("home") or {}).get("displayName")
    )
    if away and home:
        return f"{away} @ {home}"

    name = event.get("name") or event.get("eventName") or ""
    return str(name)


def _event_odds(event):
    raw = event.get("odds") or event.get("markets") or []
    if isinstance(raw, dict):
        values = []
        for key, value in raw.items():
            if isinstance(value, dict):
                item = dict(value)
                item.setdefault("oddID", key)
                values.append(item)
            elif isinstance(value, list):
                values.extend([x for x in value if isinstance(x, dict)])
        return values
    if isinstance(raw, list):
        return [x for x in raw if isinstance(x, dict)]
    return []


@st.cache_data(ttl=600, show_spinner=False)
def load_cfb_events():
    api_key = _secret("SPORTSGAMEODDS_API_KEY")
    if not api_key:
        return {
            "status": "not_configured",
            "provider": "SportsGameOdds",
            "message": "SportsGameOdds API key is not configured.",
            "events": [],
        }

    now = datetime.now(timezone.utc)
    try:
        response = requests.get(
            SGO_EVENTS_URL,
            headers={"x-api-key": api_key},
            params={
                "leagueID": CFB_LEAGUE_ID,
                "oddsAvailable": "true",
                "finalized": "false",
                "startsAfter": (now - timedelta(hours=6)).isoformat().replace("+00:00", "Z"),
                "startsBefore": (now + timedelta(days=10)).isoformat().replace("+00:00", "Z"),
                "limit": 100,
            },
            timeout=30,
        )

        if response.status_code == 429:
            return {
                "status": "rate_limited",
                "provider": "SportsGameOdds",
                "message": "SportsGameOdds is temporarily rate-limited.",
                "events": [],
            }

        response.raise_for_status()
        payload = response.json()
        events = payload.get("data") or []

        return {
            "status": "live" if events else "empty",
            "provider": "SportsGameOdds",
            "message": (
                "Live NCAAF sportsbook markets connected."
                if events
                else "No NCAAF sportsbook markets are posted yet."
            ),
            "events": events,
        }
    except Exception as exc:
        return {
            "status": "error",
            "provider": "SportsGameOdds",
            "message": f"SportsGameOdds NCAAF feed error: {exc}",
            "events": [],
        }


def get_cfb_odds_feed_status():
    feed = load_cfb_events()
    return {
        "status": feed.get("status"),
        "provider": feed.get("provider"),
        "message": feed.get("message"),
    }


@st.cache_data(ttl=600, show_spinner=False)
def load_cfb_prop_markets(prop_label):
    if prop_label not in PROP_MAP:
        return pd.DataFrame()

    stat_id, required_side = PROP_MAP[prop_label]
    feed = load_cfb_events()
    rows = []

    for event in feed.get("events", []):
        matchup = _event_matchup(event)
        event_id = event.get("eventID") or event.get("id")

        for odd in _event_odds(event):
            odd_stat = str(odd.get("statID") or odd.get("statId") or "").lower()
            if odd_stat != stat_id.lower():
                continue

            entity = str(odd.get("statEntityID") or "")
            if entity.lower() in {"", "all", "home", "away"}:
                continue

            side = str(odd.get("sideID") or odd.get("side") or "").lower()
            if required_side and side != required_side:
                continue

            # Touchdown markets may be encoded as yes/over/anytime depending on book.
            if prop_label in {"Anytime TD", "First TD"} and side in {"no", "under"}:
                continue

            player_name = _clean_player_name(odd, prop_label)
            if not player_name:
                continue

            line = pd.to_numeric(odd.get("bookOverUnder"), errors="coerce")
            odds_value = odd.get("bookOdds")
            fair_odds = odd.get("fairOdds")
            probability = _american_to_probability(fair_odds if fair_odds is not None else odds_value)

            books = odd.get("byBookmaker") or {}
            bookmaker_count = len(books) if isinstance(books, dict) else 0

            rows.append(
                {
                    "event_id": event_id,
                    "matchup": matchup,
                    "player_name": player_name,
                    "market_player_id": odd.get("playerID") or entity,
                    "consensus_line": line,
                    "consensus_odds": odds_value,
                    "fair_odds": fair_odds,
                    "sportsbook_implied_probability": probability,
                    "bookmaker_count": bookmaker_count,
                    "prop": prop_label,
                }
            )

    if not rows:
        return pd.DataFrame()

    df = pd.DataFrame(rows)

    # Multiple books/market records can exist for the same player.
    df["sportsbook_implied_probability"] = pd.to_numeric(
        df["sportsbook_implied_probability"], errors="coerce"
    )
    df["consensus_line"] = pd.to_numeric(df["consensus_line"], errors="coerce")

    grouped = []
    for (player_id, player_name, matchup), group in df.groupby(
        ["market_player_id", "player_name", "matchup"], dropna=False
    ):
        probs = group["sportsbook_implied_probability"].dropna()
        lines = group["consensus_line"].dropna()

        row = group.iloc[0].to_dict()
        row["sportsbook_implied_probability"] = round(float(probs.median()), 1) if not probs.empty else pd.NA
        row["consensus_line"] = round(float(lines.median()), 1) if not lines.empty else pd.NA
        row["bookmaker_count"] = int(group["bookmaker_count"].max()) if not group.empty else 0
        grouped.append(row)

    result = pd.DataFrame(grouped)

    # First usable CFB ranking mode: sportsbook market probability.
    # This is deliberately labelled Market Foundation until the college
    # statistical projection engine is attached.
    result = result.sort_values(
        ["sportsbook_implied_probability", "consensus_line"],
        ascending=[False, False],
        na_position="last",
    ).head(25).reset_index(drop=True)
    result["rank"] = range(1, len(result) + 1)
    result["ranking_mode"] = "Market Foundation"
    return result
