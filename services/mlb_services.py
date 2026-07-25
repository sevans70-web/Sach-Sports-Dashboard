"""

MLB Service

Coordinates MLB player data and the Global Intelligence Engine.

This service prepares player data for scoring and returns

complete GI profiles for use by the dashboard.

"""

from intelligence.gi_engine import build_gi_score

def build_player_profile(player_stats: dict) -> dict:

    """

    Build a complete player intelligence profile.

    Parameters

    ----------

    player_stats : dict

        Dictionary containing player statistics.

    Returns

    -------

    dict

        Complete player profile including GI Score.

    """

    return build_gi_score(player_stats)
