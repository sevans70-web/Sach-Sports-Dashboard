"""NFL Anytime TD and First TD scoring foundation."""

import math
import re
import unicodedata

import pandas as pd
import streamlit as st

from data.nfl_odds import (
    load_nfl_anytime_td_markets,
    load_nfl_first_td_markets,
)
from data.nfl_player_baseline import get_prop_eligible_player_baseline
from data.nfl_stats import load_nfl_weekly_player_stats


ROSTER_SEASON = 2026
BASELINE_SEASON = 2025


def _normalize_name(value) -> str:
    if value is None or pd.isna(value):
        return ""

    text = unicodedata.normalize("NFKD", str(value))
    text = "".join(
        character
        for character in text
        if not unicodedata.combining(character)
    )
    text = text.lower().strip()
    text = re.sub(r"[^a-z0-9\s]", " ", text)
    text = re.sub(
        r"\b(junior|jr|senior|sr|ii|iii|iv)\b",
        "",
        text,
    )
    return " ".join(text.split())


@st.cache_data(ttl=21600, show_spinner=False)
def build_td_foundation(
    roster_season: int = ROSTER_SEASON,
    baseline_season: int = BASELINE_SEASON,
) -> pd.DataFrame:
    """
    Build a preliminary player touchdown-scoring baseline.

    This is intentionally labeled foundation logic. Historical grading and
    current-season role/red-zone data will later calibrate the probabilities.
    """

    players = get_prop_eligible_player_baseline(
        roster_season=roster_season,
        baseline_season=baseline_season,
    ).copy()

    players = players[
        players["position"].isin(["QB", "RB", "WR", "TE"])
    ].copy()

    for column in [
        "rushing_tds",
        "receiving_tds",
        "carries",
        "targets",
        "games_played",
    ]:
        players[column] = pd.to_numeric(
            players.get(column),
            errors="coerce",
        )

    players["total_tds"] = (
        players["rushing_tds"].fillna(0)
        + players["receiving_tds"].fillna(0)
    )

    players["tds_per_game"] = (
        players["total_tds"]
        / players["games_played"].replace(0, pd.NA)
    )

    weekly = load_nfl_weekly_player_stats(
        baseline_season
    ).copy()

    weekly["week"] = pd.to_numeric(
        weekly["week"],
        errors="coerce",
    )
    weekly["rushing_tds"] = pd.to_numeric(
        weekly["rushing_tds"],
        errors="coerce",
    ).fillna(0)
    weekly["receiving_tds"] = pd.to_numeric(
        weekly["receiving_tds"],
        errors="coerce",
    ).fillna(0)
    weekly["weekly_tds"] = (
        weekly["rushing_tds"]
        + weekly["receiving_tds"]
    )

    recent_rows = []

    for player_id, group in weekly.groupby("player_id"):
        group = group.sort_values("week")
        last_5 = group.tail(5)
        last_3 = group.tail(3)

        recent_rows.append(
            {
                "player_id": player_id,
                "last_5_tds_per_game": (
                    last_5["weekly_tds"].mean()
                    if not last_5.empty
                    else pd.NA
                ),
                "last_3_tds_per_game": (
                    last_3["weekly_tds"].mean()
                    if not last_3.empty
                    else pd.NA
                ),
            }
        )

    recent = pd.DataFrame(recent_rows)

    if not recent.empty:
        players = players.merge(
            recent,
            on="player_id",
            how="left",
            validate="one_to_one",
        )

    players["td_rate_projection"] = players.apply(
        _weighted_td_rate,
        axis=1,
    )

    # Poisson-style probability of at least one TD.
    players["anytime_td_probability"] = players[
        "td_rate_projection"
    ].apply(
        lambda value: (
            pd.NA
            if value is None or pd.isna(value)
            else round(
                (1.0 - math.exp(-max(float(value), 0.0))) * 100.0,
                1,
            )
        )
    )

    # First TD is a much narrower event. Until drive-level/red-zone usage
    # is connected, use a conservative share of the anytime probability.
    players["first_td_probability"] = players[
        "anytime_td_probability"
    ].apply(
        lambda value: (
            pd.NA
            if value is None or pd.isna(value)
            else round(float(value) * 0.28, 1)
        )
    )

    players["td_data_status"] = players.apply(
        _data_status,
        axis=1,
    )

    return players.reset_index(drop=True)


def _weighted_td_rate(row):
    values = [
        (row.get("tds_per_game"), 0.55),
        (row.get("last_5_tds_per_game"), 0.25),
        (row.get("last_3_tds_per_game"), 0.20),
    ]

    total = 0.0
    weight_total = 0.0

    for value, weight in values:
        if value is not None and not pd.isna(value):
            total += float(value) * weight
            weight_total += weight

    if weight_total == 0:
        return pd.NA

    return round(total / weight_total, 3)


def _data_status(row):
    games = row.get("games_played")
    opportunities = (
        (0 if pd.isna(row.get("carries")) else float(row.get("carries")))
        + (0 if pd.isna(row.get("targets")) else float(row.get("targets")))
    )

    if games is None or pd.isna(games):
        return "No prior NFL baseline"

    if float(games) < 4 or opportunities < 15:
        return "Limited baseline"

    return "Established baseline"


def _prepare_market(markets):
    if markets is None or markets.empty:
        return pd.DataFrame()

    result = markets.copy()
    result["player_name_key"] = result[
        "player_name"
    ].apply(_normalize_name)

    result["books_available"] = pd.to_numeric(
        result.get("books_available"),
        errors="coerce",
    ).fillna(0)

    return (
        result.sort_values(
            ["player_name_key", "books_available"],
            ascending=[True, False],
        )
        .drop_duplicates(
            subset=["player_name_key"],
            keep="first",
        )
        .reset_index(drop=True)
    )


def _attach_market(
    foundation: pd.DataFrame,
    markets: pd.DataFrame,
    probability_column: str,
) -> pd.DataFrame:
    if foundation.empty:
        return foundation.copy()

    result = foundation.copy()
    result["player_name_key"] = result[
        "player_name"
    ].apply(_normalize_name)

    markets = _prepare_market(markets)

    if markets.empty:
        result["market_match_status"] = "No live market"
        result["consensus_odds"] = None
        result["sportsbook_implied_probability"] = pd.NA
        result["model_probability"] = pd.to_numeric(
            result[probability_column],
            errors="coerce",
        )
        result["probability_edge"] = pd.NA
        return result

    result = result.merge(
        markets[
            [
                "player_name_key",
                "consensus_odds",
                "fair_odds",
                "sportsbook_implied_probability",
                "fair_implied_probability",
                "books_available",
                "matchup",
                "market_player_id",
                "feed_status",
            ]
        ],
        on="player_name_key",
        how="left",
        validate="many_to_one",
    )

    result["market_match_status"] = result[
        "consensus_odds"
    ].apply(
        lambda value: (
            "Matched"
            if value not in (None, "")
            and not pd.isna(value)
            else "No live market"
        )
    )

    result["model_probability"] = pd.to_numeric(
        result[probability_column],
        errors="coerce",
    )

    result["probability_edge"] = (
        result["model_probability"]
        - pd.to_numeric(
            result["sportsbook_implied_probability"],
            errors="coerce",
        )
    ).round(1)

    return result.drop(
        columns=["player_name_key"],
        errors="ignore",
    )


def _rank(df: pd.DataFrame, limit: int = 25) -> pd.DataFrame:
    if df is None or df.empty:
        return pd.DataFrame()

    ranked = df[
        (df["market_match_status"] == "Matched")
        & (df["td_data_status"] == "Established baseline")
        & df["model_probability"].notna()
    ].copy()

    if ranked.empty:
        return ranked

    ranked = (
        ranked.sort_values(
            ["model_probability", "probability_edge"],
            ascending=[False, False],
            na_position="last",
        )
        .drop_duplicates(
            subset=["player_id"],
            keep="first",
        )
        .head(limit)
        .reset_index(drop=True)
    )

    ranked.insert(0, "rank", ranked.index + 1)
    return ranked


def build_anytime_td_top25(
    roster_season: int = ROSTER_SEASON,
    baseline_season: int = BASELINE_SEASON,
) -> pd.DataFrame:
    foundation = build_td_foundation(
        roster_season,
        baseline_season,
    )
    joined = _attach_market(
        foundation,
        load_nfl_anytime_td_markets(),
        "anytime_td_probability",
    )
    return _rank(joined, 25)


def build_first_td_top25(
    roster_season: int = ROSTER_SEASON,
    baseline_season: int = BASELINE_SEASON,
) -> pd.DataFrame:
    foundation = build_td_foundation(
        roster_season,
        baseline_season,
    )
    joined = _attach_market(
        foundation,
        load_nfl_first_td_markets(),
        "first_td_probability",
    )
    return _rank(joined, 25)
