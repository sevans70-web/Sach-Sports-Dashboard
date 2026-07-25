"""
Global Intelligence (GI) Score Weights

This module defines the weighting of each scoring category used to
calculate the Global Intelligence (GI) Score.

The weights are expressed as percentages and should total 100.

Changing these values allows the scoring engine to be tuned without
changing any ranking logic.
"""

GI_WEIGHTS = {
    "recent_form": 25,
    "matchup": 20,
    "power": 15,
    "contact": 10,
    "ballpark": 10,
    "weather": 5,
    "lineup": 5,
    "team_context": 5,
    "availability": 5,
}
