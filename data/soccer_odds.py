"""Soccer player-prop market feed via SportsGameOdds.

The page must remain usable if the provider rate-limits or temporarily fails.
No placeholders or fabricated sportsbook lines are produced.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pandas as pd
import requests
import streamlit as st

SGO_EVENTS_URL = "https://api.sportsgameodds.com/v2/events"

SGO_LEAGUE_IDS = {
    "Premier League": "EPL",
    "MLS": "MLS",
    "Champions League": "UEFA_CHAMPIONS_LEAGUE",
    "La Liga": "LA_LIGA",
    "Serie A": "IT_SERIE_A",
    "Bundesliga": "BUNDESLIGA",
    "Ligue 1": "FR_LIGUE_1",
}

PROP_STAT_IDS = {
    "Shots on Target": "shots_onGoal",
    "Shots": "shots",
    "Goalkeeper Saves": "goalie_saves",
    "Goals": "points",
    "Assists": "assists",
}

MARKET_COLUMNS = [
    "event_id",
    "league",
    "matchup",
    "start_time",
    "prop",
    "player_id",
    "player_name",
    "line",
    "consensus_odds",
    "market_probability",
    "books_available",
    "market_name",
    "provider",
]


def _empty_market_frame(status: str = "") -> pd.DataFrame:
    df = pd.DataFrame(columns=MARKET_COLUMNS)
    df.attrs["status"] = status
    return df


def market_feed_status(df: pd.DataFrame) -> str:
    return str(getattr(df, "attrs", {}).get("status") or "")


def _secret(name: str):
    try:
        return st.secrets.get(name)
    except Exception:
        return None


def _num(value):
    try:
        if value is None or value == "":
            return None
        return float(value)
    except Exception:
        return None


def _american_implied(value):
    try:
        x = float(value)
    except Exception:
        return None

    if x == 0:
        return None
    if x > 0:
        return 100.0 / (x + 100.0) * 100.0

    return (-x) / ((-x) + 100.0) * 100.0


def _team_name(block):
    if not isinstance(block, dict):
        return ""

    names = block.get("names") or {}
    return (
        names.get("long")
        or names.get("medium")
        or names.get("short")
        or block.get("name")
        or ""
    )


def _player_name(event, player_id, market_name=""):
    players = event.get("players") or {}

    if isinstance(players, dict):
        p = players.get(player_id)
        if isinstance(p, dict):
            return (
                p.get("name")
                or p.get("displayName")
                or " ".join(
                    x
                    for x in [
                        p.get("firstName"),
                        p.get("lastName"),
                    ]
                    if x
                ).strip()
            )

        for node in players.values():
            if (
                isinstance(node, dict)
                and str(node.get("playerID") or "")
                == str(player_id)
            ):
                return (
                    node.get("name")
                    or node.get("displayName")
                    or " ".join(
                        x
                        for x in [
                            node.get("firstName"),
                            node.get("lastName"),
                        ]
                        if x
                    ).strip()
                )

    if market_name:
        markers = [
            " Shots On Goal",
            " Shots",
            " Saves",
            " Assists",
            " Any Goals",
            " Goals",
            " Over/Under",
        ]
        text = str(market_name)
        for marker in markers:
            if marker in text:
                candidate = text.split(marker, 1)[0].strip()
                if candidate:
                    return candidate

    return str(player_id or "").replace("_", " ").title()


def _best_over_line(odd):
    consensus_line = _num(
        odd.get("bookOverUnder")
        or odd.get("fairOverUnder")
    )
    consensus_odds = (
        odd.get("bookOdds")
        or odd.get("fairOdds")
    )

    books = odd.get("byBookmaker") or {}
    active = []

    for book, row in books.items():
        if (
            not isinstance(row, dict)
            or not row.get("available", True)
        ):
            continue

        active.append((
            book,
            _num(row.get("overUnder")),
            row.get("odds"),
        ))

    if consensus_line is None:
        lines = [x[1] for x in active if x[1] is not None]
        if lines:
            consensus_line = float(
                pd.Series(lines).median()
            )

    if consensus_odds in (None, ""):
        prices = []
        for _, _, odds in active:
            try:
                prices.append(float(odds))
            except Exception:
                pass

        if prices:
            consensus_odds = str(
                int(
                    round(
                        float(pd.Series(prices).median())
                    )
                )
            )

    return consensus_line, consensus_odds, len(active)


@st.cache_data(ttl=1800, show_spinner=False)
def load_soccer_prop_markets(
    league_name: str,
) -> pd.DataFrame:
    api_key = _secret("SPORTSGAMEODDS_API_KEY")
    if not api_key:
        return _empty_market_frame("missing_key")

    league_id = SGO_LEAGUE_IDS.get(league_name)
    if not league_id:
        return _empty_market_frame("unsupported_league")

    now = datetime.now(timezone.utc)
    params = {
        "leagueID": league_id,
        "oddsAvailable": "true",
        "finalized": "false",
        "startsAfter": (
            now - timedelta(hours=2)
        ).isoformat().replace("+00:00", "Z"),
        "startsBefore": (
            now + timedelta(days=7)
        ).isoformat().replace("+00:00", "Z"),
        "includeOpposingOdds": "false",
        "includeAltLines": "false",
        "limit": 25,
    }

    try:
        response = requests.get(
            SGO_EVENTS_URL,
            headers={"x-api-key": api_key},
            params=params,
            timeout=25,
        )

        if response.status_code == 429:
            return _empty_market_frame("rate_limited")

        response.raise_for_status()
        payload = response.json()

        if not payload.get("success", True):
            return _empty_market_frame("provider_error")

    except requests.RequestException:
        return _empty_market_frame("provider_error")
    except Exception:
        return _empty_market_frame("provider_error")

    rows = []

    for event in payload.get("data") or []:
        teams = event.get("teams") or {}
        home = _team_name(teams.get("home") or {})
        away = _team_name(teams.get("away") or {})
        matchup = f"{away} @ {home}".strip(" @")
        event_id = str(event.get("eventID") or "")
        start_time = pd.to_datetime(
            event.get("startTime")
            or event.get("startsAt"),
            errors="coerce",
            utc=True,
        )

        for _, odd in (event.get("odds") or {}).items():
            if not isinstance(odd, dict):
                continue

            stat_id = str(odd.get("statID") or "")
            entity_id = str(
                odd.get("statEntityID")
                or odd.get("playerID")
                or ""
            )
            period_id = str(odd.get("periodID") or "")
            bet_type = str(odd.get("betTypeID") or "")
            side = str(odd.get("sideID") or "").lower()

            if (
                not entity_id
                or entity_id in {"home", "away", "all"}
                or period_id != "game"
            ):
                continue

            prop = next(
                (
                    p
                    for p, sid in PROP_STAT_IDS.items()
                    if sid == stat_id
                ),
                None,
            )
            if not prop:
                continue

            if prop == "Goals":
                if not (
                    bet_type == "yn"
                    and side == "yes"
                ):
                    continue

                line = 0.5
                consensus_odds = (
                    odd.get("bookOdds")
                    or odd.get("fairOdds")
                )
                books_available = len([
                    1
                    for x in (
                        odd.get("byBookmaker") or {}
                    ).values()
                    if (
                        isinstance(x, dict)
                        and x.get("available", True)
                    )
                ])
            else:
                if not (
                    bet_type == "ou"
                    and side == "over"
                ):
                    continue

                (
                    line,
                    consensus_odds,
                    books_available,
                ) = _best_over_line(odd)

                if line is None:
                    continue

            probability = _american_implied(
                odd.get("fairOdds")
                or consensus_odds
            )

            rows.append({
                "event_id": event_id,
                "league": league_name,
                "matchup": matchup,
                "start_time": start_time,
                "prop": prop,
                "player_id": entity_id,
                "player_name": _player_name(
                    event,
                    entity_id,
                    odd.get("marketName") or "",
                ),
                "line": float(line),
                "consensus_odds": consensus_odds,
                "market_probability": probability,
                "books_available": int(
                    books_available
                ),
                "market_name": (
                    odd.get("marketName") or ""
                ),
                "provider": "SportsGameOdds",
            })

    if not rows:
        return _empty_market_frame("no_markets")

    df = pd.DataFrame(rows)
    df = df.drop_duplicates(
        subset=[
            "event_id",
            "prop",
            "player_id",
            "line",
        ],
        keep="first",
    ).reset_index(drop=True)

    df.attrs["status"] = "ok"
    return df
