"""NFL Passing Yards Top 25 ranking foundation."""

import pandas as pd


def rank_passing_yards_top25(df: pd.DataFrame, limit: int = 25) -> pd.DataFrame:
    """
    Rank valid Passing Yards candidates.

    Ranking priority:
    1. model probability
    2. absolute projection edge
    3. matchup projection

    This is the foundation ranking. Historical validation will later calibrate
    the probability model and final GI weighting.
    """
    if df is None or df.empty:
        return pd.DataFrame()

    ranked = df.copy()

    for col in [
        "model_probability",
        "projection_edge_yards",
        "passing_yards_projection_matchup",
        "consensus_line",
    ]:
        if col in ranked.columns:
            ranked[col] = pd.to_numeric(ranked[col], errors="coerce")

    # Only rank candidates with a real live line, projection and probability.
    ranked = ranked[
        ranked["model_probability"].notna()
        & ranked["passing_yards_projection_matchup"].notna()
        & ranked["consensus_line"].notna()
    ].copy()

    if "model_side" in ranked.columns:
        ranked = ranked[
            ranked["model_side"].isin(["OVER", "UNDER"])
        ].copy()

    if ranked.empty:
        return ranked

    ranked["abs_model_edge"] = ranked["projection_edge_yards"].abs()

    # One row per player on the board.
    dedupe_cols = ["player_id"] if "player_id" in ranked.columns else ["player_name", "team"]
    ranked = ranked.sort_values(
        ["model_probability", "abs_model_edge", "passing_yards_projection_matchup"],
        ascending=[False, False, False],
        na_position="last",
    ).drop_duplicates(subset=dedupe_cols, keep="first")

    ranked = ranked.head(limit).reset_index(drop=True)
    ranked.insert(0, "rank", ranked.index + 1)

    return ranked
