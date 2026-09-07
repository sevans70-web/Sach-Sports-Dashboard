"""College Football sportsbook provider layer.

Primary: SportsGameOdds
Backup: The Odds API
Last resort: last successful local snapshot

This file is intentionally CFB-only. It never reuses NFL events or NFL prop rows.
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


SGO_EVENTS_URL = "https://api.sportsgameodds.com/v2/events"
SGO_LEAGUE_ID = "NCAAF"

ODDS_API_BASE = "https://api.the-odds-api.com/v4"
ODDS_API_SPORT = "americanfootball_ncaaf"
ODDS_API_REGION = "us"

PROP_MAP = {
    "Passing Yards": {
        "sgo_stat": "passing_yards",
        "odds_market": "player_pass_yds",
        "side": "over",
    },
    "Passing Attempts": {
        "sgo_stat": "passing_attempts",
        "odds_market": "player_pass_attempts",
        "side": "over",
    },
    "Completions": {
        "sgo_stat": "completions",
        "odds_market": "player_pass_completions",
        "side": "over",
    },
    "Rushing Yards": {
        "sgo_stat": "rushing_yards",
        "odds_market": "player_rush_yds",
        "side": "over",
    },
    "Rushing Attempts": {
        "sgo_stat": "rushing_attempts",
        "odds_market": "player_rush_attempts",
        "side": "over",
    },
    "Receiving Yards": {
        "sgo_stat": "receiving_yards",
        "odds_market": "player_reception_yds",
        "side": "over",
    },
    "Receptions": {
        "sgo_stat": "receptions",
        "odds_market": "player_receptions",
        "side": "over",
    },
    "Anytime TD": {
        "sgo_stat": "touchdowns",
        "odds_market": "player_anytime_td",
        "side": None,
    },
    "First TD": {
        "sgo_stat": "firstTouchdown",
        "odds_market": "player_1st_td",
        "side": None,
    },
}

SGO_TTL = 600
ODDS_TTL = 21600
RATE_LIMIT_COOLDOWN = 65

SGO_SNAPSHOT = Path("/tmp/sach_cfb_sgo_events.json")
ODDS_SNAPSHOT = Path("/tmp/sach_cfb_odds_api_events.json")


def _secret(name):
    try:
        value = st.secrets.get(name)
        if value:
            return str(value).strip()
    except Exception:
        pass
    value = os.getenv(name)
    return str(value).strip() if value else None


def _read_json(path):
    try:
        if path.exists():
            return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        pass
    return None


def _write_json(path, payload):
    try:
        path.write_text(json.dumps(payload), encoding="utf-8")
    except Exception:
        pass


@st.cache_resource
def _state():
    return {"sgo_retry": 0.0, "odds_retry": 0.0}


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


def _clean_player_name(text, prop_label):
    text = str(text or "").strip()
    for pattern in [
        rf"\s+{re.escape(prop_label)}\s+Over/Under$",
        rf"\s+{re.escape(prop_label)}$",
        r"\s+Over/Under$",
        r"\s+Over$",
        r"\s+Under$",
    ]:
        text = re.sub(pattern, "", text, flags=re.I)
    return text.strip()


@st.cache_data(ttl=SGO_TTL, show_spinner=False)
def _load_sgo():
    key = _secret("SPORTSGAMEODDS_API_KEY")
    if not key:
        return {"status": "not_configured", "provider": "SportsGameOdds", "data": [], "message": "SportsGameOdds is not configured."}

    state = _state()
    if time.time() < state["sgo_retry"]:
        stale = _read_json(SGO_SNAPSHOT)
        if stale:
            return {"status": "stale", "provider": "SportsGameOdds", "data": stale.get("data", []), "message": "Using the last successful SportsGameOdds CFB snapshot."}
        return {"status": "rate_limited", "provider": "SportsGameOdds", "data": [], "message": "SportsGameOdds is cooling down after a rate limit."}

    now = datetime.now(timezone.utc)
    try:
        response = requests.get(
            SGO_EVENTS_URL,
            headers={"x-api-key": key},
            params={
                "leagueID": SGO_LEAGUE_ID,
                "oddsAvailable": "true",
                "finalized": "false",
                "startsAfter": (now - timedelta(hours=6)).isoformat().replace("+00:00", "Z"),
                "startsBefore": (now + timedelta(days=10)).isoformat().replace("+00:00", "Z"),
                "limit": 100,
            },
            timeout=30,
        )
        if response.status_code == 429:
            try:
                wait = max(int(float(response.headers.get("Retry-After", RATE_LIMIT_COOLDOWN))), 1)
            except Exception:
                wait = RATE_LIMIT_COOLDOWN
            state["sgo_retry"] = time.time() + wait
            stale = _read_json(SGO_SNAPSHOT)
            if stale:
                return {"status": "stale", "provider": "SportsGameOdds", "data": stale.get("data", []), "message": "SportsGameOdds is rate-limited; using the last successful CFB snapshot."}
            return {"status": "rate_limited", "provider": "SportsGameOdds", "data": [], "message": "SportsGameOdds is temporarily rate-limited."}

        response.raise_for_status()
        payload = response.json()
        events = payload.get("data") or []
        if events:
            _write_json(SGO_SNAPSHOT, {"data": events})
            return {"status": "live", "provider": "SportsGameOdds", "data": events, "message": "Live CFB markets connected via SportsGameOdds."}
        return {"status": "empty", "provider": "SportsGameOdds", "data": [], "message": "SportsGameOdds has no current CFB prop markets."}
    except Exception as exc:
        stale = _read_json(SGO_SNAPSHOT)
        if stale:
            return {"status": "stale", "provider": "SportsGameOdds", "data": stale.get("data", []), "message": "SportsGameOdds is unavailable; using the last successful CFB snapshot."}
        return {"status": "error", "provider": "SportsGameOdds", "data": [], "message": f"SportsGameOdds CFB error: {exc}"}


@st.cache_data(ttl=ODDS_TTL, show_spinner=False)
def _load_odds_api():
    key = _secret("THE_ODDS_API_KEY")
    if not key:
        return {"status": "not_configured", "provider": "The Odds API", "data": [], "message": "The Odds API is not configured."}

    state = _state()
    if time.time() < state["odds_retry"]:
        stale = _read_json(ODDS_SNAPSHOT)
        if stale:
            return {"status": "stale", "provider": "The Odds API", "data": stale.get("data", []), "message": "Using the last successful CFB backup snapshot."}
        return {"status": "rate_limited", "provider": "The Odds API", "data": [], "message": "The Odds API is temporarily rate-limited."}

    try:
        events_response = requests.get(
            f"{ODDS_API_BASE}/sports/{ODDS_API_SPORT}/events",
            params={"apiKey": key, "dateFormat": "iso"},
            timeout=30,
        )
        events_response.raise_for_status()
        events = events_response.json()

        now = datetime.now(timezone.utc)
        cutoff = now + timedelta(days=10)
        upcoming = []
        for event in events:
            try:
                commence = datetime.fromisoformat(str(event.get("commence_time")).replace("Z", "+00:00"))
            except Exception:
                continue
            if now - timedelta(hours=6) <= commence <= cutoff:
                upcoming.append(event)

        markets = ",".join(sorted({v["odds_market"] for v in PROP_MAP.values()}))
        collected = []
        credits_remaining = None

        for event in upcoming:
            event_id = event.get("id")
            if not event_id:
                continue

            response = requests.get(
                f"{ODDS_API_BASE}/sports/{ODDS_API_SPORT}/events/{event_id}/odds",
                params={
                    "apiKey": key,
                    "regions": ODDS_API_REGION,
                    "markets": markets,
                    "oddsFormat": "american",
                    "dateFormat": "iso",
                },
                timeout=30,
            )

            remaining = response.headers.get("x-requests-remaining")
            if remaining is not None:
                try:
                    credits_remaining = int(float(remaining))
                except Exception:
                    pass

            if response.status_code == 429:
                state["odds_retry"] = time.time() + RATE_LIMIT_COOLDOWN
                break
            if response.status_code == 422:
                continue
            if response.status_code in {401, 403}:
                return {"status": "auth_error", "provider": "The Odds API", "data": [], "message": "The Odds API rejected THE_ODDS_API_KEY."}

            response.raise_for_status()
            payload = response.json()
            if payload.get("bookmakers"):
                collected.append(payload)

            if credits_remaining is not None and credits_remaining < 12:
                break

        if collected:
            _write_json(ODDS_SNAPSHOT, {"data": collected})
            return {"status": "live", "provider": "The Odds API", "data": collected, "message": "Live CFB backup markets connected via The Odds API."}

        stale = _read_json(ODDS_SNAPSHOT)
        if stale:
            return {"status": "stale", "provider": "The Odds API", "data": stale.get("data", []), "message": "No fresh backup markets were returned; using the last successful CFB backup snapshot."}

        return {"status": "empty", "provider": "The Odds API", "data": [], "message": "No CFB player-prop markets are posted by the backup provider yet."}
    except Exception as exc:
        stale = _read_json(ODDS_SNAPSHOT)
        if stale:
            return {"status": "stale", "provider": "The Odds API", "data": stale.get("data", []), "message": "The Odds API is unavailable; using the last successful CFB backup snapshot."}
        return {"status": "error", "provider": "The Odds API", "data": [], "message": f"The Odds API CFB error: {exc}"}


@st.cache_data(ttl=600, show_spinner=False)
def load_shared_cfb_events():
    primary = _load_sgo()
    if primary.get("data"):
        return primary

    backup = _load_odds_api()
    if backup.get("data"):
        return backup

    # Prefer the backup's actionable message when both are empty/unavailable.
    return backup if backup.get("status") != "not_configured" else primary


def get_cfb_odds_feed_status():
    result = load_shared_cfb_events()
    return {
        "status": result.get("status"),
        "provider": result.get("provider"),
        "message": result.get("message"),
    }


def _sgo_event_odds(event):
    raw = event.get("odds") or event.get("markets") or []
    if isinstance(raw, dict):
        values = []
        for key, value in raw.items():
            if isinstance(value, dict):
                item = dict(value)
                item.setdefault("oddID", key)
                values.append(item)
            elif isinstance(value, list):
                values.extend(x for x in value if isinstance(x, dict))
        return values
    return [x for x in raw if isinstance(x, dict)] if isinstance(raw, list) else []


def _sgo_matchup(event):
    away, home = _event_team_names(event)
    if away and home:
        return f"{away} @ {home}"
    return str(event.get("name") or event.get("eventName") or "")


def _normalize_sgo(events, prop_label):
    config = PROP_MAP[prop_label]
    rows = []
    for event in events:
        matchup = _sgo_matchup(event)
        for odd in _sgo_event_odds(event):
            stat_id = str(odd.get("statID") or odd.get("statId") or "").lower()
            if stat_id != config["sgo_stat"].lower():
                continue

            entity = str(odd.get("statEntityID") or "")
            if entity.lower() in {"", "all", "home", "away"}:
                continue

            side = str(odd.get("sideID") or odd.get("side") or "").lower()
            if config["side"] and side != config["side"]:
                continue
            if prop_label in {"Anytime TD", "First TD"} and side in {"no", "under"}:
                continue

            name = (
                odd.get("statEntityName")
                or odd.get("playerName")
                or odd.get("participantName")
                or odd.get("marketName")
                or entity.replace("_NCAAF", "").replace("_", " ").title()
            )
            name = _clean_player_name(name, prop_label)
            if not name:
                continue

            odds_value = odd.get("bookOdds")
            fair_odds = odd.get("fairOdds")
            books = odd.get("byBookmaker") or {}
            rows.append({
                "event_id": event.get("eventID") or event.get("id"),
                "matchup": matchup,
                "player_name": name,
                "market_player_id": odd.get("playerID") or entity,
                "consensus_line": pd.to_numeric(odd.get("bookOverUnder"), errors="coerce"),
                "consensus_odds": odds_value,
                "fair_odds": fair_odds,
                "sportsbook_implied_probability": _american_to_probability(fair_odds if fair_odds is not None else odds_value),
                "bookmaker_count": len(books) if isinstance(books, dict) else 0,
            })
    return pd.DataFrame(rows)


def _normalize_odds_api(events, prop_label):
    market_key = PROP_MAP[prop_label]["odds_market"]
    raw_rows = []

    for event in events:
        matchup = f"{event.get('away_team', '')} @ {event.get('home_team', '')}".strip()
        for bookmaker in event.get("bookmakers") or []:
            for market in bookmaker.get("markets") or []:
                if market.get("key") != market_key:
                    continue
                for outcome in market.get("outcomes") or []:
                    outcome_name = str(outcome.get("name") or "")
                    description = str(outcome.get("description") or "")

                    if prop_label not in {"Anytime TD", "First TD"} and outcome_name.lower() != "over":
                        continue
                    if prop_label in {"Anytime TD", "First TD"} and outcome_name.lower() in {"no", "under"}:
                        continue

                    player = description or outcome_name
                    player = _clean_player_name(player, prop_label)
                    if not player:
                        continue

                    raw_rows.append({
                        "event_id": event.get("id"),
                        "matchup": matchup,
                        "player_name": player,
                        "market_player_id": player.lower(),
                        "consensus_line": pd.to_numeric(outcome.get("point"), errors="coerce"),
                        "price": pd.to_numeric(outcome.get("price"), errors="coerce"),
                        "book": bookmaker.get("key"),
                    })

    if not raw_rows:
        return pd.DataFrame()

    raw = pd.DataFrame(raw_rows)
    rows = []
    for (event_id, matchup, player_id, player), group in raw.groupby(
        ["event_id", "matchup", "market_player_id", "player_name"], dropna=False
    ):
        prices = group["price"].dropna()
        lines = group["consensus_line"].dropna()
        consensus_odds = int(round(float(prices.median()))) if not prices.empty else None
        rows.append({
            "event_id": event_id,
            "matchup": matchup,
            "player_name": player,
            "market_player_id": player_id,
            "consensus_line": round(float(lines.median()), 1) if not lines.empty else pd.NA,
            "consensus_odds": consensus_odds,
            "fair_odds": None,
            "sportsbook_implied_probability": _american_to_probability(consensus_odds),
            "bookmaker_count": int(group["book"].nunique()),
        })
    return pd.DataFrame(rows)



def _team_match_key(value):
    """Loose team-name key used only to join sportsbook events to ESPN schedule rows."""
    text = re.sub(r"[^a-z0-9]+", " ", str(value or "").lower()).strip()
    stop = {
        "university", "college", "state", "the", "football",
        "wildcats", "tigers", "bulldogs", "eagles", "bears", "cougars",
        "cardinals", "huskies", "mustangs", "rebels", "aggies", "trojans",
        "panthers", "knights", "warriors", "broncos", "hawks", "owls",
        "rams", "wolves", "cowboys", "mountaineers", "spartans", "gators",
        "seminoles", "hurricanes", "longhorns", "sooners", "volunteers",
        "nittany", "lions", "hoosiers", "buckeyes", "wolverines", "utes",
        "vandals", "miners", "mean", "green", "paladins", "red", "raiders",
        "jayhawks", "fighting", "irish", "badgers", "beavers", "ducks",
    }
    words = [w for w in text.split() if w not in stop]
    return " ".join(words) or text


def _event_team_names(event):
    """Extract sportsbook team names from either SportsGameOdds or The Odds API."""
    teams = event.get("teams") or {}

    def _nested_name(side):
        item = teams.get(side) or {}
        if not isinstance(item, dict):
            return ""
        names = item.get("names") or {}
        if isinstance(names, dict):
            for key in ("long", "medium", "short"):
                if names.get(key):
                    return str(names.get(key)).strip()
        for key in ("name", "displayName", "teamName"):
            if item.get(key):
                return str(item.get(key)).strip()
        return ""

    away = (
        event.get("awayTeamName") or event.get("away_team")
        or _nested_name("away")
    )
    home = (
        event.get("homeTeamName") or event.get("home_team")
        or _nested_name("home")
    )

    # Some provider payloads expose awayTeam/homeTeam as objects rather than strings.
    if isinstance(event.get("awayTeam"), str) and not away:
        away = event.get("awayTeam")
    if isinstance(event.get("homeTeam"), str) and not home:
        home = event.get("homeTeam")

    return str(away or "").strip(), str(home or "").strip()


def _sgo_event_has_supported_player_prop(event):
    supported = {str(v["sgo_stat"]).lower() for v in PROP_MAP.values()}
    for odd in _sgo_event_odds(event):
        stat_id = str(odd.get("statID") or odd.get("statId") or "").lower()
        if stat_id not in supported:
            continue
        entity = str(odd.get("statEntityID") or "").strip().lower()
        if entity in {"", "all", "home", "away"}:
            continue
        # Require an actual posted line/price/book record, not only an event shell.
        if (
            odd.get("bookOdds") is not None
            or odd.get("fairOdds") is not None
            or odd.get("bookOverUnder") is not None
            or bool(odd.get("byBookmaker"))
        ):
            return True
    return False


def _odds_api_event_has_supported_player_prop(event):
    supported = {v["odds_market"] for v in PROP_MAP.values()}
    for bookmaker in event.get("bookmakers") or []:
        for market in bookmaker.get("markets") or []:
            if market.get("key") not in supported:
                continue
            if any((outcome.get("description") or outcome.get("name")) for outcome in market.get("outcomes") or []):
                return True
    return False


@st.cache_data(ttl=600, show_spinner=False)
def load_cfb_prop_eligible_games():
    """Return sportsbook CFB matchups that currently have supported player props."""
    shared = load_shared_cfb_events()
    provider = shared.get("provider")
    eligible = []
    for event in shared.get("data") or []:
        has_props = (
            _odds_api_event_has_supported_player_prop(event)
            if provider == "The Odds API"
            else _sgo_event_has_supported_player_prop(event)
        )
        if not has_props:
            continue
        away, home = _event_team_names(event)
        if away and home:
            eligible.append({
                "event_id": str(event.get("eventID") or event.get("id") or ""),
                "away_team": away,
                "home_team": home,
                "away_key": _team_match_key(away),
                "home_key": _team_match_key(home),
            })
    return eligible


def cfb_game_has_player_props(away_team, home_team, eligible_games=None):
    """True only when the sportsbook feed has a supported player prop for this matchup."""
    eligible_games = load_cfb_prop_eligible_games() if eligible_games is None else eligible_games
    away_key = _team_match_key(away_team)
    home_key = _team_match_key(home_team)
    for item in eligible_games:
        ea = item.get("away_key") or ""
        eh = item.get("home_key") or ""
        away_ok = away_key == ea or (away_key and ea and (away_key in ea or ea in away_key))
        home_ok = home_key == eh or (home_key and eh and (home_key in eh or eh in home_key))
        if away_ok and home_ok:
            return True
    return False

@st.cache_data(ttl=600, show_spinner=False)
def load_cfb_prop_markets(prop_label):
    if prop_label not in PROP_MAP:
        return pd.DataFrame()

    shared = load_shared_cfb_events()
    provider = shared.get("provider")
    events = shared.get("data") or []

    if not events:
        return pd.DataFrame()

    if provider == "The Odds API":
        df = _normalize_odds_api(events, prop_label)
    else:
        df = _normalize_sgo(events, prop_label)

    if df.empty:
        return df

    df["sportsbook_implied_probability"] = pd.to_numeric(
        df["sportsbook_implied_probability"], errors="coerce"
    )
    df["consensus_line"] = pd.to_numeric(df["consensus_line"], errors="coerce")

    # Collapse duplicate SportsGameOdds records if necessary.
    grouped = []
    for (player_id, player_name, matchup), group in df.groupby(
        ["market_player_id", "player_name", "matchup"], dropna=False
    ):
        row = group.iloc[0].to_dict()
        probs = group["sportsbook_implied_probability"].dropna()
        lines = group["consensus_line"].dropna()
        row["sportsbook_implied_probability"] = round(float(probs.median()), 1) if not probs.empty else pd.NA
        row["consensus_line"] = round(float(lines.median()), 1) if not lines.empty else pd.NA
        row["bookmaker_count"] = int(pd.to_numeric(group["bookmaker_count"], errors="coerce").fillna(0).max())
        row["provider"] = provider
        grouped.append(row)

    result = pd.DataFrame(grouped)
    result = result.sort_values(
        ["sportsbook_implied_probability", "consensus_line"],
        ascending=[False, False],
        na_position="last",
    ).head(25).reset_index(drop=True)
    result["rank"] = range(1, len(result) + 1)
    result["ranking_mode"] = "Market Foundation"
    return result
