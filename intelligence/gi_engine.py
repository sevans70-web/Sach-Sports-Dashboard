"""
Global Intelligence (GI) Engine

Coordinates all intelligence modules and produces a complete
GI Score for an MLB player.
"""

from intelligence.recent_form import calculate_recent_form
from intelligence.power import calculate_power_score
from intelligence.contact import calculate_contact_score
from intelligence.matchup import calculate_matchup_score
from intelligence.ballpark import calculate_ballpark_score
from intelligence.lineup import calculate_lineup_score

from intelligence.gi_score import calculate_gi_score


def build_gi_score(player_stats: dict) -> dict:
    """
    Build the complete GI profile for a player.

    Parameters
    ----------
    player_stats : dict
        Dictionary containing all player statistics.

    Returns
    -------
    dict
        Individual category scores and overall GI Score.
    """

    metrics = {
        "recent_form": calculate_recent_form(player_stats),
        "power": calculate_power_score(player_stats),
        "contact": calculate_contact_score(player_stats),
        "matchup": calculate_matchup_score(player_stats),
        "ballpark": calculate_ballpark_score(player_stats),
        "lineup": calculate_lineup_score(player_stats),
        "weather": 50,
        "team_context": 50,
        "availability": 100,
    }

    gi_score = calculate_gi_score(metrics)

    return {
        "gi_score": gi_score,
        "metrics": metrics,
    }
