"""CFB player intelligence.

Preferred path: cached sportsbook markets + ESPN statistics.
Immediate fallback: ESPN season leaders + current CFB schedule, producing clearly
labelled model projections when sportsbook lines are unavailable.
"""
from __future__ import annotations

import re
import unicodedata
from datetime import datetime, timedelta, timezone

import pandas as pd
import requests
import streamlit as st

from data.cfb_odds import load_cfb_prop_markets

ESPN_SEARCH = "https://site.web.api.espn.com/apis/search/v2"
ESPN_WEB_BASE = "https://site.web.api.espn.com/apis/common/v3/sports/football/college-football/athletes"
ESPN_SCOREBOARD = "https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard"
ESPN_CORE = "https://sports.core.api.espn.com/v2/sports/football/leagues/college-football"
CURRENT_SEASON = 2026
FOUNDATION_SEASON = 2025

PROP_STAT_KEYS = {
    "Passing Yards": ("passingYards", "passing_yards", "passYards", "YDS"),
    "Pass Incompletions": ("passingIncompletions", "passIncompletions", "incompletions", "INC"),
    "Rushing Yards": ("rushingYards", "rushing_yards", "rushYards", "YDS"),
    "Rushing Attempts": ("rushingAttempts", "rushing_attempts", "carries", "CAR"),
    "Receiving Yards": ("receivingYards", "receiving_yards", "recYards", "YDS"),
    "Receptions": ("receptions", "receivingReceptions", "REC"),
    "Anytime TD": ("totalTouchdowns", "rushingTouchdowns", "receivingTouchdowns", "TD"),
    "First TD": ("totalTouchdowns", "rushingTouchdowns", "receivingTouchdowns", "TD"),
}

LEADER_ALIASES = {
    "Passing Yards": ("passingYards",),
    "Pass Incompletions": ("passingIncompletions", "passIncompletions", "incompletions"),
    "Rushing Yards": ("rushingYards",),
    "Rushing Attempts": ("rushingAttempts", "carries"),
    "Receiving Yards": ("receivingYards",),
    "Receptions": ("receptions", "receivingReceptions"),
    "Anytime TD": ("totalTouchdowns", "rushingTouchdowns", "receivingTouchdowns"),
    "First TD": ("totalTouchdowns", "rushingTouchdowns", "receivingTouchdowns"),
}

# ESPN does not publish a standalone national leader category for every prop.
# Use a verified position-appropriate leader pool, then read the requested stat
# from each athlete's ESPN season statistics.
FALLBACK_LEADER_POOLS = {
    "Passing Yards": ("Passing Yards",),
    "Pass Incompletions": ("Passing Yards",),
    "Rushing Yards": ("Rushing Yards",),
    "Rushing Attempts": ("Rushing Yards",),
    "Receiving Yards": ("Receiving Yards",),
    "Receptions": ("Receiving Yards",),
    "Anytime TD": ("Anytime TD", "Rushing Yards", "Receiving Yards"),
    "First TD": ("Anytime TD", "Rushing Yards", "Receiving Yards"),
}


def _norm(value):
    text = unicodedata.normalize("NFKD", str(value or ""))
    text = "".join(c for c in text if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]", "", text.lower())


def _number(value):
    try:
        return float(str(value).replace(",", "").strip())
    except Exception:
        return None


def _walk(obj):
    if isinstance(obj, dict):
        yield obj
        for value in obj.values():
            yield from _walk(value)
    elif isinstance(obj, list):
        for value in obj:
            yield from _walk(value)


def _ref_id(ref, token):
    m = re.search(rf"/{re.escape(token)}/([^/?]+)", str(ref or ""))
    return m.group(1) if m else None


@st.cache_data(ttl=86400, show_spinner=False)
def _espn_player_search(player_name):
    try:
        response = requests.get(ESPN_SEARCH, params={"query": player_name, "limit": 12, "sport": "football"}, timeout=15)
        response.raise_for_status()
        payload = response.json()
    except Exception:
        return None
    target = _norm(player_name)
    candidates = []
    for node in _walk(payload):
        name = node.get("displayName") or node.get("name") or node.get("title") or node.get("fullName")
        athlete_id = node.get("id")
        if not name or not athlete_id:
            continue
        score = 100 if _norm(name) == target else (50 if target in _norm(name) or _norm(name) in target else 0)
        if score:
            candidates.append((score, str(athlete_id), str(name)))
    if not candidates:
        return None
    candidates.sort(reverse=True)
    score, athlete_id, display_name = candidates[0]
    return {"id": athlete_id, "display_name": display_name, "score": score}


@st.cache_data(ttl=21600, show_spinner=False)
def _espn_stats_payload(athlete_id, season):
    if not athlete_id:
        return {}
    for url in [f"{ESPN_WEB_BASE}/{athlete_id}/stats", f"{ESPN_WEB_BASE}/{athlete_id}/overview"]:
        try:
            response = requests.get(url, params={"season": season, "seasontype": 2}, timeout=15)
            if response.ok and response.json():
                return response.json()
        except Exception:
            continue
    return {}


@st.cache_data(ttl=21600, show_spinner=False)
def _athlete_identity(athlete_id, season):
    try:
        r = requests.get(f"{ESPN_CORE}/seasons/{season}/athletes/{athlete_id}", timeout=15)
        if not r.ok:
            return {}
        x = r.json() or {}
        team_ref = ((x.get("team") or {}).get("$ref") or "")
        return {
            "player_name": x.get("fullName") or x.get("displayName") or x.get("shortName") or f"Player {athlete_id}",
            "team_id": _ref_id(team_ref, "teams"),
            "headshot": ((x.get("headshot") or {}).get("href") or ""),
            "position": ((x.get("position") or {}).get("abbreviation") or ""),
        }
    except Exception:
        return {}


@st.cache_data(ttl=1800, show_spinner=False)
def _upcoming_team_map():
    now = datetime.now(timezone.utc)
    end = now + timedelta(days=14)
    try:
        r = requests.get(
            ESPN_SCOREBOARD,
            params={
                "groups": 80,
                "limit": 300,
                "dates": f"{now.strftime('%Y%m%d')}-{end.strftime('%Y%m%d')}",
            },
            timeout=20,
        )
        r.raise_for_status()
        payload = r.json()
    except Exception:
        return {}

    out = {}
    for event in payload.get("events", []) or []:
        comp = (event.get("competitions") or [{}])[0]
        competitors = comp.get("competitors") or []
        home = next((x for x in competitors if x.get("homeAway") == "home"), {})
        away = next((x for x in competitors if x.get("homeAway") == "away"), {})
        ht, at = home.get("team") or {}, away.get("team") or {}
        hid, aid = str(ht.get("id") or ""), str(at.get("id") or "")
        matchup = f"{at.get('displayName') or 'Away'} @ {ht.get('displayName') or 'Home'}"
        kickoff = event.get("date")
        if hid:
            out[hid] = {"matchup": matchup, "kickoff": kickoff, "opponent_id": aid}
        if aid:
            out[aid] = {"matchup": matchup, "kickoff": kickoff, "opponent_id": hid}
    return out


@st.cache_data(ttl=1800, show_spinner=False)
def _completed_team_games_map(season):
    """Count completed regular-season games for each FBS team in one ESPN call."""
    now = datetime.now(timezone.utc)
    start = datetime(season, 8, 1, tzinfo=timezone.utc)
    try:
        r = requests.get(
            ESPN_SCOREBOARD,
            params={
                "groups": 80,
                "limit": 1000,
                "dates": f"{start.strftime('%Y%m%d')}-{now.strftime('%Y%m%d')}",
            },
            timeout=25,
        )
        r.raise_for_status()
        payload = r.json() or {}
    except Exception:
        return {}

    counts = {}
    for event in payload.get("events", []) or []:
        status_type = ((event.get("status") or {}).get("type") or {})
        if not status_type.get("completed"):
            continue
        comp = (event.get("competitions") or [{}])[0]
        for competitor in comp.get("competitors") or []:
            team_id = str(((competitor.get("team") or {}).get("id") or ""))
            if team_id:
                counts[team_id] = counts.get(team_id, 0) + 1
    return counts


@st.cache_data(ttl=21600, show_spinner=False)
def _season_leaders(season):
    try:
        r = requests.get(f"{ESPN_CORE}/seasons/{season}/types/2/leaders", params={"limit": 100}, timeout=20)
        r.raise_for_status()
        return r.json() or {}
    except Exception:
        return {}


def _extract_games(payload):
    best = None
    for node in _walk(payload):
        for key in ("gamesPlayed", "games", "GP"):
            if key in node:
                value = _number(node.get(key))
                if value is not None and 0 < value <= 20:
                    best = value if best is None else max(best, value)
    return best


def _extract_named_stat(payload, wanted_keys):
    wanted = {_norm(x) for x in wanted_keys}
    found = []
    for node in _walk(payload):
        for key, value in node.items():
            if _norm(key) in wanted:
                number = _number(value)
                if number is not None:
                    found.append(number)
        label = node.get("name") or node.get("displayName") or node.get("abbreviation") or node.get("label")
        if label and _norm(label) in wanted:
            for value_key in ("value", "displayValue", "statValue"):
                number = _number(node.get(value_key))
                if number is not None:
                    found.append(number)
    return max(found) if found else None


def _extract_prop_total(payload, prop):
    if prop == "Pass Incompletions":
        direct = _extract_named_stat(payload, PROP_STAT_KEYS[prop])
        if direct is not None:
            return direct
        attempts = _extract_named_stat(payload, ("passingAttempts", "passing_attempts", "passAttempts", "ATT"))
        completions = _extract_named_stat(payload, ("completions", "passingCompletions", "CMP"))
        if attempts is not None and completions is not None and attempts >= completions:
            return attempts - completions
        return None
    if prop in {"Anytime TD", "First TD"}:
        total = _extract_named_stat(payload, ("totalTouchdowns", "total_tds", "TD"))
        rush = _extract_named_stat(payload, ("rushingTouchdowns", "rushTD", "rushing_tds"))
        rec = _extract_named_stat(payload, ("receivingTouchdowns", "recTD", "receiving_tds"))
        if rush is not None or rec is not None:
            combined = (rush or 0) + (rec or 0)
            if total is None or combined > total:
                return combined
        return total
    return _extract_named_stat(payload, PROP_STAT_KEYS[prop])


def _expected_per_game(prop, season_total, games):
    if season_total is None or not games:
        return None
    return season_total / games


def _line_edge(prop, per_game, line):
    if per_game is None:
        return None
    if prop in {"Anytime TD", "First TD"}:
        return max(-1.0, min(1.0, per_game - 0.5))
    if line is None or line <= 0:
        return None
    return max(-1.0, min(1.0, (per_game - line) / line))


def _model_probability(market_probability, edge, games):
    market = market_probability if market_probability is not None else 50.0
    if edge is None:
        return round(market, 1)
    sample = min(1.0, max(0.35, (games or 0) / 10.0))
    return round(max(25.0, min(78.0, market + edge * 18.0 * sample)), 1)


def _gi_score(model_probability, market_probability, edge, books, verified):
    market = market_probability if market_probability is not None else 50.0
    model = model_probability if model_probability is not None else market
    agreement = max(0.0, 100.0 - abs(model - market) * 3.0)
    edge_component = 50.0 if edge is None else max(0.0, min(100.0, 50.0 + edge * 100.0))
    book_component = min(100.0, max(20.0, float(books or 0) * 20.0))
    score = model * 0.45 + edge_component * 0.30 + agreement * 0.15 + book_component * 0.10 if verified else market * 0.70 + book_component * 0.30
    return round(max(1.0, min(99.0, score)), 1)


def _why_market(prop, verified, season, total, games, per_game, line, model_probability, market_probability):
    if not verified:
        return "Market-backed ranking. ESPN player statistics were not verified, so no statistical projection was invented."
    production = f"{total:.0f} TDs in {games:.0f} games ({per_game:.2f}/game)" if prop in {"Anytime TD", "First TD"} else f"{total:.0f} in {games:.0f} games ({per_game:.1f}/game)"
    line_text = f" versus a {line:.1f} market line" if line is not None and not pd.isna(line) else ""
    return f"{season} ESPN production: {production}{line_text}. Model probability {model_probability:.1f}% vs market {market_probability:.1f}%."


def _leader_candidates(prop):
    """Build model-only candidates from ESPN stats when sportsbook markets are unavailable.

    Secondary props (pass incompletions and receptions) intentionally use
    the matching yardage leader pool to discover players, then pull or derive the requested
    stat from the athlete's ESPN season stat page. This avoids empty tabs when ESPN
    does not expose a national leader category for that secondary stat.
    """
    team_map = _upcoming_team_map()
    if not team_map:
        return pd.DataFrame()

    chosen_season = CURRENT_SEASON
    games_by_team = _completed_team_games_map(chosen_season)

    def collect(season):
        payload = _season_leaders(season)
        categories = payload.get("categories") or []
        wanted_props = FALLBACK_LEADER_POOLS.get(prop, (prop,))
        wanted_alias_sets = []
        for source_prop in wanted_props:
            aliases = {_norm(x) for x in LEADER_ALIASES.get(source_prop, ())}
            wanted_alias_sets.append((source_prop, aliases))

        found = []
        for cat in categories:
            cat_norm = _norm(cat.get("name") or cat.get("displayName"))
            for source_prop, aliases in wanted_alias_sets:
                if cat_norm in aliases or any(a in cat_norm or cat_norm in a for a in aliases):
                    for leader in cat.get("leaders") or []:
                        found.append((leader, source_prop))
                    break
        return found

    selected = collect(chosen_season)
    if not selected:
        chosen_season = FOUNDATION_SEASON
        games_by_team = _completed_team_games_map(chosen_season)
        selected = collect(chosen_season)

    rows, seen = [], set()
    for leader, source_prop in selected:
        athlete_ref = ((leader.get("athlete") or {}).get("$ref") or "")
        team_ref = ((leader.get("team") or {}).get("$ref") or "")
        athlete_id = _ref_id(athlete_ref, "athletes")
        team_id = _ref_id(team_ref, "teams")
        if not athlete_id:
            continue

        identity = _athlete_identity(athlete_id, chosen_season)
        team_id = team_id or identity.get("team_id")
        if not team_id or str(team_id) not in team_map:
            continue

        dedupe_key = (athlete_id, prop)
        if dedupe_key in seen:
            continue

        stats = _espn_stats_payload(athlete_id, chosen_season)
        total = _extract_prop_total(stats, prop) if stats else None

        # Only use the leader value directly when that leader category is the same
        # stat we are ranking. Never treat passing yards as passing attempts, etc.
        if total is None and source_prop == prop:
            total = _number(leader.get("value"))
        if total is None:
            continue

        games = _extract_games(stats) if stats else None
        if not games and chosen_season == CURRENT_SEASON:
            games = games_by_team.get(str(team_id))
        if not games or games <= 0:
            # A season total without a game count must not be displayed as a per-game
            # projection. Skip it rather than inventing a denominator.
            continue

        per_game = _expected_per_game(prop, total, games)
        if per_game is None:
            continue

        seen.add(dedupe_key)
        rows.append({
            "event_id": None,
            "matchup": team_map[str(team_id)]["matchup"],
            "kickoff": team_map[str(team_id)].get("kickoff"),
            "player_name": identity.get("player_name") or f"Player {athlete_id}",
            "market_player_id": athlete_id,
            "espn_athlete_id": athlete_id,
            "position": identity.get("position") or "",
            "headshot": identity.get("headshot") or "",
            "consensus_line": per_game,
            "consensus_odds": None,
            "fair_odds": None,
            "sportsbook_implied_probability": pd.NA,
            "bookmaker_count": 0,
            "stats_verified": True,
            "stats_season": chosen_season,
            "season_total": total,
            "games_played": games,
            "per_game": per_game,
        })

    if not rows:
        return pd.DataFrame()

    df = pd.DataFrame(rows)
    df["projection_value"] = pd.to_numeric(df["per_game"], errors="coerce")
    df = df.sort_values(
        ["projection_value", "season_total"],
        ascending=[False, False],
        na_position="last",
    ).head(25).reset_index(drop=True)
    n = max(len(df), 1)

    # Confidence is a model-ranking confidence, not a sportsbook probability.
    df["model_probability"] = [
        round(max(52.0, 72.0 - (i * 16.0 / max(1, n - 1))), 1) for i in range(n)
    ]
    df["gi_score"] = [
        round(max(55.0, 88.0 - (i * 24.0 / max(1, n - 1))), 1) for i in range(n)
    ]
    df["line_edge"] = pd.NA
    df["ranking_mode"] = "Model Projection"
    df["line_type"] = "projection"
    df["rank"] = range(1, n + 1)

    def why(row):
        gp = int(row.get("games_played") or 0)
        pg = float(row.get("per_game"))
        total = float(row.get("season_total"))
        unit = "TDs" if prop in {"Anytime TD", "First TD"} else prop.lower()
        first_td = (
            " First-touchdown ordering is model-only until a sportsbook line is available."
            if prop == "First TD"
            else ""
        )
        return (
            f"Sportsbook data is unavailable, so this ranking uses verified {int(row['stats_season'])} "
            f"ESPN production: {total:.0f} {unit} across {gp} games ({pg:.1f}/game). "
            f"No sportsbook line or odds were invented.{first_td}"
        )

    df["why_engine"] = df.apply(why, axis=1)
    return df


@st.cache_data(ttl=1800, show_spinner=False)
def build_cfb_rankings(prop):
    markets = load_cfb_prop_markets(prop)
    if markets is None or markets.empty:
        return _leader_candidates(prop)

    rows = []
    for _, market in markets.iterrows():
        player_name = market.get("player_name")
        search = _espn_player_search(player_name)
        athlete_id = search.get("id") if search else None
        payload = _espn_stats_payload(athlete_id, FOUNDATION_SEASON) if athlete_id else {}
        total = _extract_prop_total(payload, prop) if payload else None
        games = _extract_games(payload) if payload else None
        verified = total is not None and games is not None and games > 0
        per_game = _expected_per_game(prop, total, games) if verified else None
        line_value = _number(market.get("consensus_line"))
        edge = _line_edge(prop, per_game, line_value)
        market_probability = _number(market.get("sportsbook_implied_probability")) or 50.0
        model_probability = _model_probability(market_probability, edge, games)
        gi = _gi_score(model_probability, market_probability, edge, market.get("bookmaker_count"), verified)
        row = market.to_dict()
        row.update({
            "espn_athlete_id": athlete_id,
            "stats_verified": verified,
            "stats_season": FOUNDATION_SEASON if verified else None,
            "season_total": total,
            "games_played": games,
            "per_game": per_game,
            "line_edge": edge,
            "model_probability": model_probability,
            "gi_score": gi,
            "ranking_mode": "CFB Intelligence" if verified else "Market Foundation",
            "line_type": "market",
            "why_engine": _why_market(prop, verified, FOUNDATION_SEASON, total, games, per_game, line_value, model_probability, market_probability),
        })
        rows.append(row)

    result = pd.DataFrame(rows)
    result = result.sort_values(["gi_score", "model_probability", "sportsbook_implied_probability"], ascending=[False, False, False], na_position="last").head(25).reset_index(drop=True)
    result["rank"] = range(1, len(result) + 1)
    return result
