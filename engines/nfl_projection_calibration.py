"""Shared safeguards for realistic NFL player-prop projections."""
from __future__ import annotations

import pandas as pd


def season_anchored_projection(
    season_average,
    last_five,
    last_three,
    *,
    max_adjustment: float,
    digits: int = 1,
):
    """Let recent form move, but never replace, the season-level baseline."""
    if season_average is None or pd.isna(season_average):
        return pd.NA
    recent = []
    weights = []
    for value, weight in ((last_five, 0.65), (last_three, 0.35)):
        if value is not None and not pd.isna(value):
            recent.append(float(value))
            weights.append(weight)
    baseline = float(season_average)
    if not recent:
        return round(baseline, digits)
    signal = sum(value * weight for value, weight in zip(recent, weights)) / sum(weights)
    adjustment = max(-max_adjustment, min(max_adjustment, signal - baseline))
    return round(baseline + adjustment, digits)


def market_anchored_projection(
    model_projection: pd.Series,
    consensus_line: pd.Series,
    *,
    maximum_distance: float,
    market_weight: float = 0.65,
) -> pd.Series:
    """Blend a model with a verified market and cap unreasonable divergence."""
    model = pd.to_numeric(model_projection, errors="coerce")
    line = pd.to_numeric(consensus_line, errors="coerce")
    blended = model * (1.0 - market_weight) + line * market_weight
    lower = line - float(maximum_distance)
    upper = line + float(maximum_distance)
    calibrated = blended.clip(lower=lower, upper=upper)
    return model.where(line.isna(), calibrated)
