"""
Global Intelligence (GI) Score Calculator

This module calculates the Global Intelligence (GI) Score for a player
using weighted performance categories.

The scoring engine is sport-agnostic and can be used across MLB, NFL,
NBA, NHL, Soccer, and future sports.
"""

from intelligence.gi_weights import GI_WEIGHTS


def calculate_gi_score(metrics: dict) -> float:
    """
    Calculate the Global Intelligence (GI) Score.

    Parameters
    ----------
    metrics : dict
        Dictionary containing normalized metric values
        (0-100) for each scoring category.

    Returns
    -------
    float
        GI Score between 0 and 100.
    """

    score = 0

    for category, weight in GI_WEIGHTS.items():
        value = metrics.get(category, 0)
        score += value * (weight / 100)

    return round(score, 1)
