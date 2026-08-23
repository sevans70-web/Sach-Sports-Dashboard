"""Match live SportsGameOdds Passing Yards lines to Sach NFL quarterbacks."""

import re
import unicodedata

import pandas as pd

from data.nfl_odds import load_nfl_passing_yards_markets


def normalize_player_name(value) -> str:
    """Normalize names for a conservative exact-name market join."""

    if value is None or pd.isna(value):
        return ""

    text = unicodedata.normalize("NFKD", str(value))
    text = "".join(
        char for char in text
        if not unicodedata.combining(char)
    )

    text = text.lower().strip()

    # Remove punctuation while retaining letters/numbers/spaces.
    text = re.sub(r"[^a-z0-9\s]", " ", text)

    # Normalize common suffixes so "Jr." and "Jr" match.
    text = re.sub(
        r"\b(junior|jr|senior|sr|ii|iii|iv)\b",
        "",
        text,
    )

    return " ".join(text.split())


def prepare_passing_yards_markets() -> pd.DataFrame:
    """Return one clean market row per normalized player name."""

    markets = load_nfl_passing_yards_markets().copy()

    if markets.empty:
        return markets

    markets["player_name_key"] = markets[
        "player_name"
    ].apply(normalize_player_name)

    markets = markets[
        markets["player_name_key"] != ""
    ].copy()

    # Prefer the row with the most sportsbook coverage when duplicates exist.
    markets["books_available"] = pd.to_numeric(
        markets["books_available"],
        errors="coerce",
    ).fillna(0)

    markets = markets.sort_values(
        ["player_name_key", "books_available"],
        ascending=[True, False],
    )

    markets = markets.drop_duplicates(
        subset=["player_name_key"],
        keep="first",
    )

    return markets.reset_index(drop=True)


def attach_live_passing_yards_lines(
    qb_rows: pd.DataFrame,
) -> pd.DataFrame:
    """
    Attach live sportsbook Passing Yards lines to QB projection rows.

    This deliberately uses normalized exact-name matching rather than fuzzy
    matching so the dashboard does not silently assign a line to the wrong QB.
    """

    if qb_rows.empty:
        return qb_rows.copy()

    result = qb_rows.copy()

    result["player_name_key"] = result[
        "player_name"
    ].apply(normalize_player_name)

    markets = prepare_passing_yards_markets()

    if markets.empty:
        result["market_match_status"] = "No live market"
        result["consensus_line"] = pd.NA
        result["best_over_line"] = pd.NA
        result["best_over_book"] = None
        result["best_over_odds"] = None
        result["books_available"] = 0
        result["projection_edge_yards"] = pd.NA
        return result

    market_columns = [
        "player_name_key",
        "consensus_line",
        "best_over_line",
        "best_over_book",
        "best_over_odds",
        "books_available",
        "matchup",
        "market_player_id",
    ]

    result = result.merge(
        markets[market_columns],
        on="player_name_key",
        how="left",
        validate="many_to_one",
    )

    result["market_match_status"] = result[
        "consensus_line"
    ].apply(
        lambda value: (
            "Matched"
            if value is not None and not pd.isna(value)
            else "No live market"
        )
    )

    projection = pd.to_numeric(
        result["passing_yards_projection_matchup"],
        errors="coerce",
    )

    line = pd.to_numeric(
        result["consensus_line"],
        errors="coerce",
    )

    result["projection_edge_yards"] = (
        projection - line
    ).round(1)

    return result.drop(
        columns=["player_name_key"],
        errors="ignore",
    )
