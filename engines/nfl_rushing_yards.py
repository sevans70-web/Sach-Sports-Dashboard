"""NFL Rushing Yards projection, market, probability and Top 25 ranking."""

import math
import re
import unicodedata

import pandas as pd
import streamlit as st

from data.nfl_odds import load_nfl_rushing_yards_markets
from data.nfl_player_baseline import get_prop_eligible_player_baseline
from data.nfl_stats import load_nfl_weekly_player_stats


ROSTER_SEASON = 2026
BASELINE_SEASON = 2025
DEFAULT_RUSHING_VOLATILITY = 22.0


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
def build_rushing_yards_foundation(
    roster_season: int = ROSTER_SEASON,
    baseline_season: int = BASELINE_SEASON,
) -> pd.DataFrame:
    """Build current-roster rushing baselines from the prior season."""

    players = get_prop_eligible_player_baseline(
        roster_season=roster_season,
        baseline_season=baseline_season,
    ).copy()

    players = players[
        players["position"].isin(["QB", "RB", "WR"])
    ].copy()

    weekly = load_nfl_weekly_player_stats(
        baseline_season
    ).copy()

    weekly["week"] = pd.to_numeric(
        weekly["week"],
        errors="coerce",
    )
    weekly["carries"] = pd.to_numeric(
        weekly["carries"],
        errors="coerce",
    ).fillna(0)
    weekly["rushing_yards"] = pd.to_numeric(
        weekly["rushing_yards"],
        errors="coerce",
    ).fillna(0)

    recent_rows = []

    for player_id, group in weekly.groupby("player_id"):
        group = group.sort_values("week")
        last_5 = group.tail(5)
        last_3 = group.tail(3)

        recent_rows.append(
            {
                "player_id": player_id,
                "last_5_rushing_yards_per_game": (
                    last_5["rushing_yards"].mean()
                    if not last_5.empty
                    else pd.NA
                ),
                "last_3_rushing_yards_per_game": (
                    last_3["rushing_yards"].mean()
                    if not last_3.empty
                    else pd.NA
                ),
                "last_5_carries_per_game": (
                    last_5["carries"].mean()
                    if not last_5.empty
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

    players["rushing_yards_per_game"] = pd.to_numeric(
        players.get("rushing_yards_per_game"),
        errors="coerce",
    )

    players["rushing_baseline_projection"] = players.apply(
        _baseline_projection,
        axis=1,
    )

    players["rushing_data_status"] = players.apply(
        _data_status,
        axis=1,
    )

    return players.reset_index(drop=True)


def _baseline_projection(row):
    season_avg = row.get("rushing_yards_per_game")
    last_5 = row.get("last_5_rushing_yards_per_game")
    last_3 = row.get("last_3_rushing_yards_per_game")

    values = [
        (season_avg, 0.55),
        (last_5, 0.25),
        (last_3, 0.20),
    ]

    weighted = 0.0
    total_weight = 0.0

    for value, weight in values:
        if value is not None and not pd.isna(value):
            weighted += float(value) * weight
            total_weight += weight

    if total_weight == 0:
        return pd.NA

    return round(weighted / total_weight, 1)


def _data_status(row):
    games = pd.to_numeric(
        pd.Series([row.get("games_played")]),
        errors="coerce",
    ).iloc[0]

    carries = pd.to_numeric(
        pd.Series([row.get("carries")]),
        errors="coerce",
    ).iloc[0]

    if pd.isna(games):
        return "No prior NFL baseline"

    if (
        (pd.notna(games) and float(games) < 4)
        or (pd.notna(carries) and float(carries) < 20)
    ):
        return "Limited baseline"

    return "Established baseline"


def _prepare_market():
    markets = load_nfl_rushing_yards_markets().copy()

    if markets.empty:
        return markets

    markets["player_name_key"] = markets[
        "player_name"
    ].apply(_normalize_name)

    markets["books_available"] = pd.to_numeric(
        markets["books_available"],
        errors="coerce",
    ).fillna(0)

    return (
        markets.sort_values(
            ["player_name_key", "books_available"],
            ascending=[True, False],
        )
        .drop_duplicates(
            subset=["player_name_key"],
            keep="first",
        )
        .reset_index(drop=True)
    )


def attach_rushing_market(df: pd.DataFrame) -> pd.DataFrame:
    if df.empty:
        return df.copy()

    result = df.copy()
    result["player_name_key"] = result[
        "player_name"
    ].apply(_normalize_name)

    # Keep a stable projection schema even when no sportsbook market is posted.
    result["rushing_projection"] = pd.to_numeric(
        result.get("rushing_baseline_projection"),
        errors="coerce",
    )

    markets = _prepare_market()

    if markets.empty:
        result["consensus_line"] = pd.NA
        result["best_over_line"] = pd.NA
        result["best_over_book"] = pd.NA
        result["best_over_odds"] = pd.NA
        result["books_available"] = 0
        result["matchup"] = pd.NA
        result["market_player_id"] = pd.NA
        result["market_match_status"] = "No live market"
        result["projection_edge_yards"] = pd.NA
        return result.drop(columns=["player_name_key"], errors="ignore")

    result = result.merge(
        markets[
            [
                "player_name_key",
                "consensus_line",
                "best_over_line",
                "best_over_book",
                "best_over_odds",
                "books_available",
                "matchup",
                "market_player_id",
            ]
        ],
        on="player_name_key",
        how="left",
        validate="many_to_one",
    )

    result["market_match_status"] = result[
        "consensus_line"
    ].apply(
        lambda value: (
            "Matched"
            if value is not None
            and not pd.isna(value)
            else "No live market"
        )
    )

    result["rushing_projection"] = pd.to_numeric(
        result["rushing_baseline_projection"],
        errors="coerce",
    )

    result["projection_edge_yards"] = (
        result["rushing_projection"]
        - pd.to_numeric(
            result["consensus_line"],
            errors="coerce",
        )
    ).round(1)

    return result.drop(
        columns=["player_name_key"],
        errors="ignore",
    )


def _probabilities(projection, line):
    if (
        projection is None
        or pd.isna(projection)
        or line is None
        or pd.isna(line)
    ):
        return {
            "over_probability": pd.NA,
            "under_probability": pd.NA,
            "model_probability": pd.NA,
            "model_side": "NO PLAY",
        }

    projection = float(projection)
    line = float(line)

    z = (
        line - projection
    ) / DEFAULT_RUSHING_VOLATILITY

    cdf = 0.5 * (
        1.0
        + math.erf(
            z / math.sqrt(2.0)
        )
    )

    over = (1.0 - cdf) * 100.0
    under = cdf * 100.0

    if over > under:
        side = "OVER"
        probability = over
    else:
        side = "UNDER"
        probability = under

    if abs(projection - line) < 3:
        side = "PASS"

    return {
        "over_probability": round(over, 1),
        "under_probability": round(under, 1),
        "model_probability": round(probability, 1),
        "model_side": side,
    }


def attach_rushing_probabilities(df: pd.DataFrame) -> pd.DataFrame:
    if df.empty:
        return df.copy()

    result = df.copy()

    probabilities = result.apply(
        lambda row: _probabilities(
            row.get("rushing_projection"),
            row.get("consensus_line"),
        ),
        axis=1,
    )

    for column in [
        "over_probability",
        "under_probability",
        "model_probability",
        "model_side",
    ]:
        result[column] = probabilities.apply(
            lambda item: item[column]
        )

    return result


def rank_rushing_yards_top25(
    df: pd.DataFrame,
    limit: int = 25,
) -> pd.DataFrame:
    if df is None or df.empty:
        return pd.DataFrame()

    ranked = df.copy()

    # Live-market mode ranks by model probability.  Foundation mode remains
    # available when sportsbooks have not posted props yet.
    established = (ranked["rushing_data_status"] == "Established baseline")
    valid_projection = ranked["rushing_projection"].notna() & (ranked["rushing_projection"] > 0)
    live_mask = (
        (ranked["market_match_status"] == "Matched")
        & ranked["consensus_line"].notna()
        & ranked["model_probability"].notna()
        & ranked["model_side"].isin(["OVER", "UNDER"])
    )

    if (established & valid_projection & live_mask).any():
        ranked = ranked[established & valid_projection & live_mask].copy()
        ranked["ranking_mode"] = "Live market"
    else:
        ranked = ranked[established & valid_projection].copy()
        if ranked.empty:
            return ranked
        ranked["ranking_mode"] = "Foundation"
        ranked["model_side"] = "FOUNDATION"
        ranked["model_probability"] = pd.NA
        ranked["projection_edge_yards"] = pd.NA

    ranked["abs_model_edge"] = pd.to_numeric(
        ranked["projection_edge_yards"], errors="coerce"
    ).abs()

    ranked = (
        ranked.sort_values(
            ["model_probability", "abs_model_edge", "rushing_projection"],
            ascending=[False, False, False],
            na_position="last",
        )
        .drop_duplicates(
            subset=["player_id"],
            keep="first",
        )
        .head(limit)
        .reset_index(drop=True)
    )

    ranked.insert(
        0,
        "rank",
        ranked.index + 1,
    )

    return ranked


def build_rushing_yards_top25(
    roster_season: int = ROSTER_SEASON,
    baseline_season: int = BASELINE_SEASON,
) -> pd.DataFrame:
    foundation = build_rushing_yards_foundation(
        roster_season,
        baseline_season,
    )
    foundation = attach_rushing_market(
        foundation
    )
    foundation = attach_rushing_probabilities(
        foundation
    )
    return rank_rushing_yards_top25(
        foundation,
        limit=25,
    )
