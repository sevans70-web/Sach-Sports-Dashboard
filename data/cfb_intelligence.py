"""CFB player intelligence layer.

Uses the live CFB sportsbook market as the candidate set and ESPN college-football
player statistics as the performance foundation. Before the 2026 regular season
has meaningful data, 2025 season production is used automatically.

No synthetic player statistics are created. If ESPN cannot verify a player's
statistics, the row remains market-only and is labelled accordingly.
"""

import math
import re
import unicodedata

import pandas as pd
import requests
import streamlit as st

from data.cfb_odds import load_cfb_prop_markets

ESPN_SEARCH = "https://site.api.espn.com/apis/search/v2"
ESPN_WEB_BASE = "https://site.web.api.espn.com/apis/common/v3/sports/football/college-football/athletes"
CURRENT_SEASON = 2026
FOUNDATION_SEASON = 2025

PROP_STAT_KEYS = {
    "Passing Yards": ("passingYards", "passing_yards", "passYards", "YDS"),
    "Rushing Yards": ("rushingYards", "rushing_yards", "rushYards", "YDS"),
    "Receiving Yards": ("receivingYards", "receiving_yards", "recYards", "YDS"),
    "Receptions": ("receptions", "receivingReceptions", "REC"),
    "Anytime TD": ("rushingTouchdowns", "receivingTouchdowns", "totalTouchdowns", "TD"),
    "First TD": ("rushingTouchdowns", "receivingTouchdowns", "totalTouchdowns", "TD"),
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


@st.cache_data(ttl=86400, show_spinner=False)
def _espn_player_search(player_name):
    try:
        response = requests.get(
            ESPN_SEARCH,
            params={"query": player_name, "limit": 12},
            timeout=15,
        )
        response.raise_for_status()
        payload = response.json()
    except Exception:
        return None

    target = _norm(player_name)
    candidates = []

    for node in _walk(payload):
        name = (
            node.get("displayName")
            or node.get("name")
            or node.get("title")
            or node.get("fullName")
        )
        athlete_id = node.get("id")
        if not name or not athlete_id:
            continue

        node_text = str(node).lower()
        if "football" not in node_text:
            continue

        score = 0
        candidate_norm = _norm(name)
        if candidate_norm == target:
            score += 100
        elif target in candidate_norm or candidate_norm in target:
            score += 50
        if "college" in node_text or "ncaaf" in node_text:
            score += 20

        if score:
            candidates.append((score, str(athlete_id), str(name)))

    if not candidates:
        return None

    candidates.sort(reverse=True)
    score, athlete_id, display_name = candidates[0]
    return {"id": athlete_id, "display_name": display_name, "score": score}


@st.cache_data(ttl=21600, show_spinner=False)
def _espn_stats_payload(athlete_id, season):
    urls = [
        f"{ESPN_WEB_BASE}/{athlete_id}/stats",
        f"{ESPN_WEB_BASE}/{athlete_id}/overview",
    ]
    for url in urls:
        try:
            response = requests.get(
                url,
                params={"season": season, "seasontype": 2},
                timeout=15,
            )
            if response.ok:
                payload = response.json()
                if payload:
                    return payload
        except Exception:
            continue
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
        # Direct dictionary keys.
        for key, value in node.items():
            if _norm(key) in wanted:
                number = _number(value)
                if number is not None:
                    found.append(number)

        # ESPN often represents a stat as {name/displayName/abbreviation, value}.
        label = (
            node.get("name")
            or node.get("displayName")
            or node.get("abbreviation")
            or node.get("label")
        )
        if label and _norm(label) in wanted:
            for value_key in ("value", "displayValue", "statValue"):
                number = _number(node.get(value_key))
                if number is not None:
                    found.append(number)

    return max(found) if found else None


def _extract_prop_total(payload, prop):
    keys = PROP_STAT_KEYS[prop]

    if prop in {"Anytime TD", "First TD"}:
        # Prefer explicit total TD; otherwise combine rushing + receiving TDs.
        total = _extract_named_stat(payload, ("totalTouchdowns", "total_tds", "TD"))
        rush = _extract_named_stat(payload, ("rushingTouchdowns", "rushTD", "rushing_tds"))
        rec = _extract_named_stat(payload, ("receivingTouchdowns", "recTD", "receiving_tds"))
        if rush is not None or rec is not None:
            combined = (rush or 0) + (rec or 0)
            if total is None or combined > total:
                return combined
        return total

    return _extract_named_stat(payload, keys)


def _expected_per_game(prop, season_total, games):
    if season_total is None or not games:
        return None
    return season_total / games


def _line_edge(prop, per_game, line):
    if per_game is None:
        return None
    if prop in {"Anytime TD", "First TD"}:
        # TD production is already per-game probability-like evidence.
        return max(-1.0, min(1.0, per_game - 0.5))
    if line is None or line <= 0:
        return None
    return max(-1.0, min(1.0, (per_game - line) / line))


def _model_probability(market_probability, edge, games):
    market = market_probability if market_probability is not None else 50.0
    if edge is None:
        return round(market, 1)

    sample = min(1.0, max(0.35, (games or 0) / 10.0))
    adjustment = edge * 18.0 * sample
    return round(max(25.0, min(78.0, market + adjustment)), 1)


def _gi_score(model_probability, market_probability, edge, books, verified):
    market = market_probability if market_probability is not None else 50.0
    model = model_probability if model_probability is not None else market
    agreement = max(0.0, 100.0 - abs(model - market) * 3.0)
    edge_component = 50.0 if edge is None else max(0.0, min(100.0, 50.0 + edge * 100.0))
    book_component = min(100.0, max(20.0, float(books or 0) * 20.0))

    if verified:
        score = model * 0.45 + edge_component * 0.30 + agreement * 0.15 + book_component * 0.10
    else:
        score = market * 0.70 + book_component * 0.30

    return round(max(1.0, min(99.0, score)), 1)


def _why(prop, verified, season, total, games, per_game, line, model_probability, market_probability):
    if not verified:
        return (
            "Market-backed ranking. ESPN player statistics were not verified for this player, "
            "so the model did not invent a statistical projection."
        )

    if prop in {"Anytime TD", "First TD"}:
        production = f"{total:.0f} TDs in {games:.0f} games ({per_game:.2f}/game)"
    else:
        production = f"{total:.0f} in {games:.0f} games ({per_game:.1f}/game)"

    line_text = f" versus a {line:.1f} market line" if line is not None and not pd.isna(line) else ""
    return (
        f"{season} ESPN production: {production}{line_text}. "
        f"Model probability {model_probability:.1f}% vs market {market_probability:.1f}%."
    )


@st.cache_data(ttl=1800, show_spinner=False)
def build_cfb_rankings(prop):
    markets = load_cfb_prop_markets(prop)
    if markets.empty:
        return markets

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

        market_probability = _number(market.get("sportsbook_implied_probability"))
        if market_probability is None:
            market_probability = 50.0

        model_probability = _model_probability(market_probability, edge, games)
        gi = _gi_score(
            model_probability,
            market_probability,
            edge,
            market.get("bookmaker_count"),
            verified,
        )

        row = market.to_dict()
        row.update(
            {
                "espn_athlete_id": athlete_id,
                "stats_verified": verified,
                "stats_season": FOUNDATION_SEASON if verified else None,
                "season_total": total,
                "games_played": games,
                "per_game": per_game,
                "line_edge": edge,
                "model_probability": model_probability,
                "gi_score": gi,
                "why_engine": _why(
                    prop,
                    verified,
                    FOUNDATION_SEASON,
                    total,
                    games,
                    per_game,
                    line_value,
                    model_probability,
                    market_probability,
                ),
            }
        )
        rows.append(row)

    result = pd.DataFrame(rows)
    result = result.sort_values(
        ["gi_score", "model_probability", "sportsbook_implied_probability"],
        ascending=[False, False, False],
        na_position="last",
    ).head(25).reset_index(drop=True)
    result["rank"] = range(1, len(result) + 1)
    result["ranking_mode"] = result["stats_verified"].map(
        {True: "CFB Intelligence", False: "Market Foundation"}
    )
    return result
