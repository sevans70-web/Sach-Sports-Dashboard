"""NFL Passing Yards Top 25 ranking with data-quality gating."""

import pandas as pd


MIN_BASELINE_ATTEMPTS = 100
MIN_BASELINE_GAMES = 4


def _numeric(series):
    return pd.to_numeric(series, errors="coerce")


def _ranking_eligibility(row: pd.Series) -> tuple[bool, str]:
    """Decide whether a Passing Yards row is safe to rank."""

    if row.get("market_match_status") != "Matched":
        return False, "No matched live sportsbook market"

    projection = row.get("passing_yards_projection_matchup")
    line = row.get("consensus_line")
    probability = row.get("model_probability")

    if pd.isna(projection):
        return False, "Projection unavailable"

    if pd.isna(line):
        return False, "Sportsbook line unavailable"

    if pd.isna(probability):
        return False, "Probability unavailable"

    data_status = str(row.get("passing_data_status", "")).strip()

    if data_status == "No prior NFL baseline":
        return False, "No prior NFL baseline"

    attempts = pd.to_numeric(
        pd.Series([row.get("attempts")]),
        errors="coerce",
    ).iloc[0]

    games = pd.to_numeric(
        pd.Series([row.get("games_played")]),
        errors="coerce",
    ).iloc[0]

    # Limited-sample backups/rookies must not turn tiny historical samples
    # into extreme Top 25 confidence. They will receive a separate projection
    # path later using current role/expected playing time.
    if data_status == "Limited baseline":
        return False, "Limited prior-season QB sample"

    if pd.notna(attempts) and float(attempts) < MIN_BASELINE_ATTEMPTS:
        return False, "Fewer than 100 prior-season pass attempts"

    if pd.notna(games) and float(games) < MIN_BASELINE_GAMES:
        return False, "Fewer than 4 prior-season games"

    if float(projection) <= 0:
        return False, "Non-positive projection"

    side = str(row.get("model_side", "")).upper()

    if side not in {"OVER", "UNDER"}:
        return False, "No actionable model side"

    return True, "Eligible"


def rank_passing_yards_top25(
    df: pd.DataFrame,
    limit: int = 25,
) -> pd.DataFrame:
    """
    Rank trustworthy Passing Yards candidates.

    A player is ranked only when:
    - the live market is matched,
    - projection/line/probability are present,
    - the historical QB sample is established,
    - the projection is positive,
    - the model has an actionable OVER/UNDER side.

    Ranking priority:
    1. model probability
    2. absolute projection edge
    3. matchup projection
    """

    if df is None or df.empty:
        return pd.DataFrame()

    ranked = df.copy()

    for column in [
        "model_probability",
        "projection_edge_yards",
        "passing_yards_projection_matchup",
        "consensus_line",
        "attempts",
        "games_played",
    ]:
        if column in ranked.columns:
            ranked[column] = _numeric(ranked[column])

    eligibility = ranked.apply(
        _ranking_eligibility,
        axis=1,
    )

    ranked["top25_eligible"] = eligibility.apply(
        lambda result: result[0]
    )
    ranked["top25_eligibility_reason"] = eligibility.apply(
        lambda result: result[1]
    )

    ranked = ranked[
        ranked["top25_eligible"]
    ].copy()

    if ranked.empty:
        return ranked

    ranked["abs_model_edge"] = ranked[
        "projection_edge_yards"
    ].abs()

    dedupe_columns = (
        ["player_id"]
        if "player_id" in ranked.columns
        else ["player_name", "team"]
    )

    ranked = (
        ranked.sort_values(
            [
                "model_probability",
                "abs_model_edge",
                "passing_yards_projection_matchup",
            ],
            ascending=[False, False, False],
            na_position="last",
        )
        .drop_duplicates(
            subset=dedupe_columns,
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
