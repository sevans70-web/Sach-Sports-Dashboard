"""NFL Passing Yards ranking foundation for Sach Sports Dashboard."""

import pandas as pd


def score_passing_yards_candidate(candidate: dict) -> dict:
    """
    Convert an evaluated Passing Yards market candidate into a ranking score.

    This ranking layer expects upstream data from the Passing Yards engine:
    eligibility, projection, market line, edge, probability and matchup.
    """

    result = dict(candidate)

    if not bool(result.get("passing_prop_eligible")):
        result.update(
            {
                "passing_rank_score": pd.NA,
                "ranking_status": "Excluded",
                "ranking_reason": "Player is not eligible for Passing Yards ranking",
            }
        )
        return result

    probability = result.get("model_probability")
    edge_pct = result.get("projection_edge_pct")
    matchup_index = result.get("passing_matchup_index")
    availability = result.get("availability_label")
    lean = result.get("lean")

    if (
        probability is None
        or pd.isna(probability)
        or edge_pct is None
        or pd.isna(edge_pct)
    ):
        result.update(
            {
                "passing_rank_score": pd.NA,
                "ranking_status": "Incomplete",
                "ranking_reason": "Probability or market edge is unavailable",
            }
        )
        return result

    probability_score = max(
        0.0,
        min(100.0, float(probability)),
    )

    # Reward meaningful market separation while preventing huge edges
    # from overwhelming the full ranking model.
    edge_score = min(
        abs(float(edge_pct)) * 5.0,
        100.0,
    )

    if matchup_index is None or pd.isna(matchup_index):
        matchup_score = 50.0
    else:
        raw_matchup = float(matchup_index)

        # For an OVER lean, a higher passing matchup index is favorable.
        # For an UNDER lean, a lower index is favorable.
        if lean == "UNDER LEAN":
            raw_matchup = 200.0 - raw_matchup

        matchup_score = max(
            0.0,
            min(100.0, 50.0 + (raw_matchup - 100.0) * 2.5),
        )

    availability_score = (
        85.0
        if availability == "Monitor"
        else 100.0
    )

    # Foundation weights. Historical grading will calibrate these later.
    final_score = (
        probability_score * 0.45
        + edge_score * 0.30
        + matchup_score * 0.15
        + availability_score * 0.10
    )

    result["passing_rank_score"] = round(final_score, 1)
    result["ranking_status"] = "Rankable"
    result["ranking_reason"] = (
        "Eligible starter with projection, market edge and matchup data"
    )

    return result


def rank_passing_yards_candidates(candidates) -> pd.DataFrame:
    """
    Rank a slate of evaluated Passing Yards candidates.

    Accepts either a list of dictionaries or a DataFrame.
    """

    if isinstance(candidates, pd.DataFrame):
        records = candidates.to_dict("records")
    else:
        records = list(candidates)

    scored = [
        score_passing_yards_candidate(record)
        for record in records
    ]

    if not scored:
        return pd.DataFrame()

    ranked = pd.DataFrame(scored)

    rankable = ranked[
        ranked["ranking_status"] == "Rankable"
    ].copy()

    excluded = ranked[
        ranked["ranking_status"] != "Rankable"
    ].copy()

    if not rankable.empty:
        rankable = rankable.sort_values(
            [
                "passing_rank_score",
                "model_probability",
            ],
            ascending=[False, False],
        ).reset_index(drop=True)

        rankable["passing_rank"] = (
            rankable.index + 1
        )

    if not excluded.empty:
        excluded["passing_rank"] = pd.NA

    return pd.concat(
        [rankable, excluded],
        ignore_index=True,
    )


def get_top_passing_yards_candidates(
    candidates,
    limit: int = 25,
) -> pd.DataFrame:
    """Return the strongest eligible Passing Yards candidates."""

    ranked = rank_passing_yards_candidates(candidates)

    if ranked.empty:
        return ranked

    return (
        ranked[
            ranked["ranking_status"] == "Rankable"
        ]
        .head(limit)
        .reset_index(drop=True)
    )
