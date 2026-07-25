"""
MLB Metrics Converter

Converts MLB player statistics into standardized GI Score metrics.

The output from this module is used by the GI Score engine to calculate
player rankings.
"""


def build_player_metrics(player_stats: dict) -> dict:
    """
    Convert raw MLB statistics into normalized GI metrics.

    Parameters
    ----------
    player_stats : dict
        Dictionary containing raw MLB player statistics.

    Returns
    -------
    dict
        Dictionary of normalized GI metrics.
    """

    return {
        "recent_form": 0,
        "matchup": 0,
        "power": 0,
        "contact": 0,
        "ballpark": 0,
        "weather": 0,
        "lineup": 0,
        "team_context": 0,
        "availability": 0,
    }
