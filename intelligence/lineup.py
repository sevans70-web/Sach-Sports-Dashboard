"""
Lineup Intelligence

Calculates a Lineup Score based on a player's projected batting order.

Players batting near the top of the lineup receive more plate
appearances and therefore more opportunities to score fantasy
points and produce offensive statistics.
"""


def calculate_lineup_score(stats: dict) -> float:
    """
    Calculate a Lineup Score.

    Parameters
    ----------
    stats : dict
        Dictionary containing lineup information.

    Expected Keys
    -------------
    batting_order

    Returns
    -------
    float
        Lineup Score (0-100)
    """

    batting_order = stats.get("batting_order", 9)

    lineup_scores = {
        1: 100,
        2: 98,
        3: 96,
        4: 94,
        5: 90,
        6: 84,
        7: 76,
        8: 68,
        9: 60,
    }

    return lineup_scores.get(batting_order, 50)
