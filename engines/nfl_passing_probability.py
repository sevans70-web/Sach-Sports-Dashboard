"""NFL Passing Yards probability foundation."""

import math
import pandas as pd


DEFAULT_PASSING_YARDS_VOLATILITY = 45.0


def passing_yards_probabilities(
    projection,
    prop_line,
    volatility=DEFAULT_PASSING_YARDS_VOLATILITY,
):
    """
    Convert projection vs line into preliminary Over/Under probabilities.

    This is a foundation model only. Historical grading will later calibrate
    volatility by QB/sample/profile instead of relying on one global value.
    """

    if projection is None or pd.isna(projection):
        return {
            "over_probability": pd.NA,
            "under_probability": pd.NA,
            "model_probability": pd.NA,
            "model_side": "NO PLAY",
        }

    if prop_line is None or pd.isna(prop_line):
        return {
            "over_probability": pd.NA,
            "under_probability": pd.NA,
            "model_probability": pd.NA,
            "model_side": "NO PLAY",
        }

    volatility = float(volatility)

    if volatility <= 0:
        raise ValueError("volatility must be greater than zero")

    projection = float(projection)
    prop_line = float(prop_line)

    z = (prop_line - projection) / volatility
    cdf = 0.5 * (1.0 + math.erf(z / math.sqrt(2.0)))

    over_probability = (1.0 - cdf) * 100.0
    under_probability = cdf * 100.0

    if over_probability > under_probability:
        model_side = "OVER"
        model_probability = over_probability
    else:
        model_side = "UNDER"
        model_probability = under_probability

    edge = projection - prop_line

    if abs(edge) < 5.0:
        model_side = "PASS"

    return {
        "over_probability": round(over_probability, 1),
        "under_probability": round(under_probability, 1),
        "model_probability": round(model_probability, 1),
        "model_side": model_side,
    }


def attach_passing_yards_probabilities(df: pd.DataFrame) -> pd.DataFrame:
    """Attach preliminary model probabilities to QB market rows."""

    if df.empty:
        return df.copy()

    result = df.copy()

    probabilities = result.apply(
        lambda row: passing_yards_probabilities(
            row.get("passing_yards_projection_matchup"),
            row.get("consensus_line"),
        ),
        axis=1,
    )

    result["over_probability"] = probabilities.apply(
        lambda item: item["over_probability"]
    )
    result["under_probability"] = probabilities.apply(
        lambda item: item["under_probability"]
    )
    result["model_probability"] = probabilities.apply(
        lambda item: item["model_probability"]
    )
    result["model_side"] = probabilities.apply(
        lambda item: item["model_side"]
    )

    return result
